import { RequestContext, VendureEntityEvent } from "@vendure/core";
import { Invoice } from "./entities/Invoice.entity";
import { CreateInvoiceInput } from "./types";

export type InvoiceEventInput =
  | CreateInvoiceInput;

/**
 * This event is fired whenever an invoice is added, updated or deleted.
 */
export class InvoiceEvent extends VendureEntityEvent<Invoice, InvoiceEventInput> {
  constructor(
    ctx: RequestContext,
    entity: Invoice,
    type: 'created' | 'updated' | 'deleted',
    input?: InvoiceEventInput,
  ) {
    super(entity, type, ctx, input);
  }
}

// TODO credit notes