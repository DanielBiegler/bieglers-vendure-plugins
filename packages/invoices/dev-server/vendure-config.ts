import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { LocalAssetStorageStrategy } from "@vendure/asset-server-plugin/lib/src/config/local-asset-storage-strategy";
import { DefaultLogger, DefaultSearchPlugin, LogLevel, VendureConfig } from "@vendure/core";
import "dotenv/config";
import path from "path";
import { InvoicesPlugin } from "../src";
import { DebugFileGenerationStrategy } from "../src/config/DebugFileGenerationStrategy";
import { StaticSequentialIdPrefixGenerationStrategy } from "../src/config/StaticInvoiceIdPrefixGenerationStrategy";

const apiPort = process.env.API_PORT || 3000;

export const config: VendureConfig = {
  apiOptions: {
    port: +apiPort,
    adminApiPath: "admin-api",
    shopApiPath: "shop-api",
    shopApiPlayground: true,
    adminApiPlayground: true,
  },
  authOptions: {
    tokenMethod: ["bearer", "cookie"],
    superadminCredentials: {
      identifier: "superadmin",
      password: "superadmin",
    },
  },
  logger: new DefaultLogger({ level: LogLevel.Verbose }),
  dbConnectionOptions: {
    type: "better-sqlite3",
    synchronize: true,
    migrations: [path.join(__dirname, "../migrations/*.+(js|ts)")],
    logging: false,
    database: path.join(__dirname, "vendure.sqlite"),
  },
  paymentOptions: {
    paymentMethodHandlers: [],
  },
  plugins: [
    AssetServerPlugin.init({
      route: "assets",
      assetUploadDir: path.join(__dirname, "assets"),
      storageStrategyFactory: undefined,
    }),
    InvoicesPlugin.init({
      invoiceIdPrefixGenerationStrategy: new StaticSequentialIdPrefixGenerationStrategy("INVOICE"),
      creditNoteIdPrefixGenerationStrategy: new StaticSequentialIdPrefixGenerationStrategy("CREDIT"),
      invoiceFileGenerationStrategy: new DebugFileGenerationStrategy(),
      creditNoteFileGenerationStrategy: new DebugFileGenerationStrategy(),
      storageStrategy: new LocalAssetStorageStrategy(path.join(__dirname, "invoices")),
    }),
    DefaultSearchPlugin.init({}),
  ],
};
