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
    Create preview image hashes for an entire collection.
    This includes the collection, the contained Product-assets and related ProductVariant-assets.
    """
    pluginPreviewImageHashCreateImageHashesForCollection(
      input: PluginPreviewImageHashForCollectionInput!
    ): PluginPreviewImageHashResult!

    """
    Create preview image hashes for a product.
    This includes both the product itself and all of its ProductVariant assets.
    """
    pluginPreviewImageHashCreateImageHashesForProduct(
      input: PluginPreviewImageHashForProductInput!
    ): PluginPreviewImageHashResult!
  }
`;
