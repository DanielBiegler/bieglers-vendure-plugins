import { Channel, ChannelAware, DeepPartial, HasCustomFields, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany } from "typeorm";

export class CustomInvoiceConfigFields { }

// TODO should this be SoftDeletable?
@Entity()
export class InvoiceConfig extends VendureEntity implements ChannelAware, HasCustomFields {
  constructor(input?: DeepPartial<InvoiceConfig>) {
    super(input);
  }

  @Column("integer", { nullable: false, default: 0 })
  sequenceInvoice: number;

  @Column("integer", { nullable: false, default: 0 })
  sequenceCreditNote: number;

  // TODO config unique per channel
  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @Column(() => CustomInvoiceConfigFields)
  customFields: CustomInvoiceConfigFields;
}
