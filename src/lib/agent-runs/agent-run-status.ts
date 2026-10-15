import { describeAgentRunUsageLimit } from "./usage-limit";
import { activeEventWait, describeEventWaitDetail, describeEventWaitLabel } from "./event-wait";
import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { findTaskPendingDecision } from "@/lib/fleet/task-status";
import { i18n } from "@/i18n/runtime";
/**
 * How an agent run reads. A run is an agent run (`agent-run.ts`) with one
 * implicit stage or the stages of the agent's workflow, so its surfaces drop
 * the workflow vocabulary (Agent run, workflow) and show the agent, a state,
 * the stages when there is more than one, the Done when lines and what the
 * run produced.
 *
 * Pure. Used by the agent run surfaces in `src/components/agent-runs/` for runs
 * marked `origin: "agent"`; a legacy run keeps its own copy of everything but
 * the badge, which every run wears (`describeAgentRunStatus`).
 */
import { describeRunPlan } from "./plan-progress";
import type { WorkState } from "@/components/ads/components/state-vocabulary";
import { formatDateTime } from "@/i18n/format";
import type { AgentRunPromptProvenance, ChatMessage } from "@/types/chat";
import { extractRunAssignment, hasAgentOrigin } from "./agent-run";
import type { AgentRunDetail } from "./api";
import { collectAcceptanceCriteria } from "./briefing";
import { isActiveAgentRunState, latestStageRecord, type AgentRunStopReason, type StagePlan } from "./domain";
import { classifyStageEvidence, describeActionEvidence, isVerifiedEvidence, type ClassifiedEvidence } from "./evidence";
import { workspaceCheckMet } from "./workspace-check";
import { formatAge, type AgentRunBadgeTone, type StageTone } from "./agent-run-view";
import { describeUsageShort } from "./usage";

export { extractRunAssignment };

/**
 * The six badges a run wears. The sidebar mark, the Fleet card, the Run panel
 * and the run line all read them from `describeAgentRunStatus`, so they never
 * disagree. Waiting for an event or a usage reset is still Running.
 */
export const AGENT_RUN_BADGES = ["running", "needs-answer", "paused", "halted", "completed", "stopped"] as const;
export type AgentRunBadge = (typeof AGENT_RUN_BADGES)[number];

export const AGENT_RUN_BADGE_LABELS: Record<AgentRunBadge, string> = {
  get running() { return i18n.t("agentRuns:badge.running"); },
  get "needs-answer"() { return i18n.t("agentRuns:badge.needsAnswer"); },
  get paused() { return i18n.t("agentRuns:badge.paused"); },
  get halted() { return i18n.t("agentRuns:badge.halted"); },
  get completed() { return i18n.t("agentRuns:badge.completed"); },
  get stopped() { return i18n.t("agentRuns:badge.stopped"); },
};

/** A decision card the run's lead task holds open. */
export type AgentRunDecision = "question" | "approval";

/**
 * The decision card a lead task holds open, from its turn (`user_input`,
 * `approval`) or its Fleet status (`waiting-input`, `waiting-approval`).
 */
export function agentRunDecisionOf(pending: string | null | undefined): AgentRunDecision | null {
  if (pending === "approval" || pending === "waiting-approval") return "approval";
  if (pending === "user_input" || pending === "waiting-input") return "question";
  return null;
}

const decisionByMessages = new WeakMap<readonly ChatMessage[], AgentRunDecision | null>();

/**
 * The run's pending decision: a question or approval card its lead task's
 * messages hold unanswered. The one derivation every surface that shows a
 * run's badge uses, read from the same source as the Fleet card's status
 * (`findTaskPendingDecision`), so answering one of two approvals leaves every
 * surface on Needs your answer. Not the turn's single `pendingInteraction`
 * hint, which only tracks the prompts blocking the current turn (an async
 * question or one an earlier turn left open does not raise it).
 *
 * Remembered per messages array (the store replaces it on change), so the
 * store selectors that call it on every update stay a lookup.
 */
