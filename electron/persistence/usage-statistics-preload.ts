import { USAGE_STATISTICS_IPC, type UsageStatisticsArgs, type UsageStatisticsResponse } from "../../src/lib/providers/usage-statistics";

export function usageStatisticsPreload(invoke: (channel: string, args: unknown) => Promise<unknown>) {
  return {
    usageStatistics: (args: UsageStatisticsArgs) => invoke(USAGE_STATISTICS_IPC, args) as Promise<UsageStatisticsResponse>,
  };
}
