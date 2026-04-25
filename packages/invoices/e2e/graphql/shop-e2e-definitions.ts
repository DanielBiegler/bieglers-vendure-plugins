import gql from "graphql-tag";

export const GET_PRODUCT_WITH_VARIANTS = gql`
  query GetProductWithVariants($id: ID!) {
    product(id: $id) {
      id
      variants {
        id
      }
    }
  }
`;

export const ADD_ITEM_TO_ORDER = gql`
  mutation AddItemToOrder($productVariantId: ID!, $quantity: Int!) {
    addItemToOrder(productVariantId: $productVariantId, quantity: $quantity) {
      ... on Order {
        id
        code
        state
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`;

export const SET_CUSTOMER_FOR_ORDER = gql`
  mutation SetCustomerForOrder($input: CreateCustomerInput!) {
    setCustomerForOrder(input: $input) {
      ... on Order {
        id
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`;

export const SET_ORDER_SHIPPING_ADDRESS = gql`
  mutation SetOrderShippingAddress($input: CreateAddressInput!) {
    setOrderShippingAddress(input: $input) {
      ... on Order {
        id
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`;

export const GET_ELIGIBLE_SHIPPING_METHODS = gql`
  query GetEligibleShippingMethods {
    eligibleShippingMethods {
      id
      name
      price
    }
  }
`;

export const SET_ORDER_SHIPPING_METHOD = gql`
  mutation SetOrderShippingMethod($shippingMethodId: [ID!]!) {
    setOrderShippingMethod(shippingMethodId: $shippingMethodId) {
      ... on Order {
        id
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`;

export const TRANSITION_ORDER_TO_STATE = gql`
  mutation TransitionOrderToState($state: String!) {
    transitionOrderToState(state: $state) {
      ... on Order {
        id
        state
      }
      ... on OrderStateTransitionError {
        errorCode
        message
        transitionError
      }
    }
  }
`;

export const ADD_PAYMENT_TO_ORDER = gql`
  mutation AddPaymentToOrder($input: PaymentInput!) {
    addPaymentToOrder(input: $input) {
      ... on Order {
        id
        state
      }
      ... on ErrorResult {
        errorCode
        message
      }
    }
  }
`;
