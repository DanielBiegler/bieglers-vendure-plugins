import { Channel, ChannelAware, DeepPartial, HasCustomFields, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany, ManyToOne } from "typeorm";
import { Invoice } from "./Invoice.entity";

export class CustomCreditNoteFields { }

@Entity()
export class CreditNote extends VendureEntity implements ChannelAware, HasCustomFields {
  constructor(input?: DeepPartial<CreditNote>) {
    super(input);
  }

  @ManyToOne(() => Invoice, base => base.creditNotes)
  invoice: Invoice;

  /**
   * Unique identifier used for accounting
   * 
   * Format: Optional prefix, followed by a gapless sequential number
   * 
   * @example "CREDIT123"
   */
  @Column({ nullable: false, unique: true })
  sequentialId: string;

  @Column({ nullable: false, unique: true })
  assetUrl: string;

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @Column(() => CustomCreditNoteFields)
  customFields: CustomCreditNoteFields;
}
