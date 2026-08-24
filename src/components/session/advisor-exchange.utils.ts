import {
  formatAdvisorDuration,
  type AdvisorActivityPhase,
  type AdvisorExchangeOutcome,
  type AdvisorExchangeSnapshot,
} from "@/lib/providers/advisor-activity";
import { formatAdvisorEffortLabel } from "@/components/ai-elements/prompt-input-advisor-mode.utils";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * A healthy exchange is self-explanatory once it lands, so it clears quickly.
 * Anything that needs a decision — a failure, a timeout, or advice that never
 * reached the prompt — stays long enough to actually be read.
 */
export const ADVISOR_EXCHANGE_SETTLED_LINGER_MS = 6_000;
export const ADVISOR_EXCHANGE_ATTENTION_LINGER_MS = 20_000;

export type AdvisorExchangeTone =
  /** Armed but not consulted: present, costing nothing, demanding nothing. */
  | "neutral"
  | "active"
  | "positive"
  | "caution"
  | "danger";

export type AdvisorCheckStatus = "pass" | "fail" | "pending" | "skipped";

export type AdvisorCheckId = "cross_model" | "isolation" | "advice" | "usage";

export type AdvisorCheck = {
  id: AdvisorCheckId;
  label: string;
  status: AdvisorCheckStatus;
  detail: string;
};

/**
 * How long the linger timer should keep a terminal exchange on screen.
 * `null` means "do not auto-hide" (the exchange is still running).
 */
export function resolveAdvisorExchangeLingerMs(
  snapshot: AdvisorExchangeSnapshot,
): number | null {
  if (snapshot.outcome === "pending") {
    return null;
  }
  if (
    snapshot.outcome === "completed" ||
    snapshot.outcome === "skipped" ||
    snapshot.outcome === "aborted"
  ) {
    return ADVISOR_EXCHANGE_SETTLED_LINGER_MS;
  }
  return ADVISOR_EXCHANGE_ATTENTION_LINGER_MS;
}

export function resolveAdvisorExchangeVisibility(args: {
  snapshot: AdvisorExchangeSnapshot | null;
  nowMs: number;
  /** Set while the user is reading the card, which suspends the linger timer. */
  pinned: boolean;
}) {
  const { snapshot } = args;
  if (!snapshot) {
    return false;
  }
  if (snapshot.outcome === "armed") {
    // The floating card reports exchanges. A grant that has not been consulted
    // is reported by the turn activity shelf instead, which is where the user
    // already looks for "what is this turn doing" — popping a card to announce
    // that nothing happened would be the loudest possible way to say nothing.
    return false;
  }
  const lingerMs = resolveAdvisorExchangeLingerMs(snapshot);
  if (lingerMs === null || args.pinned) {
    return true;
  }
  const settledAt = snapshot.outcomeAt ?? snapshot.startedAt;
  return args.nowMs - settledAt < lingerMs;
}

export function resolveAdvisorExchangeTone(
  snapshot: AdvisorExchangeSnapshot,
): AdvisorExchangeTone {
  switch (snapshot.outcome) {
    // The grant record is neutral chrome, not an exchange in flight.
    case "armed":
      return "neutral";
    case "pending":
      return "active";
    case "completed":
      return "positive";
    case "failed":
    case "timeout":
      return "caution";
    case "aborted":
    case "skipped":
      return "caution";
  }
}

/**
 * Short status line. Deliberately states *what happened to the primary turn*,
 * because "the advisor failed" and "your work stopped" are different outcomes
 * and only the second one needs the user to do anything.
 */
