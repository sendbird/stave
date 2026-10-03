/**
 * What the mission surfaces show, derived from a `MissionDetail`: stage rows,
 * the one status line with its age, and the transcript divider for each turn a
 * mission started. The Mission bar, the Mission panel and the transcript read
 * the same projection, so they tell the same story.
 *
 * Pure. Callers pass `now` and a time formatter.
 */
import type { MissionDetail } from "./api";
import { resolveMissionStageSignOff } from "./policy";
import {
  latestStageRecord,
  type Mission,
  type MissionEvent,
  type MissionStageRecord,
  type StageStatus,
} from "./domain";
import { classifyStageEvidence, describeActionEvidence, isVerifiedEvidence, type ClassifiedEvidence } from "./evidence";
import { CHECK_IN_LABELS, type WorkflowStage, type StaveAction } from "@/lib/workflows/schema";

/** How a stage status reads and which tone its icon takes. */
export type StageTone = "done" | "active" | "waiting" | "attention" | "idle" | "skipped";

export const STAGE_STATUS_PRESENTATION: Record<StageStatus, { label: string; tone: StageTone }> = {
  pending: { label: "Not started", tone: "idle" },
  "awaiting-sign-off": { label: "Waiting for your sign-off", tone: "waiting" },
  running: { label: "Running", tone: "active" },
  blocked: { label: "Blocked", tone: "attention" },
  stuck: { label: "Stuck", tone: "attention" },
  completed: { label: "Done", tone: "done" },
  skipped: { label: "Skipped", tone: "skipped" },
  cancelled: { label: "Cancelled", tone: "skipped" },
};

export interface MissionStageRow {
  index: number;
  stage: WorkflowStage;
  record: MissionStageRecord | null;
  status: StageStatus;
  attempts: number;
  current: boolean;
  /** The stage waits for the user's sign-off before it starts. */
  asksFirst: boolean;
  durationMs: number | null;
  evidence: ClassifiedEvidence[];
}

export function projectMissionStages(detail: MissionDetail, now: Date): MissionStageRow[] {
  const { mission, stages: records } = detail;
  return mission.workflow.stages.map((stage, index) => {
    const record = latestStageRecord(records, stage.id) ?? null;
    const status: StageStatus = record?.status ?? "pending";
    const started = record?.startedAt ? Date.parse(record.startedAt) : null;
    const ended = record?.endedAt ? Date.parse(record.endedAt) : null;
    const report = record?.report?.outcome === "complete" ? record.report : null;
    const evidence = report ? classifyStageEvidence(report, record?.facts ?? null) : [];
    if (record?.facts?.action) evidence.unshift(describeActionEvidence(record.facts.action, record.facts));
    // Verified by Stave first.
    evidence.sort((left, right) => Number(isVerifiedEvidence(right)) - Number(isVerifiedEvidence(left)));
    return {
      index,
      stage,
      record,
      status,
      attempts: records.filter((candidate) => candidate.stageId === stage.id).length,
      current: index === mission.currentStageIndex,
      asksFirst: index > 0 && resolveMissionStageSignOff(mission, index) === "ask",
      durationMs:
        started === null ? null : (ended ?? (status === "running" ? now.getTime() : started)) - started,
      evidence,
    };
  });
}

/** "now", "45s", "6m", "2h", "3d". */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 5_000) return "now";
  const seconds = Math.floor(ms / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export type MissionHeadlineTone = "active" | "waiting" | "attention" | "done" | "ended";

export interface MissionHeadline {
  text: string;
  tone: MissionHeadlineTone;
  /** When the state this headline names began, for the age. */
  since: string;
}

function latestEvent(events: readonly MissionEvent[], kinds?: readonly MissionEvent["kind"][]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (!kinds || kinds.includes(event.kind)) return event;
  }
  return null;
}

/** "Checks 7/12" from the latest checks observation of the current attempt. */
function describeChecks(detail: MissionDetail, record: MissionStageRecord): string {
  const observed = latestEvent(detail.events, ["checks-observed"]);
  const checks =
    observed && observed.detail.stageId === record.stageId && observed.detail.attempt === record.attempt
      ? (observed.detail.checks as Array<{ state?: string }> | undefined)
      : undefined;
  if (!checks?.length) return "Watching checks";
  const passing = checks.filter((check) =>
    ["SUCCESS", "NEUTRAL", "SKIPPED"].includes((check.state ?? "").toUpperCase()),
  ).length;
  return `Checks ${passing}/${checks.length}`;
}

