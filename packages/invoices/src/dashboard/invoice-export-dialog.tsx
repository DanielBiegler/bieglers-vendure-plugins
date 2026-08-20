import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  Button,
  DateRangePicker,
  DefinedDateRange,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@vendure/dashboard";
import gql from "graphql-tag";
import { Download, FileArchive } from "lucide-react";
import { useEffect, useState } from "react";

import { INVOICE_EXPORT_LIST_QUERY_KEY } from "./invoice-export-list";

type InvoiceExportState = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

type InvoiceExportResult = {
  id: string;
  state: InvoiceExportState;
  filename: string | null;
  entryCount: number;
  fileSizeBytes: number;
  missingFileCount: number;
  errorMessage: string | null;
};

const previewCountDocument = gql`
  query InvoiceExportPreviewCount($startsAt: DateTime!, $endsAt: DateTime!) {
    invoiceExportPreviewCount(startsAt: $startsAt, endsAt: $endsAt)
  }
` as TypedDocumentNode<
  { invoiceExportPreviewCount: number },
  { startsAt: string; endsAt: string }
>;

const createExportDocument = gql`
  mutation CreateInvoiceExport($input: CreateInvoiceExportInput!) {
    createInvoiceExport(input: $input) {
      id
      state
    }
  }
` as TypedDocumentNode<
  { createInvoiceExport: { id: string; state: InvoiceExportState } },
  { input: { startsAt: string; endsAt: string } }
>;

const exportStatusDocument = gql`
  query InvoiceExport($id: ID!) {
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
` as TypedDocumentNode<{ invoiceExport: InvoiceExportResult | null }, { id: string }>;

const createDownloadUrlDocument = gql`
  mutation CreateInvoiceExportDownloadUrl($id: ID!) {
    createInvoiceExportDownloadUrl(id: $id)
  }
` as TypedDocumentNode<{ createInvoiceExportDownloadUrl: string }, { id: string }>;

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

function currentMonthToDate(): DefinedDateRange {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  };
}

/**
 * The picker hands back an **inclusive** end at 23:59:59.999 local time, while the API
 * takes an **exclusive** one. Adding a single millisecond lands exactly on the following
 * local midnight, which is what makes back to back periods tile: no invoice is counted in
 * two quarters, and none falls through the gap between them.
 */
function toApiRange(range: DefinedDateRange): { startsAt: string; endsAt: string } {
  return {
    startsAt: range.from.toISOString(),
    endsAt: new Date(range.to.getTime() + 1).toISOString(),
  };
}

/**
 * Bulk export of every invoice in a period, for handing to an accountant.
 *
 * The work runs as a job on the worker rather than streaming out of this request, so the
 * dialog polls for the result. See FEATURE_EXPORT.md for why.
 */
export function InvoiceExportDialog() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DefinedDateRange>(currentMonthToDate);
  const [exportId, setExportId] = useState<string | null>(null);

  const apiRange = toApiRange(range);

  const { data: preview, isFetching: isCounting } = useQuery({
    queryKey: ["invoiceExportPreviewCount", apiRange.startsAt, apiRange.endsAt],
    queryFn: () => api.query(previewCountDocument, apiRange),
    enabled: open && !exportId,
  });

  const { data: status } = useQuery({
    queryKey: ["invoiceExport", exportId],
    queryFn: () => api.query(exportStatusDocument, { id: exportId! }),
    enabled: !!exportId,
    // Nothing pushes job completion to the dashboard, so the state has to be pulled.
    // Stops on its own once the job reaches a terminal state.
    refetchInterval: query => {
      const state = query.state.data?.invoiceExport?.state;
      return state === "COMPLETED" || state === "FAILED" ? false : 1500;
    },
  });

  // Reaching a terminal state also changes the row shown below the invoice list. Done in
  // an effect rather than inline, so it fires once per transition instead of on every
  // render for as long as the dialog stays open.
  const settledState = status?.invoiceExport?.state;
  useEffect(() => {
    if (settledState === "COMPLETED" || settledState === "FAILED") {
      void queryClient.invalidateQueries({ queryKey: INVOICE_EXPORT_LIST_QUERY_KEY });
    }
  }, [settledState, queryClient]);

  const record = status?.invoiceExport ?? null;

  const { mutate: startExport, isPending: isStarting } = useMutation({
    mutationFn: api.mutate(createExportDocument),
    onSuccess: ({ createInvoiceExport }) => {
      setExportId(createInvoiceExport.id);
      // The table below the list polls only while something is in flight, so a freshly
      // queued export has to be announced to it rather than waited for.
      void queryClient.invalidateQueries({ queryKey: INVOICE_EXPORT_LIST_QUERY_KEY });
    },
    onError: error => {
      toast.error(t`Could not start the export`, {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

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

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    // Dropping the ID only detaches the dialog from the job; the export itself keeps
    // running and stays available in the export list.
    if (!nextOpen) setExportId(null);
  }

  const isRunning = record?.state === "PENDING" || record?.state === "RUNNING";
  const count = preview?.invoiceExportPreviewCount ?? 0;

  return (
    <Dialog open={open} onOpenChange={reset}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileArchive className="w-4 h-4" />
        <Trans>Export range</Trans>
      </Button>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Trans>Export invoices</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Bundles every invoice issued in the selected period into a downloadable
              archive. Only invoices of the current channel are included.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        {!exportId && (
          <div className="flex flex-col gap-4">
            <DateRangePicker dateRange={range} onDateRangeChange={setRange} />
            <p className="text-sm text-muted-foreground">
              {isCounting ? (
                <Trans>Counting invoices…</Trans>
              ) : (
                <Trans>{count} invoice(s) fall into this period.</Trans>
              )}
            </p>
          </div>
        )}

        {isRunning && (
          <p className="text-sm text-muted-foreground">
            <Trans>
              Building the archive. This can take a while for large periods, and continues
              even if you close this dialog.
            </Trans>
          </p>
        )}

        {record?.state === "FAILED" && (
          <p className="text-sm text-destructive">
            <Trans>The export failed: {record.errorMessage ?? "unknown error"}</Trans>
          </p>
        )}

        {record?.state === "COMPLETED" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              <Trans>
                {record.entryCount} invoice(s), {formatBytes(record.fileSizeBytes)}
              </Trans>
            </p>

            {record.missingFileCount > 0 && (
              <p className="text-sm text-destructive">
                <Trans>
                  {record.missingFileCount} file(s) were missing from storage and are not
                  part of the archive.
                </Trans>
              </p>
            )}

            <Button variant="outline" onClick={() => download({ id: record.id })}>
              <Download className="w-4 h-4" />
              {record.filename}
            </Button>
          </div>
        )}

        <DialogFooter>
          {!exportId ? (
            <Button
              disabled={isStarting || isCounting || count === 0}
              onClick={() => startExport({ input: apiRange })}
            >
              <Trans>Start export</Trans>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => reset(false)}>
              <Trans>Close</Trans>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
