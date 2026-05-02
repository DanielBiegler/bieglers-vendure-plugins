import { Channel, ChannelAware, DeepPartial, HasCustomFields, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany, ManyToOne } from "typeorm";
import { Invoice } from "./Invoice.entity";

export class CustomCreditNoteFields { }

@Entity()
export class CreditNote<Snapshot = any> extends VendureEntity implements ChannelAware, HasCustomFields {
  constructor(input?: DeepPartial<CreditNote<Snapshot>>) {
    super(input);
  }

  @ManyToOne(() => Invoice, base => base.creditNotes, { nullable: false })
  invoice: Invoice;

  /**
   * Unique identifier used for accounting
   * 
   * Format: Optional prefix, followed by a gapless sequential number
   * 
   * @example "EXAMPLE0123"
   */
  @Column({ nullable: false, unique: true })
  sequentialId: string;

  @Column({ nullable: false, unique: true })
  assetUrl: string;

  /**
   * Customizable payload that shall serve as readonly snapshot with all the data
   * needed to generate the accompanying legal document.
   */
  @Column("simple-json", { nullable: false })
  snapshot: Snapshot;

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @Column(() => CustomCreditNoteFields)
  customFields: CustomCreditNoteFields;
}
