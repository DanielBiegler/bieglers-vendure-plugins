import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { LocalAssetStorageStrategy } from "@vendure/asset-server-plugin/lib/src/config/local-asset-storage-strategy";
import { DefaultLogger, DefaultSearchPlugin, dummyPaymentHandler, LanguageCode, LogLevel, PaymentMethodEligibilityChecker, VendureConfig } from "@vendure/core";
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import "dotenv/config";
import path from "path";
import { DebugFileStrategy } from "../src/config/FileStrategy";
import { StaticSequentialIdStrategy } from "../src/config/SequentialIdStrategy";
import { DebugSnapshotStrategy, InvoicesPlugin } from "../src/index";

const apiPort = process.env.API_PORT || 3000;

const dummyPaymentEligibilityChecker = new PaymentMethodEligibilityChecker({
  code: "dummy-payment-eligibility-checker",
  description: [{ languageCode: LanguageCode.en, value: "Dummy eligibility checker (always eligible)" }],
  args: {},
  check: () => true,
});

export const config: VendureConfig = {
  apiOptions: {
    port: +apiPort,
    adminApiPath: "admin-api",
    shopApiPath: "shop-api",
    shopApiPlayground: true,
    adminApiPlayground: true,
  },
  authOptions: {
    tokenMethod: ["bearer", "cookie"],
    superadminCredentials: {
      identifier: "superadmin",
      password: "superadmin",
    },
  },
  logger: new DefaultLogger({ level: LogLevel.Verbose }),
  dbConnectionOptions: {
    type: "better-sqlite3",
    synchronize: true,
    migrations: [path.join(__dirname, "../migrations/*.+(js|ts)")],
    logging: false,
    database: path.join(__dirname, "vendure.sqlite"),
  },
  paymentOptions: {
    paymentMethodHandlers: [dummyPaymentHandler],
    paymentMethodEligibilityCheckers: [dummyPaymentEligibilityChecker],
  },
  plugins: [
    AssetServerPlugin.init({
      route: "assets",
      assetUploadDir: path.join(__dirname, "assets"),
      storageStrategyFactory: undefined,
    }),
    InvoicesPlugin.init<TMP_TEST_Snapshot>({
      prefixStrategy: new StaticSequentialIdStrategy("INVOICE"),
      fileStrategy: new DebugFileStrategy(),
      storageStrategy: new LocalAssetStorageStrategy(path.join(__dirname, "invoices")),
      subscribeToOrderPlacedEvent: true,
      snapshotStrategy: new DebugSnapshotStrategy()
    }),
    DefaultSearchPlugin.init({}),
    DashboardPlugin.init({
      route: "dashboard",
      appDir: path.join(__dirname, "dashboard"),
    }),
  ],
};

type TMP_TEST_Snapshot = {}