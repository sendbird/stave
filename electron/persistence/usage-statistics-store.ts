import type { ProviderId, RateLimitsSnapshotResponse } from "../../src/lib/providers/provider.types";
import { selectedProviderAccount } from "../../src/lib/providers/provider-account-selection";
import {
  addUsageMetrics, emptyUsageMetrics, quotaObservations, usageBucketKey, UNATTRIBUTED_ACCOUNT_ID,
  type QuotaObservation, type UsageAccountTotal, type UsageMetrics, type UsageModelTotal,
  type UsageStatisticsArgs, type UsageStatisticsReport, type UsageTurn,
} from "../../src/lib/providers/usage-statistics";
import { METRIC_SUMS, TURN_METRICS, USAGE_CTE } from "./usage-statistics-query";
import type { BridgeEvent } from "../providers/types";

interface UsageDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...args: any[]): unknown;
    all(...args: any[]): unknown[];
    get(...args: any[]): unknown;
  };
  transaction<T>(run: () => T): () => T;
}

/** Metadata only: no prompts, paths, account credentials or message bodies. */
export class UsageStatisticsStore {
  constructor(private readonly db: UsageDatabase) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_turns (
        id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, account_profile_id TEXT NOT NULL,
        model_id TEXT, model_sequence INTEGER NOT NULL DEFAULT -1, account_sequence INTEGER NOT NULL DEFAULT -1,
        created_at TEXT NOT NULL, completed_at TEXT, usage_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_usage_turns_period ON usage_turns (created_at, provider_id, account_profile_id);
      CREATE TABLE IF NOT EXISTS usage_quota_observations (
        provider_id TEXT NOT NULL, account_profile_id TEXT NOT NULL, window_id TEXT NOT NULL,
        minute TEXT NOT NULL, observed_at TEXT NOT NULL, label TEXT NOT NULL,
        used_percent REAL NOT NULL, resets_at REAL, source TEXT NOT NULL,
        PRIMARY KEY (provider_id, account_profile_id, window_id, minute)
      );
      CREATE INDEX IF NOT EXISTS idx_usage_quota_period ON usage_quota_observations (observed_at);
      CREATE TABLE IF NOT EXISTS usage_statistics_meta (key TEXT PRIMARY KEY);
    `);
    // Existing turn rows have no execution-account evidence. Keep them explicitly
    // unattributed; never infer it from today's selected account. Import once,
    // atomically, across concurrent main/host connections.
    db.transaction(() => {
      if (db.prepare("SELECT key FROM usage_statistics_meta WHERE key = 'turn-history-imported'").get()) return;
      // temporary-migration: usage-statistics-legacy-provider
      // Remove the legacy provider CASE and its filter entry in 0.27.0.
      db.prepare(`INSERT OR IGNORE INTO usage_turns
      (id, provider_id, account_profile_id, model_id, created_at, completed_at, usage_json)
      SELECT id, CASE provider_id WHEN 'stave' THEN 'claude-code' ELSE provider_id END, ?, NULL,
        created_at, completed_at, usage_json FROM turns
      WHERE provider_id IN ('stave', 'claude-code', 'codex', 'cursor', 'kiro')`).run(UNATTRIBUTED_ACCOUNT_ID);
      // end temporary-migration: usage-statistics-legacy-provider
      db.prepare("INSERT INTO usage_statistics_meta (key) VALUES ('turn-history-imported')").run();
    })();
  }

  beginTurn(args: { id: string; providerId: ProviderId; accountProfileId?: string; modelId?: string; createdAt: string }) {
    this.db.prepare(`INSERT INTO usage_turns
      (id, provider_id, account_profile_id, model_id, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET account_profile_id = excluded.account_profile_id, model_id = excluded.model_id`)
      .run(args.id, args.providerId, args.accountProfileId ?? UNATTRIBUTED_ACCOUNT_ID, args.modelId ?? null, args.createdAt);
  }

  resolveModel(id: string, modelId: string, sequence: number) {
    this.db.prepare("UPDATE usage_turns SET model_id = ?, model_sequence = ? WHERE id = ? AND model_sequence < ?")
      .run(modelId, sequence, id, sequence);
  }

  observeEvent(id: string, event: BridgeEvent, sequence: number) {
    if (event.type === "model_resolved") this.resolveModel(id, event.resolvedModel, sequence);
    if ((event.type === "provider_session" || event.type === "provider_turn") && event.accountProfileId) {
      this.db.prepare(`UPDATE usage_turns SET provider_id = ?, account_profile_id = ?, account_sequence = ?
        WHERE id = ? AND account_sequence < ?`).run(event.providerId, event.accountProfileId, sequence, id, sequence);
    }
  }

  completeTurn(id: string, completedAt: string, usageJson: string | null) {
    this.db.prepare(`UPDATE usage_turns SET completed_at = COALESCE(completed_at, ?),
      usage_json = COALESCE(?, usage_json) WHERE id = ?`).run(completedAt, usageJson, id);
  }

  /** Existing reads supply observations; storing them creates no provider traffic. */
  recordQuota(snapshot: RateLimitsSnapshotResponse, options?: { claudeAccountProfileId?: string; codexAccountProfileId?: string },
    observedAt = new Date().toISOString()) {
    const insert = this.db.prepare(`INSERT INTO usage_quota_observations
      (provider_id, account_profile_id, window_id, minute, observed_at, label, used_percent, resets_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, account_profile_id, window_id, minute) DO UPDATE SET
        observed_at = excluded.observed_at, label = excluded.label, used_percent = excluded.used_percent,
        resets_at = excluded.resets_at, source = excluded.source
      WHERE excluded.observed_at > observed_at`);
    for (const providerId of ["claude-code", "codex", "cursor", "kiro"] as const) {
      for (const sample of quotaObservations(snapshot, providerId, selectedProviderAccount(providerId, options), observedAt)) {
        insert.run(providerId, sample.accountProfileId, sample.windowId, observedAt.slice(0, 16), observedAt,
          sample.label, sample.usedPercent, sample.resetsAt, sample.source);
      }
    }
    // A year's minute-grained observations is bounded independently of turn history.
    const before = new Date(Date.parse(observedAt) - 366 * 86_400_000).toISOString();
    this.db.prepare("DELETE FROM usage_quota_observations WHERE observed_at < ?").run(before);
  }

  read(args: UsageStatisticsArgs): UsageStatisticsReport {
    return this.db.transaction(() => this.readReport(args))();
  }

  private readReport(args: UsageStatisticsArgs): UsageStatisticsReport {
    const params = [args.from, args.to, args.providerId ?? null, args.providerId ?? null,
      args.accountProfileId ?? null, args.accountProfileId ?? null];
    const totals = this.db.prepare(`${USAGE_CTE} SELECT ${METRIC_SUMS} FROM usage`).get(...params) as UsageMetrics;
    totals.measuredTurns ??= 0;
    totals.costReportedTurns ??= 0;
    const accounts = this.db.prepare(`${USAGE_CTE} SELECT provider_id AS providerId,
      account_profile_id AS accountProfileId, ${METRIC_SUMS} FROM usage GROUP BY provider_id, account_profile_id
      ORDER BY tokens DESC, provider_id, account_profile_id`).all(...params) as UsageAccountTotal[];
    const models = this.db.prepare(`${USAGE_CTE} SELECT provider_id AS providerId, model_id AS modelId,
      ${METRIC_SUMS} FROM usage GROUP BY provider_id, model_id ORDER BY tokens DESC, provider_id, model_id`)
      .all(...params) as UsageModelTotal[];
    // Minute groups preserve half/quarter-hour timezone boundaries. Aggregate in
    // SQLite first so all prompt-free rows need not cross into the renderer.
    const minutes = this.db.prepare(`${USAGE_CTE} SELECT strftime('%Y-%m-%dT%H:%M:00Z', created_at) AS at,
      ${METRIC_SUMS} FROM usage GROUP BY at ORDER BY at`).all(...params) as Array<UsageMetrics & { at: string }>;
    const buckets = new Map<string, UsageMetrics>();
    for (let at = Date.parse(args.from); at < Date.parse(args.to); at += 30 * 60_000) {
      buckets.set(usageBucketKey(new Date(at).toISOString(), args.timeZone, args.granularity), emptyUsageMetrics());
    }
    buckets.set(usageBucketKey(new Date(Date.parse(args.to) - 1).toISOString(), args.timeZone, args.granularity), emptyUsageMetrics());
    for (const minute of minutes) {
      const key = usageBucketKey(minute.at, args.timeZone, args.granularity);
      const target = buckets.get(key) ?? emptyUsageMetrics();
      addUsageMetrics(target, minute);
      buckets.set(key, target);
    }
    const turns = this.db.prepare(`${USAGE_CTE} SELECT id, provider_id AS providerId,
      account_profile_id AS accountProfileId, model_id AS modelId, created_at AS createdAt,
      completed_at AS completedAt, ${TURN_METRICS} FROM usage ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, args.limit, args.offset) as UsageTurn[];
    const knownAccounts = this.db.prepare(`SELECT DISTINCT provider_id AS providerId, account_profile_id AS accountProfileId
      FROM usage_turns UNION SELECT DISTINCT provider_id, account_profile_id FROM usage_quota_observations`)
      .all() as UsageStatisticsReport["knownAccounts"];
    const quota = this.db.prepare(`SELECT provider_id AS providerId, account_profile_id AS accountProfileId,
      window_id AS windowId, observed_at AS observedAt, label, used_percent AS usedPercent, resets_at AS resetsAt, source
      FROM usage_quota_observations WHERE observed_at >= ? AND observed_at < ?
        AND (? IS NULL OR provider_id = ?) AND (? IS NULL OR account_profile_id = ?)
      ORDER BY observed_at DESC, provider_id, account_profile_id, window_id LIMIT 2001`).all(...params) as QuotaObservation[];
    const latestQuota = this.db.prepare(`SELECT provider_id AS providerId, account_profile_id AS accountProfileId,
      window_id AS windowId, observed_at AS observedAt, label, used_percent AS usedPercent, resets_at AS resetsAt, source
      FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY provider_id, account_profile_id, window_id ORDER BY observed_at DESC) AS rank
        FROM usage_quota_observations WHERE (? IS NULL OR provider_id = ?) AND (? IS NULL OR account_profile_id = ?))
      WHERE rank = 1 ORDER BY provider_id, account_profile_id, window_id`)
      .all(args.providerId ?? null, args.providerId ?? null, args.accountProfileId ?? null, args.accountProfileId ?? null) as QuotaObservation[];
    return { totals, series: [...buckets].map(([at, metrics]) => ({ at, ...metrics })), accounts, models, knownAccounts, latestQuota,
      turns, quota: quota.slice(0, 2000).reverse(), quotaHistoryTruncated: quota.length > 2000,
      generatedAt: new Date().toISOString() };
  }
}
