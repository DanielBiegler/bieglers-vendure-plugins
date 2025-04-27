import { AdminUiPlugin } from "@vendure/admin-ui-plugin";
import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { DefaultLogger, DefaultSearchPlugin, LogLevel, VendureConfig } from "@vendure/core";
import "dotenv/config";
import path from "path";
import { UserRegistrationGuardPlugin } from "../src/user-registration-guard.plugin";

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
    }),
    UserRegistrationGuardPlugin.init({
      shop: {
        assert: {
          logicalOperator: "AND",
          functions: [async () => ({ isAllowed: false, reason: "Customer Registration disabled" })],
        },
      },
      admin: {
        assert: {
          logicalOperator: "AND",
          functions: [],
        },
      },
    }),
    DefaultSearchPlugin.init({}),
    AdminUiPlugin.init({
      port: 3002,
      route: "admin",
      adminUiConfig: {
        apiPort: +apiPort,
        apiHost: "http://localhost",
      },
    }),
  ],
};
