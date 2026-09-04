import { InvoicesPlugin, StaticSequentialIdStrategy } from "@danielbiegler/vendure-plugin-invoices";
import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { LocalAssetStorageStrategy } from "@vendure/asset-server-plugin/lib/src/config/local-asset-storage-strategy";
import { DefaultLogger, DefaultSearchPlugin, dummyPaymentHandler, LanguageCode, LogLevel, PaymentMethodEligibilityChecker, VendureConfig } from "@vendure/core";
import { DashboardPlugin } from "@vendure/dashboard/plugin";
import "dotenv/config";
import path from "path";
import { MerchantDetails, PdfkitFileStrategy, PdfkitSnapshotStrategy } from "../src";
import { AutoIssueInvoicesPlugin } from "../../../utils/auto-issue-invoices.plugin";

const apiPort = process.env.API_PORT || 3000;

const DEV_MERCHANT: MerchantDetails = {
  name: "Musterhandel GmbH",
  address: {
    streetLine1: "Beispielstraße 12",
    postalCode: "50667",
    city: "Köln",
    country: "Deutschland",
  },
  email: "rechnung@musterhandel.example",
  phoneNumber: "+49 221 1234567",
  website: "www.musterhandel.example",
  vatId: "DE123456789",
  taxNumber: "214/5678/9012",
  registrationNumber: "HRB 12345, Amtsgericht Köln",
  footerColumns: [
    { heading: "Musterhandel GmbH", lines: ["Beispielstraße 12", "50667 Köln", "Deutschland"] },
    { heading: "Kontakt", lines: ["+49 221 1234567", "rechnung@musterhandel.example"] },
    { heading: "Bankverbindung", lines: ["Musterbank Köln", "IBAN DE02 1001 0010 0000 0123 45", "BIC PBNKDEFFXXX"] },
    { heading: "Registergericht", lines: ["HRB 12345, Amtsgericht Köln", "USt-IdNr. DE123456789", "GF: Erika Mustermann"] },
  ],
};

const dummyPaymentEligibilityChecker = new PaymentMethodEligibilityChecker({
  code: "dummy-payment-eligibility-checker",
  description: [{ languageCode: LanguageCode.en, value: "Dummy eligibility checker (always eligible)" }],
  args: {},
  check: () => true,
});

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
    paymentMethodHandlers: [dummyPaymentHandler],
    paymentMethodEligibilityCheckers: [dummyPaymentEligibilityChecker],
  },
  plugins: [
    AssetServerPlugin.init({
      route: "assets",
      assetUploadDir: path.join(__dirname, "assets"),
      storageStrategyFactory: undefined,
    }),
    InvoicesPlugin.init({
      prefixStrategy: new StaticSequentialIdStrategy("INVOICE"),
      fileStrategy: new PdfkitFileStrategy(),
      storageStrategy: new LocalAssetStorageStrategy(path.join(__dirname, "invoices")),
      snapshotStrategy: new PdfkitSnapshotStrategy({
        merchant: DEV_MERCHANT,
        locale: "de-DE",
        texts: {
          intro: "Vielen Dank für Ihre Bestellung. Wir stellen Ihnen die folgenden Leistungen in Rechnung.",
          outro: "Zahlbar ohne Abzug innerhalb von 14 Tagen nach Rechnungserhalt.",
        },
      }),
      initialSequence: 1000,
      sequenceLeftPadCount: 5,
      download: {
        signingSecret: "test",
      },
    }),
    // The plugin issues nothing on its own; this is the shop deciding when.
    AutoIssueInvoicesPlugin,
    DefaultSearchPlugin.init({}),
    DashboardPlugin.init({
      route: 'dashboard',
      appDir: path.join(__dirname, 'dashboard'),
    }),

  ],
};
