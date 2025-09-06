import path from "path";
import { generateTypes } from "../../utils/generate-types";
import { ChannelNotificationsPlugin } from "./src/plugin";

require("dotenv").config({ path: path.join(__dirname, "../dev-server/.env") });

generateTypes(
  {
    plugins: [
      ChannelNotificationsPlugin.init({}),
    ],
  },
  {
    pluginDir: __dirname,
    e2e: "admin",
    ui: false,
  },
).then(() => process.exit(0));
