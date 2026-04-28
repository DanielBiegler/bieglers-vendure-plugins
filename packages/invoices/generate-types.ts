import path from "path";
import { generateTypes } from "../../utils/generate-types";
import { InvoicesPlugin } from "./src/plugin";

require("dotenv").config({ path: path.join(__dirname, "../dev-server/.env") });

generateTypes(
  {
    plugins: [
      InvoicesPlugin.init({
        // @ts-ignore not needed for type generation
        invoiceIdPrefixGenerationStrategy: undefined,
        // @ts-ignore not needed for type generation
        creditNoteIdPrefixGenerationStrategy: undefined,
        // @ts-ignore not needed for type generation
        invoiceFileGenerationStrategy: undefined,
        // @ts-ignore not needed for type generation
        creditNoteFileGenerationStrategy: undefined,
        // @ts-ignore not needed for type generation
        storageStrategy: undefined
      }),
    ],
  },
  {
    pluginDir: __dirname,
    e2e: true,
    ui: false,
  },
).then(() => process.exit(0));
