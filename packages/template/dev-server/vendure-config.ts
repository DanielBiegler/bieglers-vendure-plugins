import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { DefaultLogger, DefaultSchedulerPlugin, DefaultSearchPlugin, LogLevel, VendureConfig } from "@vendure/core";
import { DashboardPlugin } from "@vendure/dashboard/plugin";
import "dotenv/config";
import path from "path";
import { __SCAFFOLD_TITLE_NO_SPACE__Plugin } from "../src";

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
  schedulerOptions: {
    // In a dev environment we need this so that it runs on the server
    runTasksInWorkerOnly: false,
  },
  paymentOptions: {
    paymentMethodHandlers: [],
  },
  plugins: [
    AssetServerPlugin.init({
      route: "assets",
      assetUploadDir: path.join(__dirname, "assets"),
    }),
    __SCAFFOLD_TITLE_NO_SPACE__Plugin.init({}),
    DefaultSchedulerPlugin.init({}),
    DefaultSearchPlugin.init({}),
    DashboardPlugin.init({
      route: "dashboard",
      appDir: path.join(__dirname, "dashboard"),
    }),
  ],
};
