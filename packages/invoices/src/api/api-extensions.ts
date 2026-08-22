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

    """
    The artifacts of this document, primary one first.

    Scoped to the current channel: an invoice covering a marketplace order spans every
    vendor involved, but each vendor only ever sees the files that settle their own
    share.
    """
    files: [InvoiceFile!]!
  }

  """
  One artifact of an invoice, e.g. the PDF or the machine readable XML beside it.
  """
  type InvoiceFile implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    "Name the file is served under, extension included."
    filename: String!

    """
    Opaque storage identifier. May be a filesystem path or a bucket key and is not
    necessarily reachable by a browser, so never treat it as a link - use
    "createInvoiceDownloadUrl" instead.
    """
    assetUrl: String!

    "Content type declared by the FileStrategy. Null when it did not claim one."
    mimeType: String

    """
    Size of the file in bytes.

    Deliberately a Float: GraphQL's Int is 32 bit signed and therefore caps at 2GB.
    """
    fileSizeBytes: Float!

    "Position within the invoice. Zero is the primary document."
    position: Int!
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

    """
    Number of files written into the archive. An invoice contributes one entry per
    artifact, so this can exceed the number of invoices in the range.
    """
    entryCount: Int!

    """
    Size of the archive in bytes. Zero until the export completes.

    Deliberately a Float: GraphQL's Int is 32 bit signed and therefore caps at 2GB, which
    a yearly export can exceed.
    """
    fileSizeBytes: Float!

    """
    Files whose row exists but whose bytes were gone from storage. They are skipped
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

    Must reference a plain invoice belonging to "orderId". Pointing it at a credit note,
    or at an invoice of a different order, is rejected.
    """
    cancels: ID
    """
    Free-text reason for the correction, e.g. "Item returned".

    Only meaningful together with "cancels". It is handed to your strategies rather than
    stored on the invoice row, so it only survives if your SnapshotStrategy writes it into
    the snapshot.
    """
    reason: String
  }

  input ReissueInvoiceInput {
    "The invoice to cancel. Must be a plain invoice rather than a credit note."
    cancels: ID!
    "Free-text reason, forwarded to the credit note. See CreateInvoiceInput.reason."
    reason: String
  }

  "The pair of documents written by the reissueInvoice mutation, in the order they were numbered."
  type ReissueInvoiceResult {
    "Cancels the original invoice in full."
    creditNote: Invoice!
    "Bills the order's current state."
    invoice: Invoice!
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
    Corrects an already issued invoice by cancelling it with a full credit note and
    immediately issuing a replacement invoice for the order's current state.

    This is the usual flow after an order was modified: the original stays on the books,
    the credit note reverses it, and the replacement bills the new amount, leaving the
    three document trail accountants expect. Both documents are written in one
    transaction, so you never end up with a credit note and no replacement.

    The order is taken from the cancelled invoice, so there is no way to credit one order
    and re-bill another.

    Nothing prevents reissuing an invoice that was already credited - the plugin does not
    track how much of an invoice is still outstanding.
    """
    reissueInvoice(input: ReissueInvoiceInput!): ReissueInvoiceResult!

    """
    """
    updateInvoice(input: UpdateInvoiceInput!): Invoice!

    """
    Creates a short lived, signed URL which downloads the invoice file.

    The file gets streamed through this instance, because storage strategies hand out
    opaque identifiers that a browser generally cannot resolve on its own.

    Anyone holding the URL can download the file until it expires, so treat it as a
    secret and keep the lifetime short. Requires the plugins' "download" option.

    "fileId" picks which artifact of the invoice to serve and defaults to the primary
    one. It must belong to the given invoice and be visible in the current channel;
    the signature covers it, so a minted URL cannot be edited into a different file.

    "expiresIn" is the validity in seconds and is taken at face value, so a value in
    the past yields a URL which is already dead. Defaults to the configured
    "download.defaultExpiresIn".

    "neverExpires" mints a URL that stays valid forever, for cases like handing
    customers a permanent link to their own invoice. Such a URL can only be retracted
    by rotating the signing secret, which invalidates every other URL as well, so
    prefer a finite lifetime whenever the recipient can ask for a fresh link.
    Specifying it together with "expiresIn" is an error.
    """
    createInvoiceDownloadUrl(id: ID!, fileId: ID, expiresIn: Int, neverExpires: Boolean): String!

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
