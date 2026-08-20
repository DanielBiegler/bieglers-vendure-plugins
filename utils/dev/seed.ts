import { INestApplicationContext } from "@nestjs/common";
import {
  bootstrap,
  ConfigService,
  DefaultLogger,
  InitialData,
  isInspectableJobQueueStrategy,
  JobQueueService,
  Country,
  Logger,
  LogLevel,
  mergeConfig,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
  User,
  VendureConfig,
} from "@vendure/core";
import { importProductsFromCsv, populateCollections, populateInitialData } from "@vendure/core/cli";
import { populateCustomers } from "@vendure/testing";
import path from "path";
import { DEV_PAYMENT_METHOD_CODE, devInitialData } from "./dev-initial-data";
import { resetDatabase } from "./reset-database";
import { seedOrders, SeedOrdersOptions } from "./seed-orders";

const loggerCtx = "DevSeed";

export interface DevSeedOptions {
  /** Drop and recreate every table before seeding. Without it, seeding an already populated database duplicates data. */
  reset?: boolean;
  customerCount?: number;
  orderCount?: number;
  /** Seed for the PRNG picking customers, variants and quantities. Same seed produces the same orders. */
  randomSeed?: number;
  /**
   * Run the job queue during seeding and wait for it to drain. Needed for anything a plugin
   * does asynchronously - search indexing, and for this repo, invoice generation - because the
   * default in-memory job queue loses everything the moment the seeding process exits.
   */
  processJobs?: boolean;
  jobTimeoutMs?: number;
  initialData?: InitialData;
  /** Pass `null` to skip the product import entirely. */
  productsCsvPath?: string | null;
  importAssetsDir?: string;
  orders?: Partial<SeedOrdersOptions>;
}

const defaultProductsCsvPath = path.join(__dirname, "../e2e/e2e-products-full.csv");
const defaultAssetsDir = path.join(__dirname, "assets");

export async function seedDevDatabase(config: VendureConfig, options: DevSeedOptions = {}): Promise<void> {
  const {
    reset = false,
    customerCount = 20,
    orderCount = 20,
    randomSeed = 42,
    processJobs = true,
    jobTimeoutMs = 120_000,
    initialData = devInitialData,
    productsCsvPath = defaultProductsCsvPath,
    importAssetsDir = defaultAssetsDir,
  } = options;

  // Port 0 lets the OS pick a free one, so seeding works while a dev server holds the configured port.
  const seedConfig = mergeConfig(config, {
    apiOptions: { port: 0 },
    importExportOptions: { importAssetsDir },
    logger: new DefaultLogger({ level: LogLevel.Info }),
  });

  if (reset) await resetDatabase(seedConfig);

  const app = await bootstrap(seedConfig);

  try {
    await assertEmpty(app, reset);

    if (processJobs) await app.get(JobQueueService).start();

    Logger.info(`Populating ${initialData.countries.length} countries, tax rates, shipping and payment methods...`, loggerCtx);
    await populateInitialData(app, initialData);

    if (productsCsvPath) {
      Logger.info("Importing product catalogue...", loggerCtx);
      const result = await importProductsFromCsv(app, productsCsvPath, initialData.defaultLanguage);
      for (const error of result.errors ?? []) Logger.warn(error, loggerCtx);
      Logger.info(`Imported ${result.imported} products`, loggerCtx);
      await populateCollections(app, initialData);
    }

    if (customerCount > 0) {
      Logger.info(`Creating ${customerCount} customers...`, loggerCtx);
      await populateCustomers(app, customerCount, message => Logger.warn(message, loggerCtx));
    }

    if (orderCount > 0) {
      Logger.info(`Creating ${orderCount} orders...`, loggerCtx);
      const ctx = await createSuperadminContext(app);
      const summary = await seedOrders(app, ctx, randomSeed, {
        count: orderCount,
        paymentMethodCode: DEV_PAYMENT_METHOD_CODE,
        ...options.orders,
      });
      const breakdown = Object.entries(summary.byState)
        .map(([state, n]) => `${state}: ${n}`)
        .join(", ");
      Logger.info(`Created ${summary.created}/${orderCount} orders (${breakdown})`, loggerCtx);
    }

    if (processJobs) await awaitJobQueueDrain(app, jobTimeoutMs);

    Logger.info("Seeding complete", loggerCtx);
  } finally {
    await app.close();
  }
}

