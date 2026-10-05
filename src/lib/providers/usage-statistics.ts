import { i18n } from "@/i18n";
import { z } from "zod";
import type { ProviderId, RateLimitsSnapshotResponse } from "./provider.types";
import { ProviderAccountProfileIdSchema } from "./provider-accounts";

export const UNATTRIBUTED_ACCOUNT_ID = "unattributed";
export const USAGE_STATISTICS_IPC = "persistence:usage-statistics";
export const USAGE_PROVIDER_NAMES: Record<ProviderId, string> = {
  "claude-code": "Claude", codex: "Codex", cursor: "Cursor", kiro: "Kiro",
};

const IsoDate = z.iso.datetime().transform((value) => new Date(value).toISOString());
export const UsageStatisticsArgsSchema = z.object({
  from: IsoDate,
  to: IsoDate,
  timeZone: z.string().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
    catch { return false; }
  }),
  granularity: z.enum(["day", "hour"]).default("day"),
  providerId: z.enum(["claude-code", "codex", "cursor", "kiro"]).optional(),
  accountProfileId: z.union([ProviderAccountProfileIdSchema, z.literal(UNATTRIBUTED_ACCOUNT_ID)]).optional(),
  /** null selects turns with no recorded model; omission selects every model. */
  modelId: z.string().min(1).max(500).nullable().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(1_000_000).default(0),
}).strict().refine((args) => {
  const duration = Date.parse(args.to) - Date.parse(args.from);
  return duration > 0 && duration <= 366 * 86_400_000;
}, { error: () => i18n.t("providers:validation.periodLimit") })
  .refine((args) => !args.accountProfileId || Boolean(args.providerId), { error: () => i18n.t("providers:validation.accountProvider") });
export type UsageStatisticsArgs = z.infer<typeof UsageStatisticsArgsSchema>;

export interface UsageMetrics {
  turns: number;
  measuredTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  thoughtTokens: number;
  /** Same convention as turn-spend: input + output excluding prompt cache reads. */
  tokens: number;
  /** Sum of reported costs only; null when no turn reported a cost. */
  costUsd: number | null;
  costReportedTurns: number;
}
export interface UsageAccountTotal extends UsageMetrics {
  providerId: ProviderId;
  accountProfileId: string;
}
export interface UsageModelTotal extends UsageMetrics {
  providerId: ProviderId;
  modelId: string | null;
}
export interface UsageTurn extends UsageMetrics {
  id: string;
  providerId: ProviderId;
  accountProfileId: string;
  modelId: string | null;
  createdAt: string;
  completedAt: string;
}
export interface QuotaObservation {
  providerId: ProviderId;
  accountProfileId: string;
  observedAt: string;
  windowId: string;
  label: string;
  usedPercent: number;
  resetsAt: number | null;
  source: string;
}
export interface UsageStatisticsReport {
  totals: UsageMetrics;
  series: Array<UsageMetrics & { at: string }>;
  accounts: UsageAccountTotal[];
  models: UsageModelTotal[];
  knownAccounts: Array<{ providerId: ProviderId; accountProfileId: string }>;
  turns: UsageTurn[];
  quota: QuotaObservation[];
  latestQuota: QuotaObservation[];
  quotaHistoryTruncated: boolean;
  generatedAt: string;
}
export type UsageStatisticsResponse =
  | { ok: true; report: UsageStatisticsReport }
  | { ok: false; message: string };

export function emptyUsageMetrics(): UsageMetrics {
  return { turns: 0, measuredTurns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
    cacheCreationTokens: 0, thoughtTokens: 0, tokens: 0, costUsd: null, costReportedTurns: 0 };
}
export function addUsageMetrics(target: UsageMetrics, source: UsageMetrics) {
  for (const key of ["turns", "measuredTurns", "inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens", "thoughtTokens", "tokens", "costReportedTurns"] as const) {
    target[key] += source[key];
  }
  if (source.costUsd !== null) target.costUsd = (target.costUsd ?? 0) + source.costUsd;
}

/** Calendar labels in the chosen zone; offsets keep repeated DST hours distinct. */
const bucketFormatters = new Map<string, Intl.DateTimeFormat>();
export function usageBucketKey(at: string, timeZone: string, granularity: "day" | "hour") {
  const key = `${timeZone}:${granularity}`;
  let formatter = bucketFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    ...(granularity === "hour" ? { hour: "2-digit", hourCycle: "h23" as const, timeZoneName: "shortOffset" as const } : {}),
    });
    if (bucketFormatters.size >= 16) bucketFormatters.clear();
    bucketFormatters.set(key, formatter);
  }
  const parts = formatter.formatToParts(new Date(at));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  return granularity === "day" ? day : `${day} ${part("hour")}:00 ${part("timeZoneName")}`;
}

/** All native windows; never collapse distinct model buckets into an average. */
export function quotaObservations(snapshot: RateLimitsSnapshotResponse, providerId: ProviderId,
  accountProfileId: string, observedAt: string): QuotaObservation[] {
  const rows: QuotaObservation[] = [];
  const push = (windowId: string, label: string, window: { usedPercent: number; resetsAt: number | null } | null,
    source: string) => {
    if (source === "unavailable" || !window || !Number.isFinite(window.usedPercent) || window.usedPercent < 0) return;
    rows.push({ providerId, accountProfileId, observedAt, windowId, label, usedPercent: window.usedPercent,
      resetsAt: window.resetsAt, source });
  };
  if (providerId === "claude-code") {
    push("session", i18n.t("providers:usageStatistics.hourLimit"), snapshot.claude.session, snapshot.claude.source);
    push("weekly", i18n.t("providers:usageStatistics.weeklyLimit"), snapshot.claude.weekly, snapshot.claude.source);
    push("fable-weekly", i18n.t("providers:usageStatistics.weeklyFableLimit"), snapshot.claude.fableWeekly, snapshot.claude.source);
  } else if (providerId === "codex") {
    snapshot.codex.buckets.forEach((bucket, index) => {
      const id = bucket.limitId ?? `bucket-${index}`;
      const label = bucket.limitName ?? bucket.limitId ?? i18n.t("usage:usageView.quota");
      for (const key of ["primary", "secondary", "individualLimit"] as const) {
        const window = bucket[key];
        const minutes = window && "windowDurationMins" in window ? window.windowDurationMins : null;
        push(`${id}:${key}`, `${label} · ${minutes ? i18n.t("providers:usageStatistics.hourLimitVariant9f03f68c", { value1: minutes / 60 }) : key === "individualLimit" ? i18n.t("providers:usageStatistics.credits") : key}`, window, snapshot.codex.source);
      }
    });
  } else {
    const value = snapshot[providerId];
    push("monthly", i18n.t("providers:usageStatistics.monthlyIncludedUsage"), value.monthly, value.source);
    for (const bucket of value.buckets) push(`bucket:${bucket.id}`, bucket.label, bucket, value.source);
  }
  return rows;
}
