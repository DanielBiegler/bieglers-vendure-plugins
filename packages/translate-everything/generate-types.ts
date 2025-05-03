import path from "path";
import { generateTypes } from "../../utils/generate-types";
import { TranslateEverythingPlugin } from "./src";
import { NoopTranslationStrategy } from "./src/config/translation-strategy";

require("dotenv").config({ path: path.join(__dirname, "../dev-server/.env") });

generateTypes(
  {
    plugins: [
      TranslateEverythingPlugin.init({
        translationStrategy: new NoopTranslationStrategy(),
      }),
    ],
  },
  {
    pluginDir: __dirname,
    e2e: {
      admin: true,
      shop: false,
    },
    ui: false,
  },
).then(() => process.exit(0));
