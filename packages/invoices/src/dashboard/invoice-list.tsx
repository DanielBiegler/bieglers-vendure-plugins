import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { DashboardRouteDefinition, DetailPageButton, ListPage } from '@vendure/dashboard';
import gql from 'graphql-tag';

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

/**
 * The nav menu only accepts a plain string, which it runs through `i18n.t()` when
 * rendering. Declaring it via `msg` is what gets the string into the catalogs.
 */
const navMenuTitle = msg`Invoices`;

export const invoiceList: DashboardRouteDefinition = {
  path: '/invoices',
  component: route => (
    <ListPage
      pageId="invoice-list"
      title={<Trans>Invoices</Trans>}
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
    title: navMenuTitle.id,
    // Spelled out instead of imported from `../constants`, because that would pull
    // @vendure/core into the dashboard bundle. Keep in sync with `InvoicePermissions`.
    requiresPermission: 'ReadInvoice',
  },
};
