import { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectableStrategy, Injector, PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AdminResolver } from "./api/admin.resolver";
import { adminApiExtensions } from "./api/api-extensions";
import { InvoiceDownloadController } from "./api/invoice-download.controller";
import { InvoiceExportResolver } from "./api/invoice-export.resolver";
import { ZipArchiveStrategy } from "./config/ZipArchiveStrategy";
import { InvoicePermissions, PLUGIN_INIT_OPTIONS } from "./constants";
import { Invoice } from "./entities/Invoice.entity";
import { InvoiceExport } from "./entities/InvoiceExport.entity";
import { InvoiceSequence } from "./entities/Sequence.entity";
import { InvoiceDownloadSignerService } from "./services/DownloadSigner.service";
import { InvoiceService } from "./services/Invoice.service";
import { InvoiceExportService } from "./services/InvoiceExport.service";
import { pruneInvoiceExportsTask } from "./tasks/prune-invoice-exports.task";
import { InvoicesOptions, ResolvedInvoicesOptions } from './types';

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
    InvoiceDownloadSignerService,
    InvoiceService,
    InvoiceExportService,
  ],
  entities: [
    InvoiceSequence,
    Invoice,
    InvoiceExport,
  ],
  configuration(config) {
    config.authOptions.customPermissions.push(InvoicePermissions);

    // Only registered when asked for
    if (InvoicesPlugin.options.exportRetention)
      config.schedulerOptions.tasks.push(pruneInvoiceExportsTask(InvoicesPlugin.options.exportRetention));

    return config;
  },
  adminApiExtensions: {
    resolvers: [AdminResolver, InvoiceExportResolver],
    schema: adminApiExtensions,
  },
})
export class InvoicesPlugin implements OnApplicationBootstrap, OnApplicationShutdown {
  // Cannot use class-generic here due to options being static! Error: TS2302
  static options: ResolvedInvoicesOptions<unknown>;

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
    this.options = {
      ...options,
      // Resolved here rather than at the point of use so that `onApplicationBootstrap`
      // gets a chance to inject dependencies into the default strategy too.
      archiveStrategy: options.archiveStrategy ?? new ZipArchiveStrategy(),
    } as ResolvedInvoicesOptions<unknown>;
    return InvoicesPlugin;
  }

  /**
   * Any option that looks like a strategy, i.e. carries a lifecycle hook. Options also
   * hold plain numbers, booleans and config objects, so the shape has to be checked
   * rather than assumed.
   */
  private static injectableStrategies(): InjectableStrategy[] {
    return (Object.values(InvoicesPlugin.options) as unknown[]).filter(
      (option): option is InjectableStrategy =>
        typeof option === "object" &&
        option !== null &&
        (typeof (option as InjectableStrategy).init === "function" ||
          typeof (option as InjectableStrategy).destroy === "function"),
    );
  }

  /**
   * Important: Ensures strategies can inject their dependencies
   */
  async onApplicationBootstrap() {
    const injector = new Injector(this.moduleRef);
    for (const strategy of InvoicesPlugin.injectableStrategies()) {
      await strategy.init?.(injector);
    }
  }

  async onApplicationShutdown() {
    for (const strategy of InvoicesPlugin.injectableStrategies()) {
      await strategy.destroy?.();
    }
  }
}
