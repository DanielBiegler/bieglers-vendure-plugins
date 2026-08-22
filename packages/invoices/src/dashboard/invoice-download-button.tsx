import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { api, Button, toast } from "@vendure/dashboard";
import gql from "graphql-tag";
import { Download } from "lucide-react";

type CreateInvoiceDownloadUrlMutation = { createInvoiceDownloadUrl: string };
type CreateInvoiceDownloadUrlVariables = { id: string; fileId?: string | null };

const createInvoiceDownloadUrlDocument = gql`
  mutation CreateInvoiceDownloadUrl($id: ID!, $fileId: ID) {
    createInvoiceDownloadUrl(id: $id, fileId: $fileId)
  }
` as TypedDocumentNode<CreateInvoiceDownloadUrlMutation, CreateInvoiceDownloadUrlVariables>;

/**
 * Files live behind an {@link AssetStorageStrategy} whose identifiers a browser cannot
 * resolve, so the URL is minted per click and expires shortly after. Minting it upfront
 * would burn its lifetime while the page sits open and hand out a capability nobody asked
 * for, hence the button rather than a plain link.
 *
 * `fileId` picks one artifact of an invoice that has several. Left out, the server serves
 * the primary document, which is what keeps list rows from having to load every
 * invoice's files just to render a button.
 */
export function InvoiceDownloadButton({
  invoiceId,
  fileId,
  size,
  label,
}: {
  invoiceId: string;
  fileId?: string;
  size?: "sm" | "default";
  label?: React.ReactNode;
}) {
  const { t } = useLingui();

  const { mutate, isPending } = useMutation({
    mutationFn: api.mutate(createInvoiceDownloadUrlDocument),
    onSuccess: ({ createInvoiceDownloadUrl }) => {
      // The endpoint answers with a Content-Disposition attachment, so handing the URL to
      // an anchor downloads the file without navigating away or needing CORS.
      const anchor = document.createElement("a");
      anchor.href = createInvoiceDownloadUrl;
      anchor.click();
    },
    onError: error => {
      toast.error(t`Could not create a download link`, {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  return (
    <Button
      variant="outline"
      size={size ?? "default"}
      disabled={isPending}
      onClick={() => mutate({ id: invoiceId, fileId })}
    >
      <Download className="w-4 h-4" />
      {label ?? <Trans>Download</Trans>}
    </Button>
  );
}