export function agentRunDecisionOfMessages(messages: ChatMessage[] | null | undefined): AgentRunDecision | null {
  if (!messages || messages.length === 0) return null;
  const known = decisionByMessages.get(messages);
  if (known !== undefined) return known;
  const decision = agentRunDecisionOf(findTaskPendingDecision(messages));
  decisionByMessages.set(messages, decision);
  return decision;
}

const STOP_REASON_TEXT: Record<AgentRunStopReason, string> = {
  get "task-unavailable"() { return i18n.t("agentRuns:agentRunStatus.taskUnavailable"); },
  get "turn-cap-reached"() { return i18n.t("agentRuns:agentRunStatus.turnCapReached"); },
  get "acceptance-unmet"() { return i18n.t("agentRuns:agentRunStatus.acceptanceUnmet"); },
  get expired() { return i18n.t("agentRuns:agentRunStatus.expired"); },
};

/** The glyph beside the words: its shape (a shared work state) and its color. */
export interface AgentRunStatusMark {
  state: WorkState;
  tone: StageTone;
}

/** Each badge's tone and mark; a run waiting between turns wears the waiting mark. */
const BADGE_LOOK: Record<AgentRunBadge, { tone: AgentRunBadgeTone; mark: AgentRunStatusMark }> = {
  running: { tone: "accent", mark: { state: "working", tone: "active" } },
  "needs-answer": { tone: "warning", mark: { state: "needs-you", tone: "waiting" } },
  paused: { tone: "neutral", mark: { state: "paused", tone: "idle" } },
  halted: { tone: "warning", mark: { state: "halted", tone: "waiting" } },
  completed: { tone: "success", mark: { state: "ready", tone: "done" } },
  stopped: { tone: "neutral", mark: { state: "stopped", tone: "skipped" } },
};
const WAITING_LOOK = { tone: "neutral", mark: { state: "waiting", tone: "idle" } } as const;
const APPROVAL_MARK: AgentRunStatusMark = { state: "approval", tone: "waiting" };

/** What Retry does: ask the stage again, or start a new run from the assignment. */
export type AgentRunRecovery = "retry-stage" | "new-run" | "extend";

export interface AgentRunStatus {
  badge: AgentRunBadge;
  /** The badge's word. */
  label: string;
  /** What the badge stands on, such as `Waiting · PR checks`, `Question` or `Blocked`. */
  subtitle: string | null;
  tone: AgentRunBadgeTone;
  mark: AgentRunStatusMark;
  /** Running between turns until an outside event or a usage reset. */
  waiting: boolean;
  /** The agent's name; the run's implicit workflow carries it. */
  agentName: string;
  /** Why the run stands where it does, in one sentence. */
  reason: string | null;
  /** Set when the run stopped moving: it gets a reason card with Retry and Take control. */
  recovery: AgentRunRecovery | null;
}

/** `Halted · Blocked`: the badge and its subtitle, as one run of words. */
export function formatAgentRunBadge(status: Pick<AgentRunStatus, "label" | "subtitle">): string {
  return status.subtitle ? `${status.label} · ${status.subtitle}` : status.label;
}

/**
 * The state of an agent run in the words people see: one of six badges, what
 * it stands on, and why. `decision` is the question or approval card the lead
 * task holds open, which only its messages know (`agentRunDecisionOfMessages`).
 */
