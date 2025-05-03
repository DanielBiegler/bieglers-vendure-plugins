import {
  Administrator,
  Channel,
  ChannelAware,
  DeepPartial,
  EntityId,
  HasCustomFields,
  ID,
  LanguageCode,
  Product,
  VendureEntity,
} from "@vendure/core";
import { Column, Entity, JoinTable, ManyToMany, ManyToOne } from "typeorm";
import { TranslateEverythingEntryKindProduct } from "./generated-admin-types";

export class TranslateEverythingEntryCustomFields {}

export abstract class TranslateEverythingEntry extends VendureEntity implements ChannelAware, HasCustomFields {
  /**
   * Who initiated this translation.
   */
  @ManyToOne((type) => Administrator, { nullable: false })
  admin: Administrator;

  @EntityId()
  adminId: ID;

  // sqlite adapter doesnt support enum-type, lets use simple-enum
  @Column("simple-enum", { enum: LanguageCode })
  sourceLanguage: LanguageCode;

  // sqlite adapter doesnt support enum-type, lets use simple-enum
  @Column("simple-enum", { enum: LanguageCode })
  targetLanguage: LanguageCode;

  /**
   * Text before applying the translation. Useful for rolling back to the previous state.
   */
  @Column("text")
  sourceText: string;

  /**
   * Text after applying the translation.
   */
  @Column("text")
  targetText: string;

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  // TODO dont know if this should be specific per entity
  // Check how the usage feels in tests and decide after
  @Column((type) => TranslateEverythingEntryCustomFields)
  customFields: TranslateEverythingEntryCustomFields;
}

export class TranslateEverythingEntryProductCustomFields {}

@Entity("translate_everything_entry_product")
export class TranslateEverythingEntryProduct extends TranslateEverythingEntry {
  // TODO maybe rather type out the needed fields instead of DeepPartial afterwards
  constructor(input?: DeepPartial<TranslateEverythingEntryProduct>) {
    super(input);
  }

  // sqlite adapter doesnt support enum-type, lets use simple-enum
  @Column("simple-enum", { enum: TranslateEverythingEntryKindProduct })
  translationKind: TranslateEverythingEntryKindProduct;

  @EntityId()
  productId: ID;

  @ManyToOne((type) => Product, { nullable: false, onDelete: "CASCADE" })
  product: Product;

  // @Column((type) => TranslateEverythingEntryProductCustomFields)
  // customFields: TranslateEverythingEntryProductCustomFields;
}
