import { RequestContext, VendureEntityEvent } from "@vendure/core";
import { CreditNote } from "./entities/CreditNote.entity";
import { Invoice } from "./entities/Invoice.entity";
import { CreateCreditNoteInput, CreateInvoiceInput } from "./types";

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

export type CreditNoteEventInput =
  | CreateCreditNoteInput;

/**
 * This event is fired whenever an invoice is added, updated or deleted.
 */
export class CreditNoteEvent extends VendureEntityEvent<CreditNote, CreditNoteEventInput> {
  constructor(
    ctx: RequestContext,
    entity: CreditNote,
    type: 'created' | 'updated' | 'deleted',
    input?: CreditNoteEventInput,
  ) {
    super(entity, type, ctx, input);
  }
}
