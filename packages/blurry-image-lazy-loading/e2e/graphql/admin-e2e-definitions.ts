import gql from "graphql-tag";

export const CREATE_PREVIEW_IMG_HASH = gql`
  mutation createPreviewImageHash($input: PluginPreviewImageHashCreateInput!) {
    pluginPreviewImageHashCreateImageHash(input: $input) {
      __typename

      ... on PluginPreviewImageHashResult {
        code
        jobsAddedToQueue
        message
      }

      ... on Asset {
        mimeType
        customFields {
          previewImageHash
        }
      }
    }
  }
`;

export const CREATE_FOR_COLLECTION = gql`
  mutation createForCollection($input: PluginPreviewImageHashForCollectionInput!) {
    pluginPreviewImageHashCreateImageHashesForCollection(input: $input) {
      __typename
      code
      jobsAddedToQueue
      message
    }
  }
`;

export const CREATE_FOR_PRODUCT = gql`
  mutation createForProduct($input: PluginPreviewImageHashForProductInput!) {
    pluginPreviewImageHashCreateImageHashesForProduct(input: $input) {
      __typename
      code
      jobsAddedToQueue
      message
    }
  }
`;
