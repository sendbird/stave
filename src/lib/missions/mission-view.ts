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
import { classifyStageEvidence, describeActionEvidence, type ClassifiedEvidence } from "./evidence";
import { CHECK_IN_LABELS, type PlaybookStage } from "@/lib/playbooks/schema";

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
  stage: PlaybookStage;
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
  return mission.playbook.stages.map((stage, index) => {
    const record = latestStageRecord(records, stage.id) ?? null;
    const status: StageStatus = record?.status ?? "pending";
    const started = record?.startedAt ? Date.parse(record.startedAt) : null;
    const ended = record?.endedAt ? Date.parse(record.endedAt) : null;
    const report = record?.report?.outcome === "complete" ? record.report : null;
    const evidence = report ? classifyStageEvidence(report, record?.facts ?? null) : [];
    if (record?.facts?.action) evidence.unshift(describeActionEvidence(record.facts.action));
    // Verified by Stave first.
    evidence.sort((left, right) => Number(right.source === "stave") - Number(left.source === "stave"));
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
  const stage = mission.playbook.stages[mission.currentStageIndex]!;
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

export function describeCheckIns(mission: Mission) {
  return CHECK_IN_LABELS[mission.consent.checkIns];
}

/* -------------------------------------------------------------------------- */
/* Transcript dividers                                                         */
/* -------------------------------------------------------------------------- */

function stagePosition(mission: Mission, stageId: string) {
  const index = mission.playbook.stages.findIndex((stage) => stage.id === stageId);
  return index === -1 ? null : { index, stage: mission.playbook.stages[index]! };
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