export function describeAdvisorExchangeStatus(
  snapshot: AdvisorExchangeSnapshot,
): string {
  const duration =
    snapshot.durationMs === undefined
      ? null
      : formatAdvisorDuration(snapshot.durationMs);
  switch (snapshot.outcome) {
    case "armed":
      return "Armed for this turn. The primary has not consulted it yet.";
    case "pending":
      // Naming what the provider was last seen doing is the whole point of the
      // heartbeat: both providers only resolve once generation has finished, so
      // a bare "waiting" reads identically for a model that is thinking and one
      // that is wedged.
      return snapshot.progressDetail
        ? `Advisor working (${snapshot.progressDetail}).`
        : "The primary is waiting on the advisor's answer.";
    case "completed":
      return `Advice returned to the primary${duration ? ` in ${duration}` : ""}.`;
    case "timeout":
      return `Advisor timed out${duration ? ` after ${duration}` : ""}. The primary turn continued without advice.`;
    case "failed":
      return `Advisor failed${duration ? ` after ${duration}` : ""}. The primary turn continued without advice.`;
    case "skipped":
      return "Consult cancelled. The primary turn continued without advice.";
    case "aborted":
      return "Turn cancelled during an advisor consult.";
  }
}

export function describeAdvisorPhase(phase: AdvisorActivityPhase): string {
  switch (phase) {
    case "armed":
      return "Advisor armed";
    case "started":
      return "Consulting advisor";
    case "progress":
      return "Advisor working";
    case "completed":
      return "Advice returned";
    case "failed":
      return "Advisor failed";
    case "timeout":
      return "Advisor timed out";
    case "aborted":
      return "Aborted";
    case "skipped":
      return "Consult cancelled";
  }
}

export function describeAdvisorOutcome(
  outcome: AdvisorExchangeOutcome,
): string {
  switch (outcome) {
    case "armed":
      return "Armed";
    case "pending":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "timeout":
      return "Timed out";
    case "aborted":
      return "Aborted";
    case "skipped":
      return "Skipped";
  }
}

/**
 * Badge text for the exchange. Advice returns to the primary as the consult
 * tool's own result, so "Completed" here does mean the primary saw it.
 */
export function describeAdvisorExchangeBadge(
  snapshot: AdvisorExchangeSnapshot,
): string {
  return describeAdvisorOutcome(snapshot.outcome);
}

export function describeAdvisorIsolation(
  isolation: AdvisorExchangeSnapshot["isolation"],
): string {
  if (isolation === "claude-tools-disabled") {
    return "Tools disabled";
  }
  if (isolation === "codex-ephemeral-read-only") {
    return "Ephemeral read-only thread";
  }
  return "Unknown";
}

/**
 * The tier the Advisor call actually ran at, as reported by the runtime.
 *
 * "Not reported" rather than a guessed default: the renderer knows the target's
 * pinned tier, but only the runtime knows what survived defaulting and
 * clamping, and this panel exists to show what happened, not what was asked.
 */
export function describeAdvisorEffort(
  effort: AdvisorExchangeSnapshot["advisorEffort"],
): string {
  return effort ? formatAdvisorEffortLabel(effort) : "Not reported";
}

export function describeAdvisorParticipant(args: {
  providerId?: ProviderId;
  model?: string;
}): string {
  if (!args.providerId) {
    return "Not resolved";
  }
  const label = getProviderLabel({ providerId: args.providerId });
  return args.model ? `${label} · ${args.model}` : label;
}

function crossModelCheck(snapshot: AdvisorExchangeSnapshot): AdvisorCheck {
  if (!snapshot.advisorProviderId || !snapshot.advisorModel) {
    return {
      id: "cross_model",
      label: "A separate model answered",
      status: snapshot.outcome === "pending" ? "pending" : "fail",
      detail: "The advisor target never resolved to a provider and model.",
    };
  }
  const sameProvider = snapshot.advisorProviderId === snapshot.primaryProviderId;
  const sameModel =
    snapshot.primaryModel !== undefined &&
    snapshot.primaryModel === snapshot.advisorModel;
  if (sameProvider && sameModel) {
    // Legal but self-defeating: the "second opinion" is the same model. Saying
    // this out loud is the entire point of the check.
    return {
      id: "cross_model",
      label: "A separate model answered",
      status: "fail",
      detail: `Advisor and primary are both ${describeAdvisorParticipant({
        providerId: snapshot.primaryProviderId,
        model: snapshot.primaryModel,
      })}.`,
    };
  }
  return {
    id: "cross_model",
    label: "A separate model answered",
    status: "pass",
    detail: `${describeAdvisorParticipant({
      providerId: snapshot.primaryProviderId,
      model: snapshot.primaryModel,
    })} asked ${describeAdvisorParticipant({
      providerId: snapshot.advisorProviderId,
      model: snapshot.advisorModel,
    })}.`,
  };
}

