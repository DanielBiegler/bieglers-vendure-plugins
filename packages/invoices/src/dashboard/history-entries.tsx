import { Trans } from "@lingui/react/macro";
import { DashboardHistoryEntryComponent, DetailPageButton, HistoryEntry } from "@vendure/dashboard";
import { FileText } from "lucide-react";

/**
 * Mirrors the `OrderHistoryEntryData` augmentation of the server. Kept as a local type
 * because importing from `../types` would drag @vendure/core into the browser bundle.
 */
type InvoiceCreatedData = {
  invoiceId: string;
  sequentialId: string;
  cancelsSequentialId?: string;
};

export const invoiceCreatedHistoryEntry: DashboardHistoryEntryComponent = {
  // Spelled out rather than imported from `../constants`, which would pull
  // @vendure/core into the bundle. Keep in sync with `PLUGIN_INVOICE_CREATED`.
  type: "PLUGIN_INVOICE_CREATED",
  component: ({ entry }) => {
    const data = entry.data as InvoiceCreatedData;
    const cancelled = data.cancelsSequentialId;
    const isCreditNote = !!cancelled;

    return (
      <HistoryEntry
        entry={entry}
        title={isCreditNote ? <Trans>Credit note issued</Trans> : <Trans>Invoice issued</Trans>}
        timelineIcon={<FileText />}
        timelineIconClassName="bg-success/10 text-success"
      >
        <div className="flex items-center gap-2 text-xs">
          <DetailPageButton
            href={`/invoices/${data.invoiceId}`}
            label={data.sequentialId}
            className="px-0 h-auto"
          />
          {cancelled && (
            <span className="text-muted-foreground">
              <Trans>cancels {cancelled}</Trans>
            </span>
          )}
        </div>
      </HistoryEntry>
    );
  },
};
