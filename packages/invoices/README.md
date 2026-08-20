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

## Localization

Every user facing string of the dashboard extension goes through [Lingui][lingui], which the Vendure
dashboard itself uses. English is the source language, translations live in
[`src/dashboard/i18n`](./src/dashboard/i18n) as one `.po` file per locale and get compiled into the
dashboard bundle automatically, no registration needed.

Currently shipped: `en`, `de`.

### Contributing a translation

1. Add your locale to `locales` in [`lingui.config.js`](./lingui.config.js). It must be a valid
   Vendure [`LanguageCode`][languagecode], which uses underscores for region variants, e.g. `pt_BR`.
2. Generate the catalog:

   ```bash
   npm run i18n:extract
   ```

3. Fill in the `msgstr` values in the new `src/dashboard/i18n/{locale}.po`. Untranslated strings fall
   back to English, so partial translations are fine.

Run `npm run i18n:extract` as well whenever you add or change a string in the dashboard extension,
otherwise the catalogs go stale.

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

This plugin models Approach 2, which is the standard e-commerce practice and strictly more general: a full-inversion workflow is just a partial credit note that credits 100% followed by a new invoice. Approach 1 sits on top without extra model complexity and ships as the [`reissueInvoice`](#correcting-an-order-reissueinvoice) mutation.

Note that the *amounts* are entirely your `SnapshotStrategy`'s business - the plugin records which invoice a credit note cancels, not how much of it. Crediting a subset of the lines is therefore a matter of what you write into the snapshot.

The trade-off: DB-level uniqueness cannot prevent over-crediting (total credited exceeding the original amount). This guard moves to the service layer.

#### Constraints to keep in mind

1. `cancels` must point to a row where `cancels IS NULL`. You cannot cancel a cancellation.
2. A row may not reference itself.
3. `cancels` must point to an invoice of the same order. Crediting order A's invoice on order B would leave both orders with a ledger that does not add up, so the service rejects it.

Nullable foreign keys as type discriminators sacrifice compile-time type safety, and self-referential ORM relations require care around eager-loading cycles. Both costs are lower than the alternative of cross-entity sequence coupling or duplicated schema.

What the plugin deliberately does *not* enforce is how much of an invoice is still outstanding. Nothing stops you from crediting the same invoice twice, because "how much is left to credit" depends on rules the plugin cannot know. If your accounting needs that guard, put it in your own code.

### Telling invoices and credit notes apart during generation

Because both document types share one entity, one sequence and one storage path, the only thing that distinguishes them at generation time is the `InvoiceDocumentContext` that every strategy receives:

```ts
type InvoiceDocumentContext =
  | { kind: "invoice";    order: Order }
  | { kind: "creditNote"; order: Order; cancels: Invoice; reason?: string };
```

A discriminated union rather than an `isCreditNote` boolean, so that `cancels` is non-optional exactly where it exists and `switch (doc.kind)` narrows without casts:

```ts
class MyFileStrategy implements FileStrategy<MySnapshot> {
  async generate(ctx, sequentialId, snapshot, doc) {
    switch (doc.kind) {
      case "invoice":
        return renderInvoice(sequentialId, snapshot);
      case "creditNote":
        // Legally required on a German Rechnungskorrektur: the document it corrects
        return renderCreditNote(sequentialId, snapshot, doc.cancels.sequentialId);
    }
  }
}
```

Two rules worth internalising:

- **Read amounts from `doc.cancels.snapshot`, never from `doc.order`.** By the time a correction happens the order has usually moved on, so the live order no longer reflects what the original invoice actually billed.
- **`reason` is not persisted on the invoice row.** The snapshot is the immutable record, so capture it there from your `SnapshotStrategy` if the document has to show it.

`SequentialIdStrategy.generatePrefix` receives the same context, so you can prefix credit notes differently. Note that both kinds still draw from the same counter, so a differing prefix alone does not give credit notes their own gapless range.

### Correcting an order: `reissueInvoice`

The common case - an order gets modified, the total drops, the customer is refunded - needs three documents. The `reissueInvoice` mutation writes the latter two in a single transaction:

```graphql
mutation {
  reissueInvoice(input: { cancels: "42", reason: "Item returned" }) {
    creditNote { sequentialId }  # cancels the original in full
    invoice     { sequentialId }  # bills the order's current state
  }
}
```

Leaving you with exactly the trail an accountant expects:

1. `INVOICE001` - the original order
2. `INVOICE002` - the credit note, inverting `INVOICE001`
3. `INVOICE003` - the corrected invoice

Doing this as two separate `createInvoice` calls is possible but discouraged: without a shared transaction, a failure while issuing the replacement leaves the order credited with nothing to bill against. Because the sequence counter is claimed inside that same transaction, a rollback takes the numbers with it and the sequence stays gapless.

The order is taken from the cancelled invoice rather than from the caller, so there is no way to credit one order and re-bill another.

## Order history

Issuing a document writes a `PLUGIN_INVOICE_CREATED` entry into the orders' history timeline, so
administrators can see when an invoice or credit note was created and jump straight to it. The entry
is **not** public, i.e. it is invisible to the Shop API, because it carries internal accounting
identifiers:

```json
{
  "invoiceId": "1",
  "sequentialId": "INVOICE01000",
  "cancelsSequentialId": "INVOICE00999"
}
```

`cancelsSequentialId` is only present for credit notes and is what the dashboard uses to tell the
two apart. The type is exported as `PLUGIN_INVOICE_CREATED` and the payload is declared on Vendure's
`OrderHistoryEntryData`, so your own code gets it type-checked too.

## Downloading invoice files

An [`AssetStorageStrategy`][assetstorage] identifier is opaque: depending on the strategy it is a
filesystem path, a bucket key or an actual URL, so a browser generally cannot fetch it and the
`assetUrl` field must not be treated as a link. Files are therefore streamed through your instance,
guarded by a signed, expiring URL:

```graphql
mutation {
  createInvoiceDownloadUrl(id: "1", expiresIn: 300)
  # -> "https://api.example.com/invoices/1/download?expires=1786095410&signature=Ux_ZGU2M..."
}
```

Minting a URL requires the `ReadInvoice` permission and is scoped to the current channel. The
returned URL is not: the HMAC signature *is* the authorization, which is what lets a browser, an
email client or a customer follow it without a session. **Treat such a URL as a secret.**

Enable it by configuring a signing secret:

```ts
InvoicesPlugin.init({
  // ...
  download: {
    signingSecret: process.env.INVOICE_DOWNLOAD_SECRET!,
    // Defaults to the origin of the request that asked for the URL, which guesses
    // wrong behind proxies that don't set `X-Forwarded-*`
    baseUrl: "https://api.example.com",
    defaultExpiresIn: 300,
  },
}),
```

Without it, the mutation and the endpoint both refuse to work.

The endpoint lives at `/invoices/:id/download` and answers with `410` for an expired URL, `403` for a
forged one and `404` when the invoice does not exist. It sends `Content-Disposition: attachment` plus
a generic `application/octet-stream`, because your `FileStrategy` decides the actual format.

### Permanent URLs for customers

Shops that mail invoices to their customers need links that still work next tax season, which
`neverExpires` (or `defaultExpiresIn: Infinity`) provides:

```graphql
mutation {
  createInvoiceDownloadUrl(id: "1", neverExpires: true)
  # -> "https://api.example.com/invoices/1/download?expires=never&signature=..."
}
```

Be deliberate about it: a URL that never expires is a permanent bearer capability, and the only way
to retract one afterwards is rotating `signingSecret` — which invalidates every URL you ever handed
out, your customers' included. Prefer a finite lifetime whenever the recipient is able to ask for a
fresh link, i.e. for everything that goes through a dashboard or download page.

## Bulk export for accountants

The invoice list page has an **Export range** action that bundles every invoice issued in a
period into a downloadable archive. The work runs as a job on the worker, so the request
returns immediately and the dashboard polls for the result. Past exports appear in an
**Exports** table below the invoice list, where they can be re-downloaded or deleted.

```graphql
mutation {
  createInvoiceExport(input: {
    startsAt: "2026-01-01T00:00:00.000Z"
    endsAt:   "2026-02-01T00:00:00.000Z"
  }) { id state }
}

# once state is COMPLETED
mutation {
  createInvoiceExportDownloadUrl(id: "1")
}
```

Scoped to the current channel and gated behind the existing `ReadInvoice` permission —
deliberately not a permission of its own. An export reaches nothing that `invoiceList`
plus `createInvoiceDownloadUrl` do not already hand out.

Memory stays flat in the number of invoices: rows are paged, files are opened only as the
archive reaches them, and bytes go straight to storage instead of piling up in a buffer. A
ten thousand invoice export costs a few megabytes of RAM.

### The range is `[startsAt, endsAt)`

The upper bound is **exclusive**, so pass the start of the *following* period: February 1st
exports all of January. This is what makes consecutive periods tile without dropping or
duplicating an invoice at the seam, and it avoids the usual `23:59:59.999` mistake.

Bounds are full instants, not bare dates, because `createdAt` is stored in UTC while an
administrator thinks in local time. The dashboard converts for you.

### Archive format

Handled by the `ArchiveStrategy`. The default `ZipArchiveStrategy` produces a single
uncompressed ZIP, with entries named `YYYY-MM/{sequentialId}{ext}`:

```ts
archiveStrategy: new ZipArchiveStrategy({
  // PDFs are already compressed, so this usually buys 2-5% for real CPU. Worth it only
  // if your FileStrategy emits something compressible, e.g. XML.
  compress: false,
  // How many storage reads may be in flight. Raise it to hide S3 latency, at the cost of
  // roughly `readAhead × filesize` in peak memory.
  readAhead: 4,
}),
```

One export produces exactly one archive. Size is not worth designing around: yazl switches
to ZIP64 by itself past 65.535 entries or 4GB.

An invoice whose file has vanished from storage is skipped rather than failing the whole
export, and counted in `missingFileCount`. Anything above zero means the archive is
incomplete.

### Retention

Archives are full duplicates of the invoices inside them, so they add up. Cleanup is
**off** by default, but you should configure it once you know your needs:

```ts
exportRetention: {
  maxAge: 60 * 60 * 24 * 30, // seconds, so 30 days
  schedule: "0 3 * * *",     // optional, this is the default
}
```

This registers a scheduled task that deletes expired exports and their archives. The
invoices themselves are never touched. Requires a scheduler, e.g. `DefaultSchedulerPlugin`.

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
    1. `SequentialIdStrategy` claims the next unique sequential ID
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

[assetstorage]: https://docs.vendure.io/reference/typescript-api/assets/asset-storage-strategy/
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
[languagecode]: https://docs.vendure.io/reference/typescript-api/common/language-code/
[lingui]: https://lingui.dev/
[migrations]: https://docs.vendure.io/guides/developer-guide/migrations/
[orderplacedstrategy]: https://docs.vendure.io/current/core/reference/typescript-api/orders/order-placed-strategy
[orderprocess]: https://docs.vendure.io/current/core/core-concepts/orders#the-order-process
[order]: https://docs.vendure.io/current/core/reference/typescript-api/entities/order
[plugins]: https://docs.vendure.io/guides/developer-guide/plugins/
[roles]: https://docs.vendure.io/guides/core-concepts/auth/#roles--permissions
[scheduledtasks]: https://docs.vendure.io/guides/developer-guide/scheduled-tasks/
[translatable]: https://docs.vendure.io/guides/developer-guide/translatable/
