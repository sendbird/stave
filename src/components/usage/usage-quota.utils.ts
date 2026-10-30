import { i18n } from "@/i18n";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { QuotaObservation } from "@/lib/providers/usage-statistics";

export function quotaResetCountdown(resetsAt: number | null, now: number) {
  if (resetsAt === null) return i18n.t("usage:countdown.missing");
  const minutes = Math.ceil((resetsAt * 1000 - now) / 60_000);
  if (minutes <= 0) return i18n.t("usage:countdown.passed");
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const key = days ? (hours ? (rest ? "daysHoursMinutes" : "daysHours") : rest ? "daysMinutes" : "days") : hours ? (rest ? "hoursMinutes" : "hours") : "minutes";
  return i18n.t(`usage:countdown.${key}`, { days, hours, minutes: rest });
}

/** Account rows remain separate: different subscriptions do not share a quota. */
export function groupQuotaAccounts(args: {
  observations: readonly QuotaObservation[];
  accounts: readonly { providerId: ProviderId; accountProfileId: string }[];
  providerId?: ProviderId;
  accountProfileId?: string;
  now: number;
}) {
  const groups = new Map<string, { providerId: ProviderId; accountProfileId: string; windows: QuotaObservation[] }>();
  for (const account of [...args.accounts, ...args.observations]) {
    if ((args.providerId && account.providerId !== args.providerId) ||
      (args.accountProfileId && account.accountProfileId !== args.accountProfileId) || account.accountProfileId === "unattributed") continue;
    const key = `${account.providerId}:${account.accountProfileId}`;
    if (!groups.has(key)) groups.set(key, { providerId: account.providerId, accountProfileId: account.accountProfileId, windows: [] });
  }
  for (const row of args.observations) groups.get(`${row.providerId}:${row.accountProfileId}`)?.windows.push(row);
  const nextReset = (windows: readonly QuotaObservation[]) => Math.min(Infinity,
    ...windows.filter((row) => row.resetsAt !== null && row.resetsAt * 1000 > args.now).map((row) => row.resetsAt!));
  return [...groups.values()].sort((a, b) => a.providerId.localeCompare(b.providerId) ||
    (nextReset(a.windows) - nextReset(b.windows) || a.accountProfileId.localeCompare(b.accountProfileId)));
}

/**
 * One row per provider for subscription quota, in the order groupQuotaAccounts
 * sorted them. API-billed gateway accounts carry no quota, so they are split
 * out to a row of their own at the end instead of sitting among the providers.
 */
export function splitQuotaRows<T extends { providerId: ProviderId }>(accounts: readonly T[], isGateway: (account: T) => boolean) {
  const rows = new Map<ProviderId, T[]>();
  for (const account of accounts) {
    if (isGateway(account)) continue;
    rows.set(account.providerId, [...(rows.get(account.providerId) ?? []), account]);
  }
  return {
    providers: [...rows].map(([providerId, providerAccounts]) => ({ providerId, accounts: providerAccounts })),
    gateways: accounts.filter(isGateway),
  };
}

/**
 * Window lengths Stave can name from the saved observation alone. Claude's
 * windows are fixed by id; other providers store their length only in a
 * localized label, so they read as unknown rather than guessed.
 */
const KNOWN_WINDOW_MS: Partial<Record<ProviderId, Record<string, number>>> = {
  "claude-code": { session: 5 * 3_600_000, weekly: 7 * 86_400_000, "fable-weekly": 7 * 86_400_000 },
};
export function quotaWindowMs(row: Pick<QuotaObservation, "providerId" | "windowId">) {
  return KNOWN_WINDOW_MS[row.providerId]?.[row.windowId] ?? null;
}

/** A reading older than this no longer describes the account as it is now. */
export const QUOTA_STALE_MS = 15 * 60_000;
/** Below this share of the window, one burst would read as the whole window's pace. */
const PACE_MIN_ELAPSED = 0.1;

export type QuotaPace =
  | { kind: "exhausted" }
  | { kind: "runsOut"; at: number }
  | { kind: "lasts"; projectedPercent: number };

export interface QuotaWindowState {
  remainingPercent: number;
  stale: boolean;
  expired: boolean;
  /** Share of the window already elapsed now, 0–1, when the window length is known. */
  elapsedRatio: number | null;
  /** Straight-line projection from the observed reading; null when it would mislead. */
  pace: QuotaPace | null;
}

/**
 * What a saved reading says about the time left: how much of the window has
 * passed, and whether the observed pace reaches 100% before the reset. The
 * projection assumes the average rate since the window started continues; it
 * is an estimate, never a promise, and it is withheld for stale, expired,
 * unknown-length and just-started windows.
 */
export function quotaWindowState(row: QuotaObservation, now: number): QuotaWindowState {
  const observedAt = Date.parse(row.observedAt);
  const resetAt = row.resetsAt === null ? null : row.resetsAt * 1000;
  const stale = !Number.isFinite(observedAt) || now - observedAt > QUOTA_STALE_MS;
  const expired = resetAt !== null && resetAt <= now;
  const remainingPercent = Math.max(0, 100 - row.usedPercent);
  const windowMs = quotaWindowMs(row);
  const elapsedRatio = windowMs !== null && resetAt !== null && !expired
    ? Math.min(1, Math.max(0, 1 - (resetAt - now) / windowMs)) : null;
  let pace: QuotaPace | null = null;
  if (!stale && !expired) {
    if (row.usedPercent >= 100) pace = { kind: "exhausted" };
    else if (windowMs !== null && resetAt !== null) {
      const elapsedAtReading = windowMs - (resetAt - observedAt);
      // Nothing used yet has no pace to project.
      if (row.usedPercent > 0 && elapsedAtReading >= windowMs * PACE_MIN_ELAPSED && elapsedAtReading <= windowMs) {
        const rate = row.usedPercent / elapsedAtReading;
        const runsOutAt = observedAt + (100 - row.usedPercent) / rate;
        // Running out within a minute of the reset is landing on it, not a warning.
        pace = runsOutAt < resetAt - 60_000 ? { kind: "runsOut", at: runsOutAt }
          : { kind: "lasts", projectedPercent: Math.min(100, row.usedPercent + rate * (resetAt - observedAt)) };
      }
    }
  }
  return { remainingPercent, stale, expired, elapsedRatio, pace };
}

/**
 * The window that stops work first across the listed accounts: one already
 * used up, then the earliest projected run-out, then the least room left.
 * Expired and stale readings cannot speak for now.
 */
export function tightestQuotaWindow(windows: readonly QuotaObservation[], now: number) {
  const rank = (state: QuotaWindowState) => state.pace?.kind === "exhausted" ? [0, 0]
    : state.pace?.kind === "runsOut" ? [1, state.pace.at] : [2, state.remainingPercent];
  let best: { row: QuotaObservation; state: QuotaWindowState } | null = null;
  for (const row of windows) {
    const state = quotaWindowState(row, now);
    if (state.expired || state.stale) continue;
    if (!best) { best = { row, state }; continue; }
    const [group, value] = rank(state);
    const [bestGroup, bestValue] = rank(best.state);
    if (group! < bestGroup! || (group === bestGroup && value! < bestValue!)) best = { row, state };
  }
  return best;
}
