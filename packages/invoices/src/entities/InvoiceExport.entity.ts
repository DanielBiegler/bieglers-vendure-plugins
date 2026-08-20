import { Channel, ChannelAware, DeepPartial, EntityId, HasCustomFields, ID, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany } from "typeorm";

export class CustomInvoiceExportFields { }

export type InvoiceExportState = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

/**
 * A request to bundle every invoice issued in a date range into downloadable archives.
 *
 * Kept as a row rather than a fire-and-forget stream so the work can run on the worker,
 * be retried, and leave an audit trail of who pulled the ledger and for which period.
 */
@Entity()
export class InvoiceExport extends VendureEntity implements ChannelAware, HasCustomFields {
  constructor(input?: DeepPartial<InvoiceExport>) {
    super(input);
  }

  /** Inclusive lower bound of the exported period. */
  @Column({ type: Date, nullable: false })
  startsAt: Date;

  /**
   * **Exclusive** upper bound, which is what keeps a period boundary unambiguous: an
   * admin asking for January gets everything up to February 1st 00:00 with no
   * `23:59:59.999` fencepost to get wrong.
   */
  @Column({ type: Date, nullable: false })
  endsAt: Date;

  // `type` spelled out because the field is a string union, which reflect-metadata
  // reports as `Object` and TypeORM then refuses to map to a column
  @Column({ type: String, nullable: false, default: "PENDING" })
  state: InvoiceExportState;

  /** Null until the export completes. */
  @Column({ type: String, nullable: true })
  filename: string | null;

  /**
   * Opaque {@link AssetStorageStrategy} identifier, not a browser resolvable URL.
   *
   * Null until the export completes.
   */
  @Column({ type: String, nullable: true })
  assetUrl: string | null;

  /**
   * Counted while writing, because {@link AssetStorageStrategy} offers no way to ask a
   * stored object for its size afterwards. Serving a `Content-Length` on download is what
   * gives the browser a progress bar and the ability to resume.
   */
  @Column({
    type: "bigint",
    nullable: false,
    default: 0,
    transformer: {
      to: (value: number) => value,
      // Drivers hand bigints back as strings to avoid a lossy cast. Sizes stay far below
      // Number.MAX_SAFE_INTEGER (9 PB), so widening here is safe.
      from: (value: string | number) => Number(value ?? 0),
    },
  })
  fileSizeBytes: number;

  /** Invoices actually written into the archive, i.e. excluding any that were missing. */
  @Column({ type: "int", nullable: false, default: 0 })
  entryCount: number;

  /**
   * Invoices whose row exists but whose file was gone from storage, e.g. removed by a
   * bucket lifecycle rule. They are skipped rather than aborting the export, so this
   * counter is what tells an accountant the archive is incomplete.
   */
  @Column({ type: "int", nullable: false, default: 0 })
  missingFileCount: number;

  @Column({ type: String, nullable: true })
  errorMessage: string | null;

  /** Who requested it. Bulk ledger extraction is worth attributing. */
  @EntityId({ nullable: true })
  createdByUserId: ID | null;

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @Column(() => CustomInvoiceExportFields)
  customFields: CustomInvoiceExportFields;
}