/** The one line that says where the mission is, named and aged. */
export function describeMissionHeadline(detail: MissionDetail): MissionHeadline {
  const { mission } = detail;
  const since = latestEvent(detail.events)?.createdAt ?? mission.updatedAt;
  switch (mission.state) {
    case "completed":
      return { text: "Mission complete", tone: "done", since: mission.updatedAt };
    case "cancelled":
      return { text: "Mission cancelled", tone: "ended", since: mission.updatedAt };
    case "stopped":
      return {
        text: `Mission stopped${mission.reasonDetail ? ` · ${mission.reasonDetail}` : ""}`,
        tone: "attention",
        since: mission.updatedAt,
      };
    case "paused":
      return {
        text: mission.reasonDetail ?? "Paused",
        tone: mission.pauseReason === "paused-by-user" || mission.pauseReason === "taken-over" ? "waiting" : "attention",
        since,
      };
    case "running":
      break;
  }
  const stage = mission.workflow.stages[mission.currentStageIndex]!;
  const record = latestStageRecord(detail.stages, stage.id);
  switch (record?.status ?? "pending") {
    case "awaiting-sign-off":
      return { text: "Waiting for your sign-off", tone: "waiting", since };
    case "blocked":
      return {
        text:
          record?.blockReason === "reporting-unavailable"
            ? "Reporting unavailable · Stave's local tools are unreachable"
            : `Blocked · ${record?.detail ?? "waiting for you"}`,
        tone: "attention",
        since,
      };
    case "stuck":
      return { text: `Stuck · ${record?.detail ?? "the stage stopped moving"}`, tone: "attention", since };
    case "running":
      if (stage.kind === "action" && stage.action.type === "watch-checks" && record) {
        return { text: describeChecks(detail, record), tone: "active", since: record.startedAt ?? since };
      }
      return { text: `${stage.title} · running`, tone: "active", since: record?.startedAt ?? since };
    case "pending":
    case "completed":
    case "skipped":
    case "cancelled":
      return { text: `${stage.title} · starting`, tone: "active", since };
  }
}

export interface MissionStatusLine {
  /** The lead words: the current stage, or "Paused". */
  title: string;
  /** The state word when it is not plain progress: "Blocked", "Waiting for your sign-off". */
  state: string | null;
  /** What the stage is doing, or why it waits. */
  detail: string | null;
  tone: StageTone;
  /** When the state this line names began, for the age. */
  since: string;
  /** A turn does the work now, so the Now phrase may replace the detail. */
  live: boolean;
}

/** What Stave is doing while one of its own stages runs. */
function describeRunningAction(action: StaveAction, watchingChecks: string): string {
  switch (action.type) {
    case "watch-checks":
      return watchingChecks;
    case "open-draft-pr":
      return "Stave is opening the draft PR";
    case "mark-pr-ready":
      return "Stave is marking the PR ready for review";
    case "run-script":
      return `Stave is running the “${action.scriptId}” script`;
  }
}

/**
 * The mission's line: the stage in view, its state and why, for example
 * `Verify` · `Blocked` · `Which breakpoint…`. The Mission bar shows it in
 * full; the panel shows the state as a badge and the rest beside it.
 */
