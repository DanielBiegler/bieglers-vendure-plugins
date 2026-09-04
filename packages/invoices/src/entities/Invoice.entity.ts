import { Channel, ChannelAware, DeepPartial, EntityId, HasCustomFields, ID, Order, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany, ManyToOne, OneToMany, Unique } from "typeorm";
import { InvoiceFile } from "./InvoiceFile.entity";

export class CustomInvoiceFields { }

/**
 * A number is unique within the counter that issued it, which is what gapless sequential
 * numbering actually means. Scoping the constraint this way is what lets two vendors in a
 * marketplace each run their own range without being forced onto distinct prefixes.
 */
@Entity()
@Unique(["sequenceOwnerChannelId", "sequenceCode", "sequentialId"])
export class Invoice<Snapshot = any> extends VendureEntity implements ChannelAware, HasCustomFields {
  constructor(input?: DeepPartial<Invoice>) {
    super(input);
  }

  @EntityId({ nullable: false })
  orderId: ID;

  @ManyToOne(() => Order, { nullable: false })
  order: Order;

  /**
   * Customizable payload that shall serve as readonly snapshot with all the data
   * needed to generate the accompanying legal document.
   */
  @Column("simple-json", { nullable: false })
  snapshot: Snapshot;

  /**
   * Identifier used for accounting.
   *
   * Format: Optional prefix, followed by a gapless sequential number
   *
   * Unique per issuing counter rather than globally - see the `@Unique` on this entity.
   *
   * @example "INVOICE123"
   */
  @Column({ nullable: false })
  sequentialId: string;

  /**
   * `InvoiceSequence.ownerChannelId` of the counter {@link sequentialId} was drawn from.
   *
   * Recorded rather than re-derived because the {@link SequenceSelectionStrategy} may
   * change over the life of a shop, and an accountant asking "which range is this
   * document from" needs the answer that was true when it was issued.
   */
  @EntityId({ nullable: false })
  sequenceOwnerChannelId: ID;

  /** `InvoiceSequence.code` of the counter {@link sequentialId} was drawn from. */
  @Column({ nullable: false })
  sequenceCode: string;

  /**
   * The artifacts of this document, ordered by {@link InvoiceFile.position}, the first
   * being the primary one. Never empty: an invoice is only written once its files are.
   *
   * Not eager, because the export may walk thousands of rows and pay for every
   * relation it did not ask for.
   */
  @OneToMany(() => InvoiceFile, (file) => file.invoice)
  files: InvoiceFile[];

  /**
   * If set, this document is a credit note cancelling the referenced invoice.
   * `null` means this is a regular invoice.
   */
  @EntityId({ nullable: true })
  cancelsId: ID | null;

  @ManyToOne(() => Invoice, (invoice) => invoice.cancelledBy, { nullable: true })
  cancels: Invoice | null;

  /** Credit notes issued against this invoice. */
  @OneToMany(() => Invoice, (invoice) => invoice.cancels)
  cancelledBy: Invoice[];

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @Column(() => CustomInvoiceFields)
  customFields: CustomInvoiceFields;
}
