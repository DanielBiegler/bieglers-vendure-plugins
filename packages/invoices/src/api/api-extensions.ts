import { gql } from "graphql-tag";

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

    cancelsId: ID
    cancels: Invoice

    sequentialId: String!
    assetUrl: String!
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

  input CreateInvoiceInput {
    "The order which this invoice relates to"
    orderId: ID!
    """
    An invoice ID.
    When defined, will create a credit note relating to this invoice.
    """
    cancels: ID
  }

  input UpdateInvoiceInput {
    "ID of the invoice to update"
    id: ID!
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

  extend type Mutation {
    """
    """
    createInvoice(input: CreateInvoiceInput!): Invoice!

    """
    """
    updateInvoice(input: UpdateInvoiceInput!): Invoice!
  }
`;
