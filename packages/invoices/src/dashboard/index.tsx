import { defineDashboardExtension } from '@vendure/dashboard';
import { orderDetailGenerateInvoice } from './actionBarItems';
import { invoiceDetail } from './invoice-detail';
import { invoiceList } from './invoice-list';

defineDashboardExtension({
  routes: [invoiceList, invoiceDetail],
  widgets: [],
  actionBarItems: [
    orderDetailGenerateInvoice,
  ],
  pageBlocks: [],
});
