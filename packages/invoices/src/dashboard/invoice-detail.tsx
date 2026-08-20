import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { Trans } from '@lingui/react/macro';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import {
  api,
  DashboardRouteDefinition,
  DateTime,
  DetailPageButton,
  Page,
  PageActionBar,
  PageBlock,
  PageLayout,
  PageTitle
} from '@vendure/dashboard';
import gql from 'graphql-tag';
import { InvoiceDownloadButton } from './invoice-download-button';

type InvoiceDetail = {
  id: string;
  createdAt: string;
  updatedAt: string;
  sequentialId: string;
  order: { id: string; code: string };
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
      order {
        id
        code
      }
    }
  }
` as TypedDocumentNode<GetInvoiceQuery, GetInvoiceQueryVariables>;

type CreditNoteItem = {
  id: string;
  createdAt: string;
  sequentialId: string;
};

type GetCreditNotesQuery = { invoiceList: { items: CreditNoteItem[] } };
type GetCreditNotesQueryVariables = { invoiceId: string };

/**
 * Credit notes are the invoices whose `cancels` reference points back at this invoice.
 * `IdOperators` takes a String, not an ID, hence the seemingly odd variable type.
 */
const creditNotesDocument = gql`
  query GetCreditNotesForInvoice($invoiceId: String!) {
    invoiceList(
      options: { filter: { cancelsId: { eq: $invoiceId } }, sort: { createdAt: ASC }, take: 100 }
    ) {
      items {
        id
        createdAt
        sequentialId
      }
    }
  }
` as TypedDocumentNode<GetCreditNotesQuery, GetCreditNotesQueryVariables>;

function InvoiceDetailPage({ route }: { route: any }) {
  const { id } = route.useParams() as { id: string };
  // `getDetailQueryOptions` is not usable here, because it insists on a plain
  // `{ id }` variable while this query takes a `GetSingleInvoiceInput`.
  const { data } = useSuspenseQuery({
    queryKey: ['GetInvoice', id],
    queryFn: () => api.query(invoiceDetailDocument, { input: { id } }),
  });
  const invoice = data.invoice;

  // PageLayout only picks up PageBlocks that are its direct children, so this
  // cannot be extracted into a component of its own.
  const { data: creditNotesData } = useQuery({
    queryKey: ['GetCreditNotesForInvoice', invoice?.id],
    queryFn: () => api.query(creditNotesDocument, { invoiceId: invoice!.id }),
    enabled: !!invoice?.id,
  });
  const creditNotes = creditNotesData?.invoiceList.items ?? [];

  return (
    <Page pageId="invoice-detail">
      <PageTitle>{invoice?.sequentialId ?? <Trans>Invoice</Trans>}</PageTitle>
      <PageActionBar>{invoice && <InvoiceDownloadButton invoiceId={invoice.id} />}</PageActionBar>
      <PageLayout>
        <PageBlock column="main" blockId="invoice-info" title={<Trans>Invoice Details</Trans>}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="font-medium text-muted-foreground"><Trans>Sequential ID</Trans></dt>
            <dd>{invoice?.sequentialId}</dd>
            <dt className="font-medium text-muted-foreground"><Trans>Order</Trans></dt>
            <dd>
              {invoice?.order && (
                <DetailPageButton
                  href={`/orders/${invoice.order.id}`}
                  label={invoice.order.code}
                  className="px-0 h-auto"
                />
              )}
            </dd>
            <dt className="font-medium text-muted-foreground"><Trans>Issued</Trans></dt>
            <dd>{invoice?.createdAt ? <DateTime value={invoice.createdAt} /> : '—'}</dd>
          </dl>
        </PageBlock>
        {creditNotes.length > 0 && (
          <PageBlock column="main" blockId="credit-notes" title={<Trans>Credit Notes</Trans>}>
            <ul className="space-y-2 text-sm">
              {creditNotes.map(cn => (
                <li key={cn.id} className="flex items-center justify-between gap-2">
                  <span>{cn.sequentialId}</span>
                  <DateTime value={cn.createdAt} />
                  <InvoiceDownloadButton invoiceId={cn.id} size="sm" />
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
  loader: async ({ context, params }: { context: any; params: { id: string } }) => {
    const data = await context.queryClient.ensureQueryData({
      queryKey: ['GetInvoice', params.id],
      queryFn: () => api.query(invoiceDetailDocument, { input: { id: params.id } }),
    });
    return {
      breadcrumb: [
        { path: '/invoices', label: <Trans>Invoices</Trans> },
        data.invoice?.sequentialId ?? <Trans>Invoice</Trans>,
      ],
    };
  },
  component: route => <InvoiceDetailPage route={route} />,
};
