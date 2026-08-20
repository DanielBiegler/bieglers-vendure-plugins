import { Logger, VendureConfig } from "@vendure/core";
import { rm } from "node:fs/promises";
import { DataSource, DataSourceOptions } from "typeorm";

const loggerCtx = "DevSeed";

/**
 * Drops everything the Vendure schema lives in, so that the subsequent bootstrap recreates it.
 *
 * Deliberately does *not* go through `@vendure/testing`'s `clearAllTables`: that calls
 * `preBootstrapConfig`, which runs every plugin's `configuration()` a second time. Plugins that
 * push onto config arrays (scheduled tasks, permissions, strategies) then register their entries
 * twice and the following bootstrap dies - e.g. croner rejects the duplicate task name.
 */
export async function resetDatabase(config: VendureConfig): Promise<void> {
  const options = config.dbConnectionOptions;

  if (options.synchronize !== true) {
    Logger.warn(
      "dbConnectionOptions.synchronize is not true - the schema will have to be recreated by migrations after this reset",
      loggerCtx,
    );
  }

  switch (options.type) {
    case "better-sqlite3":
    case "sqlite": {
      const file = options.database;
      if (typeof file !== "string" || file === ":memory:") {
        throw new Error("Cannot reset an in-memory SQLite database");
      }
      // WAL and shared-memory sidecars outlive the main file and would resurrect old pages.
      await Promise.all([file, `${file}-wal`, `${file}-shm`].map(f => rm(f, { force: true })));
      Logger.info(`Deleted ${file}`, loggerCtx);
      return;
    }
    case "postgres":
      await withRawConnection(options, async dataSource => {
        const schema = (options as { schema?: string }).schema ?? "public";
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await dataSource.query(`CREATE SCHEMA "${schema}"`);
        Logger.info(`Recreated schema "${schema}"`, loggerCtx);
      });
      return;
    case "mysql":
    case "mariadb":
      await withRawConnection(options, async dataSource => {
        const database = (options as { database?: string }).database;
        if (!database) throw new Error("dbConnectionOptions.database is required to reset a MySQL/MariaDB database");
        await dataSource.query(`DROP DATABASE IF EXISTS \`${database}\``);
        await dataSource.query(`CREATE DATABASE \`${database}\``);
        Logger.info(`Recreated database "${database}"`, loggerCtx);
      });
      return;
    default:
      throw new Error(
        `--reset does not know how to drop a "${options.type}" database. Drop it yourself and re-run without --reset.`,
      );
  }
}

async function withRawConnection(
  options: DataSourceOptions,
  fn: (dataSource: DataSource) => Promise<void>,
): Promise<void> {
  // No entities, so TypeORM never needs the Vendure metadata and we never touch plugin config.
  const dataSource = new DataSource({ ...options, entities: [], migrations: [], synchronize: false });
  await dataSource.initialize();
  try {
    await fn(dataSource);
  } finally {
    await dataSource.destroy();
  }
}
