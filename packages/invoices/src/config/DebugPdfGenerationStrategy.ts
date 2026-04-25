import { ID, Injector, Logger, OrderService, RequestContext } from "@vendure/core";
import { loggerCtx } from "../constants";
import { PdfGenerationStrategy } from "./PdfGenerationStrategy";

export class DebugPdfGenerationStrategy implements PdfGenerationStrategy {
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
