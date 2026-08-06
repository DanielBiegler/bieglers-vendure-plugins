![Banner Image](https://raw.githubusercontent.com/DanielBiegler/bieglers-vendure-plugins/master/packages/invoices/assets/thumbnail_16x9.jpeg)

# Vendure Plugin: Invoices

Fully customizable invoices / credit notes for single-/ and multi-vendor shops

<a href="https://www.npmjs.com/package/@danielbiegler/vendure-plugin-invoices" target="_blank">
  <img src="https://badge.fury.io/js/@danielbiegler%2Fvendure-plugin-invoices.svg" alt="npm version badge" height="18">
</a>

## Features

- TODO

### End-To-End Tests

```
TODO
```

## How To: Usage

TODO

See [api-extensions.ts](https://github.com/DanielBiegler/bieglers-vendure-plugins/blob/master/packages/invoices/src/api/api-extensions.ts) for a complete overview of the graphql extensions and types.

### 1. Add the plugin to your Vendure Config

You can find the package over on [npm](https://www.npmjs.com/package/@danielbiegler/vendure-plugin-invoices) and install it via:

```bash
npm i @danielbiegler/vendure-plugin-invoices
```

Add it to your [Vendure Config][configuration]:

```ts
import { TODO } from "@danielbiegler/vendure-plugin-invoices";
export const config: VendureConfig = {
  // ...
  plugins: [
    TODO
  ],
}
```

TODO

Please refer to the specific [docs](https://github.com/DanielBiegler/bieglers-vendure-plugins/blob/master/packages/invoices/src/types.ts) for how and what you can customize.

### 2. Generate a database migration

This plugin adds // TODO, which requires you to generate a database migration. See Vendure's [migration documentation][migrations] for further guidance.

### 3. // TODO

## Roadmap

- Dashboard
  - [ ] List Page
  - [ ] Detail Page
  - [ ] Order Detail Page "Related Invoices" Section. Should show issued date, type (invoice / credit note), link to detail page.

- Extensions
  - [ ] Custom Fields: Kleinunternehmer&shy;regelung

- Strategies
  - [ ] PDFKit (ZUGFeRD?)
  - [ ] Typst

## Design Reasons and Decisions

### Gapless invoice sequences via row level transaction locks

The counter lives in a regular row, incremented inside the same transaction that creates the invoice. If the transaction rolls back, e.g. PDF generation fails, the counter rolls back with it: the database guarantees no gap ever appears.

Concurrent invoice-jobs must queue at the lock, reducing throughput in comparison to a native sequence type, but **sequences are non-transactional** and a consumed value is not being returned to the pool!

The row-level lock is the right trade-off for invoicing, because the throughput cost is negligible at realistic invoice volumes, and gaplessness is a legal requirement rather than just a nice-to-have.

### Customizable Vendor Prefixes

While looking into some real world invoice identifiers by marketplaces I found patterns that look roughly like this: `$VENDOR_$YEAR_$SEQUENCE` 

The `SequentialIdPrefixGenerationStrategy` can be used to achieve this, but take care when providing vendors with the ability to influence the generation. The actual sequential invoice identifiers must be, like the name suggests, clearly sequential and gapless for tax and compliance reasons i.e. it'd be *pretty bad* if your invoices suddenly switch their format halfway through the fiscal year.

### Customizable PDF Templates

There is no size-fits-all solution here especially for multivendor setups because you have to make some important tradeoffs regarding customizability, security, stability and compute resources.

On a personal machine you might just install [Puppeteer](https://github.com/puppeteer/puppeteer) and tell it to use your locally-installed Chrome/Firefox binaries in order to convert HTML to PDF for the best layout compatability, but this becomes quite a [heftyyyy dependency](https://github.com/puppeteer/puppeteer/issues/3027) because servers usually don't have an installed browser. Without specific custom build targets your project now depends on an entire browser engine just to generate a couple kilobytes of PDF.

Personally I much prefer programmatic PDF generation with a library like [PDFKit](https://github.com/foliojs/pdfkit) but this comes with some other tradeoffs. Apart from fewer dependencies and layout options, more importantly, you can't just give untrusted vendors access to customize the PDF generation now, because running untrusted JavaScript code in Node is still (2026) a major PITA. An attacker could crash your entire instance or find other privilege escalations potentially.

This is why this plugin only defines the interface and actual implementation details are handed off to the instance owner. For me personally, I decided separate vendors don't need the ability to customize the invoice template, but you certainly are able to do so, provided you create your own API extensions, generation strategy and bear the complexity cost.

The aim is to provide a sound foundation with some practical, generally useful implementations to choose from, but if your specific business needs custom data in the PDF you ought to roll your own implementation.

#### Legal documents and mutability

Another relevant detail regarding file generation: invoice data is to be treated as read-only and should ideally be reproducible.

Vendures [Order][order] entity by design is mutable and its state is supposed to change over time. This clashes with the legal requirement of immutable invoices, because generating an invoice for a given Order at two or more different points in time may or may not yield different results.

A realistic scenario where this matters: Let's say your S3 bucket got breached, attackers delete your backed up invoices and the tax man audits you. Now you're in trouble because Order entities may or may not have changed over time and you can't reproduce the original documents.

That's where the `SnapshotStrategy` comes in and saves the day. At the time of creation, it shall create a read-only snapshot with all the needed datapoints like sender, recipient, order details, meta data for the document, custom fields, etc. and `FileStrategy` shall solely rely on this snapshot as source of truth, this makes the output deterministically reproducible.

Additionally, we as plugin can't know what everyone needs in their invoice, some users need the basics, some need custom fields, etc. The `SnapshotStrategy` lets us abstract that fact and anyone can decide for themselves.

### Should invoices be a single entity?

Yes - invoices and credit notes share the same structure (sequential ID, snapshot, file, storage metadata, channel, order reference) and occupy the same legal ledger. The gapless sequence counter can span both document types because both are accounting records.

A credit note is therefore modelled as a regular invoice row with a `cancels` foreign key set. If `cancels` is `null` the document is a plain invoice; if it is set, the document is a credit note. This makes the type fully derivable and keeps all documents for a given order queryable in a single table without unions.

#### Full inversion vs. partial credit notes

When a customer returns only part of an order, two approaches are legally valid:

**Approach 1 - Full inversion + reissue (3 documents)**

1. Cancel the original invoice with a credit note for the full amount
2. Issue a new invoice for only the remaining items

Every invoice is always in an unambiguous state: fully active or fully cancelled. The `cancels` relation stays 1:1 and a unique constraint prevents an invoice from being cancelled twice.

**Approach 2 - Partial credit note (2 documents)**

1. Keep the original invoice valid
2. Issue a credit note that credits only the returned item(s)

The net financial position is the original minus the sum of all credit notes against it. Multiple partial credit notes can reference the same invoice, so the `cancels` relation becomes 1:many and the unique constraint must be dropped.

This plugin supports Approach 2, which is the standard e-commerce practice and strictly more general: a full-inversion workflow is just a partial credit note that credits 100% followed by a new invoice. Approach 1 is achievable on top without extra model complexity.

The trade-off: DB-level uniqueness cannot prevent over-crediting (total credited exceeding the original amount). This guard moves to the service layer.

#### Constraints to keep in mind

1. `cancels` must point to a row where `cancels IS NULL`. You cannot cancel a cancellation.
2. A row may not reference itself.

Nullable foreign keys as type discriminators sacrifice compile-time type safety, and self-referential ORM relations require care around eager-loading cycles. Both costs are lower than the alternative of cross-entity sequence coupling or duplicated schema.

## Practical Guides and Resources

### Guides

#### Understanding invoice flows

This is for a regular [order process][orderprocess], applicable to most Vendure instances.

1. Order gets created and awaits payment
2. Payment authorizes and or settles
3. Due to state-change, the [`OrderPlacedStrategy`][orderplacedstrategy] gets called and publishes the [`OrderPlacedEvent`][events]
4. `InvoiceService` reacts to this [event][events] *(you can disable this)* and queues a [job][jobqueue] for the invoice-creation
5. A worker will asynchronously pick up this job, create and persist an invoice for this order
    - Every step is customizable but conceptionally speaking the following happens:
    1. The next unique sequential ID gets generated, making use of the `SequentialIdStrategy`
    2. `SnapshotStrategy` creates a readonly snapshot containing necessary data for file generation
    3. `FileStrategy` generates a file and provides a name
    4. `StorageStrategy` persists said file
6. `InvoiceService` publishes an `InvoiceEvent` which you can react to, for example to send the customer an email containing the generated file

For example sake, let's modify this existing order.

Due to accounting/compliance reasons, invoices are forbidden from being mutated, so a corrective invoice must be issued. Often referred to as "Credit note", "Credit memo" or "Stornorechnung" in german.

This credit note inverses the previously issued invoice, i.e. you credit the customer the paid amount back and record it in your sequential invoice identifiers for accounting purposes.

Afterwards you can issue the new invoice for the modified order with a new amount. Practically speaking, you now issued three distinct documents like so:

1. `INVOICE001` - the initial order
2. `INVOICE002` - the credit note, specifically inverting `INVOICE001`
3. `INVOICE003` - the new modified order

This way the accountant/tax office has a clear sequence of transactions.

### Resources

- TODO

---

#### Credits

- Original Banner Photo by [// TODO](#), edited by [Daniel Biegler](https://www.danielbiegler.de/)

<!-- Link references -->

[channelaware]: https://docs.vendure.io/guides/developer-guide/channel-aware/
[channels]: https://docs.vendure.io/guides/core-concepts/channels/
[configuration]: https://docs.vendure.io/guides/developer-guide/configuration/
[customfields]: https://docs.vendure.io/guides/developer-guide/custom-fields/
[custompermissions]: https://docs.vendure.io/guides/developer-guide/custom-permissions/
[entity]: https://docs.vendure.io/guides/developer-guide/database-entity/
[eventbus]: https://docs.vendure.io/reference/typescript-api/events/event-bus/
[events]: https://docs.vendure.io/guides/developer-guide/events/
[extendapi]: https://docs.vendure.io/guides/developer-guide/extend-graphql-api/
[jobqueue]: https://docs.vendure.io/guides/developer-guide/worker-job-queue/
[migrations]: https://docs.vendure.io/guides/developer-guide/migrations/
[orderplacedstrategy]: https://docs.vendure.io/current/core/reference/typescript-api/orders/order-placed-strategy
[orderprocess]: https://docs.vendure.io/current/core/core-concepts/orders#the-order-process
[order]: https://docs.vendure.io/current/core/reference/typescript-api/entities/order
[plugins]: https://docs.vendure.io/guides/developer-guide/plugins/
[roles]: https://docs.vendure.io/guides/core-concepts/auth/#roles--permissions
[scheduledtasks]: https://docs.vendure.io/guides/developer-guide/scheduled-tasks/
[translatable]: https://docs.vendure.io/guides/developer-guide/translatable/
