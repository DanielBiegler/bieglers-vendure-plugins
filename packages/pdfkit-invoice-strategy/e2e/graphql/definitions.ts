import gql from "graphql-tag";

/** The shared shop definitions only select variant ids, the rendered PDF is checked against names. */
export const GET_PRODUCT_WITH_VARIANT_NAMES = gql`
  query GetProductWithVariantNames($id: ID!) {
    product(id: $id) {
      id
      variants {
        id
        name
        sku
      }
    }
  }
`;

export const GET_ORDERS_WITH_TOTALS = gql`
  query GetOrdersWithTotals {
    orders(options: { sort: { createdAt: ASC } }) {
      items {
        id
        code
        currencyCode
        subTotal
        subTotalWithTax
        shippingWithTax
        total
        totalWithTax
        taxSummary {
          taxRate
          taxBase
          taxTotal
        }
      }
    }
  }
`;