export function describeAgentRunStatus(detail: AgentRunDetail, decision: AgentRunDecision | null = null): AgentRunStatus {
  const { agentRun } = detail;
  const agentName = agentRun.workflow.name;
  const make = (
    badge: AgentRunBadge,
    subtitle: string | null = null,
    extra: { reason?: string | null; recovery?: AgentRunRecovery | null; mark?: AgentRunStatusMark } = {},
  ): AgentRunStatus => ({
    badge,
    label: AGENT_RUN_BADGE_LABELS[badge],
    subtitle,
    tone: BADGE_LOOK[badge].tone,
    mark: extra.mark ?? BADGE_LOOK[badge].mark,
    waiting: false,
    agentName,
    reason: extra.reason ?? null,
    recovery: extra.recovery ?? null,
  });
  // Running, between turns: "Running · Waiting · PR checks".
  const waiting = (subtitle: string, reason: string): AgentRunStatus => ({
    ...make("running", subtitle, { reason, mark: WAITING_LOOK.mark }),
    tone: WAITING_LOOK.tone,
    waiting: true,
  });
  const paused = (): AgentRunStatus => {
    const reason = agentRun.reasonDetail ?? i18n.t("agentRuns:agentRunStatus.extraCopy213");
    switch (agentRun.pauseReason) {
      case "usage-limit": {
        // A known reset resumes on its own; an unknown one halts until the user resumes.
        const resumeAt = agentRun.usageLimit?.resumeAt;
        return resumeAt
          ? waiting(i18n.t("agentRuns:badge.usageWait", { time: formatDateTime(resumeAt) }), describeAgentRunUsageLimit(agentRun))
          : make("halted", i18n.t("agentRuns:badge.usageLimit"), { reason: describeAgentRunUsageLimit(agentRun) });
      }
      case "limit-reached":
        return make("halted", i18n.t("agentRuns:limit.reached"), { reason, recovery: "extend" });
      case "wait-expired":
        return make("halted", i18n.t("agentRuns:badge.waitExpired"), { reason });
      case "task-identity-changed":
      case "runtime-changed":
        return make("halted", i18n.t("agentRuns:badge.recoveryNeeded"), { reason });
      case "taken-over":
        return make("paused", i18n.t("agentRuns:badge.takenOver"), { reason });
      case "paused-by-user":
      case null:
        return make("paused", null, { reason });
    }
  };
  switch (agentRun.state) {
    case "completed":
      return make("completed");
    case "cancelled":
      return make("stopped");
    case "stopped":
      return make("stopped", null, {
        reason: agentRun.reasonDetail ?? (agentRun.stopReason ? STOP_REASON_TEXT[agentRun.stopReason] : null),
        recovery: "new-run",
      });
    case "paused":
      return paused();
    case "running":
      break;
  }
  if (decision) {
    return make("needs-answer", i18n.t(decision === "approval" ? "agentRuns:badge.approval" : "agentRuns:badge.question"), {
      mark: decision === "approval" ? APPROVAL_MARK : undefined,
    });
  }
  const stage = agentRun.workflow.stages[agentRun.currentStageIndex];
  const record = stage ? latestStageRecord(detail.stages, stage.id) : undefined;
  const wait = activeEventWait(agentRun, record);
  if (wait) return waiting(describeEventWaitLabel(wait), describeEventWaitDetail(wait));
  switch (record?.status) {
    case "awaiting-sign-off":
      // A sign-off is the approval card of a stage that asks first.
      return make("needs-answer", i18n.t("agentRuns:badge.approval"), {
        mark: APPROVAL_MARK,
        reason: stage ? i18n.t("agentRuns:agentRunStatus.extraCopy217", { value1: getStageDisplayTitle(stage) }) : i18n.t("agentRuns:agentRunStatus.extraCopy218"),
      });
    case "blocked":
      return make("halted", i18n.t("agentRuns:badge.blocked"), {
        reason: record.blockReason === "reporting-unavailable"
          ? i18n.t("agentRuns:agentRunStatus.extraCopy214")
          : (record.detail ?? i18n.t("agentRuns:agentRunStatus.extraCopy215")),
        recovery: record.blockReason === "action-failed" || record.blockReason === "acceptance-unmet" ? "retry-stage" : null,
      });
    case "stuck":
      return make("halted", i18n.t("agentRuns:badge.blocked"), {
        reason: record.detail ?? i18n.t("agentRuns:agentRunStatus.extraCopy216"),
        recovery: "retry-stage",
      });
    default:
      return make("running");
  }
}

/** "45s", "6m", "2h": how long a run took or has been going. */
export function formatRunDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  return ms < 60_000 ? `${Math.max(1, Math.round(ms / 1_000))}s` : formatAge(ms);
}

/** How long the run has gone, or went: from its start to now, or to its last change. */
export function agentRunDuration(detail: AgentRunDetail, now: number): string {
  const { agentRun } = detail;
  const active = agentRun.state === "running" || agentRun.state === "paused";
  const end = active ? now : Date.parse(agentRun.updatedAt);
  return formatRunDuration(end - Date.parse(agentRun.createdAt));
}

