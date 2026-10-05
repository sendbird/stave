import { i18n } from "@/i18n/runtime";
/**
 * User commands on an agent run, as pure transitions. Each one either returns an
 * `AgentRunChange` for the store to apply in one transaction or throws an
 * `AgentRunCommandError` whose message the surface shows as-is.
 *
 * The supervisor policy (`policy.ts`) decides what happens on its own; these
 * are the choices only the user makes: sign off, ask for changes, skip, retry,
 * pause, resume, cancel, and accept a runtime change.
 */
import {
  AGENT_RUN_LIMITS,
  AgentRunCommandError,
  clampReason,
  currentStageRecord,
  enterStage,
  isActiveAgentRunState,
  isTerminalStageStatus,
  workflowStageAt,
  replaceStageRecord,
  type CompleteStageReport,
  type AgentRun,
  type AgentRunAggregate,
  type AgentRunChange,
  type AgentRunFingerprint,
  type AgentRunStageRecord,
  type StageBlockInput,
  type StageCompleteReportInput,
  type StageStatus,
} from "./domain";
import { advanceAgentRun } from "./policy";

/** The stage attempt a control was rendered against. */
export interface StageIdentity {
  stageId: string;
  attempt: number;
}

function touch(agentRun: AgentRun, patch: Partial<AgentRun>, now: Date): AgentRun {
  return { ...agentRun, ...patch, updatedAt: now.toISOString() };
}

function requireActive(aggregate: AgentRunAggregate) {
  if (!isActiveAgentRunState(aggregate.agentRun.state)) {
    throw new AgentRunCommandError("not-active", i18n.t("agentRuns:commands.extraCopy240"));
  }
}

/**
 * Refuses a control aimed at a stage attempt the agent run has moved past, so a
 * stale card can never act on whatever replaced it.
 */
function requireCurrentStage(
  aggregate: AgentRunAggregate,
  expected: StageIdentity,
  allowed: readonly StageStatus[],
): AgentRunStageRecord {
  requireActive(aggregate);
  const record = currentStageRecord(aggregate);
  if (record.stageId !== expected.stageId || record.attempt !== expected.attempt) {
    throw new AgentRunCommandError(
      "stale-identity",
      i18n.t("agentRuns:commands.extraCopy241"),
    );
  }
  if (!allowed.includes(record.status)) {
    const title = workflowStageAt(aggregate.agentRun, aggregate.agentRun.currentStageIndex).title;
    throw new AgentRunCommandError(
      "invalid-state",
      i18n.t("agentRuns:commands.extraCopy242", { value1: title, value2: record.status.replaceAll("-", " ") }),
    );
  }
  return record;
}

/** Approves the stage waiting at a sign-off card; the supervisor starts it. */
export function signOffStage(args: {
  aggregate: AgentRunAggregate;
  expected: StageIdentity;
  now: Date;
}): AgentRunChange {
  const record = requireCurrentStage(args.aggregate, args.expected, ["awaiting-sign-off"]);
  return {
    agentRun: touch(args.aggregate.agentRun, {}, args.now),
    upserts: [{ ...record, status: "running" }],
    events: [
      {
        kind: "sign-off",
        idempotencyKey: null,
        detail: { stageId: record.stageId, attempt: record.attempt },
      },
    ],
  };
}

/**
 * "Ask for changes" on a sign-off card: the most recent AI stage before the
 * card runs again as a new attempt carrying the feedback. The stages after it
 * run again too, so a change is re-verified before anything is published.
 */
export function requestStageChanges(args: {
  aggregate: AgentRunAggregate;
  expected: StageIdentity;
  feedback: string;
  now: Date;
}): AgentRunChange {
  const { aggregate, now } = args;
  const waiting = requireCurrentStage(aggregate, args.expected, ["awaiting-sign-off"]);
  const feedback = args.feedback.trim().slice(0, AGENT_RUN_LIMITS.maxFeedbackChars);
  if (!feedback) {
    throw new AgentRunCommandError("invalid-state", i18n.t("agentRuns:commands.extraCopy243"));
  }
  const stages = aggregate.agentRun.workflow.stages;
  let targetIndex = -1;
  for (let index = aggregate.agentRun.currentStageIndex - 1; index >= 0; index -= 1) {
    if (stages[index]?.kind === "ai") {
      targetIndex = index;
      break;
    }
  }
  if (targetIndex === -1) {
    throw new AgentRunCommandError(
      "no-previous-ai-stage",
      i18n.t("agentRuns:commands.extraCopy244"),
    );
  }
  const agentRun = touch(aggregate.agentRun, { currentStageIndex: targetIndex }, now);
  const rerun = enterStage({
    aggregate: { agentRun, stages: aggregate.stages },
    index: targetIndex,
    feedback,
  });
  return {
    agentRun,
    // The card's own record never started; it waits as pending until the
    // agent run reaches it again.
    upserts: [{ ...waiting, status: "pending" }, rerun],
    events: [
      {
        kind: "changes-requested",
        idempotencyKey: null,
        detail: {
          atStageId: waiting.stageId,
          rerunStageId: rerun.stageId,
          attempt: rerun.attempt,
        },
      },
    ],
  };
}

