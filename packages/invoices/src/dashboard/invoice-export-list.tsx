import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ColumnFiltersState, SortingState } from "@tanstack/react-table";
import {
  api,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DashboardPageBlockDefinition,
  DateTime,
  PaginatedListDataTable,
  RowAction,
  toast,
} from "@vendure/dashboard";
import gql from "graphql-tag";
import { useEffect, useRef, useState } from "react";

type InvoiceExportState = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

type InvoiceExportItem = {
  id: string;
  createdAt: string;
  startsAt: string;
  endsAt: string;
  state: InvoiceExportState;
  filename: string | null;
  entryCount: number;
  fileSizeBytes: number;
  missingFileCount: number;
  errorMessage: string | null;
};

type GetInvoiceExportListQuery = {
  invoiceExportList: { items: InvoiceExportItem[]; totalItems: number };
};

type GetInvoiceExportListQueryVariables = {
  options?: { skip?: number; take?: number } | null;
};

const invoiceExportListDocument = gql`
  query GetInvoiceExportList($options: InvoiceExportListOptions) {
    invoiceExportList(options: $options) {
      items {
        id
        createdAt
        startsAt
        endsAt
        state
        filename
        entryCount
        fileSizeBytes
        missingFileCount
        errorMessage
      }
      totalItems
    }
  }
` as TypedDocumentNode<GetInvoiceExportListQuery, GetInvoiceExportListQueryVariables>;

/**
 * Deliberately separate from the table's own query. It decides whether the block appears at
 * all, and drives the polling while a job is in flight — neither of which the table can do
 * on its own, because it owns its query key and re-fetches only what its visible columns
 * select. Kept to two fields so the poll stays cheap.
 */
const invoiceExportStatusDocument = gql`
  query GetInvoiceExportStatus {
    invoiceExportList(options: { take: 100, sort: { createdAt: DESC } }) {
      totalItems
      items {
        id
        state
      }
    }
  }
` as TypedDocumentNode<
  { invoiceExportList: { totalItems: number; items: Array<{ id: string; state: InvoiceExportState }> } },
  Record<string, never>
>;

const createDownloadUrlDocument = gql`
  mutation CreateInvoiceExportDownloadUrl($id: ID!) {
    createInvoiceExportDownloadUrl(id: $id)
  }
` as TypedDocumentNode<{ createInvoiceExportDownloadUrl: string }, { id: string }>;

const deleteExportDocument = gql`
  mutation DeleteInvoiceExport($id: ID!) {
    deleteInvoiceExport(id: $id) {
      result
      message
    }
  }
` as TypedDocumentNode<
  { deleteInvoiceExport: { result: string; message?: string | null } },
  { id: string }
>;

