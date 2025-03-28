import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import {
  assertFound,
  Asset,
  AssetEvent,
  AssetService,
  Collection,
  CollectionService,
  ConfigService,
  EventBus,
  ID,
  JobQueue,
  JobQueueService,
  Logger,
  PaginatedList,
  Product,
  ProductService,
  ProductVariant,
  ProductVariantService,
  RelationPaths,
  RequestContext,
  SerializedRequestContext,
  Translated,
} from "@vendure/core";
import sharp from "sharp";
import { MIMEType } from "util";
import {
  DEFAULT_COLLECTION_PAGINATION,
  DEFAULT_DEDUPLICATE_ASSET_IDS,
  DEFAULT_ENQUEUE_HASHING_AFTER_ASSET_CREATION,
  DEFAULT_REGENERATE_HASHES,
  loggerCtx,
  PLUGIN_INIT_OPTIONS,
  SUPPORTED_IMG_TYPES,
} from "../constants";
import {
  PluginPreviewImageHashResultCode as CODE,
  PluginPreviewImageHashCreateInput,
  PluginPreviewImageHashCreateResult,
  PluginPreviewImageHashForCollectionInput,
  PluginPreviewImageHashForProductInput,
  PluginPreviewImageHashResult,
} from "../generated-admin-types";
import { PluginPreviewImageHashOptions } from "../types";

/**
 * The PreviewImageHashService provides methods for managing the creation of image hashes.
 *
 * @category Services
 */
@Injectable()
export class PreviewImageHashService implements OnModuleInit {
  /** @internal */
  constructor(
    private assetService: AssetService,
    private collectionService: CollectionService,
    private productService: ProductService,
    private productVariantService: ProductVariantService,
    private configService: ConfigService,
    private eventBus: EventBus,
    private jobQueueService: JobQueueService,
    @Inject(PLUGIN_INIT_OPTIONS)
    private options: PluginPreviewImageHashOptions,
  ) {}

  private jobQueue: JobQueue<{
    ctx: SerializedRequestContext;
    input: PluginPreviewImageHashCreateInput;
  }>;

  /**
   * Adds the hashing to the dedicated job queue
   */
  async addToJobQueue(ctx: RequestContext, input: PluginPreviewImageHashCreateInput) {
    const job = await this.jobQueue.add({
      ctx: ctx.serialize(),
      input,
    });

    Logger.verbose(`Image hashing job "${job.id}" added to queue "${job.queueName}"`, loggerCtx);

    return job;
  }

  /**
   * Convenience method to make the processing code more concise
   */
  private result(
    jobsAddedToQueue: PluginPreviewImageHashResult["jobsAddedToQueue"],
    assetsSkipped: PluginPreviewImageHashResult["assetsSkipped"],
    code: PluginPreviewImageHashResult["code"],
    message: PluginPreviewImageHashResult["message"],
  ): PluginPreviewImageHashResult {
    return {
      __typename: "PluginPreviewImageHashResult",
      jobsAddedToQueue,
      assetsSkipped,
      code,
      message,
    };
  }

  /**
   * Bootstrapping the plugin
   */
  async onModuleInit() {
    const shouldSubscribe =
      this.options.enqueueHashingAfterAssetCreation ?? DEFAULT_ENQUEUE_HASHING_AFTER_ASSET_CREATION;
    if (shouldSubscribe) {
      this.eventBus.ofType(AssetEvent).subscribe(async (event) => {
        if (event.type === "created") {
          await this.addToJobQueue(event.ctx, {
            idAsset: event.entity.id,
          });
        }
      });
      Logger.info("Subscribed to the asset creation event", loggerCtx);
    } else {
      Logger.info(
        "Skipped subscribing to the asset creation event due to a false `enqueueHashingAfterAssetCreation`",
        loggerCtx,
      );
    }

    this.jobQueue = await this.jobQueueService.createQueue({
      name: "plugin-preview-image-hash",
      process: async (job) => {
        const input: PluginPreviewImageHashCreateInput = {
          ...job.data.input,
          runSynchronously: true,
        };
        return await this.create(RequestContext.deserialize(job.data.ctx), input);
      },
    });
  }

