import { defineDashboardExtension } from '@vendure/dashboard';
import { orderDetailGenerateInvoice } from './action-bar-items';
import { invoiceDetail } from './invoice-detail';
import { invoiceList } from './invoice-list';
import { relatedInvoices } from './page-blocks';

defineDashboardExtension({
  routes: [invoiceList, invoiceDetail],
  widgets: [],
  actionBarItems: [
    orderDetailGenerateInvoice,
  ],
  pageBlocks: [
    relatedInvoices,
  ],
});
