import { ID, Injector, Logger, OrderService, RequestContext } from "@vendure/core";
import { loggerCtx } from "../constants";
import { InvoiceFileGenerationStrategy } from "./InvoiceFileGenerationStrategy";

export class DebugFileGenerationStrategy implements InvoiceFileGenerationStrategy {
  private orderService: OrderService;

  init(injector: Injector) {
    this.orderService = injector.get(OrderService);
  }

  async generate(ctx: RequestContext, invoiceNumber: string, orderId: ID): Promise<Buffer> {
    const order = await this.orderService.findOne(ctx, orderId);
    Logger.debug(`Order for invoice ${invoiceNumber}: ${JSON.stringify(order)}`, loggerCtx);
    throw new Error("Method not implemented.");
  }
}