  /**
   * Depending on `input.runSynchronously` will either generate the hash and persist it to the asset,
   * or will add this task to the dedicated job queue.
   *
   * If being run synchronously will return the asset so you can query the custom field directly
   */
  async create(
    ctx: RequestContext,
    input: PluginPreviewImageHashCreateInput,
    relations?: RelationPaths<Asset>,
  ): Promise<PluginPreviewImageHashCreateResult> {
    // Early exit if the job queue should take over
    if (!input.runSynchronously) {
      await this.addToJobQueue(ctx, input);
      return this.result(1, 0, CODE.OK, "Successfully added task to job queue");
    }

    const asset = await this.assetService.findOne(ctx, input.idAsset);

    if (!asset) {
      const errorMsg = `Failed to find asset with ID: "${input.idAsset}"`;
      Logger.error(errorMsg, loggerCtx);
      return this.result(0, 0, CODE.ENTITY_NOT_FOUND, errorMsg);
    }

    let mimetype: MIMEType | null = null;
    try {
      mimetype = new MIMEType(asset.mimeType);

      if (mimetype.type !== "image") {
        const errorMsg = `Asset is not of type "image", found type: "${mimetype.type}"`;
        Logger.error(errorMsg, loggerCtx);
        return this.result(0, 0, CODE.WRONG_MIMETYPE, errorMsg);
      }

      if (SUPPORTED_IMG_TYPES.includes(mimetype.subtype) === false) {
        const errorMsg = `Image is not any of subtype [${SUPPORTED_IMG_TYPES}], found subtype: "${mimetype.subtype}"`;
        Logger.error(errorMsg, loggerCtx);
        return this.result(0, 0, CODE.WRONG_MIMETYPE, errorMsg);
      }
    } catch (error) {
      const errorMsg = "Failed to parse mimetype";
      Logger.error(errorMsg, loggerCtx, error instanceof Error ? error.stack : undefined);
      return this.result(0, 0, CODE.WRONG_MIMETYPE, errorMsg);
    }

    let bufferInput: Buffer | null = null;
    try {
      bufferInput = await this.configService.assetOptions.assetStorageStrategy.readFileToBuffer(asset.preview);
    } catch (error) {
      const errorMsg = `Failed to fetch image from URL: "${asset.preview}"`;
      Logger.error(errorMsg, loggerCtx, error instanceof Error ? error.stack : undefined);
      return this.result(0, 0, CODE.FAIL_FETCH, errorMsg);
    }

    if (bufferInput.length === 0) {
      const errorMsg = `Image buffer is empty. Aborting now.`;
      Logger.error(errorMsg, loggerCtx);
      return this.result(0, 0, CODE.FAIL_EMPTY_BUFFER, errorMsg);
    }

    let bufferOutput: sharp.Sharp | null = null;
    try {
      bufferOutput = sharp(bufferInput);
    } catch (error) {
      const errorMsg = "Failed to open image via sharp";
      Logger.error(errorMsg, loggerCtx, error instanceof Error ? error.stack : undefined);
      return this.result(0, 0, CODE.FAIL_ENCODE, errorMsg);
    }

    let hash: string | null = null;
    try {
      hash = await this.options.hashingStrategy.encode(bufferOutput, input);
    } catch (error) {
      const errorMsg = "Failed to encode image";
      Logger.error(errorMsg, loggerCtx, error instanceof Error ? error.stack : undefined);
      return this.result(0, 0, CODE.FAIL_ENCODE, errorMsg);
    }

    try {
      await this.assetService.update(ctx, {
        id: asset.id,
        customFields: { previewImageHash: hash },
      });

      Logger.info(`Generated preview image hash for asset: "${asset.id}"`, loggerCtx);

      // @ts-expect-error Because we extend the CustomAssetField type (see types.ts) which doesnt quite match the gql type
      return assertFound(this.assetService.findOne(ctx, input.idAsset, relations));
    } catch (error) {
      const errorMsg = "Failed to update asset entity";
      Logger.error(errorMsg, loggerCtx, error instanceof Error ? error.stack : undefined);
      return this.result(0, 0, CODE.FAIL_SAVE_ASSET, errorMsg);
    }
  }

  /**
   * Enqueues hashing jobs for each asset inside this product.
   * Includes the product itself and all of its variants.
   *
   * Deduplicates the asset IDs.
   */
  async createForProduct(
    ctx: RequestContext,
    input: PluginPreviewImageHashForProductInput,
  ): Promise<PluginPreviewImageHashResult> {
    let product: Translated<Product> | undefined | null = null;
    let jobsAddedToQueue = 0;
    let assetsSkipped = 0;

    try {
      product = await this.productService.findOne(ctx, input.idProduct, ["assets", "variants.assets"]);
    } catch (error) {
      const errorMsg = "Something unexpected happened when fetching the product";
      Logger.error(errorMsg, loggerCtx, error instanceof Error ? error.stack : undefined);
      return this.result(jobsAddedToQueue, assetsSkipped, CODE.UNEXPECTED_ERROR, errorMsg);
    }

    if (!product) {
      const errorMsg = `Failed to find product with ID: "${input.idProduct}"`;
      Logger.error(errorMsg, loggerCtx);
      return this.result(jobsAddedToQueue, assetsSkipped, CODE.ENTITY_NOT_FOUND, errorMsg);
    }

    const assetIds = new Set<ID>();
    for (const asset of product.assets) {
      assetIds.add(asset.assetId);
    }

    for (const variant of product.variants) {
      for (const asset of variant.assets) {
        assetIds.add(asset.assetId);
      }
    }

    for (const idAsset of assetIds) {
      await this.addToJobQueue(ctx, { idAsset });
      jobsAddedToQueue += 1;
    }

    return this.result(
      jobsAddedToQueue,
      assetsSkipped,
      CODE.OK,
      "Successfully added all eligible hashing-tasks of product-/ and its variant-assets to job queue",
    );
  }

