import type { ProviderId } from "../../src/lib/providers/provider.types";
import { addUsageMetrics, emptyUsageMetrics, usageBucketKey, type UsageMetrics } from "../../src/lib/providers/usage-statistics";
import type { WorkspaceUsageArgs, WorkspaceUsageReport, WorkspaceUsageRow } from "../../src/lib/providers/workspace-usage";
import { METRIC_SUMS, RAW_USAGE_COUNTERS, usageCte } from "./usage-statistics-query";

interface WorkspaceUsageDatabase {
  prepare(sql: string): { all(...args: unknown[]): unknown[]; get(...args: unknown[]): unknown };
  transaction<T>(run: () => T): () => T;
}

/**
 * Usage rows carry the provider, account and counters; the turn row carries
 * the workspace. A turn whose task was deleted keeps its usage row, so it
 * still counts, under no workspace. Filters match the usage report's.
 */
const WORKSPACE_USAGE_CTE = usageCte(`
  SELECT *, ${RAW_USAGE_COUNTERS} FROM (
    SELECT u.id, u.provider_id, u.account_profile_id, u.created_at, u.usage_json, t.workspace_id
    FROM usage_turns AS u LEFT JOIN turns AS t ON t.id = u.id
    WHERE u.created_at >= ? AND u.created_at < ? AND u.completed_at IS NOT NULL
      AND (? IS NULL OR u.provider_id = ?) AND (? IS NULL OR u.account_profile_id = ?)
      AND (? = 0 OR u.model_id IS ?)
  )`);

type MinuteRow = UsageMetrics & { workspaceId: string | null; providerId: ProviderId; at: string; lastActiveAt: string };

const settle = (metrics: UsageMetrics) => {
  metrics.measuredTurns ??= 0;
  metrics.costReportedTurns ??= 0;
  return metrics;
};

/** Tokens and reported cost per workspace and calendar day, for the Projects view of AI usage. */
export class WorkspaceUsageStore {
  constructor(private readonly db: WorkspaceUsageDatabase) {}

  read(args: WorkspaceUsageArgs): WorkspaceUsageReport {
    return this.db.transaction(() => this.readReport(args))();
  }

  private readReport(args: WorkspaceUsageArgs): WorkspaceUsageReport {
    const filters = [args.providerId ?? null, args.providerId ?? null, args.accountProfileId ?? null, args.accountProfileId ?? null,
      args.modelId === undefined ? 0 : 1, args.modelId ?? null];
    const totalsOf = (from: string, to: string) =>
      settle(this.db.prepare(`${WORKSPACE_USAGE_CTE} SELECT ${METRIC_SUMS} FROM usage`).get(from, to, ...filters) as UsageMetrics);
    // Minute groups keep half- and quarter-hour zone boundaries exact; days are formed below in the report's zone.
    const minutes = this.db.prepare(`${WORKSPACE_USAGE_CTE} SELECT workspace_id AS workspaceId, provider_id AS providerId,
      strftime('%Y-%m-%dT%H:%M:00Z', created_at) AS at, MAX(created_at) AS lastActiveAt, ${METRIC_SUMS}
      FROM usage GROUP BY workspace_id, provider_id, at ORDER BY at`).all(args.from, args.to, ...filters) as MinuteRow[];

    const days: string[] = [];
    const seen = new Set<string>();
    const addDay = (day: string) => { if (!seen.has(day)) { seen.add(day); days.push(day); } };
    for (let at = Date.parse(args.from); at < Date.parse(args.to); at += 30 * 60_000) addDay(usageBucketKey(new Date(at).toISOString(), args.timeZone, "day"));
    addDay(usageBucketKey(new Date(Date.parse(args.to) - 1).toISOString(), args.timeZone, "day"));

    const rows = new Map<string | null, WorkspaceUsageRow & { providers: Set<ProviderId> }>();
    for (const { workspaceId, providerId, at, lastActiveAt, ...metrics } of minutes) {
      settle(metrics);
      let row = rows.get(workspaceId);
      if (!row) {
        row = { workspaceId, lastActiveAt, providerIds: [], days: {}, providers: new Set(), ...emptyUsageMetrics() };
        rows.set(workspaceId, row);
      }
      addUsageMetrics(row, metrics);
      row.providers.add(providerId);
      if (lastActiveAt > row.lastActiveAt) row.lastActiveAt = lastActiveAt;
      const day = usageBucketKey(at, args.timeZone, "day");
      addUsageMetrics(row.days[day] ??= emptyUsageMetrics(), metrics);
    }
    const workspaces = [...rows.values()].map(({ providers, ...row }) => ({ ...row, providerIds: [...providers] }))
      .sort((left, right) => right.tokens - left.tokens || (left.workspaceId ?? "").localeCompare(right.workspaceId ?? ""));
    return {
      totals: totalsOf(args.from, args.to),
      previousTotals: args.previous ? totalsOf(args.previous.from, args.previous.to) : null,
      days,
      workspaces,
      generatedAt: new Date().toISOString(),
    };
  }
}
