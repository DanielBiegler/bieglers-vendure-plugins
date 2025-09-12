import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import {
  AssetEvent,
  EventBus,
  JobQueue,
  JobQueueService,
  Logger,
  RequestContext,
  SerializedRequestContext,
  TransactionalConnection
} from "@vendure/core";
import {
  loggerCtx,
  PLUGIN_INIT_OPTIONS
} from "../constants";
import { DBOSJobQueueOptions } from "../types";

/**
 * // TODO
 *
 * @category Services
 */
@Injectable()
export class DBOSJobQueueService implements OnModuleInit {
  /** @internal */
  constructor(
    private eventBus: EventBus,
    private jobQueueService: JobQueueService,
    private connection: TransactionalConnection,
    @Inject(PLUGIN_INIT_OPTIONS)
    private options: DBOSJobQueueOptions,
  ) { }

  private jobQueue: JobQueue<{
    ctx: SerializedRequestContext;
    input: {};
  }>;

  /**
   * Convenience method for adding jobs to the plugins' queue
   */
  async addToJobQueue(ctx: RequestContext, input: {}) {
    const job = await this.jobQueue.add({
      ctx: ctx.serialize(),
      input,
    });

    Logger.verbose(`Job "${job.id}" added to queue "${job.queueName}"`, loggerCtx);

    return job;
  }

  /**
   * Bootstrapping the plugin
   */
  async onModuleInit() {
    this.eventBus.ofType(AssetEvent).subscribe(async (event) => {
      if (event.type === "created") {
        await this.addToJobQueue(event.ctx, {
          idAsset: event.entity.id,
        });
      }
    });
    Logger.info("Subscribed to the asset creation event", loggerCtx);

    this.jobQueue = await this.jobQueueService.createQueue({
      name: "plugin-dbos-job-queue",
      process: async (job) => {
        const input = { ...job.data.input, };
        const ctx = RequestContext.deserialize(job.data.ctx);
      },
    });
  }

}
