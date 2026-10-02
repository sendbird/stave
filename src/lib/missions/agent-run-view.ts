/**
 * How an agent run reads. A run is a mission (`agent-run.ts`) with one
 * implicit stage or the stages of the agent's workflow, so its surfaces drop
 * the playbook vocabulary (Mission, playbook) and show the agent, a state,
 * the stages when there is more than one, the Done when lines and what the
 * run produced.
 *
 * Pure. Used by the mission surfaces in `src/components/missions/` for runs
 * marked `origin: "agent"`; a playbook mission keeps its own copy.
 */
import { WORK_STATE } from "@/components/ads/components/state-vocabulary";
import type { AgentRunPromptProvenance, ChatMessage } from "@/types/chat";
import { extractRunAssignment, isAgentRun } from "./agent-run";
import type { MissionDetail } from "./api";
import { collectAcceptanceCriteria } from "./briefing";
import { isActiveMissionState, latestStageRecord, type MissionStopReason } from "./domain";
import { classifyStageEvidence, isVerifiedEvidence, type ClassifiedEvidence } from "./evidence";
import { formatAge, type MissionBadgeTone, type StageTone } from "./mission-view";
import { describeUsageShort } from "./usage";

export { extractRunAssignment };

export type AgentRunState = "working" | "needs-you" | "ready" | "failed" | "stopped";

/** The words are the shared work-state vocabulary's. */
export const AGENT_RUN_STATE_LABELS: Record<AgentRunState, string> = {
  working: WORK_STATE.working.label,
  "needs-you": WORK_STATE["needs-you"].label,
  ready: WORK_STATE.ready.label,
  failed: WORK_STATE.failed.label,
  stopped: WORK_STATE.stopped.label,
};

const STOP_REASON_TEXT: Record<MissionStopReason, string> = {
  "task-unavailable": "The task is no longer available.",
  "turn-cap-reached": "The run used all its turns before it finished.",
  expired: "The run took too long and expired.",
};

/** The icon tone of a state; the icon is always paired with the state word. */
export const AGENT_RUN_STATE_TONES: Record<AgentRunState, StageTone> = {
  working: "active",
  "needs-you": "waiting",
  ready: "done",
  failed: "attention",
  stopped: "skipped",
};

/** What Retry does: ask the stage again, or start a new run from the assignment. */
export type AgentRunRecovery = "retry-stage" | "new-run";

export interface AgentRunStatus {
  state: AgentRunState;
  label: string;
  tone: MissionBadgeTone;
  /** The agent's name; the run's implicit playbook carries it. */
  agentName: string;
  /** Why the run needs you or failed, in one sentence. */
  reason: string | null;
  /** Set when the run stopped moving: it gets a reason card with Retry and Take control. */
  recovery: AgentRunRecovery | null;
}

/** The state of an agent run in the words people see. */
export function describeAgentRunStatus(detail: MissionDetail): AgentRunStatus {
  const { mission } = detail;
  const agentName = mission.playbook.name;
  const make = (
    state: AgentRunState,
    tone: MissionBadgeTone,
    reason: string | null = null,
    recovery: AgentRunRecovery | null = null,
  ): AgentRunStatus => ({ state, label: AGENT_RUN_STATE_LABELS[state], tone, agentName, reason, recovery });
  switch (mission.state) {
    case "completed":
      return make("ready", "success");
    case "cancelled":
      return make("stopped", "neutral");
    case "stopped":
      return make(
        "failed",
        "danger",
        mission.reasonDetail ?? (mission.stopReason ? STOP_REASON_TEXT[mission.stopReason] : null),
        "new-run",
      );
    case "paused":
      return make("needs-you", "warning", mission.reasonDetail ?? "The run is paused.");
    case "running":
      break;
  }
  const stage = mission.playbook.stages[mission.currentStageIndex];
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
export function agentRunDuration(detail: MissionDetail, now: number): string {
  const { mission } = detail;
  const active = mission.state === "running" || mission.state === "paused";
  const end = active ? now : Date.parse(mission.updatedAt);
  return formatRunDuration(end - Date.parse(mission.createdAt));
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
function reportOf(detail: MissionDetail) {
  const stages = detail.mission.playbook.stages;
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
export function describeDoneWhen(detail: MissionDetail): AgentRunDoneWhenLine[] {
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
  const stages = detail.mission.playbook.stages;
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
export function describeStaveChecks(detail: MissionDetail): string[] {
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
export function describeAgentRunChanges(detail: MissionDetail): AgentRunChanges | null {
  const diff = reportOf(detail).record?.facts?.diff;
  return diff && diff.filesChanged > 0
    ? { files: diff.filesChanged, insertions: diff.insertions, deletions: diff.deletions }
    : null;
}

export interface AgentRunPullRequest {
  url: string;
  number: number;
}

/** The pull request the run's report links to, when it names one. */
export function findAgentRunPullRequest(detail: MissionDetail): AgentRunPullRequest | null {
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
  pullRequest: AgentRunPullRequest | null;
  summary: string | null;
  spent: string | null;
}

/** Everything the Result card and the panel's Result section show. */
export function describeAgentRunResult(detail: MissionDetail, now: number): AgentRunResult {
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
  detail: MissionDetail;
  lastMessageStartedAt?: string | null;
}): AgentRunCardKind | null {
  const { mission } = args.detail;
  if (!isAgentRun(mission) || isActiveMissionState(mission.state)) return null;
  if (args.lastMessageStartedAt && Date.parse(args.lastMessageStartedAt) > Date.parse(mission.updatedAt)) return null;
  const status = describeAgentRunStatus(args.detail);
  if (status.state === "ready") return "result";
  return status.recovery ? "reason" : null;
}

/**
 * A run's state on a Fleet card, where the run's strip names the agent and
 * the state for the lead task: a working run whose task waits on the user (a
 * question or an approval in the turn) needs you.
 */
export function agentRunFleetState(state: AgentRunState, leadTaskWaiting: boolean): AgentRunState {
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
  missionId: string;
  messages: readonly Pick<ChatMessage, "role" | "turnId" | "agentRunPrompt">[];
  detail: MissionDetail | undefined;
}): AgentRunFirstPromptState {
  const linked = new Set<string>();
  for (const event of args.detail?.events ?? []) {
    if (event.kind === "turn-linked" && typeof event.detail.turnId === "string") linked.add(event.detail.turnId);
  }
  for (const message of args.messages) {
    if (message.role === "user" && message.agentRunPrompt?.missionId === args.missionId) return "landed";
    if (message.turnId && linked.has(message.turnId)) return "landed";
  }
  // A linked turn has written its row; the transcript has yet to load it.
  if (!args.detail || linked.size > 0) return "pending";
  return isActiveMissionState(args.detail.mission.state) ? "pending" : "ended";
}
