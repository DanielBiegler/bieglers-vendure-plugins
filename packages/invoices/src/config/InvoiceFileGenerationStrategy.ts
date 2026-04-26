import { ID, InjectableStrategy, RequestContext } from "@vendure/core";

export type InvoiceFileGenerationResult = { filename: string; buffer: Buffer };
export interface InvoiceFileGenerationStrategy extends InjectableStrategy {
  /**
   * #TODO: parameters are WIP, just exploring implementation details
   * @returns Raw bytes of the generated PDF file
   */
  generate(
    ctx: RequestContext,
    sequentialId: string,
    /** TODO MIGHT NEED SNAPSHOT HERE IN ORDER TO ALLOW COMPLIANT, DETERMINISTIC RE-GENERATION */
    orderId: ID,
  ): Promise<InvoiceFileGenerationResult>;
}
