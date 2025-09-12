import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { PLUGIN_INIT_OPTIONS } from "./constants";
import { DBOSHealthIndicator } from "./services/health-indicator.health";
import { DBOSJobQueueService } from "./services/main.service";
import { DBOSJobQueueOptions } from "./types";

/**
 * // TODO
 *
 * @category Plugin
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    {
      provide: PLUGIN_INIT_OPTIONS,
      useFactory: () => DBOSJobQueuePlugin.options,
    },
    DBOSJobQueueService,
    DBOSHealthIndicator,
  ],
  // TODO
  // configuration: config => {
  //   config.jobQueueOptions.jobQueueStrategy = new BullMQJobQueueStrategy();
  //   config.jobQueueOptions.jobBufferStorageStrategy = new RedisJobBufferStorageStrategy();
  //   config.systemOptions.healthChecks.push(new RedisHealthCheckStrategy());
  //   config.schedulerOptions.tasks.push(cleanIndexedSetsTask);
  //   return config;
  // },
  compatibility: ">=3.0.0", // TODO figure out when nestjs/terminus got added, we use it in the healthcheck - would this impact older instances?
})
export class DBOSJobQueuePlugin {
  /** @internal */
  static options: DBOSJobQueueOptions;

  /**
   * The static `init()` method is called with the options to configure the plugin.
   *
   * @example
   * ```ts
   * // TODO
   * DBOSJobQueuePlugin.init({}),
   * ```
   */
  static init(options: DBOSJobQueueOptions) {
    this.options = options;
    return DBOSJobQueuePlugin;
  }
}
