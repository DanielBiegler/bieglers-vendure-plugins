![Banner Image](https://raw.githubusercontent.com/DanielBiegler/bieglers-vendure-plugins/master/packages/translate-everything/assets/thumbnail_16x9.png)

# Vendure Plugin: Translate Everything

The one stop shop to translate everything in your Vendure instance.

<a href="https://www.npmjs.com/package/@danielbiegler/vendure-plugin-translate-everything" target="_blank">
  <img src="https://badge.fury.io/js/@danielbiegler%2Fvendure-plugin-translate-everything.svg" alt="npm version badge" height="18">
</a>

## Features

TODO

### End-To-End Tests

```
✓ Plugin Translate Everything (6)
✓ Fail due to non-existing product
✓ Fail due to missing source translation
✓ Successfully translate product
✓ Successfully stop translations for already translated product fields
✓ Successfully overwrite translations for already translated product fields
✓ Successfully translate product variants

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

## How To: Usage

TODO

### 1. Add the plugin to your Vendure Config

You can find the package over on [npm](https://www.npmjs.com/package/@danielbiegler/vendure-plugin-translate-everything) and install it via:

```bash
npm i @danielbiegler/vendure-plugin-translate-everything
```

```ts
import { TranslateEverythingPlugin } from "@danielbiegler/vendure-plugin-translate-everything";
export const config: VendureConfig = {
  // ...
  plugins: [
    TranslateEverythingPlugin.init({
      translationStrategy: new ExampleTranslationStrategy(),
    }),
  ],
}
```

Please refer to the specific [docs](./src/types.ts) for how and what you can customize.

### 2. // TODO


---

#### Credits

- Photo by Mikhail Nilov from [Pexels](https://www.pexels.com/photo/close-up-shot-of-a-person-holding-a-globe-8542559/), edited by [Daniel Biegler](https://www.danielbiegler.de/)
