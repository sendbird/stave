import { z } from "zod";
import { i18n } from "@/i18n/runtime";
import type { ProviderId } from "../providers/provider.types";

export const DAILY_LIMIT_PROVIDERS = ["claude-code", "codex", "cursor", "kiro", "opencode"] as const;
export const DailyLimitUpdateSchema = z.object({
  providerId: z.enum(DAILY_LIMIT_PROVIDERS),
  limit: z.object({ unit: z.enum(["tokens", "usd"]), amount: z.number().finite().positive() }).strict().nullable(),
}).strict();
export type DailyLimit = NonNullable<z.infer<typeof DailyLimitUpdateSchema>["limit"]>;
export type DailyLimitUpdate = z.infer<typeof DailyLimitUpdateSchema>;
export interface DailyUsage {
  providerId: ProviderId;
  limit: DailyLimit | null;
  tokens: number;
  costUsd: number | null;
  costReportedTurns: number;
  costAvailable: boolean;
  turns: number;
  reached: boolean;
}
export interface DailyUsageReport { from: string; to: string; providers: DailyUsage[] }
export interface DailyUsageApi {
  read(): Promise<DailyUsageReport>;
  update(input: DailyLimitUpdate): Promise<DailyUsageReport>;
}

/** Local calendar midnights, including 23/25-hour daylight-saving days. */
export function dailyUsageWindow(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function dailyLimitReached(usage: Pick<DailyUsage, "limit" | "tokens" | "costUsd">): boolean {
  if (!usage.limit) return false;
  const spent = usage.limit.unit === "tokens" ? usage.tokens : usage.costUsd;
  return spent !== null && spent >= usage.limit.amount;
}

export function dailyLimitReason(): string {
  return i18n.t("usage:dailyLimit.reached");
}
