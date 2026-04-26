import { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Injector, PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AdminResolver } from "./api/admin.resolver";
import { adminApiExtensions } from "./api/api-extensions";
import { PLUGIN_INIT_OPTIONS } from "./constants";
import { CreditNote } from './entities/CreditNote.entity';
import { Invoice } from "./entities/Invoice.entity";
import { InvoiceConfig } from "./entities/InvoiceConfig.entity";
import { InvoiceService } from "./services/invoice.service";
import { InvoicesOptions } from "./types";

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
      useFactory: () => InvoicesPlugin.options,
    },
    InvoiceService,
  ],
  entities: [
    InvoiceConfig,
    Invoice,
    CreditNote,
  ],
  adminApiExtensions: {
    resolvers: [AdminResolver],
    schema: adminApiExtensions,
  },
  compatibility: ">=3.0.0",
})
export class InvoicesPlugin implements OnApplicationBootstrap, OnApplicationShutdown {
  /** @internal */
  static options: InvoicesOptions;
  constructor(private moduleRef: ModuleRef) { }

  /**
   * The static `init()` method is called with the options to configure the plugin.
   *
   * @example
   * ```ts
   * InvoicesPlugin.init({}),
   * ```
   */
  static init(options: InvoicesOptions) {
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
