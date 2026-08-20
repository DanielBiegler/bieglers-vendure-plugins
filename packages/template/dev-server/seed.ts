import { runSeedCli } from "../../../utils/dev/seed";
import { config } from "./vendure-config";

runSeedCli(config).catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
