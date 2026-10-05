import { addUsageMetrics, emptyUsageMetrics, usageBucketKey, type QuotaObservation, type UsageStatisticsArgs,
  type UsageStatisticsReport, type UsageTurn } from "@/lib/providers/usage-statistics";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";

export const USAGE_PREVIEW_NOW = Date.parse("2026-10-04T09:00:00.000Z");
export const USAGE_PREVIEW_PROFILES: ProviderAccountProfile[] = [
  { providerId: "claude-code", id: "system-default", label: "System default", kind: "system" },
  { providerId: "claude-code", id: "e1c06d30-cf21-4362-887a-5679b9fdfae1", label: "Work · 제품 개발 계정", kind: "managed" },
  { providerId: "codex", id: "system-default", label: "System default", kind: "system" },
  { providerId: "codex", id: "e1c06d30-cf21-4362-887a-5679b9fdfae2", label: "Personal", kind: "managed" },
];

function turns(): UsageTurn[] {
  return Array.from({ length: 180 }, (_, index) => {
    const profile = USAGE_PREVIEW_PROFILES[index % 4]!;
    const createdAt = new Date(USAGE_PREVIEW_NOW - (index % 30) * 86_400_000 - (index % 8) * 3_600_000).toISOString();
    const inputTokens = (index + 1) * 530;
    const outputTokens = (index + 1) * 39;
    const cacheReadTokens = (index + 1) * 250;
    const measured = index % 15 !== 0;
    return { ...emptyUsageMetrics(), id: `preview-turn-${index}`, providerId: profile.providerId,
      accountProfileId: index === 0 ? "unattributed" : profile.id,
      modelId: index % 8 < 4 ? "primary-model" : "fast-model", createdAt,
      completedAt: new Date(Date.parse(createdAt) + 60_000).toISOString(), turns: 1, measuredTurns: measured ? 1 : 0,
      inputTokens: measured ? inputTokens : 0, outputTokens: measured ? outputTokens : 0,
      cacheReadTokens: measured ? cacheReadTokens : 0, cacheCreationTokens: 0,
      tokens: measured ? inputTokens + outputTokens - (profile.providerId === "codex" ? cacheReadTokens : 0) : 0,
      costUsd: profile.providerId === "claude-code" && measured ? (index + 1) / 60 : null,
      costReportedTurns: profile.providerId === "claude-code" && measured ? 1 : 0 };
  });
}

function quota(): QuotaObservation[] {
  return USAGE_PREVIEW_PROFILES.flatMap((profile, accountIndex) => Array.from({ length: 12 }, (_, index) => ({
    providerId: profile.providerId, accountProfileId: profile.id, windowId: "primary", label: "5-hour limit",
    observedAt: new Date(USAGE_PREVIEW_NOW - (11 - index) * 3_600_000).toISOString(),
    usedPercent: (index * 8 + accountIndex * 12) % 100,
    resetsAt: Math.floor(USAGE_PREVIEW_NOW / 1000) + 3_600 * 2,
    source: profile.providerId === "codex" ? "rpc" : "oauth",
  })));
}

/** Deterministic fixture for the actual UsageView, never installed as product data. */
export function usagePreviewReport(args: UsageStatisticsArgs, empty = false): UsageStatisticsReport {
  const all = empty ? [] : turns();
  const inScope = (row: { providerId: string; accountProfileId: string }) => (!args.providerId || row.providerId === args.providerId) && (!args.accountProfileId || row.accountProfileId === args.accountProfileId);
  const selected = all.filter((row) => inScope(row) && row.createdAt >= args.from && row.createdAt < args.to
    && (args.modelId === undefined || row.modelId === args.modelId));
  const totals = emptyUsageMetrics();
  const accounts = new Map<string, UsageStatisticsReport["accounts"][number]>();
  const models = new Map<string, UsageStatisticsReport["models"][number]>();
  const buckets = new Map<string, UsageStatisticsReport["series"][number]>();
  for (let at = Date.parse(args.from); at < Date.parse(args.to); at += 30 * 60_000) {
    const key = usageBucketKey(new Date(at).toISOString(), args.timeZone, args.granularity);
    buckets.set(key, { at: key, ...emptyUsageMetrics() });
  }
  for (const row of selected) {
    addUsageMetrics(totals, row);
    const accountKey = `${row.providerId}:${row.accountProfileId}`;
    const account = accounts.get(accountKey) ?? { providerId: row.providerId, accountProfileId: row.accountProfileId, ...emptyUsageMetrics() };
    addUsageMetrics(account, row); accounts.set(accountKey, account);
    const modelKey = `${row.providerId}:${row.modelId}`;
    const model = models.get(modelKey) ?? { providerId: row.providerId, modelId: row.modelId, ...emptyUsageMetrics() };
    addUsageMetrics(model, row); models.set(modelKey, model);
    const key = usageBucketKey(row.createdAt, args.timeZone, args.granularity);
    const bucket = buckets.get(key) ?? { at: key, ...emptyUsageMetrics() };
    addUsageMetrics(bucket, row); buckets.set(key, bucket);
  }
  const observations = quota().filter(inScope);
  const latest = new Map<string, QuotaObservation>();
  for (const row of observations) latest.set(`${row.providerId}:${row.accountProfileId}:${row.windowId}`, row);
  return { totals, series: [...buckets.values()], accounts: [...accounts.values()], models: [...models.values()],
    knownAccounts: [...new Map(all.map((row) => [`${row.providerId}:${row.accountProfileId}`, { providerId: row.providerId, accountProfileId: row.accountProfileId }])).values()],
    turns: selected.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(args.offset, args.offset + args.limit),
    quota: observations.filter((row) => row.observedAt >= args.from && row.observedAt < args.to), latestQuota: [...latest.values()],
    quotaHistoryTruncated: false, generatedAt: new Date(USAGE_PREVIEW_NOW).toISOString() };
}
