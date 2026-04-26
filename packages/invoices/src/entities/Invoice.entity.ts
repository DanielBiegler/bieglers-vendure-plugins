import { Channel, ChannelAware, DeepPartial, HasCustomFields, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany, ManyToOne } from "typeorm";
import { CreditNote } from "./CreditNote.entity";

export class CustomInvoiceFields { }

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
  sequentialId: string;

  @Column({ nullable: false, unique: true })
  assetUrl: string;

  @ManyToOne(() => CreditNote, entity => entity.invoice)
  creditNotes: CreditNote[];

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @Column(() => CustomInvoiceFields)
  customFields: CustomInvoiceFields;
}
