import { gql } from "graphql-tag";

export const adminApiExtensions = gql`

  extend enum HistoryEntryType {
    "Written to the orders' history whenever an invoice or credit note is issued for it"
    PLUGIN_INVOICE_CREATED
  }

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

    """
    Creates a short lived, signed URL which downloads the invoice file.

    The file gets streamed through this instance, because storage strategies hand out
    opaque identifiers that a browser generally cannot resolve on its own.

    Anyone holding the URL can download the file until it expires, so treat it as a
    secret and keep the lifetime short. Requires the plugins' "download" option.

    "expiresIn" is the validity in seconds and is taken at face value, so a value in
    the past yields a URL which is already dead. Defaults to the configured
    "download.defaultExpiresIn".

    "neverExpires" mints a URL that stays valid forever, for cases like handing
    customers a permanent link to their own invoice. Such a URL can only be retracted
    by rotating the signing secret, which invalidates every other URL as well, so
    prefer a finite lifetime whenever the recipient can ask for a fresh link.
    Specifying it together with "expiresIn" is an error.
    """
    createInvoiceDownloadUrl(id: ID!, expiresIn: Int, neverExpires: Boolean): String!
  }
`;