  /**
   * Helper for determining whether or not we should skip hash generation for a given asset.
   * Useful for keeping the logging DRY.
   *
   * @param shouldRegenerate Whether or not you want to regenerate existing hashes
   * @param asset The asset for which you would like to check
   * @returns Whether or not you should skip this asset
   */
  private shouldSkipGeneratingHash(shouldRegenerate: Boolean, asset: Asset): Boolean {
    if (asset.customFields.previewImageHash && !shouldRegenerate) {
      Logger.verbose(
        `Skipped generating hash for asset "${asset.id}", because regeneration of existing hashes is disabled`,
        loggerCtx,
      );

      return true;
    } else {
      return false;
    }
  }

  /**
   * Enqueues hashing jobs for each asset inside a collection. This includes the collection itself,
   * the contained products and all of their variants.
   *
   * Due to how large collections can become, you may want to disable the deduplication of asset ids.
   *
   * If deduplication is enabled, jobs will be created only after gathering all assets first.
   * If disabled, jobs will be created as the assets are being read.
   *
   * No deduplication may result in assets being hashed multiple times, but the tradeoff is not having
   * to hold potentially millions of records in memory and just letting the worker take care of them eventually.
   */
  async createForCollection(
    ctx: RequestContext,
    input: PluginPreviewImageHashForCollectionInput,
  ): Promise<PluginPreviewImageHashResult> {
    let collection: Translated<Collection> | undefined | null = null;
    let jobsAddedToQueue = 0;
    let assetsSkipped = 0;

    try {
      collection = await this.collectionService.findOne(ctx, input.idCollection, ["assets"]);
    } catch (error) {
      const errorMsg = "Something unexpected happened when fetching the collection";
      Logger.error(errorMsg, loggerCtx, error instanceof Error ? error.stack : undefined);
      return this.result(jobsAddedToQueue, assetsSkipped, CODE.UNEXPECTED_ERROR, errorMsg);
    }

    if (!collection) {
      const errorMsg = `Failed to find collection with ID: "${input.idCollection}"`;
      Logger.error(errorMsg, loggerCtx);
      return this.result(jobsAddedToQueue, assetsSkipped, CODE.ENTITY_NOT_FOUND, errorMsg);
    }

    const regenerateExistingHashes = input.regenerateExistingHashes ?? DEFAULT_REGENERATE_HASHES;
    const deduplicateAssetIds = input.deduplicateAssetIds ?? DEFAULT_DEDUPLICATE_ASSET_IDS;
    const assetIds = new Set<ID>();
    for (const asset of collection.assets) {
      if (this.shouldSkipGeneratingHash(regenerateExistingHashes, asset.asset)) {
        assetsSkipped += 1;
        continue;
      }

      if (deduplicateAssetIds) {
        assetIds.add(asset.assetId);
      } else {
        await this.addToJobQueue(ctx, { idAsset: asset.assetId });
        jobsAddedToQueue += 1;
      }
    }

    const take = input.batchSize && input.batchSize > 0 ? input.batchSize : DEFAULT_COLLECTION_PAGINATION;
    let skip = 0;
    let hasMoreVariants = true;
    do {
      let variants: PaginatedList<Translated<ProductVariant>> | null = null;
      try {
        variants = await this.productVariantService.getVariantsByCollectionId(ctx, collection.id, { take, skip }, [
          "assets",
          "product.assets",
        ]);
      } catch (error) {
        const errorMsg = "Something unexpected happened when querying product variants";
        Logger.error(errorMsg, loggerCtx, error instanceof Error ? error.stack : undefined);
        return this.result(jobsAddedToQueue, assetsSkipped, CODE.UNEXPECTED_ERROR, errorMsg);
      }
      hasMoreVariants = variants.items.length > 0;

      if (!hasMoreVariants) break; // Early exit, as theres no work needed
      skip += take;

      for (const variant of variants.items) {
        for (const asset of variant.assets) {
          if (this.shouldSkipGeneratingHash(regenerateExistingHashes, asset.asset)) {
            assetsSkipped += 1;
            continue;
          }

          if (deduplicateAssetIds) {
            assetIds.add(asset.assetId);
          } else {
            await this.addToJobQueue(ctx, { idAsset: asset.assetId });
            jobsAddedToQueue += 1;
          }
        }

        for (const asset of variant.product.assets) {
          if (this.shouldSkipGeneratingHash(regenerateExistingHashes, asset.asset)) {
            assetsSkipped += 1;
            continue;
          }

          if (deduplicateAssetIds) {
            assetIds.add(asset.assetId);
          } else {
            await this.addToJobQueue(ctx, { idAsset: asset.assetId });
            jobsAddedToQueue += 1;
          }
        }
      }
    } while (hasMoreVariants);

    if (deduplicateAssetIds) {
      for (const id of assetIds) {
        await this.addToJobQueue(ctx, { idAsset: id });
        jobsAddedToQueue += 1;
      }
    }

    return this.result(
      jobsAddedToQueue,
      assetsSkipped,
      CODE.OK,
      "Successfully added all eligible hashing-tasks of collection-/, product-/ and its variant-assets to job queue",
    );
  }
}