/**
 * Seeding on top of existing data silently produces duplicate countries, tax rates and payment
 * methods rather than failing, which is far more confusing later than refusing up front.
 */
async function assertEmpty(app: INestApplicationContext, reset: boolean): Promise<void> {
  if (reset) return;
  const count = await app.get(TransactionalConnection).rawConnection.getRepository(Country).count();
  if (count > 0) {
    throw new Error(
      `Database already contains data (${count} countries). Re-run with --reset to drop and recreate all tables.`,
    );
  }
}

/**
 * Services called outside the request-response cycle reject anonymous contexts, so the seeder
 * acts as the superadmin. The roles/channels relations must be loaded or the context carries
 * the user id but none of its permissions.
 */
export async function createSuperadminContext(app: INestApplicationContext): Promise<RequestContext> {
  const { superadminCredentials } = app.get(ConfigService).authOptions;
  const user = await app
    .get(TransactionalConnection)
    .rawConnection.getRepository(User)
    .findOneOrFail({
      where: { identifier: superadminCredentials.identifier },
      relations: { roles: { channels: true } },
    });
  return app.get(RequestContextService).create({ apiType: "admin", user });
}

async function awaitJobQueueDrain(app: INestApplicationContext, timeoutMs: number): Promise<void> {
  const strategy = app.get(ConfigService).jobQueueOptions.jobQueueStrategy;
  if (!isInspectableJobQueueStrategy(strategy)) {
    Logger.warn("Job queue strategy is not inspectable - cannot wait for jobs to finish", loggerCtx);
    return;
  }
  const startedAt = Date.now();
  let lastLogged = -1;
  while (Date.now() - startedAt < timeoutMs) {
    const { totalItems } = await strategy.findMany({
      filter: { isSettled: { eq: false } },
      take: 1,
    });
    if (totalItems === 0) {
      // A settled job can enqueue follow-up work, so confirm the queue stays empty.
      await new Promise(resolve => setTimeout(resolve, 500));
      const recheck = await strategy.findMany({ filter: { isSettled: { eq: false } }, take: 1 });
      if (recheck.totalItems === 0) return;
      continue;
    }
    if (totalItems !== lastLogged) {
      Logger.info(`Waiting for ${totalItems} job(s) to finish...`, loggerCtx);
      lastLogged = totalItems;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  Logger.warn(`Job queue did not drain within ${timeoutMs}ms - continuing anyway`, loggerCtx);
}

const usage = `
Seeds a Vendure dev database with countries, zones, tax rates, shipping/payment methods,
the sample product catalogue, customers and orders.

Options:
  --reset              Drop and recreate all tables first (required when the database already has data)
  --customers=<n>      Number of customers to create (default: 20)
  --orders=<n>         Number of orders to create (default: 20)
  --random-seed=<n>    PRNG seed, so runs are reproducible (default: 42)
  --no-products        Skip the product catalogue import
  --no-jobs            Do not run the job queue (search index and invoices will not be generated)
  --help               Show this message
`;

/**
 * Entry point for a package's `dev-server/seed.ts`, so each plugin only needs a two-line script.
 */
export async function runSeedCli(config: VendureConfig, defaults: DevSeedOptions = {}): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    // eslint-disable-next-line no-console
    console.log(usage);
    return;
  }

  const numeric = (flag: string): number | undefined => {
    const arg = args.find(a => a.startsWith(`--${flag}=`));
    if (!arg) return undefined;
    const value = Number(arg.split("=")[1]);
    if (!Number.isFinite(value)) throw new Error(`--${flag} expects a number, got "${arg.split("=")[1]}"`);
    return value;
  };

  const unknown = args.filter(
    a => !/^--(reset|no-products|no-jobs|customers=|orders=|random-seed=)/.test(a),
  );
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(", ")}\n${usage}`);

  await seedDevDatabase(config, {
    ...defaults,
    reset: args.includes("--reset") || defaults.reset,
    customerCount: numeric("customers") ?? defaults.customerCount,
    orderCount: numeric("orders") ?? defaults.orderCount,
    randomSeed: numeric("random-seed") ?? defaults.randomSeed,
    productsCsvPath: args.includes("--no-products") ? null : defaults.productsCsvPath,
    processJobs: args.includes("--no-jobs") ? false : defaults.processJobs,
  });
}
