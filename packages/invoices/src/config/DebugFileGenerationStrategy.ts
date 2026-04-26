import { ID, Injector, Logger, OrderService, RequestContext } from "@vendure/core";
import { loggerCtx } from "../constants";
import { InvoiceFileGenerationResult, InvoiceFileGenerationStrategy } from "./InvoiceFileGenerationStrategy";

export class DebugFileGenerationStrategy implements InvoiceFileGenerationStrategy {
  private orderService: OrderService;

  init(injector: Injector) {
    this.orderService = injector.get(OrderService);
  }

  async generate(
    ctx: RequestContext,
    sequentialId: string,
    orderId: ID
  ): Promise<InvoiceFileGenerationResult> {
    const order = await this.orderService.findOne(ctx, orderId);
    Logger.debug(`Order for invoice ${sequentialId}: ${JSON.stringify(order)}`, loggerCtx);

    if (!order)
      throw new Error(`Failed to find Order-entity via ID: ${orderId}`)

    const filename = `${sequentialId}.json`;
    const buffer = Buffer.from(JSON.stringify(order, null, 2));

    return { filename, buffer };
  }
}
