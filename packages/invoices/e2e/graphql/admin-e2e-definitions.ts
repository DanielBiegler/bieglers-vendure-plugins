import gql from "graphql-tag";

export const CREATE_PAYMENT_METHOD = gql`
  mutation CreatePaymentMethod($input: CreatePaymentMethodInput!) {
    createPaymentMethod(input: $input) {
      id
      code
      name
      enabled
    }
  }
`;
