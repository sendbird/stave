import { providerAccountUsageLabel } from "../providers/account-usage-block";

/**
 * Account usage as agent runs and delegations read it: the host summarizes
 * its cached readings (`electron/host-service/supervision/provider-usage-context.ts`)
 * and both the Run team limits context and a delegation's admission use this.
 */

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

export type UsageAdmission = { ok: true } | { ok: false; message: string };

function describeUsage(summary: ProviderUsageSummary): string {
  return summary.usedPercent === undefined ? summary.status : `${summary.status}, ${summary.usedPercent}% used`;
}

/**
 * Whether a model's new delegation may start on a provider, from the summaries
 * a run reads. Exhausted (the account, or the requested model's own window) is
 * refused, since the child could not run. Critical is refused only while the
 * other provider has room, so what is left stays with the user's other tasks.
 * Unknown never refuses, and an explicit user request for the provider
 * overrides all of it. Model-facing, so not localized.
 */
export function admitDelegationUsage(args: {
  providerId: TeamProviderId;
  model?: string;
  usage: Record<TeamProviderId, ProviderUsageSummary> | null;
  override?: boolean;
}): UsageAdmission {
  if (args.override || !args.usage) return { ok: true };
  const target = args.usage[args.providerId];
  const otherId: TeamProviderId = args.providerId === "codex" ? "claude-code" : "codex";
  const other = args.usage[otherId];
  const label = providerAccountUsageLabel(args.providerId);
  const otherLabel = providerAccountUsageLabel(otherId);
  const until = (summary: ProviderUsageSummary) => (summary.resetsAt ? ` until ${summary.resetsAt}` : "");
  // i18n-ignore: model-facing; only a model's stave_delegate_task call receives this refusal
  const overrideHint = ` Pass usageOverride "user-request" only when the user asked for ${label}.`;
  if (target.status === "exhausted") {
    // i18n-ignore: model-facing; only a model's stave_delegate_task call receives this refusal
    return { ok: false, message: `${label} account usage is exhausted${until(target)}. ${otherLabel} is ${describeUsage(other)}: start this on ${otherLabel}, or retry after the reset.${overrideHint}` };
  }
  const model = args.model?.trim().toLowerCase();
  if (model && target.exhaustedModels?.some((entry) => entry.toLowerCase() === model)) {
    // i18n-ignore: model-facing; only a model's stave_delegate_task call receives this refusal
    return { ok: false, message: `${args.model} has used up its own usage window on ${label}. Choose another ${label} model or ${otherLabel}.${overrideHint}` };
  }
  if (target.status === "critical" && (other.status === "headroom" || other.status === "low")) {
    // i18n-ignore: model-facing; only a model's stave_delegate_task call receives this refusal
    return { ok: false, message: `${label} is ${describeUsage(target)}${until(target)}; the rest is kept for the user's other tasks. ${otherLabel} is ${describeUsage(other)}: start new work there.${overrideHint}` };
  }
  return { ok: true };
}
