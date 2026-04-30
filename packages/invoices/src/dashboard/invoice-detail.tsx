import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  DashboardRouteDefinition,
  getDetailQueryOptions,
  Page,
  PageBlock,
  PageLayout,
  PageTitle
} from '@vendure/dashboard';
import gql from 'graphql-tag';

type CreditNoteDetail = {
  id: string;
  sequentialId: string;
  assetUrl: string;
};

type InvoiceDetail = {
  id: string;
  createdAt: string;
  updatedAt: string;
  sequentialId: string;
  orderId: string;
  assetUrl: string;
  creditNotes: CreditNoteDetail[];
} | null;

type GetInvoiceQuery = { invoice: InvoiceDetail };
type GetInvoiceQueryVariables = { input: { id?: string | null; sequentialId?: string | null } };

const invoiceDetailDocument = gql`
  query GetInvoice($input: GetSingleInvoiceInput!) {
    invoice(input: $input) {
      id
      createdAt
      updatedAt
      sequentialId
      orderId
      assetUrl
      creditNotes {
        id
        sequentialId
        assetUrl
      }
    }
  }
` as TypedDocumentNode<GetInvoiceQuery, GetInvoiceQueryVariables>;

function InvoiceDetailPage({ route }: { route: any }) {
  const { id } = route.useParams() as { id: string };
  const { data } = useSuspenseQuery(
    getDetailQueryOptions(invoiceDetailDocument, { input: { id } }),
  );
  const invoice = (data as GetInvoiceQuery).invoice;

  return (
    <Page pageId="invoice-detail">
      <PageTitle>{invoice?.sequentialId ?? 'Invoice'}</PageTitle>
      {/* <PageActionBar></PageActionBar> */}
      <PageLayout>
        <PageBlock column="main" blockId="invoice-info" title="Invoice Details">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="font-medium text-muted-foreground">Sequential ID</dt>
            <dd>{invoice?.sequentialId}</dd>
            <dt className="font-medium text-muted-foreground">Order ID</dt>
            <dd>{invoice?.orderId}</dd>
            <dt className="font-medium text-muted-foreground">Created</dt>
            <dd>{invoice?.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : '—'}</dd>
            <dt className="font-medium text-muted-foreground">Download</dt>
            <dd>
              <a
                href={invoice?.assetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Invoice file
              </a>
            </dd>
          </dl>
        </PageBlock>
        {(invoice?.creditNotes?.length ?? 0) > 0 && (
          <PageBlock column="main" blockId="credit-notes" title="Credit Notes">
            <ul className="space-y-2 text-sm">
              {invoice!.creditNotes.map(cn => (
                <li key={cn.id} className="flex items-center justify-between">
                  <span>{cn.sequentialId}</span>
                  <a
                    href={cn.assetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          </PageBlock>
        )}
      </PageLayout>
    </Page>
  );
}

export const invoiceDetail: DashboardRouteDefinition = {
  path: '/invoices/$id',
  component: route => <InvoiceDetailPage route={route} />,
};