/**
 * Skips the current stage and moves on. A running stage can be skipped only
 * while no turn runs on the lead task (`betweenTurns`), such as an action
 * waiting on checks or a stage that could not move on.
 */
export function skipStage(args: {
  aggregate: AgentRunAggregate;
  expected: StageIdentity;
  now: Date;
  betweenTurns?: boolean;
}): AgentRunChange {
  const record = requireCurrentStage(args.aggregate, args.expected, [
    "pending",
    "awaiting-sign-off",
    "blocked",
    "stuck",
    ...(args.betweenTurns ? (["running"] as const) : []),
  ]);
  const skipped: AgentRunStageRecord = {
    ...record,
    status: "skipped",
    blockReason: null,
    detail: i18n.t("agentRuns:commands.detail"),
    endedAt: args.now.toISOString(),
  };
  const change = advanceAgentRun({ aggregate: args.aggregate, completed: skipped, now: args.now });
  return {
    ...change,
    events: [
      {
        kind: "stage-skipped",
        idempotencyKey: null,
        detail: { stageId: record.stageId, attempt: record.attempt },
      },
      ...change.events,
    ],
  };
}

/** Starts a fresh attempt at a blocked or stuck stage. */
export function retryStage(args: {
  aggregate: AgentRunAggregate;
  expected: StageIdentity;
  now: Date;
}): AgentRunChange {
  const { aggregate, now } = args;
  const record = requireCurrentStage(aggregate, args.expected, ["blocked", "stuck"]);
  const ended: AgentRunStageRecord = {
    ...record,
    status: "cancelled",
    blockReason: null,
    detail: i18n.t("agentRuns:commands.detail2"),
    endedAt: now.toISOString(),
  };
  const retried = enterStage({
    aggregate: { agentRun: aggregate.agentRun, stages: replaceStageRecord(aggregate.stages, ended) },
    index: aggregate.agentRun.currentStageIndex,
  });
  return {
    agentRun: touch(aggregate.agentRun, {}, now),
    upserts: [ended, retried],
    events: [
      {
        kind: "stage-retried",
        idempotencyKey: null,
        detail: { stageId: record.stageId, attempt: retried.attempt },
      },
    ],
  };
}

/** Pauses a running agent run until Resume. */
export function pauseAgentRun(args: {
  aggregate: AgentRunAggregate;
  reason: "paused-by-user" | "taken-over";
  now: Date;
}): AgentRunChange {
  requireActive(args.aggregate);
  const { agentRun } = args.aggregate;
  if (agentRun.state === "paused" && agentRun.pauseReason === args.reason) {
    return { agentRun, upserts: [], events: [] };
  }
  const detail =
    args.reason === "taken-over"
      ? i18n.t("agentRuns:commands.detail3")
      : i18n.t("agentRuns:commands.detail4");
  return {
    agentRun: touch(
      agentRun,
      { state: "paused", pauseReason: args.reason, reasonDetail: detail },
      args.now,
    ),
    upserts: [],
    events: [{ kind: "paused", idempotencyKey: null, detail: { reason: args.reason } }],
  };
}

/**
 * Clears a pause the user chose. A pause the supervisor set clears on its own
 * once its condition lifts, so resuming one by hand is refused.
 */
export function resumeAgentRun(args: {
  aggregate: AgentRunAggregate;
  now: Date;
}): AgentRunChange {
  requireActive(args.aggregate);
  const { agentRun } = args.aggregate;
  if (agentRun.state === "running") return { agentRun, upserts: [], events: [] };
  if (agentRun.pauseReason !== "paused-by-user" && agentRun.pauseReason !== "taken-over") {
    throw new AgentRunCommandError(
      "invalid-state",
      agentRun.reasonDetail ?? i18n.t("agentRuns:commands.extraCopy245"),
    );
  }
  return {
    agentRun: touch(
      agentRun,
      { state: "running", pauseReason: null, reasonDetail: null },
      args.now,
    ),
    upserts: [],
    events: [{ kind: "resumed", idempotencyKey: null, detail: {} }],
  };
}

