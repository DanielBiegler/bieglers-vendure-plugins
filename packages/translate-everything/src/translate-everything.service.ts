import { Inject, Injectable } from "@nestjs/common";
import {
  DeepPartial,
  EntityNotFoundError,
  FacetService,
  FacetValueService,
  ID,
  LanguageCode,
  ListQueryBuilder,
  Product,
  ProductService,
  ProductTranslation,
  RelationPaths,
  RequestContext,
  TransactionalConnection,
  Translated,
  Translation,
  UserInputError,
} from "@vendure/core";
import { PLUGIN_INIT_OPTIONS } from "./constants";
import { TranslateEverythingEntry } from "./translate-everything-entry.entity";
import { PluginTranslateEverythingOptions } from "./types";

/**
 * // TODO
 * @note when adding jobqueues later for translating many productvariants or collections
 * users might run into ratelimiting issues if the workers request from third party apis.
 * Bullmq does support the option for ratelimiting jobs but gotta check that out etc.
 */
@Injectable()
export class TranslateEverythingService {
  constructor(
    private connection: TransactionalConnection,
    private productService: ProductService,
    private facetService: FacetService,
    private facetValueService: FacetValueService,
    private listQueryBuilder: ListQueryBuilder,
    @Inject(PLUGIN_INIT_OPTIONS)
    private options: PluginTranslateEverythingOptions,
  ) {}

  async createEntry(
    ctx: RequestContext,
    input: DeepPartial<TranslateEverythingEntry>,
  ): Promise<TranslateEverythingEntry> {
    // TODO check after adding custom fields
    return this.connection.getRepository(ctx, TranslateEverythingEntry).save(new TranslateEverythingEntry(input));
  }

  async translateProduct(
    ctx: RequestContext,
    input: {
      productId: ID;
      sourceLanguage: LanguageCode;
      targetLanguage: LanguageCode;
    },
    relations?: RelationPaths<Product>,
  ): Promise<Translated<Product>> {
    // ProductService.findOne is ChannelAware, not manually needed here
    const product = await this.productService.findOne(ctx, input.productId, relations);
    if (!product) throw new EntityNotFoundError("Product", input.productId);

    const sourceTranslation = product.translations.find((t) => t.languageCode === input.sourceLanguage);
    if (!sourceTranslation)
      throw new UserInputError("pluginTranslateEverything.error.sourceLanguageNotFound", {
        productId: input.productId,
        sourceLanguage: input.sourceLanguage,
      });

    let targetTranslation: Translation<Product> =
      product.translations.find((t) => t.languageCode === input.targetLanguage) ??
      new ProductTranslation({
        languageCode: input.targetLanguage,
      });

    // Which fields need translating: Name, slug, description?
    const isMissingName = sourceTranslation.name !== "";
    const isMissingDesc = sourceTranslation.description !== "";
    const isMissingSlug = sourceTranslation.slug !== "";

    if (isMissingName) {
      targetTranslation.name = await this.options.translationStrategy.translateString(
        sourceTranslation.name,
        sourceTranslation.languageCode,
        targetTranslation.languageCode,
      );

      await this.createEntry(ctx, {
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        sourceText: sourceTranslation.name,
        targetText: targetTranslation.name,
        adminId: ctx.activeUserId,
      });
    }

    if (isMissingDesc) {
      targetTranslation.description = await this.options.translationStrategy.translateString(
        sourceTranslation.description,
        sourceTranslation.languageCode,
        targetTranslation.languageCode,
      );

      await this.createEntry(ctx, {
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        sourceText: sourceTranslation.description,
        targetText: targetTranslation.description,
        adminId: ctx.activeUserId,
      });
    }

    if (isMissingSlug) {
      // Slug is subjective - Might be better to trim, normalize and slugify the name
      // Use SlugValidator after?
      // TODO skip for now
      targetTranslation.slug = "";
    }

    return this.productService.update(ctx, {
      id: product.id,
      translations: [targetTranslation],
    });
  }
}
