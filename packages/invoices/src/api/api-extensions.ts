import { gql } from "graphql-tag";

// TODO custom fields
export const adminApiExtensions = gql`

  # In case you need a field resolver for result unions
  #
  # type PluginInvoicesResult {
  #   # TODO
  # }
  # union PluginInvoicesCreateResult = Asset | PluginInvoicesResult

  type Invoice implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    orderId: ID!
    order: Order!

    sequentialId: String!
    assetUrl: String!
    creditNotes: [CreditNote]!
  }

  type CreditNote implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    invoice: Invoice!

    sequentialId: String!
    assetUrl: String!
  }

  type InvoiceConfig implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    sequenceInvoice: Int!
    sequenceCreditNote: Int!
  }

  type InvoiceList implements PaginatedList {
    items: [Invoice!]!
    totalItems: Int!
  }
  input InvoiceListOptions

  extend type Query {
    "Get a single invoice by its entity ID"
    invoice(id: ID!): Invoice
    
    "Paginate through all invoices"
    invoices(options: InvoiceListOptions): InvoiceList!
    
    "Get a single invoice by its sequential ID"
    invoiceBySequentialId(sequentialId: String!): Invoice
  }

  input CreateInvoiceInput {
    orderId: ID!
  }

  extend type Mutation {
    createInvoice(input: CreateInvoiceInput!): Invoice!
  }
`;
