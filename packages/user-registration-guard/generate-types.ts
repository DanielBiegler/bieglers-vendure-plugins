import path from "path";
import { generateTypes } from "../../utils/generate-types";

require("dotenv").config({ path: path.join(__dirname, "../dev-server/.env") });

generateTypes(
  {
    plugins: [
      // Right now (2025-04-25) we dont extend the api so its not necessary to include the plugin here
    ],
  },
  {
    pluginDir: __dirname,
    e2e: true,
    ui: false,
  },
).then(() => process.exit(0));
