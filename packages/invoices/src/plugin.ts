import { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Injector, PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AdminResolver } from "./api/admin.resolver";
import { adminApiExtensions } from "./api/api-extensions";
import { InvoiceDownloadController } from "./api/invoice-download.controller";
import { InvoicePermissions, PLUGIN_INIT_OPTIONS } from "./constants";
import { Invoice } from "./entities/Invoice.entity";
import { InvoiceSequence } from "./entities/Sequence.entity";
import { InvoiceService } from "./services/Invoice.service";
import { InvoicesOptions } from './types';

/**
 * // TODO
 *
 * @category Plugin
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  dashboard: './dashboard/index.tsx',
  compatibility: ">=3.2.0",
  controllers: [
    InvoiceDownloadController,
  ],
  providers: [
    {
      provide: PLUGIN_INIT_OPTIONS,
      useFactory: () => InvoicesPlugin.options,
    },
    InvoiceService,
  ],
  entities: [
    InvoiceSequence,
    Invoice,
  ],
  configuration(config) {
    config.authOptions.customPermissions.push(InvoicePermissions);
    return config;
  },
  adminApiExtensions: {
    resolvers: [AdminResolver],
    schema: adminApiExtensions,
  },
})
export class InvoicesPlugin implements OnApplicationBootstrap, OnApplicationShutdown {
  // Cannot use class-generic here due to options being static! Error: TS2302
  static options: InvoicesOptions<unknown>;

  constructor(private moduleRef: ModuleRef) { }

  /**
   * The static `init()` method is called with the options to configure the plugin.
   *
   * @example
   * ```ts
   * InvoicesPlugin.init({}),
   * ```
   */
  static init<Snapshot = unknown>(options: InvoicesOptions<Snapshot>) {
    this.options = options;
    return InvoicesPlugin;
  }

  /**
   * Important: Ensures strategies can inject their dependencies
   */
  async onApplicationBootstrap() {
    const injector = new Injector(this.moduleRef);
    const strategies = Object.values(InvoicesPlugin.options).filter(option => typeof option?.init === "function");
    for (const strategy of strategies) {
      await strategy?.init?.(injector);
    }
  }

  async onApplicationShutdown() {
    const strategies = Object.values(InvoicesPlugin.options).filter(option => typeof option?.destroy === "function");
    for (const strategy of strategies) {
      await strategy?.destroy?.();
    }
  }
}
