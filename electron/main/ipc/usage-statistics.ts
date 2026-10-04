import { ipcMain } from "electron";
import { ensurePersistenceReady } from "../state";
import { UsageStatisticsArgsSchema, USAGE_STATISTICS_IPC, type UsageStatisticsResponse } from "../../../src/lib/providers/usage-statistics";

export function registerUsageStatisticsHandlers() {
  ipcMain.handle(USAGE_STATISTICS_IPC, async (_event, input: unknown): Promise<UsageStatisticsResponse> => {
    const parsed = UsageStatisticsArgsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Invalid usage filters. Choose a valid account, timezone and period of at most 366 days." };
    try {
      const store = await ensurePersistenceReady();
      return { ok: true, report: store.usageStatistics.read(parsed.data) };
    } catch {
      return { ok: false, message: "Usage history could not be read. Try again." };
    }
  });
}
