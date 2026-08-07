import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "de"],
  // Line numbers in the `#:` reference comments churn on every unrelated edit,
  // which turns the catalogs into a needless source of merge conflicts.
  format: formatter({ lineNumbers: false }),
  catalogs: [
    {
      // The dashboard's vite plugin globs `**/*.po` beneath a plugins' dashboard
      // entry directory, so the catalogs must live inside `src/dashboard`.
      path: "<rootDir>/src/dashboard/i18n/{locale}",
      include: ["<rootDir>/src/dashboard"],
    },
  ],
});
