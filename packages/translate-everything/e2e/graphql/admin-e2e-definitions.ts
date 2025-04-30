import gql from "graphql-tag";

export const TRANSLATE_PRODUCT = gql`
  mutation translateProduct($input: TranslateProductInput!) {
    translateProduct(input: $input) {
      __typename
      ... on Product {
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
