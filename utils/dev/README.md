# Dev database seeding

Populates a plugin's local dev database with everything a shop needs before it is usable:
zones, countries, tax categories/rates, shipping methods, payment methods, the sample product
catalogue, customers with addresses, and orders spread across the order states.

## Usage

From a plugin package (e.g. `packages/invoices`):

```bash
npm run dev:reset   # drop everything and seed from scratch
npm run dev:seed    # seed an empty database (refuses if it already has data)
npm run dev         # start the dev server against it
```

Flags are passed through after `--`:

```bash
npm run dev:seed -- --reset --customers=50 --orders=200
npm run dev:seed -- --reset --no-products --orders=0   # settings only, no catalogue
npm run dev:seed -- --help
```

| Flag                | Default | Meaning                                                        |
| ------------------- | ------- | -------------------------------------------------------------- |
| `--reset`           | off     | Drop the database first. Required if it already contains data. |
| `--customers=<n>`   | 20      | Customers to create, each with one address.                    |
| `--orders=<n>`      | 20      | Orders to create.                                              |
| `--random-seed=<n>` | 42      | PRNG seed. The same seed produces the same orders.             |
| `--no-products`     | off     | Skip the product catalogue import.                             |
| `--no-jobs`         | off     | Don't run the job queue (see below).                           |

The seeder binds its API to port 0, so it can run while a dev server holds the configured port.

## What you get

- **Countries** across the `Americas` and `Europe`
- **Tax**: `Standard` (20%), `Reduced` (10%) and `Zero` (0%) categories, with a rate per zone
- **Shipping**: `Standard Shipping` (5.00) and `Express Shipping` (10.00)
- **Payment**: `dummy-payment-settled` and `dummy-payment-authorized`, so checkout actually completes
- **Catalogue**: the 20 products / 34 variants from `utils/e2e/e2e-products-full.csv`, plus collections
- **Customers** from `@vendure/testing`'s deterministic mock data, password `test`
- **Orders** spread over `AddingItems` (active carts), `ArrangingPayment`, `PaymentSettled`,
  `Shipped` and `Delivered`

## Job queue

Unless `--no-jobs` is passed, the seeder starts the job queue and waits for it to drain before
exiting. This matters because the dev configs use the default in-memory job queue: anything a
plugin does asynchronously - search indexing, and in this repo invoice generation on
`OrderPlacedEvent` - would otherwise be discarded when the seeding process exits, leaving orders
without the artifacts they are supposed to have.

## Adding it to another plugin

Create `dev-server/seed.ts`:

```ts
import { runSeedCli } from "../../../utils/dev/seed";
import { config } from "./vendure-config";

runSeedCli(config).catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

and add the scripts:

```json
"dev:seed": "ts-node dev-server/seed.ts",
"dev:reset": "ts-node dev-server/seed.ts --reset"
```

`runSeedCli` takes a second argument for per-plugin defaults, e.g. a different product CSV or a
different order-state distribution:

```ts
runSeedCli(config, { orderCount: 100, orders: { distribution: { delivered: 0.8 } } });
```

For anything more involved, call `seedDevDatabase(config, options)` directly.
