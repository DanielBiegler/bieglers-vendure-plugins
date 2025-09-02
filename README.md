# Bieglers Vendure Plugins

High quality plugins for your commerce pleasure.

| Thumbnail                                                                                                                                   | Description                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![thumbnail blurry image previews](./packages/blurry-image-lazy-loading/assets/thumbnail_1x1.jpeg)](./packages/blurry-image-lazy-loading/) | Improves your sites UX by avoiding image pop-in. Generates image hashes for displaying blurry previews when loading images on the frontend. Image hashes condense the shape of your image into around **20-50 bytes**. Yes, **bytes**, not **kilo**bytes.                                                            |
| [![thumbnail user registration guard](./packages/user-registration-guard/assets/thumbnail_1x1.png)](./packages/user-registration-guard/)    | Let's you flexibly customize if and how you prevent users from registering with your Vendure instance. For example, reduce fraud by blocking disposable email providers or IP ranges from registering with your Vendure instance or harden your admin accounts by only allowing specific domains in email addresses. |
| [![thumbnail channel notifications](./packages/channel-notifications/assets/thumbnail_1x1.jpeg)](./packages/channel-notifications/)         | Foundation for building notification inboxes and or changelogs for your users. Features channel aware, translatable and customizable notifications with read-receipts per user.                                                                                                                                      |

## Structure

This is a monorepo powered by [Lerna](https://lerna.js.org/). The folder structure is as follows:

```
packages/           # Each plugin is housed in a directory under `packages`
  example-plugin/   # An example plugin to get you started
    dev-server/     # The development server for testing the plugin
    e2e/            # End-to-end tests for the plugin
    src/            # The source code of the plugin  
utils/              # Utility scripts for shared tasks
    e2e/            # Helper functions for e2e tests
```

The reason we are using a monorepo is that it allows you to create multiple plugins without requiring a separate 
repository for each one. This reduces the maintenance burden and makes it easier to manage multiple plugins.

## Getting started

1. Clone this repository
2. Run `npm install` from the root to install the dependencies
3. `cd packages/example-plugin`
4. Run `npm run dev` to start the development server for the example plugin.
5. Modify the example plugin to implement your features.

## Code generation

This repo is set up with [GraphQL Code Generator](https://www.graphql-code-generator.com/) to generate TypeScript types
for the schema extensions in your plugins. To generate the types, run `npm run generate` from the plugin directory:

```bash
cd packages/example-plugin
npm run codegen
```

This should be done whenever you:

- make changes to the schema extensions in your plugin (`/src/api/api-extensions.ts`)
- make changes to GraphQL queries or mutations in your e2e tests (in `/e2e/graphql/**.ts`)
- make changes to the GraphQL queries or mutations in your plugin's admin UI (in `/src/ui/**.ts`)

## Testing

End-to-end (e2e) tests are run using `npm run e2e` from the plugin directory. This will start a Vendure server with the
plugin installed, run the tests in the `e2e` directory, and then shut down the server.

```bash
cd packages/example-plugin
npm run e2e
```

## Publishing to NPM

1. Go to the directory of the plugin you want to publish, e.g. `cd packages/example-plugin`
2. Check the package version
3. Finalize `CHANGELOG.md`
4. `npm run codegen` and see if types are all up to date
5. `npm run e2e`
6. `npm run build`
7. `npm pack --dry-run` to double check
8. `npm publish`
9. Tag commit like ( *&lt;version&gt;-&lt;plugin-name&gt;* ) - Example: 
   1. `git tag -s v1.0.0-user-registration-guard`
   2. `git push --tags`

For an in-depth guide on publishing to NPM and the Vendure Hub,
see our [Publishing a Plugin guide](https://docs.vendure.io/guides/how-to/publish-plugin/).

