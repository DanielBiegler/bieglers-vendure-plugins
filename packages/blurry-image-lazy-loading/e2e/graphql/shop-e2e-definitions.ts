import gql from "graphql-tag";

export const GET_PRODUCTS = gql`
  query getProducts {
    products {
      items {
        assets {
          id
          customFields {
            previewImageHash
          }
        }
      }
    }
  }
`;
