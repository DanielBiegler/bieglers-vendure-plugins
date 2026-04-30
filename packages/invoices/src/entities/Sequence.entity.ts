import { Channel, ChannelAware, DeepPartial, EntityId, HasCustomFields, ID, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany, Unique } from "typeorm";

export class CustomInvoiceSequenceFields { }

@Entity()
@Unique(["ownerChannelId", "code"])
export class InvoiceSequence extends VendureEntity implements ChannelAware, HasCustomFields {
  constructor(input?: DeepPartial<InvoiceSequence>) {
    super(input);
  }

  /**
   * The single channel that owns this config.
   * Used for unambiguous lookups per {@link Channel}.
   * 
   * While yes, InvoiceSequences are {@link ChannelAware}, i.e. as Superadmin you can
   * easily filter and manage entities through the default-channel, this makes
   * it problematic to actually constrain the uniqueness of the `code` **per channel**.
   * 
   * Having an explicit "owner-channel" gives us DB-level enforced uniqueness,
   * clean lookups, and Vendure admin channel filtering all at once.
   */
  @EntityId({ nullable: false })
  ownerChannelId: ID;

  /**
   * For differentiating between separate sequences on the same {@link Channel}
   * 
   * One example scenario is that in B2B setups you may give a larger client their own
   * separate sequence for long term projects/partnerships.
   * 
   * TASK(2kjlijhf)
   * 
   * For the basic default usecase, we expect two internal codes, namely:
   * 
   * - `__default_invoice`
   * - `__default_credit`
   * 
   * @see {@link DEFAULT_CONFIG_CODE_INVOICE}
   * @see {@link DEFAULT_CONFIG_CODE_CREDIT}
   */
  @Column({ nullable: false })
  code: string;

  /**
   * Sequence used for the last part of the sequential identifier.
   * 
   * Supporting databases guarantee gaplessness via row-level locking of this sequence.
   * # TODO link docs for gaplessness
   */
  @Column("integer", { nullable: false, default: 1 })
  sequence: number;

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @Column(() => CustomInvoiceSequenceFields)
  customFields: CustomInvoiceSequenceFields;
}