export const INVOICE_EXPORT_LIST_QUERY_KEY = ["invoiceExportList"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function StateBadge({ state }: { state: InvoiceExportState }) {
  switch (state) {
    case "COMPLETED":
      return <Badge variant="secondary"><Trans>Completed</Trans></Badge>;
    case "FAILED":
      return <Badge variant="destructive"><Trans>Failed</Trans></Badge>;
    default:
      return <Badge variant="outline"><Trans>Building…</Trans></Badge>;
  }
}

function InvoiceExportList() {
  const { t } = useLingui();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [filters, setFilters] = useState<ColumnFiltersState>([]);

  const { data: status } = useQuery({
    queryKey: INVOICE_EXPORT_LIST_QUERY_KEY,
    queryFn: () => api.query(invoiceExportStatusDocument, {}),
    // Nothing pushes job completion to the dashboard, so a running export has to be pulled.
    // Stops once nothing is in flight.
    refetchInterval: query => {
      const items = query.state.data?.invoiceExportList.items ?? [];
      return items.some(item => item.state === "PENDING" || item.state === "RUNNING") ? 2000 : false;
    },
  });

  const refresh = useRef<(() => void) | undefined>(undefined);
  const fingerprint = status?.invoiceExportList.items.map(item => `${item.id}:${item.state}`).join(",");
  const previousFingerprint = useRef<string | undefined>(undefined);
  useEffect(() => {
    // The first observation only establishes the baseline: refreshing there would re-fetch
    // a table that has just loaded anyway.
    const isFirst = previousFingerprint.current === undefined;
    if (!isFirst && previousFingerprint.current !== fingerprint) refresh.current?.();
    previousFingerprint.current = fingerprint;
  }, [fingerprint]);

  const { mutate: download } = useMutation({
    mutationFn: api.mutate(createDownloadUrlDocument),
    onSuccess: ({ createInvoiceExportDownloadUrl }) => {
      // The endpoint answers with a Content-Disposition attachment, so handing the URL to
      // an anchor downloads the file without navigating away or needing CORS.
      const anchor = document.createElement("a");
      anchor.href = createInvoiceExportDownloadUrl;
      anchor.click();
    },
    onError: error => {
      toast.error(t`Could not create a download link`, {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const rowActions: Array<RowAction<InvoiceExportItem>> = [
    {
      label: <Trans>Download archive</Trans>,
      onClick: row => {
        // Row actions are defined once for the whole table rather than per row, so an
        // unfinished export has to be turned away here instead of being hidden.
        if (row.original.state !== "COMPLETED") {
          toast.error(t`This export has no archive to download yet`);
          return;
        }
        download({ id: row.original.id });
      },
    },
  ];

  // The block is only meaningful once somebody has actually exported something, and an
  // empty table below the invoice list is just noise on a fresh instance.
  if (!status?.invoiceExportList.totalItems) return null;

  return (
    // The card is built by hand because `FullWidthPageBlock`, which is what a `column:
    // "full"` extension block renders as, takes only `children` and drops the definition's
    // `title` on the floor. This is the same shell an ordinary `PageBlock` puts around its
    // content, and without it the second table on the page arrives with no heading at all.
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans>Invoice exports</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PaginatedListDataTable
          listQuery={invoiceExportListDocument}
          deleteMutation={deleteExportDocument}
          registerRefresher={refresher => {
            refresh.current = refresher;
          }}
          rowActions={rowActions}
          defaultColumnOrder={[
            "startsAt",
            "endsAt",
            "createdAt",
            "state",
            "entryCount",
            "fileSizeBytes",
            "missingFileCount",
          ]}
          defaultVisibility={{
            id: false,
            filename: false,
            errorMessage: false,
          }}
          customizeColumns={{
            startsAt: {
              header: () => <Trans>From</Trans>,
            },
            endsAt: {
              header: () => <Trans>Until</Trans>,
              // The stored bound is exclusive, so it is stepped back by a millisecond to show
              // the last instant actually covered rather than the next period's first one,
              // which reads as an off-by-one to an administrator.
              cell: ({ row }) => (
                <DateTime value={new Date(new Date(row.original.endsAt).getTime() - 1).toISOString()} />
              ),
            },
            createdAt: {
              header: () => <Trans>Requested</Trans>,
            },
            state: {
              header: () => <Trans>Status</Trans>,
              cell: ({ row }) => <StateBadge state={row.original.state} />,
            },
            entryCount: {
              header: () => <Trans>Invoices</Trans>,
              cell: ({ row }) => (row.original.state === "COMPLETED" ? row.original.entryCount : "—"),
            },
            fileSizeBytes: {
              header: () => <Trans>Size</Trans>,
              cell: ({ row }) =>
                row.original.state === "COMPLETED" ? formatBytes(row.original.fileSizeBytes) : "—",
            },
            missingFileCount: {
              header: () => <Trans>Missing files</Trans>,
              cell: ({ row }) =>
                row.original.missingFileCount > 0 ? (
                  <span className="text-destructive">{row.original.missingFileCount}</span>
                ) : (
                  row.original.missingFileCount
                ),
            },
          }}
          page={page}
          itemsPerPage={pageSize}
          sorting={sorting}
          columnFilters={filters}
          onPageChange={(_, page, perPage) => {
            setPage(page);
            setPageSize(perPage);
          }}
          onSortChange={(_, sorting) => setSorting(sorting)}
          onFilterChange={(_, filters) => setFilters(filters)}
        />
      </CardContent>
    </Card>
  );
}

export const invoiceExports: DashboardPageBlockDefinition = {
  id: "invoice-exports",
  // No `title`: a `column: "full"` block renders as a `FullWidthPageBlock`, which never
  // reads it. The heading lives in the component instead.
  location: {
    // Keep `pageId` in sync with the ListPage in `invoice-list.tsx`. `list-table` is the
    // blockId Vendure gives the table of every standard list page.
    pageId: "invoice-list",
    column: "full",
    position: {
      blockId: "list-table",
      order: "after",
    },
  },
  // Spelled out instead of imported from `../constants`, because that would pull
  // @vendure/core into the dashboard bundle. Keep in sync with `InvoicePermissions`.
  requiresPermission: "ReadInvoice",
  component: () => <InvoiceExportList />,
};
