import path from "path";
import { generateTypes } from "../../utils/generate-types";
import { UserNotificationsPlugin } from "./src/plugin";

require("dotenv").config({ path: path.join(__dirname, "../dev-server/.env") });

generateTypes(
  {
    plugins: [
      UserNotificationsPlugin.init({}),
    ],
  },
  {
    pluginDir: __dirname,
    e2e: true,
    ui: false,
  },
).then(() => process.exit(0));
