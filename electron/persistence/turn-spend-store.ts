import type { ProviderId } from "../../src/lib/providers/provider.types";
import type {
  ProviderTurnSpend,
  TurnSpendArgs,
} from "../../src/lib/providers/turn-spend";

interface SpendDatabase {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}

interface SpendRow {
  provider: string;
  month_usd: number;
  today_usd: number;
  month_turns: number;
}

const PROVIDER_IDS: ReadonlySet<string> = new Set<ProviderId>([
  "claude-code",
  "codex",
  "cursor",
  "kiro",
]);

/**
 * Sums the cost providers reported on turn rows. Both `created_at` and the
 * period starts are UTC ISO strings, so they compare as text and the query
 * needs no date parsing. Rows whose usage JSON is malformed or carries no cost
 * are skipped, so a provider that reports tokens only never shows up.
 */
export class TurnSpendStore {
  constructor(private readonly db: SpendDatabase) {}

  summarize(args: TurnSpendArgs): ProviderTurnSpend[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        provider,
        SUM(cost) AS month_usd,
        SUM(CASE WHEN created_at >= ? THEN cost ELSE 0 END) AS today_usd,
        COUNT(*) AS month_turns
      FROM (
        SELECT
          CASE provider_id WHEN 'stave' THEN 'claude-code' ELSE provider_id END AS provider,
          created_at,
          json_extract(usage_json, '$.totalCostUsd') AS cost
        FROM turns
        WHERE created_at >= ? AND usage_json IS NOT NULL AND json_valid(usage_json)
      )
      WHERE typeof(cost) IN ('real', 'integer') AND cost > 0
      GROUP BY provider
    `,
      )
      .all(args.dayStart, args.monthStart) as SpendRow[];
    return rows
      .filter((row) => PROVIDER_IDS.has(row.provider))
      .map((row) => ({
        providerId: row.provider as ProviderId,
        todayUsd: row.today_usd,
        monthUsd: row.month_usd,
        monthTurns: row.month_turns,
      }));
  }
}
