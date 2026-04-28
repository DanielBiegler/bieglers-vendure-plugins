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

  input GetSingleInvoiceInput {
    id: ID
    sequentialId: String
  }

  extend type Query {
    """
    Get a single invoice either by its entity ID or by its sequential ID.
    Throws an error if neither ID nor sequential ID is specified.
    """
    invoice(input: GetSingleInvoiceInput!): Invoice
    
    "Paginate through all invoices"
    invoiceList(options: InvoiceListOptions): InvoiceList!
  }
`;
