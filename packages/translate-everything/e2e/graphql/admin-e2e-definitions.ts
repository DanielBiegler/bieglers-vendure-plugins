import gql from "graphql-tag";

export const TRANSLATE_PRODUCT = gql`
  mutation translateProduct($input: TranslateProductInput!) {
    pluginTranslateProduct(input: $input) {
      __typename

      id
      createdAt
      updatedAt

      adminId
      admin {
        id
      }

      sourceLanguage
      targetLanguage

      sourceText
      targetText

      translationKind

      productId
      product {
        id
        name
        description
        slug
        translations {
          languageCode
          name
          description
          slug
        }
      }
    }
  }
`;

export const GET_CURRENT_ADMIN = gql`
  query getActiveAdminId {
    activeAdministrator {
      id
    }
  }
`;
