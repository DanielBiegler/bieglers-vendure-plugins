import { Channel, ChannelAware, DeepPartial, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany } from "typeorm";

// TODO  Channel-Aware, HasCustomFields, SoftDeletable
@Entity()
export class InvoiceConfig extends VendureEntity implements ChannelAware {
  constructor(input?: DeepPartial<InvoiceConfig>) {
    super(input);
  }

  @Column("integer", { nullable: false, default: 0 })
  sequence: number;

  // TODO config unique per channel
  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];
}
