import { Inject, Injectable } from "@nestjs/common";
import {
  AdministratorService,
  ChannelService,
  CustomFieldRelationService,
  EntityNotFoundError,
  FacetService,
  FacetValueService,
  ListQueryBuilder,
  Product,
  ProductService,
  ProductTranslation,
  RelationPaths,
  RequestContext,
  TransactionalConnection,
  Translation,
  UnauthorizedError,
  UserInputError,
} from "@vendure/core";
import { PLUGIN_INIT_OPTIONS } from "./constants";
import { TranslateEverythingEntryKindProduct, TranslateProductInput } from "./generated-admin-types";
import { TranslateEverythingEntryProduct } from "./translate-everything-entry.entity";
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
    private channelService: ChannelService,
    private cfRelationService: CustomFieldRelationService,
    private adminService: AdministratorService,
    private productService: ProductService,
    private facetService: FacetService,
    private facetValueService: FacetValueService,
    private listQueryBuilder: ListQueryBuilder,
    @Inject(PLUGIN_INIT_OPTIONS)
    private options: PluginTranslateEverythingOptions,
  ) {}

  async createEntry(
    ctx: RequestContext,
    entity: TranslateEverythingEntryProduct,
  ): Promise<TranslateEverythingEntryProduct> {
    await this.channelService.assignToCurrentChannel(entity, ctx);
    await this.cfRelationService.updateRelations(ctx, TranslateEverythingEntryProduct, entity, entity);
    return this.connection.getRepository(ctx, TranslateEverythingEntryProduct).save(entity);
  }

  async translateProduct(
    ctx: RequestContext,
    input: TranslateProductInput,
    relations?: RelationPaths<TranslateEverythingEntryProduct>,
  ): Promise<TranslateEverythingEntryProduct[]> {
    // ProductService.findOne is ChannelAware, not manually needed here
    let product = await this.productService.findOne(ctx, input.productId);
    if (!product) throw new EntityNotFoundError("Product", input.productId);

    if (!ctx.activeUserId) throw new UnauthorizedError();
    const admin = await this.adminService.findOneByUserId(ctx, ctx.activeUserId);
    if (!admin) throw new UnauthorizedError();

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

    // Which fields need translating: Name, description, slug?
    // Only translate if the source has text and theres no translation or overwrite is true
    const shouldTranslateName = sourceTranslation.name && (!targetTranslation.name || input.overwrite?.name);
    const shouldTranslateDescription =
      sourceTranslation.description && (!targetTranslation.description || input.overwrite?.description);
    const shouldTranslateSlug = sourceTranslation.slug && (!targetTranslation.slug || input.overwrite?.slug);

    if (shouldTranslateName) {
      targetTranslation.name = await this.options.translationStrategy.translateString(
        sourceTranslation.name,
        sourceTranslation.languageCode,
        targetTranslation.languageCode,
      );
    }

    if (shouldTranslateDescription) {
      targetTranslation.description = await this.options.translationStrategy.translateString(
        sourceTranslation.description,
        sourceTranslation.languageCode,
        targetTranslation.languageCode,
      );
    }

    if (shouldTranslateSlug) {
      // Slug is subjective - Might be better to trim, normalize and slugify the name
      // Use SlugValidator after?
      // TODO skip for now
      targetTranslation.slug = "";
    }

    const updatedProduct = await this.productService.update(ctx, {
      id: product.id,
      translations: [targetTranslation],
    });

    // Constructing the output after the translations so that we can use the updated-product directly
    // Otherwise we would have to mutate the entries which is more error prone imo

    const output: TranslateEverythingEntryProduct[] = [];

    if (shouldTranslateName)
      output.push(
        await this.createEntry(
          ctx,
          new TranslateEverythingEntryProduct({
            sourceLanguage: input.sourceLanguage,
            targetLanguage: input.targetLanguage,
            sourceText: sourceTranslation.name,
            targetText: targetTranslation.name,
            translationKind: TranslateEverythingEntryKindProduct.NAME,
            admin,
            adminId: admin.id,
            product: updatedProduct,
            productId: updatedProduct.id,
          }),
        ),
      );

    if (shouldTranslateDescription)
      output.push(
        await this.createEntry(
          ctx,
          new TranslateEverythingEntryProduct({
            sourceLanguage: input.sourceLanguage,
            targetLanguage: input.targetLanguage,
            sourceText: sourceTranslation.description,
            targetText: targetTranslation.description,
            translationKind: TranslateEverythingEntryKindProduct.DESCRIPTION,
            admin,
            adminId: admin.id,
            product: updatedProduct,
            productId: updatedProduct.id,
          }),
        ),
      );

    // TODO slug at some point

    return output;
  }
}
