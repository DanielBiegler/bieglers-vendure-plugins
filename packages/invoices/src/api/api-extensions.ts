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

  enum InvoiceExportState {
    PENDING
    RUNNING
    COMPLETED
    FAILED
  }

  type InvoiceExport implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    "Inclusive lower bound of the exported period."
    startsAt: DateTime!
    "Exclusive upper bound of the exported period."
    endsAt: DateTime!

    state: InvoiceExportState!

    "Name of the archive. Null until the export completes."
    filename: String

    "Number of invoices written into the archive."
    entryCount: Int!

    """
    Size of the archive in bytes. Zero until the export completes.

    Deliberately a Float: GraphQL's Int is 32 bit signed and therefore caps at 2GB, which
    a yearly export can exceed.
    """
    fileSizeBytes: Float!

    """
    Invoices whose row exists but whose file was gone from storage. They are skipped
    rather than failing the export, so anything above zero means the archive is
    incomplete and worth investigating.
    """
    missingFileCount: Int!

    "Only set when the state is FAILED."
    errorMessage: String
  }

  type InvoiceExportList implements PaginatedList {
    items: [InvoiceExport!]!
    totalItems: Int!
  }
  input InvoiceExportListOptions

  input CreateInvoiceExportInput {
    "Inclusive lower bound, as a full instant rather than a bare date."
    startsAt: DateTime!
    """
    Exclusive upper bound. Pass the start of the following period, e.g. February 1st to
    export all of January, which avoids the usual 23:59:59.999 fencepost mistake.
    """
    endsAt: DateTime!
  }

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

    invoiceExport(id: ID!): InvoiceExport

    "Paginate through all bulk exports of the current channel"
    invoiceExportList(options: InvoiceExportListOptions): InvoiceExportList!

    """
    How many invoices a given range would export, so the dashboard can show the size of
    the job before anyone commits to running it.
    """
    invoiceExportPreviewCount(startsAt: DateTime!, endsAt: DateTime!): Int!
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

    """
    Queues a job that bundles every invoice issued in the given range into one archive.

    Returns immediately with a PENDING record; poll "invoiceExport" until it reports
    COMPLETED, then ask for a download URL. Requesting a range that is already
    PENDING or RUNNING returns the existing record instead of starting a second job.

    Scoped to the current channel, i.e. invoices belonging to other channels are never
    part of the archive.
    """
    createInvoiceExport(input: CreateInvoiceExportInput!): InvoiceExport!

    """
    Creates a short lived, signed URL which downloads the archive of a finished export.

    Same rules as "createInvoiceDownloadUrl": the signature is the authorization, so the
    URL is a secret.
    """
    createInvoiceExportDownloadUrl(id: ID!, expiresIn: Int, neverExpires: Boolean): String!

    "Deletes an export and the archive behind it. The invoices themselves are untouched."
    deleteInvoiceExport(id: ID!): DeletionResponse!
  }
`;
