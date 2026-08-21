import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  DashboardPageBlockDefinition,
  DetailPageButton,
  LabeledData,
  useLocalFormat
} from "@vendure/dashboard";
import gql from "graphql-tag";

type RelatedInvoiceItem = {
  id: string;
  createdAt: string;
  sequentialId: string;
  cancelsId: string | null;
};

type GetRelatedInvoicesQuery = { invoiceList: { items: RelatedInvoiceItem[] } };
type GetRelatedInvoicesQueryVariables = { orderId: string };

export const relatedInvoicesDocument = gql`
  query GetRelatedInvoices($orderId: String!) {
    invoiceList(
      options: { filter: { orderId: { eq: $orderId } }, sort: { createdAt: ASC }, take: 100 }
    ) {
      items {
        id
        createdAt
        sequentialId
        cancelsId
      }
    }
  }
` as TypedDocumentNode<GetRelatedInvoicesQuery, GetRelatedInvoicesQueryVariables>;

/**
 * Shared so that anything issuing documents for an order invalidates the very cache entry
 * this block reads, instead of leaving a stale list behind.
 */
export function relatedInvoicesQueryKey(orderId: string) {
  return ["GetRelatedInvoices", orderId];
}

function RelatedInvoicesList({ orderId }: { orderId: string }) {
  const { formatDate } = useLocalFormat();
  const { data, isPending, error } = useQuery({
    queryKey: relatedInvoicesQueryKey(orderId),
    queryFn: () => api.query(relatedInvoicesDocument, { orderId }),
  });

  // No loading indicator
  if (isPending) return null;

  if (error) {
    const reason = error.message;
    return (
      <div className="text-destructive text-sm">
        <Trans>Could not load invoices: {reason}</Trans>
      </div>
    );
  }

  const invoices = data?.invoiceList.items ?? [];
  if (!invoices.length)
    return (
      <div className="text-muted-foreground text-sm">
        <Trans>No invoices</Trans>
      </div>
    );

  return (
    <div className="space-y-2">
      {invoices.map(invoice => (
        <div key={invoice.id} className="space-y-1 p-3 border rounded-md">
          <LabeledData
            label={<Trans>Sequential ID</Trans>}
            value={
              <DetailPageButton
                href={`/invoices/${invoice.id}`}
                label={invoice.sequentialId}
                className="px-0 h-auto"
              />
            }
          />
          <LabeledData
            label={<Trans>Type</Trans>}
            // A set `cancels` reference is what makes a document a credit note, see the Invoice entity
            value={invoice.cancelsId ? <Trans>Credit note</Trans> : <Trans>Invoice</Trans>}
          />
          <LabeledData label={<Trans>Issued</Trans>} value={formatDate(invoice.createdAt)} />
        </div>
      ))}
    </div>
  );
}

export const relatedInvoices: DashboardPageBlockDefinition = {
  id: "related-invoices",
  title: <Trans>Invoices</Trans>,
  location: {
    pageId: "order-detail",
    column: "side",
    position: {
      blockId: "fulfillment-details",
      order: "after"
    }
  },
  // Spelled out instead of imported from `../constants`, because that would pull
  // @vendure/core into the dashboard bundle. Keep in sync with `InvoicePermissions`.
  requiresPermission: "ReadInvoice",
  // Drafts that are still being created have no ID yet, so there is nothing to relate to
  shouldRender: ({ entity }) => !!entity?.id,
  component: ({ context }) => <RelatedInvoicesList orderId={context.entity.id} />
};
