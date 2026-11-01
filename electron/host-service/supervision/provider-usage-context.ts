import { readAdaptiveObservations } from "../../providers/adaptive-observations";
import { collectProviderAccountUsageWindows, resolveAccountUsageBlock } from "../../../src/lib/providers/account-usage-block";
import { DEFAULT_CLAUDE_OPUS_MODEL, DEFAULT_CODEX_MODEL, getSdkModelOptions } from "../../../src/lib/providers/model-catalog";
import { selectedProviderAccount, type ProviderAccountSelection } from "../../../src/lib/providers/provider-account-selection";
import type { RateLimitsSnapshotResponse } from "../../../src/lib/providers/provider.types";

/** The providers a run's helpers can run on. */
export const TEAM_PROVIDERS = ["claude-code", "codex"] as const;
export type TeamProviderId = (typeof TEAM_PROVIDERS)[number];

/**
 * - `headroom`: below `PROVIDER_USAGE_LOW_PERCENT`.
 * - `low`: new parallel work should go elsewhere when it can.
 * - `critical`: what is left is the user's other tasks' margin.
 * - `exhausted`: the account cannot run a turn until the window resets.
 * - `unknown`: Stave has no recent reading; not a sign of headroom.
 */
export type ProviderUsageStatus = "headroom" | "low" | "critical" | "exhausted" | "unknown";

/** One provider's account usage as a run's turn reads it. Model-facing, so not localized. */
export interface ProviderUsageSummary {
  status: ProviderUsageStatus;
  /** Percent used of the tightest live account-wide window. */
  usedPercent?: number;
  /** When that window resets. */
  resetsAt?: string;
  /** When Stave last read this account's usage. */
  observedAt?: string;
  /** The reading carried only some windows, so a tighter one may be missing. */
  partial?: true;
  /** Models blocked by a window of their own while the account still has room. */
  exhaustedModels?: string[];
}

export const PROVIDER_USAGE_LOW_PERCENT = 70;
export const PROVIDER_USAGE_CRITICAL_PERCENT = 85;

/**
 * Account-wide windows only. A model with a window of its own (Claude's Fable
 * weekly, for one) is listed under `exhaustedModels` instead; counting it here
 * would mark the whole provider exhausted while its other models still run.
 */
const ACCOUNT_WIDE_MODEL: Readonly<Record<TeamProviderId, string>> = {
  "claude-code": DEFAULT_CLAUDE_OPUS_MODEL,
  codex: DEFAULT_CODEX_MODEL,
};

type UsageObservation = { snapshot: RateLimitsSnapshotResponse; metadata: { observedAt: string; observedWindowIds?: string[] } } | null;

function isoFromEpochSeconds(seconds: number | null): string | undefined {
  return seconds != null && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : undefined;
}

/**
 * Summarizes one provider's cached observation. Exhaustion follows the same
 * rule as the send guard (`resolveAccountUsageBlock`); a window whose reset has
 * passed no longer counts toward the percentage.
 */
export function summarizeProviderUsage(args: { providerId: TeamProviderId; observation: UsageObservation; now: number }): ProviderUsageSummary {
  if (!args.observation) return { status: "unknown" };
  const { snapshot, metadata } = args.observation;
  const providerId = args.providerId;
  const accountModel = ACCOUNT_WIDE_MODEL[providerId];
  const provenance = { observedAt: metadata.observedAt, ...(metadata.observedWindowIds?.length ? { partial: true as const } : {}) };
  const windows = collectProviderAccountUsageWindows({ providerId, model: accountModel, snapshot });
  if (windows === null) return { status: "unknown", ...provenance };
  const block = resolveAccountUsageBlock({ providerId, model: accountModel, snapshot, now: args.now });
  if (block) {
    const resetsAt = isoFromEpochSeconds(block.resetsAt);
    return { status: "exhausted", usedPercent: Math.round(Math.min(100, Math.max(0, block.usedPercent))), ...(resetsAt ? { resetsAt } : {}), ...provenance };
  }
  const live = windows.filter((window) =>
    Number.isFinite(window.usedPercent) && (window.resetsAt == null || !Number.isFinite(window.resetsAt) || window.resetsAt * 1000 > args.now));
  if (!live.length) return { status: "unknown", ...provenance };
  const tightest = [...live].sort((left, right) => right.usedPercent - left.usedPercent)[0]!;
  const usedPercent = Math.round(Math.min(100, Math.max(0, tightest.usedPercent)));
  const resetsAt = isoFromEpochSeconds(tightest.resetsAt);
  const exhaustedModels = getSdkModelOptions({ providerId }).filter((model) =>
    model !== accountModel && resolveAccountUsageBlock({ providerId, model, snapshot, now: args.now }) !== null);
  return {
    status: usedPercent >= PROVIDER_USAGE_CRITICAL_PERCENT ? "critical" : usedPercent >= PROVIDER_USAGE_LOW_PERCENT ? "low" : "headroom",
    usedPercent,
    ...(resetsAt ? { resetsAt } : {}),
    ...provenance,
    ...(exhaustedModels.length ? { exhaustedModels: [...exhaustedModels] } : {}),
  };
}

/**
 * Both providers' usage for the accounts this run and its helpers use, from
 * observations Stave already holds: no read is made for it. A provider Stave
 * has not read recently is `unknown`.
 */
export function readTeamProviderUsage(args: {
  accounts: ProviderAccountSelection;
  /** The account the run itself is on now, after any pool switch. */
  runAccount?: { providerId: TeamProviderId; accountProfileId: string };
  now: number;
  read?: typeof readAdaptiveObservations;
}): Record<TeamProviderId, ProviderUsageSummary> {
  const read = args.read ?? readAdaptiveObservations;
  const entries = TEAM_PROVIDERS.map((providerId) => {
    const accountId = args.runAccount?.providerId === providerId
      ? args.runAccount.accountProfileId
      : selectedProviderAccount(providerId, args.accounts);
    return [providerId, summarizeProviderUsage({ providerId, observation: read(providerId, accountId, args.now).quota, now: args.now })] as const;
  });
  return Object.fromEntries(entries) as Record<TeamProviderId, ProviderUsageSummary>;
}
