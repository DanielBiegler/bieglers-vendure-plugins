import { ID, InjectableStrategy, RequestContext } from "@vendure/core";

export interface PdfGenerationStrategy extends InjectableStrategy {
  /**
   * #TODO: parameters are WIP, just exploring implementation details
   * @returns Raw bytes of the generated PDF file
   */
  generate(
    ctx: RequestContext,
    invoiceNumber: string,
    orderId: ID,
  ): Promise<Buffer>;
}
