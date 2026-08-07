import { defineDashboardExtension } from '@vendure/dashboard';
import { invoiceCreatedHistoryEntry } from './history-entries';
import { invoiceDetail } from './invoice-detail';
import { invoiceList } from './invoice-list';
import { relatedInvoices } from './page-blocks';

defineDashboardExtension({
  routes: [
    invoiceList,
    invoiceDetail
  ],
  pageBlocks: [
    relatedInvoices,
  ],
  historyEntries: [
    invoiceCreatedHistoryEntry,
  ],
});
