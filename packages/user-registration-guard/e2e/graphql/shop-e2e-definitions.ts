import gql from "graphql-tag";

export const REGISTER_CUSTOMER = gql`
  mutation register($input: RegisterCustomerInput!) {
    registerCustomerAccount(input: $input) {
      __typename
    }
  }
`;
