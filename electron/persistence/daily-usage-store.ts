import {
  DAILY_LIMIT_PROVIDERS, DailyLimitUpdateSchema, dailyLimitReached, dailyLimitReason, dailyUsageWindow,
  type DailyLimit, type DailyLimitUpdate, type DailyUsageReport,
} from "../../src/lib/usage/daily-limit";
import type { ProviderId } from "../../src/lib/providers/provider.types";
import type { UsageStatisticsStore } from "./usage-statistics-store";
import { i18n } from "../../src/i18n/runtime";

interface DailyDatabase {
  prepare(sql: string): { get(...args: any[]): unknown; run(...args: any[]): unknown };
}

/** Main and host read the same durable settings; no renderer snapshot can bypass admission. */
export class DailyUsageStore {
  constructor(private readonly db: DailyDatabase, private readonly usage: UsageStatisticsStore) {}

  private limit(providerId: ProviderId): DailyLimit | null {
    const row = this.db.prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get(`usage.daily-limit:${providerId}`) as { value_json: string } | undefined;
    if (!row) return null;
    // Corrupt settings must fail visibly rather than silently turn a limit off.
    return DailyLimitUpdateSchema.parse({ providerId, limit: JSON.parse(row.value_json) }).limit;
  }

  read(now = new Date()): DailyUsageReport {
    const window = dailyUsageWindow(now);
    const totals = this.usage.readPeriodTotals(window);
    return { ...window, providers: DAILY_LIMIT_PROVIDERS.map((providerId) => {
      const metrics = totals.find((row) => row.providerId === providerId);
      const usage = { providerId, limit: this.limit(providerId), tokens: metrics?.tokens ?? 0,
        costUsd: metrics?.costUsd ?? null, costReportedTurns: metrics?.costReportedTurns ?? 0,
        costAvailable: this.usage.hasReportedCost(providerId), turns: metrics?.turns ?? 0 };
      return { ...usage, reached: dailyLimitReached(usage) };
    }) };
  }

  update(raw: DailyLimitUpdate, now = new Date()): DailyUsageReport {
    const { providerId, limit } = DailyLimitUpdateSchema.parse(raw);
    if (limit?.unit === "usd" && !this.usage.hasReportedCost(providerId)) throw new Error(dailyLimitReasonForCost());
    this.db.prepare(`INSERT INTO app_state (key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
      .run(`usage.daily-limit:${providerId}`, JSON.stringify(limit), now.toISOString());
    return this.read(now);
  }

  refusal(providerId: ProviderId, now = new Date()): string | null {
    const limit = this.limit(providerId);
    if (!limit) return null;
    const totals = this.usage.readPeriodTotals(dailyUsageWindow(now)).find((row) => row.providerId === providerId);
    return dailyLimitReached({ limit, tokens: totals?.tokens ?? 0, costUsd: totals?.costUsd ?? null }) ? dailyLimitReason() : null;
  }
}

function dailyLimitReasonForCost() { return i18n.t("usage:dailyLimit.costUnavailable"); }
