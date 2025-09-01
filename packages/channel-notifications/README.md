![Banner Image](https://raw.githubusercontent.com/DanielBiegler/bieglers-vendure-plugins/master/packages/channel-notifications/assets/thumbnail_16x9.jpeg)

# Vendure Plugin: Channel Notifications

Foundation for building notification inboxes and or changelogs for your users

<a href="https://www.npmjs.com/package/@danielbiegler/vendure-plugin-channel-notifications" target="_blank">
  <img src="https://badge.fury.io/js/@danielbiegler%2Fvendure-plugin-channel-notifications.svg" alt="npm version badge" height="18">
</a>

## Features

- TODO

### End-To-End Tests

```
TODO
```

## How To: Usage

TODO

See [api-extensions.ts](https://github.com/DanielBiegler/bieglers-vendure-plugins/blob/master/packages/channel-notifications/src/api/api-extensions.ts) for a complete overview of the graphql extensions and types.

### 1. Add the plugin to your Vendure Config

You can find the package over on [npm](https://www.npmjs.com/package/@danielbiegler/vendure-plugin-channel-notifications) and install it via:

```bash
npm i @danielbiegler/vendure-plugin-channel-notifications
```

TODO

```ts
import { TODO } from "@danielbiegler/vendure-plugin-channel-notifications";
export const config: VendureConfig = {
  // ...
  plugins: [
    TODO
  ],
}
```

TODO

Please refer to the specific [docs](https://github.com/DanielBiegler/bieglers-vendure-plugins/blob/master/packages/channel-notifications/src/types.ts) for how and what you can customize.

### 2. Generate a database migration

This plugin adds a custom field to the `Asset` entity called `previewImageHash`, which requires you to generate a database migration. See Vendure's [migration documentation](https://docs.vendure.io/guides/developer-guide/migrations/) for further guidance.

### 3. // TODO

## Practical Guides and Resources

### Guides

- TODO

### Resources

- TODO

---

#### Credits

- Original Banner Photo by [// TODO](#), edited by [Daniel Biegler](https://www.danielbiegler.de/)
