import { i18n } from "@/i18n/runtime";
import {
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  CODEX_EFFORT_OPTIONS,
  findOptionLabel,
} from "@/lib/providers/runtime-option-contract";
import type { WorkGraphStatus } from "@/lib/work-graph/work-graph.types";

export {
  describeDeadline,
  formatExchangeDuration,
  type DeadlineDescription,
} from "./duration";

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Title-case tier name for any provider's effort token. The Codex option
 * contract is a superset of Claude's scale, so both providers (and delegated-task
 * and worker efforts, which reuse the same tokens) read the same words.
 */
export function formatEffortLabel(effort: string): string {
  const known = findOptionLabel(CODEX_EFFORT_OPTIONS, effort);
  if (known !== effort) {
    return known;
  }
  return effort.length === 0
    ? effort
    : `${effort.slice(0, 1).toUpperCase()}${effort.slice(1)}`;
}

export interface AgentIdentityDescription {
  /** Short provider label, e.g. `Claude`; `null` when the provider is unknown. */
  providerLabel: string | null;
  /** Human model name via the catalog; `null` when no model was reported. */
  modelLabel: string | null;
  /** Title-case effort; `null` when no effort was reported. */
  effortLabel: string | null;
  /** Role label as given, e.g. `Subagent`. */
  roleLabel: string | null;
  /** `Claude Opus 5 · High`; the provider leads only when no model is known. */
  text: string;
}

/**
 * The one line that says who ran something. Every surface that names a
 * delegate goes through here so a raw model id never leaks into the UI in one
 * place while another prints the catalog name.
 */
export function describeAgentIdentity(args: {
  providerId?: ProviderId | null;
  model?: string | null;
  effort?: string | null;
  role?: string | null;
}): AgentIdentityDescription {
  const providerLabel = args.providerId
    ? getProviderLabel({ providerId: args.providerId })
    : null;
  const model = args.model?.trim();
  const modelLabel = model ? toHumanModelName({ model }) || model : null;
  const effort = args.effort?.trim();
  const effortLabel = effort ? formatEffortLabel(effort) : null;
  const roleLabel = args.role?.trim() || null;
  // The catalog name already names its provider (`GPT-5.6 Sol`, `Claude
  // Opus 5`), so the provider label only leads when no model was reported.
  const segments = [
    modelLabel ? null : providerLabel,
    modelLabel,
    effortLabel,
  ].filter((segment): segment is string => Boolean(segment));
  return {
    providerLabel,
    modelLabel,
    effortLabel,
    roleLabel,
    text: segments.length > 0 ? segments.join(" · ") : i18n.t("agentRuns:format.text"),
  };
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export const EXCHANGE_STATUSES = [
  "queued",
  "running",
  "returned",
  "failed",
  "cancelled",
  "timed_out",
  "unresolved",
] as const;

export type ExchangeStatus = (typeof EXCHANGE_STATUSES)[number];

/** Semantic tone, matching the ADS Badge tone axis. */
export type ExchangeStatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface ExchangeStatusDescription {
  label: string;
  tone: ExchangeStatusTone;
  /** True once the exchange can no longer change. */
  settled: boolean;
}

const EXCHANGE_STATUS_DESCRIPTIONS: Record<
  ExchangeStatus,
  ExchangeStatusDescription
> = {
  queued: { get label() { return i18n.t("agentRuns:format.label"); }, tone: "neutral", settled: false },
  running: { get label() { return i18n.t("agentRuns:format.label2"); }, tone: "info", settled: false },
  returned: { get label() { return i18n.t("agentRuns:format.label3"); }, tone: "success", settled: true },
  failed: { get label() { return i18n.t("agentRuns:format.label4"); }, tone: "danger", settled: true },
  cancelled: { get label() { return i18n.t("agentRuns:format.label5"); }, tone: "warning", settled: true },
  timed_out: { get label() { return i18n.t("agentRuns:format.label6"); }, tone: "warning", settled: true },
  unresolved: { get label() { return i18n.t("agentRuns:format.label7"); }, tone: "neutral", settled: true },
};

export function describeExchangeStatus(
  status: ExchangeStatus,
): ExchangeStatusDescription {
  return EXCHANGE_STATUS_DESCRIPTIONS[status];
}

export function isExchangeStatusLive(status: ExchangeStatus) {
  return !EXCHANGE_STATUS_DESCRIPTIONS[status].settled;
}

/** Transcript tool-part states (`input-streaming`, `output-error`, …). */
export function exchangeStatusFromToolState(state: string): ExchangeStatus {
  switch (state) {
    case "output-available":
      return "returned";
    case "output-error":
      return "failed";
    case "input-streaming":
      return "queued";
    default:
      return "running";
  }
}

/**
 * Delegated-task phases onto the vocabulary. A cancelled child that was detached
 * rather than stopped still reads as cancelled: the delegation ended, even if
 * the task carries on as an ordinary one.
 */
export function exchangeStatusFromDelegatedTaskPhase(
  phase:
    | "pending"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "interrupted"
    | "cancelled",
): ExchangeStatus {
  switch (phase) {
    case "pending":
      return "queued";
    case "running":
    case "waiting":
      return "running";
    case "completed":
      return "returned";
    case "failed":
    case "interrupted":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

export function exchangeStatusFromWorkGraphStatus(
  status: WorkGraphStatus,
): ExchangeStatus {
  switch (status) {
    case "pending":
      return "queued";
    case "running":
    case "waiting":
      return "running";
    case "completed":
      return "returned";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}
