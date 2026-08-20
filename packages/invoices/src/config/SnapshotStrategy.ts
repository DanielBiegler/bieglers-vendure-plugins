import { ID, InjectableStrategy, Order, RequestContext } from "@vendure/core";
import { InvoiceDocumentContext } from "../document-context";

export interface SnapshotStrategy<Snapshot = any> extends InjectableStrategy {
  /**
   * **Important:** The snapshot must be JSON serializable, as it is saved to the database.
   *
   * Snapshots are supposed to be read-only records that only get saved once and never mutated.
   * This is a requirement, because {@link Order} entities in Vendure are mutable and may change over time.
   * This can break re-generation of older files, leading to accounting/compliance issues.
   *
   * `doc` tells you which kind of document is being issued. For a credit note it also
   * carries the invoice being cancelled, whose own snapshot is the correct source for the
   * amounts to credit - the order has usually moved on by then.
   */
  generate(
    ctx: RequestContext,
    sequentialId: string,
    doc: InvoiceDocumentContext,
  ): Promise<Snapshot>;
}

export class DebugSnapshotStrategy implements SnapshotStrategy<DebugSnapshot> {
  async generate(
    ctx: RequestContext,
    sequentialId: string,
    doc: InvoiceDocumentContext,
  ): Promise<DebugSnapshot> {
    return {
      sequentialId,
      kind: doc.kind,
      order: doc.order,
      ...(doc.kind === "creditNote"
        ? {
          cancels: { id: doc.cancels.id, sequentialId: doc.cancels.sequentialId },
          reason: doc.reason,
        }
        : {}),
    };
  }
}

export type DebugSnapshot = {
  sequentialId: string,
  kind: InvoiceDocumentContext["kind"],
  order: Order,
  /** Only present on credit notes. */
  cancels?: { id: ID, sequentialId: string },
  /** Only present on credit notes, and only when the caller supplied one. */
  reason?: string,
}
