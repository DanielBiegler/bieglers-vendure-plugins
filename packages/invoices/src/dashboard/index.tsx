import { defineDashboardExtension } from '@vendure/dashboard';
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
});
