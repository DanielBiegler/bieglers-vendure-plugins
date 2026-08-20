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

export const GET_ACTIVE_CHANNEL = gql`
  query GetActiveChannel {
    activeChannel {
      id
      defaultCurrencyCode
    }
  }
`;

export const GET_ZONES = gql`
  query GetZones {
    zones {
      items {
        id
        name
      }
    }
  }
`;

export const GET_SHIPPING_METHODS = gql`
  query GetShippingMethods {
    shippingMethods {
      items {
        id
      }
    }
  }
`;

export const GET_PAYMENT_METHODS = gql`
  query GetPaymentMethods {
    paymentMethods {
      items {
        id
      }
    }
  }
`;

export const CREATE_CHANNEL = gql`
  mutation CreateChannel($input: CreateChannelInput!) {
    createChannel(input: $input) {
      ... on Channel {
        id
        code
        token
      }
      ... on LanguageNotAvailableError {
        errorCode
        message
      }
    }
  }
`;

export const ASSIGN_SHIPPING_METHODS_TO_CHANNEL = gql`
  mutation AssignShippingMethodsToChannel($input: AssignShippingMethodsToChannelInput!) {
    assignShippingMethodsToChannel(input: $input) {
      id
    }
  }
`;

export const ASSIGN_PAYMENT_METHODS_TO_CHANNEL = gql`
  mutation AssignPaymentMethodsToChannel($input: AssignPaymentMethodsToChannelInput!) {
    assignPaymentMethodsToChannel(input: $input) {
      id
    }
  }
`;

export const ASSIGN_PRODUCTS_TO_CHANNEL = gql`
  mutation AssignProductsToChannel($input: AssignProductsToChannelInput!) {
    assignProductsToChannel(input: $input) {
      id
    }
  }
`;

export const GET_STOCK_LOCATIONS = gql`
  query GetStockLocations {
    stockLocations {
      items {
        id
      }
    }
  }
`;

export const ASSIGN_STOCK_LOCATIONS_TO_CHANNEL = gql`
  mutation AssignStockLocationsToChannel($input: AssignStockLocationsToChannelInput!) {
    assignStockLocationsToChannel(input: $input) {
      id
    }
  }
`;

export const GET_INVOICE_LIST = gql`
  query GetInvoiceList($options: InvoiceListOptions) {
    invoiceList(options: $options) {
      totalItems
      items {
        id
        createdAt
        sequentialId
        assetUrl
        orderId
        cancelsId
      }
    }
  }
`;

export const CREATE_INVOICE = gql`
  mutation CreateInvoice($input: CreateInvoiceInput!) {
    createInvoice(input: $input) {
      id
      sequentialId
      orderId
      cancelsId
    }
  }
`;

export const REISSUE_INVOICE = gql`
  mutation ReissueInvoice($input: ReissueInvoiceInput!) {
    reissueInvoice(input: $input) {
      creditNote {
        id
        sequentialId
        orderId
        cancelsId
      }
      invoice {
        id
        sequentialId
        orderId
        cancelsId
      }
    }
  }
`;

export const CREATE_INVOICE_DOWNLOAD_URL = gql`
  mutation CreateInvoiceDownloadUrl($id: ID!, $expiresIn: Int, $neverExpires: Boolean) {
    createInvoiceDownloadUrl(id: $id, expiresIn: $expiresIn, neverExpires: $neverExpires)
  }
`;

export const GET_ORDER_HISTORY = gql`
  query GetOrderHistory($id: ID!) {
    order(id: $id) {
      id
      history(options: { sort: { createdAt: ASC } }) {
        totalItems
        items {
          type
          isPublic
          data
        }
      }
    }
  }
`;

export const GET_ORDERS = gql`
  query GetOrders {
    orders(options: { sort: { createdAt: ASC } }) {
      items {
        id
        code
      }
    }
  }
`;

export const INVOICE_EXPORT_PREVIEW_COUNT = gql`
  query InvoiceExportPreviewCount($startsAt: DateTime!, $endsAt: DateTime!) {
    invoiceExportPreviewCount(startsAt: $startsAt, endsAt: $endsAt)
  }
`;

export const CREATE_INVOICE_EXPORT = gql`
  mutation CreateInvoiceExport($input: CreateInvoiceExportInput!) {
    createInvoiceExport(input: $input) {
      id
      state
      startsAt
      endsAt
    }
  }
`;

export const GET_INVOICE_EXPORT = gql`
  query GetInvoiceExport($id: ID!) {
    invoiceExport(id: $id) {
      id
      state
      filename
      entryCount
      fileSizeBytes
      missingFileCount
      errorMessage
    }
  }
`;

export const CREATE_INVOICE_EXPORT_DOWNLOAD_URL = gql`
  mutation CreateInvoiceExportDownloadUrl($id: ID!, $expiresIn: Int, $neverExpires: Boolean) {
    createInvoiceExportDownloadUrl(id: $id, expiresIn: $expiresIn, neverExpires: $neverExpires)
  }
`;

export const DELETE_INVOICE_EXPORT = gql`
  mutation DeleteInvoiceExport($id: ID!) {
    deleteInvoiceExport(id: $id) {
      result
      message
    }
  }
`;