/**
 * "Apply to remaining stages" on a runtime-changed pause: the agent run adopts
 * the lead task's new runtime and continues.
 */
export function acceptAgentRunRuntime(args: {
  aggregate: AgentRunAggregate;
  fingerprint: AgentRunFingerprint;
  now: Date;
}): AgentRunChange {
  requireActive(args.aggregate);
  const { agentRun } = args.aggregate;
  const resumes = agentRun.state === "paused" && agentRun.pauseReason === "runtime-changed";
  return {
    agentRun: touch(
      agentRun,
      {
        fingerprint: args.fingerprint,
        ...(resumes ? { state: "running", pauseReason: null, reasonDetail: null } : {}),
      },
      args.now,
    ),
    upserts: [],
    events: [
      {
        kind: "runtime-accepted",
        idempotencyKey: null,
        detail: { providerId: args.fingerprint.providerId, model: args.fingerprint.model },
      },
    ],
  };
}

/** Ends the agent run. Completed work, pushed branches and PRs stay as they are. */
/** Why an agent run ended without a report (`agent-run.ts`), in the stage's words. */
const AGENT_RUN_END_DETAIL = {
  get stopped() { return i18n.t("agentRuns:commands.stopped"); },
  get released() { return i18n.t("agentRuns:commands.released"); },
} as const;

export function cancelAgentRun(args: {
  aggregate: AgentRunAggregate;
  now: Date;
  /** Set when an agent run ends on its own: the user stopped it, or the agent was released. */
  endedBy?: keyof typeof AGENT_RUN_END_DETAIL;
}): AgentRunChange {
  requireActive(args.aggregate);
  const record = currentStageRecord(args.aggregate);
  const upserts = isTerminalStageStatus(record.status)
    ? []
    : [
        {
          ...record,
          status: "cancelled" as const,
          blockReason: null,
          detail: args.endedBy ? AGENT_RUN_END_DETAIL[args.endedBy] : i18n.t("agentRuns:commands.detail5"),
          endedAt: args.now.toISOString(),
        },
      ];
  return {
    agentRun: touch(
      args.aggregate.agentRun,
      { state: "cancelled", pauseReason: null, stopReason: null, reasonDetail: null },
      args.now,
    ),
    upserts,
    events: [
      {
        kind: "agent-run-ended",
        idempotencyKey: null,
        detail: { outcome: "cancelled", ...(args.endedBy ? { endedBy: args.endedBy } : {}) },
      },
    ],
  };
}

/**
 * Records what the agent reported for the stage its turn's grant names. The
 * host resolves `expected` from the grant, never from the model. The policy
 * acts on the report at the next tick.
 */
export function recordStageReport(args: {
  aggregate: AgentRunAggregate;
  expected: StageIdentity;
  report:
    | ({ outcome: "complete" } & StageCompleteReportInput)
    | ({ outcome: "blocked" } & StageBlockInput);
  turnId: string | null;
  now: Date;
}): AgentRunChange {
  const record = requireCurrentStage(args.aggregate, args.expected, ["running", "blocked", "stuck"]);
  if (record.reportRevision >= AGENT_RUN_LIMITS.maxReportRevisions) {
    throw new AgentRunCommandError(
      "report-limit",
      i18n.t("agentRuns:commands.extraCopy246", { value1: AGENT_RUN_LIMITS.maxReportRevisions }),
    );
  }
  const report =
    args.report.outcome === "complete"
      ? ({
          ...args.report,
          decisions: args.report.decisions ?? [],
          evidence: args.report.evidence ?? [],
          artifacts: args.report.artifacts ?? [],
          reportedAt: args.now.toISOString(),
          turnId: args.turnId,
        } satisfies CompleteStageReport)
      : { ...args.report, reportedAt: args.now.toISOString(), turnId: args.turnId };
  return {
    agentRun: touch(args.aggregate.agentRun, {}, args.now),
    upserts: [{ ...record, report, reportRevision: record.reportRevision + 1 }],
    events: [
      {
        kind: "report",
        idempotencyKey: null,
        detail: {
          stageId: record.stageId,
          attempt: record.attempt,
          outcome: report.outcome,
          summary: clampReason(
            report.outcome === "complete" ? report.summary : report.missing,
          ),
        },
      },
    ],
  };
}
