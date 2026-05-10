import { InjectableStrategy, Order, RequestContext } from "@vendure/core";
import { Invoice } from "../entities/Invoice.entity";

export interface SnapshotStrategy<Snapshot = any> extends InjectableStrategy {
  /**
   * #TODO: parameters are WIP, just exploring implementation details
   * 
   * **Important:** You must make sure that the Snapshot is JSON serializable for it is being saved to the database.
   * 
   * Snapshots are supposed to be read-only records that only get saved once and never mutated.
   * This is a requirement, because {@link Order} entities in Vendure are mutable and may change over time.
   * This can break re-generation of older files, leading to accounting/compliance issues.
   */
  generate(
    ctx: RequestContext,
    sequentialId: string,
    order: Order,
    cancels?: Invoice | null,
  ): Promise<Snapshot>;
}

export class DebugSnapshotStrategy implements SnapshotStrategy<DebugSnapshot> {
  async generate(ctx: RequestContext, sequentialId: string, order: Order): Promise<DebugSnapshot> {
    return { sequentialId, order }
  }
}

export type DebugSnapshot = {
  sequentialId: string,
  order: Order,
}
