import { gql } from "graphql-tag";

export const adminApiExtensions = gql`
  enum PluginPreviewImageHashResultCode {
    ENTITY_NOT_FOUND
    FAIL_EMPTY_BUFFER
    FAIL_ENCODE
    FAIL_FETCH
    FAIL_SAVE_ASSET
    OK
    UNEXPECTED_ERROR
    WRONG_MIMETYPE
  }

  type PluginPreviewImageHashResult {
    code: PluginPreviewImageHashResultCode!
    jobsAddedToQueue: Int!
    assetsSkipped: Int!
    message: String!
  }

  input PluginPreviewImageHashCreateInput {
    """
    ID of the Asset
    """
    idAsset: ID!

    """
    By default the transformations will be done by a worker so as to not block the main server.
    Set this to \`true\` if you'd like to run the hashing synchronously, this will return your \`Asset\` directly.

    @default false
    """
    runSynchronously: Boolean

    """
    Output width of the hashed image. Leave empty for plugin defaults, those depend on the strategy used.
    """
    width: Int

    """
    Output height of the hashed image. Leave empty for plugin defaults, those depend on the strategy used.
    """
    height: Int
  }

  input PluginPreviewImageHashForAllAssetsInput {
    """
    How large a page is when paginating through all of the assets. Increasing this number will minimize 
    needed roundtrips between Vendure and the database. Be careful though, this increases load on the database.

    @default 50
    """
    batchSize: Int

    """
    Assets can be quite numerous, so by default this mutation skips over assets that already have a hash set, in order to minimize the needed compute.
    This can be undesirable, for example after you change the strategy, the encoding or resize options.
    Setting this option to \`true\` will overwrite the existing hashes, letting you update your existing assets.

    @default false
    """
    regenerateExistingHashes: Boolean
  }

  input PluginPreviewImageHashForCollectionInput {
    """
    ID of a collection
    """
    idCollection: ID!

    """
    For larger collections we need to paginate through all of the ProductVariants so
    you might want to adjust the amount of ProductVariants the plugin queries at the same time.

    @default 50
    """
    batchSize: Int

    """
    By default, before adding hashing-jobs to the queue, the asset IDs are stored in memory to deduplicate them.
    This is done to minimize the amount of compute needed by your server - but - if you have a large
    collection of assets, in certain situations it might be more practical to avoid this allocation.

    @default true
    """
    deduplicateAssetIds: Boolean

    """
    Collections can be quite large, so by default this mutation skips over assets that already have a hash set, in order to minimize the needed compute.
    This can be undesirable, for example after you change the strategy, the encoding or resize options.
    Setting this option to \`true\` will overwrite the existing hashes, letting you update your existing assets.

    @default false
    """
    regenerateExistingHashes: Boolean
  }

  input PluginPreviewImageHashForProductInput {
    """
    ID of a product
    """
    idProduct: ID!
  }

  union PluginPreviewImageHashCreateResult = Asset | PluginPreviewImageHashResult

  extend type Mutation {
    """
    Create a preview image hash for one image.
    """
    pluginPreviewImageHashCreateImageHash(
      input: PluginPreviewImageHashCreateInput!
    ): PluginPreviewImageHashCreateResult!

    """
    Create preview image hashes for a product.
    This includes both the product itself and all of its ProductVariant assets.
    """
    pluginPreviewImageHashCreateImageHashesForProduct(
      input: PluginPreviewImageHashForProductInput!
    ): PluginPreviewImageHashResult!

    """
    Create preview image hashes for an entire collection.
    This includes the collection, the contained Product-assets and related ProductVariant-assets.

    Due to how large collections can become, you may want to disable the deduplication of asset ids.
    If deduplication is enabled, jobs will be created only after gathering all assets first.
    If disabled, jobs will be created as the assets are being read.

    No deduplication may result in assets being hashed multiple times, but the tradeoff is not having
    to hold potentially millions of records in memory and just letting the worker take care of them eventually.
    """
    pluginPreviewImageHashCreateImageHashesForCollection(
      input: PluginPreviewImageHashForCollectionInput!
    ): PluginPreviewImageHashResult!

    """
    Create preview image hashes for all assets.
    
    This mutation should be handled with extra care since an installation may hold hundreds of thousands of images.
    This is mainly useful as a one-time-use utility to initialize all of the assets with hashes after installing the plugin.
    """
    pluginPreviewImageHashCreateImageHashesForAllAssets(
      input: PluginPreviewImageHashForAllAssetsInput
    ): PluginPreviewImageHashResult!
}
`;