export function describeMissionStatusLine(detail: MissionDetail): MissionStatusLine {
  const { mission } = detail;
  const headline = describeMissionHeadline(detail);
  const since = headline.since;
  const stage = mission.workflow.stages[mission.currentStageIndex]!;
  const line = (patch: Partial<MissionStatusLine> & Pick<MissionStatusLine, "tone">): MissionStatusLine => ({
    title: stage.title,
    state: null,
    detail: null,
    since,
    live: false,
    ...patch,
  });
  if (mission.state === "paused") {
    const userPause = mission.pauseReason === "paused-by-user" || mission.pauseReason === "taken-over";
    return line({
      title: "Paused",
      detail:
        mission.pauseReason === "taken-over"
          ? "You took over · replies are yours until you resume"
          : mission.pauseReason === "paused-by-user"
            ? `Paused by you before ${stage.title}`
            : headline.text,
      tone: userPause ? "waiting" : "attention",
    });
  }
  if (mission.state !== "running") {
    return line({ title: headline.text, tone: headline.tone === "done" ? "done" : "skipped" });
  }
  const record = latestStageRecord(detail.stages, stage.id);
  switch (record?.status ?? "pending") {
    case "awaiting-sign-off":
      return line({ state: "Waiting for your sign-off", tone: "waiting" });
    case "blocked":
      return record?.blockReason === "reporting-unavailable"
        ? line({ state: "Reporting unavailable", detail: "Stave's local tools are unreachable", tone: "attention" })
        : line({ state: "Blocked", detail: record?.detail ?? "waiting for you", tone: "attention" });
    case "stuck":
      return line({ state: "Stuck", detail: record?.detail ?? "the stage stopped moving", tone: "attention" });
    case "running": {
      if (stage.kind === "ai") return line({ detail: "Working", tone: "active", live: true });
      return line({ detail: describeRunningAction(stage.action, headline.text), tone: "active" });
    }
    case "pending":
    case "completed":
    case "skipped":
    case "cancelled":
      return line({ detail: "Starting", tone: "active" });
  }
}

export type MissionBadgeTone = "accent" | "warning" | "danger" | "success" | "neutral";

