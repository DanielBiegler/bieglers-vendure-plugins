import { Button, DashboardActionBarItem } from "@vendure/dashboard";

export const orderDetailGenerateInvoice: DashboardActionBarItem = {
  pageId: 'order-detail',
  id: 'generate-invoice',
  component: ({ context }) => {
    const order = context.entity;
    return (
      <Button variant="outline" onClick={() => alert(1)} disabled={!order}>
        Test
      </Button>
    );
  },
}
