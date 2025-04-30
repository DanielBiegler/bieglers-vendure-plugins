import { Administrator, DeepPartial, EntityId, ID, LanguageCode, VendureEntity } from "@vendure/core";
import { Column, Entity, ManyToOne } from "typeorm";
import { TranslateEverythingProductKind } from "./generated-admin-types";

// TODO might make sense to make entities per translated entity due to translationkind and
// easier search via relationships for example ProductId, ProductVariantId, etc.
@Entity()
export class TranslateEverythingEntry extends VendureEntity {
  constructor(input?: DeepPartial<TranslateEverythingEntry>) {
    super(input);
  }

  @EntityId({ nullable: false })
  adminId: ID;

  // sqlite adapter doesnt support enum-type, lets use simple-enum
  @Column("simple-enum", { enum: TranslateEverythingProductKind })
  translationKind: TranslateEverythingProductKind;

  /**
   * Who initiated this translation.
   */
  @ManyToOne((type) => Administrator, { nullable: false })
  admin: Administrator;

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

  // TODO channelaware

  // TODO might want custom fields on this for others to extend
}