/**
 * The acceptance criteria for "the advisor system actually worked this turn",
 * computed only from reported fields — never inferred from the provider id.
 *
 * Checks downstream of a terminal non-completion are `skipped`, not `fail`:
 * a timed-out advisor did not fail to inject advice, it never had any.
 */
export function buildAdvisorChecks(
  snapshot: AdvisorExchangeSnapshot,
): AdvisorCheck[] {
  const running = snapshot.outcome === "pending";
  const producedAdvice = snapshot.outcome === "completed";
  const unreachable: AdvisorCheckStatus = running ? "pending" : "skipped";

  const adviceChars = snapshot.adviceChars ?? snapshot.advice?.length;

  return [
    crossModelCheck(snapshot),
    {
      id: "isolation",
      label: "Advisor ran without tools",
      status: snapshot.isolation ? "pass" : unreachable,
      detail: snapshot.isolation
        ? describeAdvisorIsolation(snapshot.isolation)
        : "The runtime did not report an isolation mode.",
    },
    {
      id: "advice",
      label: "Advice returned to the primary",
      status: producedAdvice ? "pass" : unreachable,
      detail: producedAdvice
        ? `${adviceChars ?? 0} characters returned as the consult tool result.`
        : running
          ? "Waiting for the advisor to respond."
          : (snapshot.detail ?? "No advice was produced."),
    },
    {
      id: "usage",
      label: "Advisor tokens counted in the turn",
      status:
        snapshot.inputTokens === undefined && snapshot.outputTokens === undefined
          ? unreachable
          : "pass",
      detail:
        snapshot.inputTokens === undefined && snapshot.outputTokens === undefined
          ? "No advisor usage was reported."
          : `${snapshot.inputTokens ?? 0} in · ${snapshot.outputTokens ?? 0} out${
              snapshot.totalCostUsd === undefined
                ? ""
                : ` · $${snapshot.totalCostUsd.toFixed(4)}`
            }`,
    },
  ];
}

export type AdvisorLaneSegments = {
  /** Fraction of the exchange window the advisor held, 0-1. */
  advisorFraction: number;
  /** Fraction the primary turn spent blocked behind the advisor, 0-1. */
  blockedFraction: number;
  elapsedMs: number;
};

/**
 * Latency split for the two-lane bar. During an on-demand consult the primary
 * waits on the tool result for the whole exchange, so the blocked span equals
 * the advisor span — rendering it is still the point: the consult's wall-clock
 * cost is invisible in every other surface.
 */
export function resolveAdvisorLaneSegments(args: {
  snapshot: AdvisorExchangeSnapshot;
  nowMs: number;
}): AdvisorLaneSegments {
  const { snapshot } = args;
  const endedAt =
    snapshot.outcome === "pending"
      ? Math.max(args.nowMs, snapshot.startedAt)
      : Math.max(snapshot.outcomeAt ?? args.nowMs, snapshot.startedAt);
  const elapsedMs = Math.max(0, endedAt - snapshot.startedAt);
  // A pending exchange fills the whole window so the bar reads as "still the
  // advisor's time" rather than collapsing to zero width.
  const window = Math.max(1, elapsedMs);
  const advisorEnd = snapshot.outcomeAt ?? endedAt;
  return {
    advisorFraction: clampFraction((advisorEnd - snapshot.startedAt) / window),
    blockedFraction: clampFraction((advisorEnd - snapshot.startedAt) / window),
    elapsedMs,
  };
}

function clampFraction(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/** Countdown against the advisor deadline, for the pending-state hint. */
export function resolveAdvisorRemainingMs(args: {
  snapshot: AdvisorExchangeSnapshot;
  nowMs: number;
}): number | null {
  if (args.snapshot.outcome !== "pending" || !args.snapshot.timeoutMs) {
    return null;
  }
  return Math.max(
    0,
    args.snapshot.startedAt + args.snapshot.timeoutMs - args.nowMs,
  );
}

export { formatAdvisorDuration };
