import { z } from "zod";
import type { ProviderId } from "./provider.types";

/**
 * What turns run in Stave cost, per provider, for the local day and month.
 *
 * The amount is the one each provider reports with a turn: Claude reports a
 * cost, Codex reports tokens only. A provider that never reported a cost has
 * no entry at all, so callers can show nothing instead of an invented `$0.00`.
 */

/**
 * Period starts as UTC ISO strings, the form `turns.created_at` is stored in,
 * so the main process can compare them as text. The renderer picks them so
 * "today" and "this month" follow the user's local clock.
 */
export const TurnSpendArgsSchema = z
  .object({
    dayStart: z.iso.datetime(),
    monthStart: z.iso.datetime(),
  })
  .strict();

export type TurnSpendArgs = z.infer<typeof TurnSpendArgsSchema>;

export interface ProviderTurnSpend {
  providerId: ProviderId;
  todayUsd: number;
  monthUsd: number;
  /** Turns this month that reported a cost. */
  monthTurns: number;
}

export interface TurnSpendResponse {
  ok: boolean;
  spend: ProviderTurnSpend[];
}

/** Local midnight today and on the 1st of this month. */
export function resolveTurnSpendPeriods(now: Date = new Date()): TurnSpendArgs {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    dayStart: dayStart.toISOString(),
    monthStart: monthStart.toISOString(),
  };
}

/** Re-read at least this often to pick up turns the renderer did not run (missions, MCP tasks). */
export const TURN_SPEND_DRIFT_REFRESH_MS = 10 * 60_000;

/**
 * Delay until the next spend read: the drift interval, or just past local
 * midnight when that comes sooner, so "today" starts at zero on time.
 */
export function resolveTurnSpendRefreshDelayMs(now: Date = new Date()): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).getTime();
  return Math.max(
    1_000,
    Math.min(TURN_SPEND_DRIFT_REFRESH_MS, nextMidnight - now.getTime() + 1_000),
  );
}