/** The one-word state a mission wears: Running, Needs you, Blocked, Paused… */
export function describeMissionBadge(detail: MissionDetail): { label: string; tone: MissionBadgeTone } {
  const { mission } = detail;
  switch (mission.state) {
    case "completed":
      return { label: "Completed", tone: "success" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "stopped":
      return { label: "Stopped", tone: "danger" };
    case "paused":
      return { label: "Paused", tone: "warning" };
    case "running":
      break;
  }
  const stage = mission.workflow.stages[mission.currentStageIndex]!;
  switch (latestStageRecord(detail.stages, stage.id)?.status ?? "pending") {
    case "awaiting-sign-off":
      return { label: "Needs you", tone: "warning" };
    case "blocked":
      return { label: "Blocked", tone: "danger" };
    case "stuck":
      return { label: "Stuck", tone: "danger" };
    case "running":
    case "pending":
    case "completed":
    case "skipped":
    case "cancelled":
      return { label: "Running", tone: "accent" };
  }
}

/** `manual` is stored as is; people see it as "Your settings". */
export const MISSION_PERMISSION_LABELS: Record<Mission["consent"]["permissionMode"], string> = {
  auto: "Auto",
  guided: "Guided",
  manual: "Your settings",
};

/** The permissions line of a mission summary. */
export function describeMissionPermissions(permissionMode: Mission["consent"]["permissionMode"]): string {
  return permissionMode === "manual"
    ? "Your permission settings"
    : `${MISSION_PERMISSION_LABELS[permissionMode]} permissions`;
}

/** The primary button names what happens when it is pressed. */
export function describeSignOffAction(stage: WorkflowStage): string {
  if (stage.kind === "ai") return `Start ${stage.title}`;
  switch (stage.action.type) {
    case "open-draft-pr":
      return "Open the draft PR";
    case "watch-checks":
      return "Start watching checks";
    case "mark-pr-ready":
      return "Mark ready for review";
    case "run-script":
      return `Run “${stage.action.scriptId}”`;
  }
}

/** What the card cites: the stage before it, in one line. */
export function summarizePreviousStage(row: MissionStageRow | undefined): string | null {
  if (!row?.record) return null;
  const parts: string[] = [`${row.stage.title} ${row.status === "completed" ? "done" : row.status}`];
  const diff = row.record.facts?.diff;
  if (diff && diff.filesChanged > 0) {
    parts.push(`${diff.filesChanged} ${diff.filesChanged === 1 ? "file" : "files"} +${diff.insertions} −${diff.deletions}`);
  }
  const verified = row.evidence.filter(isVerifiedEvidence).length;
  if (verified > 0) parts.push(`${verified} verified by Stave`);
  return parts.join(" · ");
}

/** "5 of 40 turns", and whether the mission is close to its turn limit. */
export function describeTurnBudget(mission: Pick<Mission, "turnCount" | "maxTurns">) {
  return {
    text: `${mission.turnCount} of ${mission.maxTurns} turns`,
    nearLimit: mission.turnCount >= Math.ceil(mission.maxTurns * 0.8),
  };
}

export function describeCheckIns(mission: Mission) {
  return CHECK_IN_LABELS[mission.consent.checkIns];
}

/**
 * Whether `incoming` is an older read of the mission than `stored`, so a
 * response that left the host first cannot replace a newer one. An event can
 * land without moving `updatedAt`, so equal times compare the last event.
 */
export function isOlderMissionDetail(incoming: MissionDetail, stored: MissionDetail | undefined): boolean {
  if (!stored || stored.mission.id !== incoming.mission.id) return false;
  const incomingAt = Date.parse(incoming.mission.updatedAt);
  const storedAt = Date.parse(stored.mission.updatedAt);
  if (incomingAt !== storedAt) return incomingAt < storedAt;
  return (incoming.events.at(-1)?.sequence ?? 0) < (stored.events.at(-1)?.sequence ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Transcript dividers                                                         */
/* -------------------------------------------------------------------------- */

function stagePosition(mission: Mission, stageId: string) {
  const index = mission.workflow.stages.findIndex((stage) => stage.id === stageId);
  return index === -1 ? null : { index, stage: mission.workflow.stages[index]! };
}

/**
 * One divider per turn the mission started, keyed by turn id. Built from the
 * mission's events, never from message text.
 */
export function buildMissionTurnDividers(
  detail: MissionDetail,
  formatTime: (iso: string) => string,
): Map<string, string> {
  const { mission, events } = detail;
  const dividers = new Map<string, string>();
  const startedByKey = new Map<string, { event: MissionEvent; position: number }>();
  events.forEach((event, position) => {
    if (event.kind === "turn-started" && event.idempotencyKey) {
      startedByKey.set(event.idempotencyKey, { event, position });
    }
  });
  for (const linked of events) {
    if (linked.kind !== "turn-linked" || typeof linked.detail.turnId !== "string") continue;
    const turnKey = linked.idempotencyKey?.replace(/:linked$/, "") ?? "";
    const started = startedByKey.get(turnKey);
    if (!started) continue;
    const stageId = String(started.event.detail.stageId ?? "");
    const attempt = Number(started.event.detail.attempt ?? 1);
    const reason = String(started.event.detail.reason ?? "stage-start");
    const where = stagePosition(mission, stageId);
    if (!where) continue;
    const name = `Stage ${where.index + 1} · ${where.stage.title}${attempt > 1 ? `, attempt ${attempt}` : ""}`;
    dividers.set(
      linked.detail.turnId,
      describeTurnStart({ mission, events, position: started.position, name, stageId, attempt, reason, formatTime }),
    );
  }
  return dividers;
}

function describeTurnStart(args: {
  mission: Mission;
  events: readonly MissionEvent[];
  position: number;
  name: string;
  stageId: string;
  attempt: number;
  reason: string;
  formatTime: (iso: string) => string;
}): string {
  const { name, reason } = args;
  if (reason === "nudge") return `${name} — reminder to report the stage`;
  if (reason === "repair-checks") return `${name} — repair after checks failed`;
  if (reason === "continue-after-user") return `${name} — continuing after your reply`;
  if (reason === "reporting-restored") return `${name} — resumed after Stave's local tools came back`;
  if (reason === "resume-after-restart") return `${name} — resumed after Stave restarted`;
  // What happened just before this stage started.
  for (let index = args.position - 1; index >= 0; index -= 1) {
    const event = args.events[index]!;
    const sameAttempt = event.detail.stageId === args.stageId && event.detail.attempt === args.attempt;
    if (event.kind === "sign-off" && sameAttempt) {
      return `${name} — signed off by you at ${args.formatTime(event.createdAt)}`;
    }
    if (event.kind === "changes-requested" && event.detail.rerunStageId === args.stageId) {
      return `${name} — after you asked for changes`;
    }
    if (event.kind === "stage-retried" && event.detail.stageId === args.stageId) {
      return `${name} — retried`;
    }
    if (event.kind === "stage-completed" || event.kind === "stage-skipped") {
      const previous = stagePosition(args.mission, String(event.detail.stageId ?? ""));
      if (previous) {
        const verb = event.kind === "stage-completed" ? "reported done" : "was skipped";
        return `${name} — started automatically after ${previous.stage.title} ${verb}`;
      }
    }
    if (event.kind === "mission-started") return `${name} — mission started`;
  }
  return name;
}
