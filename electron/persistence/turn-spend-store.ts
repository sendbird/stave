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
  month_tokens: number;
  today_tokens: number;
  month_token_turns: number;
}

const PROVIDER_IDS: ReadonlySet<string> = new Set<ProviderId>([
  "claude-code",
  "codex",
  "cursor",
  "kiro",
]);

/** A usage counter as a non-negative number: absent, malformed or negative reads as 0. */
function counter(field: string) {
  return `CASE WHEN typeof(${field}) IN ('real', 'integer') AND ${field} > 0 THEN ${field} ELSE 0 END`;
}

/**
 * Sums the cost and tokens providers reported on turn rows. Both `created_at`
 * and the period starts are UTC ISO strings, so they compare as text and the
 * query needs no date parsing. Rows whose usage JSON is malformed are skipped;
 * a row with tokens but no cost counts toward tokens only, so a provider that
 * reports tokens only never gets a cost.
 *
 * Tokens are input plus output, without prompt tokens read from the cache.
 * The providers report the cache differently (see `usage-cache.ts`), so the
 * input side is evened out per provider:
 * - Claude's `inputTokens` is only the uncached remainder; tokens written to
 *   the cache are new prompt too, so they are added. Cache reads are not.
 * - Codex's `inputTokens` is the whole prompt with cache reads inside it, so
 *   they are taken out.
 * - Any other provider's counts are used as reported, since their cache
 *   convention is not verified here.
 * Reasoning tokens are not added on top of output, so a provider that already
 * counts them there is not counted twice.
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
        SUM(cost > 0) AS month_turns,
        SUM(tokens) AS month_tokens,
        SUM(CASE WHEN created_at >= ? THEN tokens ELSE 0 END) AS today_tokens,
        SUM(tokens > 0) AS month_token_turns
      FROM (
        SELECT
          provider,
          created_at,
          cost,
          output + CASE provider
            WHEN 'claude-code' THEN input + cache_write
            WHEN 'codex' THEN MAX(input - cache_read, 0)
            ELSE input
          END AS tokens
        FROM (
          SELECT
            provider,
            created_at,
            ${counter("raw_cost")} AS cost,
            ${counter("raw_input")} AS input,
            ${counter("raw_output")} AS output,
            ${counter("raw_cache_read")} AS cache_read,
            ${counter("raw_cache_write")} AS cache_write
          FROM (
            SELECT
              CASE provider_id WHEN 'stave' THEN 'claude-code' ELSE provider_id END AS provider,
              created_at,
              json_extract(usage_json, '$.totalCostUsd') AS raw_cost,
              json_extract(usage_json, '$.inputTokens') AS raw_input,
              json_extract(usage_json, '$.outputTokens') AS raw_output,
              json_extract(usage_json, '$.cacheReadTokens') AS raw_cache_read,
              json_extract(usage_json, '$.cacheCreationTokens') AS raw_cache_write
            FROM turns
            WHERE created_at >= ? AND usage_json IS NOT NULL AND json_valid(usage_json)
          )
        )
      )
      GROUP BY provider
      HAVING month_usd > 0 OR month_tokens > 0
    `,
      )
      .all(args.dayStart, args.dayStart, args.monthStart) as SpendRow[];
    return rows
      .filter((row) => PROVIDER_IDS.has(row.provider))
      .map((row) => ({
        providerId: row.provider as ProviderId,
        todayUsd: row.today_usd,
        monthUsd: row.month_usd,
        monthTurns: row.month_turns,
        todayTokens: row.today_tokens,
        monthTokens: row.month_tokens,
        monthTokenTurns: row.month_token_turns,
      }));
  }
}
