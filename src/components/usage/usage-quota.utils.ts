import type { ProviderId } from "@/lib/providers/provider.types";
import type { QuotaObservation } from "@/lib/providers/usage-statistics";

export function quotaResetCountdown(resetsAt: number | null, now: number) {
  if (resetsAt === null) return "Reset time not reported";
  const minutes = Math.ceil((resetsAt * 1000 - now) / 60_000);
  if (minutes <= 0) return "Reset time passed";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return `Resets in ${days ? `${days}d ` : ""}${hours ? `${hours}h ` : ""}${rest || (!days && !hours) ? `${rest}m` : ""}`.trim();
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
