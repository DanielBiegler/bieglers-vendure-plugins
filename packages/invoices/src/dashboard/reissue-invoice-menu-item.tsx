import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  api,
  DashboardActionBarItem,
  DropdownMenuItem,
  toast,
} from "@vendure/dashboard";
import gql from "graphql-tag";
import { FileText } from "lucide-react";
import { useState } from "react";

import { relatedInvoicesDocument, relatedInvoicesQueryKey } from "./page-blocks";

type ReissueInvoiceMutation = {
  reissueInvoice: {
    creditNote: { id: string; sequentialId: string };
    invoice: { id: string; sequentialId: string };
  };
};
type ReissueInvoiceVariables = { input: { cancels: string } };

const reissueInvoiceDocument = gql`
  mutation ReissueInvoice($input: ReissueInvoiceInput!) {
    reissueInvoice(input: $input) {
      creditNote {
        id
        sequentialId
      }
      invoice {
        id
        sequentialId
      }
    }
  }
` as TypedDocumentNode<ReissueInvoiceMutation, ReissueInvoiceVariables>;

/**
 * The document a correction has to cancel is the newest one that is not a credit note:
 * the mutation rejects credit notes, and after an earlier reissue it is the replacement
 * that carries the amount the customer currently owes.
 */
function findReissuableInvoice<T extends { cancelsId: string | null }>(
  invoices: readonly T[]
): T | null {
  return [...invoices].reverse().find(invoice => !invoice.cancelsId) ?? null;
}

function ReissueInvoiceMenuItem({ orderId }: { orderId: string }) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: relatedInvoicesQueryKey(orderId),
    queryFn: () => api.query(relatedInvoicesDocument, { orderId }),
  });

  const original = findReissuableInvoice(data?.invoiceList.items ?? []);

  const { mutate, isPending } = useMutation({
    mutationFn: api.mutate(reissueInvoiceDocument),
    onSuccess: ({ reissueInvoice }) => {
      toast.success(t`Reissued invoice ${original?.sequentialId}`, {
        description: t`Credit note ${reissueInvoice.creditNote.sequentialId} cancels it, invoice ${reissueInvoice.invoice.sequentialId} replaces it.`,
      });
      void queryClient.invalidateQueries({ queryKey: relatedInvoicesQueryKey(orderId) });
      // Both documents write an order history entry. Spelled out because the dashboard
      // keeps this key internal; keep in sync with its `orderHistoryQueryKey`.
      void queryClient.invalidateQueries({ queryKey: ["OrderHistory", orderId] });
    },
    onError: error => {
      toast.error(t`Could not reissue the invoice`, {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  // Nothing to correct until the order has an invoice
  if (!original) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        nativeButton={false}
        render={
          // Letting the click close the menu would unmount this item along with the
          // dialog it holds, so the confirmation would never be seen.
          <DropdownMenuItem
            closeOnClick={false}
            disabled={isPending}
            onClick={event => {
              event.preventDefault();
              setOpen(true);
            }}
          />
        }
      >
        <FileText className="w-4 h-4" />
        <Trans>Reissue invoice</Trans>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Reissue invoice {original.sequentialId}?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              A credit note will cancel invoice {original.sequentialId} in full and a new
              invoice will bill the order's current state. All three documents stay on the
              books, so this cannot be undone.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={isPending}
            onClick={() => {
              mutate({ input: { cancels: original.id } });
              setOpen(false);
            }}
          >
            <Trans>Reissue</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const reissueInvoice: DashboardActionBarItem = {
  pageId: "order-detail",
  type: "dropdown",
  // Spelled out instead of imported from `../constants`, because that would pull
  // @vendure/core into the dashboard bundle. Keep in sync with `InvoicePermissions`.
  requiresPermission: "CreateInvoice",
  // Drafts that are still being created have no ID yet, so they cannot have an invoice
  component: ({ context }) =>
    context.entity?.id ? <ReissueInvoiceMenuItem orderId={context.entity.id} /> : null,
};
