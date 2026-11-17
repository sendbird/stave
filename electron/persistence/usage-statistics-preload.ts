import { USAGE_STATISTICS_IPC, type UsageStatisticsArgs, type UsageStatisticsResponse } from "../../src/lib/providers/usage-statistics";

export function usageStatisticsPreload(invoke: (channel: string, args: unknown) => Promise<unknown>) {
  return {
    dailyUsage: {
      read: () => invoke("persistence:daily-usage", {}) as Promise<import("../../src/lib/usage/daily-limit").DailyUsageReport>,
      update: (input: import("../../src/lib/usage/daily-limit").DailyLimitUpdate) => invoke("persistence:daily-limit-update", input) as Promise<import("../../src/lib/usage/daily-limit").DailyUsageReport>,
    },
    usageStatistics: (args: UsageStatisticsArgs) => invoke(USAGE_STATISTICS_IPC, args) as Promise<UsageStatisticsResponse>,
  };
}
