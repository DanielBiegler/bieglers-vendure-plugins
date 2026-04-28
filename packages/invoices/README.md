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

## Practical Guides and Resources

### Guides

- TODO

### Resources

- TODO

---

#### Credits

- Original Banner Photo by [// TODO](#), edited by [Daniel Biegler](https://www.danielbiegler.de/)

<!-- Link references -->

[customfields]: https://docs.vendure.io/guides/developer-guide/custom-fields/
[channelaware]: https://docs.vendure.io/guides/developer-guide/channel-aware/
[channels]: https://docs.vendure.io/guides/core-concepts/channels/
[migrations]: https://docs.vendure.io/guides/developer-guide/migrations/
[configuration]: https://docs.vendure.io/guides/developer-guide/configuration/
[plugins]: https://docs.vendure.io/guides/developer-guide/plugins/
[custompermissions]: https://docs.vendure.io/guides/developer-guide/custom-permissions/
[translatable]: https://docs.vendure.io/guides/developer-guide/translatable/
[events]: https://docs.vendure.io/guides/developer-guide/events/
[eventbus]: https://docs.vendure.io/reference/typescript-api/events/event-bus/
[roles]: https://docs.vendure.io/guides/core-concepts/auth/#roles--permissions
[extendapi]: https://docs.vendure.io/guides/developer-guide/extend-graphql-api/
[jobqueue]: https://docs.vendure.io/guides/developer-guide/worker-job-queue/
[entity]: https://docs.vendure.io/guides/developer-guide/database-entity/
[scheduledtasks]: https://docs.vendure.io/guides/developer-guide/scheduled-tasks/
