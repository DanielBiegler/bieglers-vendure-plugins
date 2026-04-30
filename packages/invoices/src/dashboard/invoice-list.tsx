import { DetailPageButton, DashboardRouteDefinition, ListPage } from '@vendure/dashboard';
import gql from 'graphql-tag';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

type InvoiceListItem = {
  id: string;
  createdAt: string;
  updatedAt: string;
  sequentialId: string;
  orderId: string;
  assetUrl: string;
};

type GetInvoiceListQuery = {
  invoiceList: { items: InvoiceListItem[]; totalItems: number };
};

type GetInvoiceListQueryVariables = {
  options?: { skip?: number; take?: number } | null;
};

const invoiceListDocument = gql`
  query GetInvoiceList($options: InvoiceListOptions) {
    invoiceList(options: $options) {
      items {
        id
        createdAt
        updatedAt
        sequentialId
        orderId
        assetUrl
      }
      totalItems
    }
  }
` as TypedDocumentNode<GetInvoiceListQuery, GetInvoiceListQueryVariables>;

export const invoiceList: DashboardRouteDefinition = {
  path: '/invoices',
  component: route => (
    <ListPage
      pageId="invoice-list"
      title="Invoices"
      listQuery={invoiceListDocument}
      route={route}
      customizeColumns={{
        sequentialId: {
          cell: ({ row }) => (
            <DetailPageButton id={row.original.id} label={row.original.sequentialId} />
          ),
        },
      }}
    />
  ),
  navMenuItem: {
    sectionId: 'sales',
    id: 'invoices',
    title: 'Invoices',
  },
};