export type DoneWhenStatus = "met-verified" | "met-reported" | "unmet" | "unverified";

export const DONE_WHEN_LABELS: Record<DoneWhenStatus, string> = {
  get "met-verified"() { return i18n.t("agentRuns:agentRunStatus.metVerified"); },
  get "met-reported"() { return i18n.t("agentRuns:agentRunStatus.metReported"); },
  get unmet() { return i18n.t("agentRuns:agentRunStatus.unmet"); },
  get unverified() { return i18n.t("agentRuns:agentRunStatus.unverified"); },
};

export interface AgentRunDoneWhenLine {
  text: string;
  status: DoneWhenStatus;
  label: string;
}

/**
 * The run's latest report, with what Stave saw of it: the last AI stage that
 * reported complete, else the last AI stage (or, in a run of Stave actions
 * only, the first stage) as it stands. A one-stage run reads its one stage.
 */
function reportOf(detail: AgentRunDetail) {
  const stages = detail.agentRun.workflow.stages;
  const ai = stages.filter((candidate) => candidate.kind === "ai");
  const reported = [...ai]
    .reverse()
    .find((candidate) => latestStageRecord(detail.stages, candidate.id)?.report?.outcome === "complete");
  const stage = reported ?? ai.at(-1) ?? stages[0];
  const record = stage ? latestStageRecord(detail.stages, stage.id) : undefined;
  const report = record?.report?.outcome === "complete" ? record.report : null;
  const evidence = report ? classifyStageEvidence(report, record?.facts ?? null) : [];
  return { stage, record, report, evidence };
}

/**
 * Whether the latest word on a criterion is Stave's own check, in the order
 * `collectAcceptanceCriteria` settles it: stage by stage up to the current one,
 * within a stage its report, then a Run script action's result, then its host
 * check. Met-verified when that latest word is a Stave check that passed on the
 * stage's latest attempt; not verified when it is one that did not; null when
 * it is a report, so the reported status stands.
 */
function hostCheckStatus(detail: AgentRunDetail, text: string): DoneWhenStatus | null {
  const key = text.trim();
  let status: DoneWhenStatus | null = null;
  const { agentRun } = detail;
  for (let index = 0; index <= agentRun.currentStageIndex && index < agentRun.workflow.stages.length; index += 1) {
    const stage = agentRun.workflow.stages[index]!;
    const record = latestStageRecord(detail.stages, stage.id);
    if (!record) continue;
    const reported = record.report?.outcome === "complete" && record.report.acceptanceCriteria?.some((criterion) => criterion.text.trim() === key);
    const scriptAction = stage.kind === "action" && record.facts?.action?.type === "run-script" && stage.acceptanceCriteria?.some((criterion) => criterion.text.trim() === key)
      ? record.facts.action : null;
    const hostCheck = stage.kind === "ai" ? stage.acceptanceCriteria?.find((criterion) => criterion.verification === "stave-check" && criterion.text.trim() === key) : undefined;
    if (scriptAction) status = isVerifiedEvidence(describeActionEvidence(scriptAction, record.facts)) ? "met-verified" : "unverified";
    else if (hostCheck) status = workspaceCheckMet(record, hostCheck.scriptIds, hostCheck.scriptDefinitions) ? "met-verified" : "unverified";
    else if (reported) status = null;
  }
  return status;
}

/**
 * The run's Done when: the criteria the agent reported, else the assignment's
 * own line, each with its status. Only a `stave-check` criterion can read as
 * checked by Stave, and only when Stave's own check met it; every other line
 * stays the agent's word. `describeStaveChecks` lists what Stave saw succeed.
 */
