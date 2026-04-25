import { Channel, ChannelAware, DeepPartial, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany } from "typeorm";

// TODO  Channel-Aware, HasCustomFields
@Entity()
export class Invoice extends VendureEntity implements ChannelAware {
  constructor(input?: DeepPartial<Invoice>) {
    super(input);
  }

  /**
   * Unique identifier used for accounting
   * 
   * Format: Optional prefix, followed by a gapless sequential number
   * 
   * # TODO make primary key the actual identifier or keep vendure-ID?
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
}
