import { Channel, ChannelAware, DeepPartial, EntityId, HasCustomFields, ID, Order, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany, ManyToOne, OneToMany } from "typeorm";
import { InvoiceFile } from "./InvoiceFile.entity";

export class CustomInvoiceFields { }

@Entity()
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
   * Unique identifier used for accounting
   * 
   * Format: Optional prefix, followed by a gapless sequential number
   * 
   * @example "INVOICE123"
   */
  @Column({ nullable: false, unique: true })
  sequentialId: string;

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
