import { Logger, ScheduledTask } from "@vendure/core";
import { INVOICE_EXPORT_CLEANUP_TASK_ID, loggerCtx } from "../constants";
import { InvoiceExportService } from "../services/InvoiceExport.service";
import { InvoiceExportRetentionOptions } from "../types";

const DEFAULT_SCHEDULE = "0 3 * * *";

/**
 * The description is what an administrator reads in the dashboards' scheduled task list,
 * so a bare second count is unhelpful and dividing by a day unconditionally is worse:
 * an hour of retention would render as "0.041666666666666664 day/s".
 */
function describeAge(seconds: number): string {
  const units: Array<[string, number]> = [
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];

  for (const [name, size] of units) {
    if (seconds < size) continue;
    const value = Math.round((seconds / size) * 100) / 100;
    return `${seconds} seconds (~${value} ${name}${value === 1 ? "" : "s"})`;
  }

  return `${seconds} seconds`;
}

/**
 * Sweeps archives that have outlived the configured retention.
 *
 * Only registered when `exportRetention` is configured.
 */
export function pruneInvoiceExportsTask(options: InvoiceExportRetentionOptions): ScheduledTask {
  return new ScheduledTask({
    id: INVOICE_EXPORT_CLEANUP_TASK_ID,
    description: `Deletes invoice exports older than ${describeAge(options.maxAge)}`,
    schedule: options.schedule ?? DEFAULT_SCHEDULE,
    timeout: "15m",
    execute: async ({ injector, scheduledContext }) => {
      const service = injector.get(InvoiceExportService);
      const deleted = await service.pruneExpired(scheduledContext, options.maxAge);

      Logger.verbose(`Invoice export retention sweep removed ${deleted} export(s)`, loggerCtx);

      return { deleted };
    },
  });
}
