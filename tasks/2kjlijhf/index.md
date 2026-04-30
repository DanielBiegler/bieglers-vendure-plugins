---
title: Allow multiple InvoiceConfigs per Channel
priority: 0
created: 2026-04-29T12:46:26.681Z
---

Lets say a plugin user wants to have an separate invoice sequences for two large B2B partners, `FOO123` and `BAR123`. The products live on the same Channel, so the "per Channel Config" approach falls flat. The solution would be to allow custom setups and multiple `InvoiceConfigs` per Channel.

1. Lets say a new order gets placed, and the Invoice Service calls `createInvoice`
2. Currently at this point we only accept the orderId which is not enough for other plugin authors to make use of the existing `getNextSequentialId`, because the dedicated Config needs to be fetched for the sequence.

How about we rename InvoiceConfig to InvoiceSequence with these fields:

- code: string
- sequence: number
- channels: Channel[]
- customFields: {}

And we require createInvoice to use the unique sequence code as argument.
By default we can reserve two sequences: "__default_invoice", "__default_credit" ?

- If the plugin subscribes to the OrderPlacedEvent we know the createInvoice argument oughta be "__default_invoice"
- If the plugin subscribes to refunds, we also know to use "__default_credit"
- If a custom plugin author wants their own functionality they can call the invoice service directly with their own sequence code

This would also allow them to use custom invoice prefixes for customer groups while still using the default refund-credit sequence. Mh, this sounds pretty good.

TODO: What about custom file strategies for their custom sequences?

TODO: Think about making `getNextSequentialId` public maybe?