export function describeDoneWhen(detail: AgentRunDetail): AgentRunDoneWhenLine[] {
  const { stage, record } = reportOf(detail);
  const line = (text: string, status: DoneWhenStatus): AgentRunDoneWhenLine => ({
    text,
    status,
    label: DONE_WHEN_LABELS[status],
  });
  const criteria = collectAcceptanceCriteria(detail, true);
  if (criteria.length > 0) {
    return criteria.map((criterion) =>
      line(criterion.text, hostCheckStatus(detail, criterion.text) ?? (criterion.status === "met" ? "met-reported" : criterion.status)),
    );
  }
  const stages = detail.agentRun.workflow.stages;
  if (stages.length > 1) {
    // No criteria were reported: each AI stage's own line holds once that stage completes.
    return stages.flatMap((candidate) =>
      candidate.kind === "ai"
        ? [
            line(
              candidate.doneWhen,
              latestStageRecord(detail.stages, candidate.id)?.status === "completed" ? "met-reported" : "unverified",
            ),
          ]
        : [],
    );
  }
  const text = stage?.kind === "ai" ? stage.doneWhen : (stage?.title ?? "");
  if (!text) return [];
  // No criteria were reported: the stage's own line holds once it reports complete.
  return [line(text, record?.status === "completed" ? "met-reported" : "unverified")];
}

/**
 * The checks Stave saw succeed on the current work, once each: a workspace
 * check by its action name (its commands can run long), anything else by
 * command or label.
 */
export function describeStaveChecks(detail: AgentRunDetail): string[] {
  const names = reportOf(detail)
    .evidence.filter(isVerifiedEvidence)
    .map((evidence) => (evidence.scriptId ?? evidence.command ?? evidence.label).trim())
    .filter((name) => name.length > 0);
  return [...new Set(names)];
}

export interface AgentRunChanges {
  files: number;
  insertions: number;
  deletions: number;
}

/** The work tree's change since the run's turns began, as Stave counted it. */
export function describeAgentRunChanges(detail: AgentRunDetail): AgentRunChanges | null {
  const diff = reportOf(detail).record?.facts?.diff;
  return diff && diff.filesChanged > 0
    ? { files: diff.filesChanged, insertions: diff.insertions, deletions: diff.deletions }
    : null;
}

export interface AgentRunPullRequestLink {
  url: string;
  number: number;
}

/** The pull request the run's report links to, when it names one. */
export function findAgentRunPullRequest(detail: AgentRunDetail): AgentRunPullRequestLink | null {
  const { report, evidence } = reportOf(detail);
  const urls = [
    ...(detail.report?.links.map((link) => link.url) ?? []),
    ...(report?.artifacts.map((artifact) => artifact.url) ?? []),
    ...evidence.flatMap((item) => (item.ref ? [item.ref] : [])),
  ];
  for (const url of urls) {
    const number = /\/pull\/(\d+)/.exec(url)?.[1];
    if (number) return { url, number: Number(number) };
  }
  return null;
}

export interface AgentRunResult {
  status: AgentRunStatus;
  duration: string;
  doneWhen: AgentRunDoneWhenLine[];
  /** Checks Stave itself saw succeed; empty when it saw none. */
  staveChecks: string[];
  changes: AgentRunChanges | null;
  pullRequest: AgentRunPullRequestLink | null;
  summary: string | null;
  spent: string | null;
}

/** Everything the Result card and the panel's Result section show. */
export function describeAgentRunResult(detail: AgentRunDetail, now: number, decision: AgentRunDecision | null = null): AgentRunResult {
  return {
    status: describeAgentRunStatus(detail, decision),
    duration: agentRunDuration(detail, now),
    doneWhen: describeDoneWhen(detail),
    staveChecks: describeStaveChecks(detail),
    changes: describeAgentRunChanges(detail),
    pullRequest: findAgentRunPullRequest(detail),
    summary: reportOf(detail).report?.summary ?? null,
    spent: describeUsageShort(detail.usage),
  };
}

export type AgentRunCardKind = "result" | "reason";

/**
 * What an agent run leaves at the end of its conversation: the result once it
 * is ready, the reason with Retry and Take control once it failed. Nothing
 * while the run is active, because the run bar owns its state and actions
 * then, nothing after the user stopped it, and nothing once a message started
 * after the run ended (the card is history).
 */
