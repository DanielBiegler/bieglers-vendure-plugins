import { RequestContext, VendureEntityEvent } from "@vendure/core";
import { Invoice } from "./entities/Invoice.entity";
import { CreateInvoiceInput, UpdateInvoiceInput } from "./generated-admin-types";

export type InvoiceEventInput =
  | CreateInvoiceInput
  | UpdateInvoiceInput;

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

/**
 * This event is fired whenever a credit note is added, updated or deleted.
 */
export class CreditNoteEvent extends VendureEntityEvent<Invoice, InvoiceEventInput> {
  constructor(
    ctx: RequestContext,
    entity: Invoice,
    type: 'created' | 'updated' | 'deleted',
    input?: InvoiceEventInput,
  ) {
    super(entity, type, ctx, input);
  }
}
