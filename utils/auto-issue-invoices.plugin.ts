import { OnApplicationBootstrap } from "@nestjs/common";
import { EventBus, Logger, OrderPlacedEvent, PluginCommonModule, VendurePlugin } from "@vendure/core";
import { InvoicesPlugin, InvoiceService } from "../packages/invoices/src";

/**
 * Issues one invoice per placed order.
 *
 * The invoices plugin deliberately ships no such subscription. Vendure publishes
 * `OrderPlacedEvent` *before* `OrderSplitter` has created a single seller order, and
 * seller orders never publish one at all, so there is no moment in the stock order
 * lifecycle that reliably means "this is billable" - which makes the timing the shop's
 * decision rather than the plugin's guess.
 *
 * This is the single-vendor answer, and it is what the dev-servers and e2e suites use. A
 * marketplace wants `InvoiceService.issueDocuments` from its own
 * `OrderSellerStrategy.afterSellerOrdersCreated` instead, because at the moment this
 * event fires the seller orders it would need to bill do not exist yet.
 */
@VendurePlugin({
  imports: [PluginCommonModule, InvoicesPlugin],
  compatibility: ">=3.2.0",
})
export class AutoIssueInvoicesPlugin implements OnApplicationBootstrap {
  constructor(
    private eventBus: EventBus,
    private invoiceService: InvoiceService,
  ) { }

  onApplicationBootstrap() {
    this.eventBus.ofType(OrderPlacedEvent).subscribe(event => {
      // Queued rather than awaited: the subscriber runs inside the order's transaction,
      // and a rejection here would otherwise surface as an unhandled rejection.
      this.invoiceService
        .addToJobQueue(event.ctx, { orderId: event.order.id })
        .catch(error => Logger.error(
          `Could not queue an invoice for order "${event.order.code}": ${String(error)}`,
          "AutoIssueInvoicesPlugin",
        ));
    });
  }
}
