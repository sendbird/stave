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
import type { Tone } from "@/components/aui/utils/tone";
import type { WorkState } from "@/components/aui/components/state-vocabulary";

export {
  describeDeadline,
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

/**
 * Where one delegation stands. `waiting` and `needs_user` are both live but
 * not working: a `waiting` delegate sits between turns on its own (an outside
 * event, a usage reset) and carries on without anyone; a `needs_user`
 * delegate stopped on a person (a question, an approval, a halted run) and
 * goes nowhere until someone answers. They are statuses, not flags beside
 * `running`, so no surface can read the one field and miss the other.
 */
export const EXCHANGE_STATUSES = [
  "queued",
  "running",
  "waiting",
  "needs_user",
  "returned",
  "failed",
  "cancelled",
  "timed_out",
  "unresolved",
] as const;

export type ExchangeStatus = (typeof EXCHANGE_STATUSES)[number];

/** Semantic tone, matching the AUI Badge tone axis. */
export type ExchangeStatusTone = Extract<
  Tone,
  "neutral" | "info" | "success" | "warning" | "danger"
>;

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
  waiting: { get label() { return i18n.t("agentRuns:format.waiting"); }, tone: "neutral", settled: false },
  needs_user: { get label() { return i18n.t("agentRuns:format.needsYou"); }, tone: "warning", settled: false },
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

/**
 * Each exchange status as the shared work state (`state-vocabulary.ts`), the
 * one mapping every delegation surface draws its `StateMark` from. A time-out
 * is a failure; a cancelled delegation stopped; an unresolved one ended
 * without saying how, which is what `unknown` means.
 */
const EXCHANGE_STATUS_WORK_STATE: Readonly<Record<ExchangeStatus, WorkState>> = {
  queued: "queued",
  running: "working",
  waiting: "waiting",
  needs_user: "needs-you",
  returned: "ready",
  failed: "failed",
  timed_out: "failed",
  cancelled: "stopped",
  unresolved: "unknown",
};

export function exchangeStatusToWorkState(status: ExchangeStatus): WorkState {
  return EXCHANGE_STATUS_WORK_STATE[status];
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
 * the task carries on as an ordinary one. `blocked` is a live child stopped on
 * a person (a question or approval it raised, or its run waiting for one); it
 * outranks the ledger phase, which still says running or waiting.
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
  options: { blocked?: boolean } = {},
): ExchangeStatus {
  switch (phase) {
    case "pending":
      return options.blocked ? "needs_user" : "queued";
    case "running":
      return options.blocked ? "needs_user" : "running";
    case "waiting":
      return options.blocked ? "needs_user" : "waiting";
    case "completed":
      return "returned";
    case "failed":
    case "interrupted":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

/**
 * Work-graph statuses onto the vocabulary. `blocked` is a node with an open
 * interaction (an approval or a question it raised): while it is live it waits
 * on the user, whatever its own status says.
 */
export function exchangeStatusFromWorkGraphStatus(
  status: WorkGraphStatus,
  options: { blocked?: boolean } = {},
): ExchangeStatus {
  switch (status) {
    case "pending":
      return options.blocked ? "needs_user" : "queued";
    case "running":
      return options.blocked ? "needs_user" : "running";
    case "waiting":
      return options.blocked ? "needs_user" : "waiting";
    case "completed":
      return "returned";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

/**
 * A work-graph node as the shared work state. It goes through the exchange
 * vocabulary on purpose: the agent tree and the delegation rows draw the same
 * node, so they must never disagree about it.
 */
export function workGraphStatusToWorkState(
  status: WorkGraphStatus,
  options: { blocked?: boolean } = {},
): WorkState {
  return exchangeStatusToWorkState(exchangeStatusFromWorkGraphStatus(status, options));
}
