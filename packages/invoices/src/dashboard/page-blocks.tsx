import { DashboardPageBlockDefinition } from "@vendure/dashboard";

export const relatedInvoices: DashboardPageBlockDefinition = {
  id: "related-invoices",
  // TODO i18n
  title: "Related Invoices",
  location: {
    pageId: "order-detail",
    column: "side",
    position: {
      blockId: "fulfillment-details",
      order: "after"
    }
  },
  component: ({ context }) => {
    return <div>Related Invoices for Order</div>
  }
};