import path from "path";
import { generateTypes } from "../../utils/generate-types";
import { __SCAFFOLD_TITLE_NO_SPACE__Plugin } from "./src/plugin";

require("dotenv").config({ path: path.join(__dirname, "../dev-server/.env") });

generateTypes(
  {
    plugins: [
      __SCAFFOLD_TITLE_NO_SPACE__Plugin.init({}),
    ],
  },
  {
    pluginDir: __dirname,
    e2e: true,
    ui: false,
  },
).then(() => process.exit(0));
