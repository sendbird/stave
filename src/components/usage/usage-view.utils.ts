import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "@/lib/providers/provider-accounts";
import { UNATTRIBUTED_ACCOUNT_ID, USAGE_PROVIDER_NAMES, type UsageStatisticsArgs, type UsageTurn } from "@/lib/providers/usage-statistics";
import type { ProviderId } from "@/lib/providers/provider.types";

export type UsagePeriod = "today" | "7" | "30" | "90" | "month" | "custom";
export const USAGE_TURN_PAGE_SIZE = 20;
export const USAGE_PERIOD_OPTIONS = [
  { value: "today", label: "Today" }, { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" },
  { value: "month", label: "This month" }, { value: "custom", label: "Custom dates" },
];
export function dateInputValue(date: Date, utc = false) {
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = utc ? date.getUTCDate() : date.getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function usageRange(args: { period: UsagePeriod; start: string; end: string; utc: boolean; now?: Date }) {
  const now = args.now ?? new Date();
  const date = (value: string) => new Date(`${value}T00:00:00${args.utc ? "Z" : ""}`);
  const today = date(dateInputValue(now, args.utc));
  const shift = (value: Date, days: number) => {
    const copy = new Date(value);
    if (args.utc) copy.setUTCDate(copy.getUTCDate() + days);
    else copy.setDate(copy.getDate() + days);
    return copy;
  };
  let from = today;
  let to = shift(today, 1);
  if (args.period === "custom") {
    from = date(args.start);
    to = shift(date(args.end), 1);
  } else if (args.period === "month") {
    from = new Date(today);
    if (args.utc) from.setUTCDate(1); else from.setDate(1);
  } else if (args.period !== "today") from = shift(today, 1 - Number(args.period));
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 366 * 86_400_000) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}
export function usageAccountLabel(providerId: ProviderId, accountProfileId: string, profiles: readonly ProviderAccountProfile[]) {
  if (accountProfileId === UNATTRIBUTED_ACCOUNT_ID) return "Unattributed history";
  if (accountProfileId === SYSTEM_ACCOUNT_PROFILE_ID) return "System default";
  return profiles.find((profile) => profile.providerId === providerId && profile.id === accountProfileId)?.label ?? "Removed account";
}
export function usageScopeLabel(providerId: ProviderId, accountProfileId: string, profiles: readonly ProviderAccountProfile[]) {
  return `${USAGE_PROVIDER_NAMES[providerId]} · ${usageAccountLabel(providerId, accountProfileId, profiles)}`;
}
export function usageTimestamp(at: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone, year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(at));
}
export function groupUsageTurnsByDay(turns: readonly UsageTurn[], timeZone: string) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const groups = new Map<string, { day: string; turns: UsageTurn[] }>();
  for (const turn of turns) {
    const day = date.format(new Date(turn.createdAt));
    let group = groups.get(day);
    if (!group) {
      group = { day, turns: [] };
      groups.set(day, group);
    }
    group.turns.push(turn);
  }
  return [...groups.values()];
}
export type UsageStatisticsLoader = (args: UsageStatisticsArgs) => Promise<import("@/lib/providers/usage-statistics").UsageStatisticsReport | null>;
export async function loadUsageStatistics(args: UsageStatisticsArgs) {
  const read = window.api?.persistence?.usageStatistics;
  if (!read) return null;
  const result = await read(args);
  if (!result.ok) throw new Error(result.message);
  return result.report;
}
