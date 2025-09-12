import path from "path";
import { generateTypes } from "../../utils/generate-types";
import { DBOSJobQueuePlugin } from "./src/plugin";

require("dotenv").config({ path: path.join(__dirname, "../dev-server/.env") });

generateTypes(
  {
    plugins: [
      DBOSJobQueuePlugin.init({}),
    ],
  },
  {
    pluginDir: __dirname,
    e2e: true,
    ui: false,
  },
).then(() => process.exit(0));
