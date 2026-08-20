import { defineDashboardExtension } from '@vendure/dashboard';
import { invoiceCreatedHistoryEntry } from './history-entries';
import { invoiceDetail } from './invoice-detail';
import { InvoiceExportDialog } from './invoice-export-dialog';
import { invoiceExports } from './invoice-export-list';
import { invoiceList } from './invoice-list';
import { relatedInvoices } from './page-blocks';

defineDashboardExtension({
  routes: [
    invoiceList,
    invoiceDetail
  ],
  actionBarItems: [
    {
      // Keep in sync with the `pageId` of the ListPage in `invoice-list.tsx`
      pageId: 'invoice-list',
      component: () => <InvoiceExportDialog />,
    },
  ],
  pageBlocks: [
    relatedInvoices,
    invoiceExports,
  ],
  historyEntries: [
    invoiceCreatedHistoryEntry,
  ],
});
