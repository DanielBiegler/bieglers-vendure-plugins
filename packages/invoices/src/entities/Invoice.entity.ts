import { Channel, ChannelAware, DeepPartial, HasCustomFields, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany } from "typeorm";

@Entity()
export class Invoice extends VendureEntity implements ChannelAware, HasCustomFields {
  constructor(input?: DeepPartial<Invoice>) {
    super(input);
  }

  /**
   * Unique identifier used for accounting
   * 
   * Format: Optional prefix, followed by a gapless sequential number
   * 
   * @example "INVOICE123"
   */
  @Column({ nullable: false, unique: true })
  invoiceId: string;

  @Column({ nullable: false, unique: true })
  assetUrl: string;

  // TODO other fields

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @Column(() => CustomInvoiceFields)
  customFields: CustomInvoiceFields;
}

export class CustomInvoiceFields { }
