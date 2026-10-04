/**
 * How an agent run reads. A run is an agent run (`agent-run.ts`) with one
 * implicit stage or the stages of the agent's workflow, so its surfaces drop
 * the workflow vocabulary (Agent run, workflow) and show the agent, a state,
 * the stages when there is more than one, the Done when lines and what the
 * run produced.
 *
 * Pure. Used by the agent run surfaces in `src/components/agent-runs/` for runs
 * marked `origin: "agent"`; a legacy run keeps its own copy.
 */
import { WORK_STATE } from "@/components/ads/components/state-vocabulary";
import type { AgentRunPromptProvenance, ChatMessage } from "@/types/chat";
import { extractRunAssignment, hasAgentOrigin } from "./agent-run";
import type { AgentRunDetail } from "./api";
import { collectAcceptanceCriteria } from "./briefing";
import { isActiveAgentRunState, latestStageRecord, type AgentRunStopReason, type StagePlan } from "./domain";
import { classifyStageEvidence, isVerifiedEvidence, type ClassifiedEvidence } from "./evidence";
import { formatAge, type AgentRunBadgeTone, type StageTone } from "./agent-run-view";
import { describeUsageShort } from "./usage";

export { extractRunAssignment };

export type AgentRunViewState = "working" | "needs-you" | "ready" | "failed" | "stopped";

/** The words are the shared work-state vocabulary's. */
export const AGENT_RUN_VIEW_STATE_LABELS: Record<AgentRunViewState, string> = {
  working: WORK_STATE.working.label,
  "needs-you": WORK_STATE["needs-you"].label,
  ready: WORK_STATE.ready.label,
  failed: WORK_STATE.failed.label,
  stopped: WORK_STATE.stopped.label,
};

const STOP_REASON_TEXT: Record<AgentRunStopReason, string> = {
  "task-unavailable": "The task is no longer available.",
  "turn-cap-reached": "The run used all its turns before it finished.",
  expired: "The run took too long and expired.",
};

/** The icon tone of a state; the icon is always paired with the state word. */
export const AGENT_RUN_VIEW_STATE_TONES: Record<AgentRunViewState, StageTone> = {
  working: "active",
  "needs-you": "waiting",
  ready: "done",
  failed: "attention",
  stopped: "skipped",
};

/** What Retry does: ask the stage again, or start a new run from the assignment. */
export type AgentRunRecovery = "retry-stage" | "new-run";

export interface AgentRunStatus {
  state: AgentRunViewState;
  label: string;
  tone: AgentRunBadgeTone;
  /** The agent's name; the run's implicit workflow carries it. */
  agentName: string;
  /** Why the run needs you or failed, in one sentence. */
  reason: string | null;
  /** Set when the run stopped moving: it gets a reason card with Retry and Take control. */
  recovery: AgentRunRecovery | null;
}

/** The state of an agent run in the words people see. */
export function describeAgentRunStatus(detail: AgentRunDetail): AgentRunStatus {
  const { agentRun } = detail;
  const agentName = agentRun.workflow.name;
  const make = (
    state: AgentRunViewState,
    tone: AgentRunBadgeTone,
    reason: string | null = null,
    recovery: AgentRunRecovery | null = null,
  ): AgentRunStatus => ({ state, label: AGENT_RUN_VIEW_STATE_LABELS[state], tone, agentName, reason, recovery });
  switch (agentRun.state) {
    case "completed":
      return make("ready", "success");
    case "cancelled":
      return make("stopped", "neutral");
    case "stopped":
      return make(
        "failed",
        "danger",
        agentRun.reasonDetail ?? (agentRun.stopReason ? STOP_REASON_TEXT[agentRun.stopReason] : null),
        "new-run",
      );
    case "paused":
      return make("needs-you", "warning", agentRun.reasonDetail ?? "The run is paused.");
    case "running":
      break;
  }
  const stage = agentRun.workflow.stages[agentRun.currentStageIndex];
  const record = stage ? latestStageRecord(detail.stages, stage.id) : undefined;
  switch (record?.status) {
    case "blocked":
      return make(
        "needs-you",
        "warning",
        record.blockReason === "reporting-unavailable"
          ? "Stave's local tools are unreachable, so the agent could not report."
          : (record.detail ?? "The agent is waiting for you."),
      );
    case "stuck":
      return make("needs-you", "warning", record.detail ?? "The run stopped making progress.", "retry-stage");
    case "awaiting-sign-off":
      return make("needs-you", "warning", stage ? `Waiting for you to start ${stage.title}.` : "The run is waiting for you.");
    default:
      return make("working", "accent");
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

export type DoneWhenStatus = "met-reported" | "unmet" | "unverified";

export const DONE_WHEN_LABELS: Record<DoneWhenStatus, string> = {
  "met-reported": "Met · agent reported",
  unmet: "Not met",
  unverified: "Not verified",
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
 * The run's Done when: the criteria the agent reported, else the assignment's
 * own line, each with the agent's status. A criterion carries no link to the
 * checks that would prove it, so a line never claims Stave verified it;
 * `describeStaveChecks` lists what Stave itself saw succeed, separately.
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
      line(criterion.text, criterion.status === "met" ? "met-reported" : criterion.status),
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

/** The checks Stave saw succeed on the current work, by command or label, once each. */
export function describeStaveChecks(detail: AgentRunDetail): string[] {
  const names = reportOf(detail)
    .evidence.filter(isVerifiedEvidence)
    .map((evidence) => (evidence.command ?? evidence.label).trim())
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
export function describeAgentRunResult(detail: AgentRunDetail, now: number): AgentRunResult {
  return {
    status: describeAgentRunStatus(detail),
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
  if (status.state === "ready") return "result";
  return status.recovery ? "reason" : null;
}

/**
 * A run's state on a Fleet card, where the run's strip names the agent and
 * the state for the lead task: a working run whose task waits on the user (a
 * question or an approval in the turn) needs you.
 */
export function agentRunFleetState(state: AgentRunViewState, leadTaskWaiting: boolean): AgentRunViewState {
  return state === "working" && leadTaskWaiting ? "needs-you" : state;
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
export function describeAgentRunProgress(detail: AgentRunDetail): string | null {
  const { stages } = detail.agentRun.workflow;
  if (stages.length > 1) {
    const index = Math.min(detail.agentRun.currentStageIndex, stages.length - 1);
    return `${stages[index]!.title} ${index + 1}/${stages.length}`;
  }
  const plan = agentRunStoredPlan(detail);
  if (!plan) return null;
  const done = plan.items.filter((item) => item.status === "completed").length;
  const current = plan.items.find((item) => item.status === "in_progress");
  return `Plan ${done}/${plan.items.length}${current ? ` · Now: ${current.content}` : ""}`;
}
