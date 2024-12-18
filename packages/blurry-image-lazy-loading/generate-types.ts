import path from "path";
import { generateTypes } from "../../utils/generate-types";
import { ThumbHashStrategy } from "./src/config/ThumbHashStrategy";
import { PreviewImageHashPlugin } from "./src/preview-image-hash.plugin";

require("dotenv").config({ path: path.join(__dirname, "../dev-server/.env") });

generateTypes(
  {
    plugins: [
      PreviewImageHashPlugin.init({
        hashingStrategy: new ThumbHashStrategy(),
      }),
    ],
  },
  {
    pluginDir: __dirname,
    e2e: true,
    ui: false,
  },
).then(() => process.exit(0));
