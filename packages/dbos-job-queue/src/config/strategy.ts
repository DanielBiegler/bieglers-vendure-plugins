import { JobListOptions } from "@vendure/common/lib/generated-types";
import { ID, Injector, InspectableJobQueueStrategy, Job, JobData, JobQueueStrategyJobOptions, Logger, PaginatedList } from "@vendure/core";
import { loggerCtx, PLUGIN_INIT_OPTIONS } from "../constants";
import { DBOSHealthIndicator } from "../services/health-indicator.health";
import { DBOSJobQueueOptions } from "../types";

/**
 * @description
 * This JobQueueStrategy uses [DBOS](#TODO) to implement // TODO
 * It should not be used alone, but as part of the {@link DBOSJobQueuePlugin}.
 *
 * Note: To use this strategy, you need to manually install the `// TODO` package:
 *
 * ```shell
 * npm install # TODO
 * ```
 */
export class DBOSJobQueueStrategy implements InspectableJobQueueStrategy {
  private options: DBOSJobQueueOptions;

  async init(injector: Injector): Promise<void> {
    const options = injector.get<DBOSJobQueueOptions>(PLUGIN_INIT_OPTIONS);
    this.options = { ...options, /* TODO */ };

    const healthIndicator = injector.get(DBOSHealthIndicator);

    Logger.info('Checking DBOS connection...', loggerCtx);
    const health = await healthIndicator.isHealthy('dbos');

    if (health.dbos.status === "down") {
      Logger.error('Could not connect to DBOS database', loggerCtx);
    } else {
      Logger.info('Connected to DBOS database ✔', loggerCtx);
    }
  }

  add<Data extends JobData<Data> = object>(job: Job<Data>, jobOptions?: JobQueueStrategyJobOptions<Data>): Promise<Job<Data>> {
    throw new Error("Method not implemented.");
  }

  start<Data extends JobData<Data> = object>(queueName: string, process: (job: Job<Data>) => Promise<any>): Promise<void> {
    throw new Error("Method not implemented.");
  }

  stop<Data extends JobData<Data> = object>(queueName: string, process: (job: Job<Data>) => Promise<any>): Promise<void> {
    throw new Error("Method not implemented.");
  }

  findOne(id: ID): Promise<Job | undefined> {
    throw new Error("Method not implemented.");
  }

  findMany(options?: JobListOptions): Promise<PaginatedList<Job>> {
    throw new Error("Method not implemented.");
  }

  findManyById(ids: ID[]): Promise<Job[]> {
    throw new Error("Method not implemented.");
  }

  removeSettledJobs(queueNames?: string[], olderThan?: Date): Promise<number> {
    throw new Error("Method not implemented.");
  }

  cancelJob(jobId: ID): Promise<Job | undefined> {
    throw new Error("Method not implemented.");
  }

  destroy?: (() => void | Promise<void>) | undefined;
}