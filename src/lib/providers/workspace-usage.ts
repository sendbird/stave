import { i18n } from "@/i18n/runtime";
import { z } from "zod";
import type { ProviderId } from "./provider.types";
import { ProviderAccountProfileIdSchema } from "./provider-accounts";
import { UNATTRIBUTED_ACCOUNT_ID, type UsageMetrics } from "./usage-statistics";

export const WORKSPACE_USAGE_IPC = "persistence:workspace-usage";

const IsoDate = z.iso.datetime().transform((value) => new Date(value).toISOString());
const MAX_PERIOD_MS = 366 * 86_400_000;
const withinLimit = (period: { from: string; to: string }) => {
  const duration = Date.parse(period.to) - Date.parse(period.from);
  return duration > 0 && duration <= MAX_PERIOD_MS;
};

/**
 * One period of tokens and cost per workspace, under the same provider,
 * account and model filters as the usage report. Days are calendar days of `timeZone`.
 */
export const WorkspaceUsageArgsSchema = z.object({
  from: IsoDate,
  to: IsoDate,
  timeZone: z.string().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
    catch { return false; }
  }),
  providerId: z.enum(["claude-code", "codex", "cursor", "kiro", "opencode"]).optional(),
  accountProfileId: z.union([ProviderAccountProfileIdSchema, z.literal(UNATTRIBUTED_ACCOUNT_ID)]).optional(),
  /** null selects turns with no recorded model; omission selects every model. */
  modelId: z.string().min(1).max(500).nullable().optional(),
  /** When set, the report also totals this earlier period under the same filters. */
  previous: z.object({ from: IsoDate, to: IsoDate }).strict()
    .refine(withinLimit, { error: () => i18n.t("providers:validation.periodLimit") }).optional(),
}).strict()
  .refine(withinLimit, { error: () => i18n.t("providers:validation.periodLimit") })
  .refine((args) => !args.previous || Date.parse(args.previous.to) <= Date.parse(args.from), { error: () => i18n.t("providers:validation.previousPeriod") })
  .refine((args) => !args.accountProfileId || Boolean(args.providerId), { error: () => i18n.t("providers:validation.accountProvider") });
export type WorkspaceUsageArgs = z.infer<typeof WorkspaceUsageArgsSchema>;

/** One workspace's usage in the period. */
export interface WorkspaceUsageRow extends UsageMetrics {
  /** Null for turns whose task was deleted: their usage is kept, their workspace is not. */
  workspaceId: string | null;
  /** Start of the workspace's latest completed turn in the period. */
  lastActiveAt: string;
  /** Providers that ran its turns, in no particular order. */
  providerIds: ProviderId[];
  /** Calendar day (`YYYY-MM-DD` in the report's zone) to that day's usage; days without turns are absent. */
  days: Record<string, UsageMetrics>;
}

export interface WorkspaceUsageReport {
  totals: UsageMetrics;
  /** Totals of `args.previous` under the same filters; null when no comparison was asked for. */
  previousTotals: UsageMetrics | null;
  /** Every calendar day of the period in order, including days without turns. */
  days: string[];
  /** Most tokens first. */
  workspaces: WorkspaceUsageRow[];
  generatedAt: string;
}

export type WorkspaceUsageResponse =
  | { ok: true; report: WorkspaceUsageReport }
  | { ok: false; message: string };
