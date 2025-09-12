![Banner Image](https://raw.githubusercontent.com/DanielBiegler/bieglers-vendure-plugins/master/packages/dbos-job-queue/assets/thumbnail_16x9.jpeg)

# Vendure Plugin: DBOS Job Queue

Drop-in replacement of the DefaultJobQueuePlugin featuring durable queues and workflows, built on top of the DBOS library

<a href="https://www.npmjs.com/package/@danielbiegler/vendure-plugin-dbos-job-queue" target="_blank">
  <img src="https://badge.fury.io/js/@danielbiegler%2Fvendure-plugin-dbos-job-queue.svg" alt="npm version badge" height="18">
</a>

## Features

- TODO

### End-To-End Tests

```
TODO
```

## How To: Usage

TODO

See [api-extensions.ts](https://github.com/DanielBiegler/bieglers-vendure-plugins/blob/master/packages/dbos-job-queue/src/api/api-extensions.ts) for a complete overview of the graphql extensions and types.

### 1. Add the plugin to your Vendure Config

You can find the package over on [npm](https://www.npmjs.com/package/@danielbiegler/vendure-plugin-dbos-job-queue) and install it via:

```bash
npm i @danielbiegler/vendure-plugin-dbos-job-queue
```

Add it to your [Vendure Config][configuration]:

```ts
import { TODO } from "@danielbiegler/vendure-plugin-dbos-job-queue";
export const config: VendureConfig = {
  // ...
  plugins: [
    TODO
  ],
}
```

TODO

Please refer to the specific [docs](https://github.com/DanielBiegler/bieglers-vendure-plugins/blob/master/packages/dbos-job-queue/src/types.ts) for how and what you can customize.

### 2. Generate a database migration

This plugin adds a custom field to the `Asset` entity called `previewImageHash`, which requires you to generate a database migration. See Vendure's [migration documentation][migrations] for further guidance.

### 3. // TODO

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