export function selectAgentRunCard(args: {
  detail: AgentRunDetail;
  lastMessageStartedAt?: string | null;
}): AgentRunCardKind | null {
  const { agentRun } = args.detail;
  if (!hasAgentOrigin(agentRun) || isActiveAgentRunState(agentRun.state)) return null;
  if (args.lastMessageStartedAt && Date.parse(args.lastMessageStartedAt) > Date.parse(agentRun.updatedAt)) return null;
  const status = describeAgentRunStatus(args.detail);
  if (status.badge === "completed") return "result";
  return status.recovery ? "reason" : null;
}

/** A user bubble of an agent run: the user's words and the compiled prompt folded under them. */
export interface AgentRunPromptView {
  /** The assignment as the user wrote it; null for a prompt that carries none. */
  assignment: string | null;
  /** The whole compiled prompt, for the disclosure; null while the run has not written it. */
  instructions: string | null;
}

/**
 * How a user message reads as an agent run's prompt, or null when it is not
 * one. The host marks the rows a run writes (`agentRunPrompt`), so they split
 * from their first frame. A row written before the mark is found through the
 * run that started its turn (`runAssignment`). A send still waiting on its
 * run (`pending`) draws the assignment, the instructions to come.
 */
export function resolveAgentRunPrompt(args: {
  text: string;
  provenance?: AgentRunPromptProvenance | null;
  runAssignment?: string | null;
  pending?: boolean;
}): AgentRunPromptView | null {
  if (args.pending) return { assignment: args.text.trim() || null, instructions: null };
  if (args.provenance) return { assignment: args.provenance.assignment?.trim() || null, instructions: args.text };
  if (typeof args.runAssignment === "string") {
    return { assignment: extractRunAssignment(args.text, args.runAssignment), instructions: args.text };
  }
  return null;
}

export type AgentRunFirstPromptState = "pending" | "landed" | "ended";

/**
 * Where an Agent-mode send stands between the composer and the first user
 * row its run writes: `landed` once the transcript holds that row, `ended`
 * when the run ended without writing one, `pending` otherwise. A run that is
 * stuck or waits on the user before its first turn stays pending: its bar
 * says why, and its prompt stays in view until Retry writes the row.
 */
export function resolveAgentRunFirstPrompt(args: {
  agentRunId: string;
  messages: readonly Pick<ChatMessage, "role" | "turnId" | "agentRunPrompt">[];
  detail: AgentRunDetail | undefined;
}): AgentRunFirstPromptState {
  const linked = new Set<string>();
  for (const event of args.detail?.events ?? []) {
    if (event.kind === "turn-linked" && typeof event.detail.turnId === "string") linked.add(event.detail.turnId);
  }
  for (const message of args.messages) {
    if (message.role === "user" && message.agentRunPrompt?.agentRunId === args.agentRunId) return "landed";
    if (message.turnId && linked.has(message.turnId)) return "landed";
  }
  // A linked turn has written its row; the transcript has yet to load it.
  if (!args.detail || linked.size > 0) return "pending";
  return isActiveAgentRunState(args.detail.agentRun.state) ? "pending" : "ended";
}

/**
 * The plan a one-stage run shows as its steps: the agent's latest to-do list,
 * stored on the stage record when a turn ends. Null for a run with a workflow
 * (its stages are the steps) or before the agent wrote a list.
 */
export function agentRunStoredPlan(detail: AgentRunDetail | null | undefined): StagePlan | null {
  const stages = detail?.agentRun.workflow.stages;
  if (!detail || !stages || stages.length !== 1) return null;
  return latestStageRecord(detail.stages, stages[0]!.id)?.facts?.plan ?? null;
}

/**
 * Where a run stands, in a few words: its current stage of a workflow
 * ("Reproduce 2/3"), else its plan ("Plan 3/5"), else nothing.
 */
export function describeAgentRunProgress(detail: AgentRunDetail, plan = agentRunStoredPlan(detail)): string | null {
  const { stages } = detail.agentRun.workflow;
  if (stages.length > 1) {
    const index = Math.min(detail.agentRun.currentStageIndex, stages.length - 1);
    return `${stages[index]!.title} ${index + 1}/${stages.length}`;
  }
  return plan ? describeRunPlan(plan) : null;
}
