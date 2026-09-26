/**
 * The notification a mission raises when it stops for the user or finishes:
 * a sign-off, a blocker, a stuck stage, or the end. One per state, keyed so a
 * repeated change never notifies twice. Pure.
 */
import type {
  AppNotificationCreateInput,
  AppNotificationKind,
} from "@/lib/notifications/notification.types";
import type { MissionDetail } from "./api";
import { currentStageRecord } from "./domain";

export interface MissionNotificationContext {
  repositoryPath: string | null;
  repositoryName: string | null;
  workspaceName: string | null;
  taskTitle: string | null;
}

function firstLine(text: string) {
  const line = text.split("\n")[0]!.trim();
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

function draft(
  detail: MissionDetail,
  context: MissionNotificationContext,
  args: { kind: AppNotificationKind; title: string; detail: string | null; key: string },
): AppNotificationCreateInput {
  const { mission } = detail;
  const record = currentStageRecord(detail);
  return {
    id: `mission-${mission.id}-${args.key}`.slice(0, 190),
    kind: args.kind,
    title: args.title,
    body: `${mission.playbook.name} · ${firstLine(mission.assignment)}`,
    repositoryPath: context.repositoryPath,
    repositoryName: context.repositoryName,
    workspaceId: mission.workspaceId,
    workspaceName: context.workspaceName,
    taskId: mission.leadTaskId,
    taskTitle: context.taskTitle,
    turnId: null,
    providerId: mission.fingerprint.providerId,
    action: null,
    payload: {
      source: "mission",
      missionId: mission.id,
      stageId: record.stageId,
      attempt: record.attempt,
      ...(args.detail ? { detail: args.detail } : {}),
    },
    dedupeKey: `mission:${mission.id}:${args.key}`,
  };
}

/** The notification for where the mission stands now, or null when it needs nothing. */
export function describeMissionNotification(
  detail: MissionDetail,
  context: MissionNotificationContext,
): AppNotificationCreateInput | null {
  const { mission } = detail;
  const record = currentStageRecord(detail);
  const stage = mission.playbook.stages[mission.currentStageIndex]!;
  const attemptKey = `${record.stageId}:${record.attempt}`;
  switch (mission.state) {
    case "completed":
      return draft(detail, context, {
        kind: "mission.completed",
        title: `Mission complete — ${mission.playbook.name}`,
        detail: null,
        key: "completed",
      });
    case "stopped":
      return draft(detail, context, {
        kind: "mission.blocked",
        title: "Mission stopped",
        detail: mission.reasonDetail,
        key: "stopped",
      });
    case "paused":
      // A pause the user chose needs no notification; one Stave chose does.
      if (mission.pauseReason === "paused-by-user" || mission.pauseReason === "taken-over") return null;
      return draft(detail, context, {
        kind: "mission.blocked",
        title: `Mission paused before ${stage.title}`,
        detail: mission.reasonDetail,
        key: `paused:${mission.pauseReason}:${attemptKey}`,
      });
    case "cancelled":
      return null;
    case "running":
      break;
  }
  switch (record.status) {
    case "awaiting-sign-off":
      return draft(detail, context, {
        kind: "mission.sign_off_requested",
        title: `${stage.title} waits for your sign-off`,
        detail: null,
        key: `sign-off:${attemptKey}`,
      });
    case "blocked":
      return draft(detail, context, {
        kind: "mission.blocked",
        title:
          record.blockReason === "reporting-unavailable"
            ? `${stage.title} cannot report its stage`
            : `${stage.title} is blocked`,
        detail: record.detail,
        key: `blocked:${attemptKey}`,
      });
    case "stuck":
      return draft(detail, context, {
        kind: "mission.stuck",
        title: `${stage.title} is stuck`,
        detail: record.detail,
        key: `stuck:${attemptKey}`,
      });
    case "pending":
    case "running":
    case "completed":
    case "skipped":
    case "cancelled":
      return null;
  }
}

/**
 * One reminder for every sign-off that has waited past the interval, batched
 * into a single notification per interval window.
 */
export function describeSignOffReminder(args: {
  waiting: ReadonlyArray<{ detail: MissionDetail; since: string; taskTitle: string | null }>;
  now: Date;
  intervalMinutes: number;
}): AppNotificationCreateInput | null {
  if (args.intervalMinutes <= 0) return null;
  const intervalMs = args.intervalMinutes * 60_000;
  const overdue = args.waiting.filter((entry) => args.now.getTime() - Date.parse(entry.since) >= intervalMs);
  if (overdue.length === 0) return null;
  const window = Math.floor(args.now.getTime() / intervalMs);
  const first = overdue[0]!;
  const names = overdue.map((entry) => entry.taskTitle ?? entry.detail.mission.playbook.name);
  return {
    id: `mission-reminder-${window}`,
    kind: "mission.sign_off_requested",
    title:
      overdue.length === 1
        ? `Still waiting for your sign-off — ${names[0]}`
        : `${overdue.length} missions are waiting for your sign-off`,
    body: names.slice(0, 3).join(", ") + (names.length > 3 ? ` and ${names.length - 3} more` : ""),
    repositoryPath: null,
    repositoryName: null,
    workspaceId: overdue.length === 1 ? first.detail.mission.workspaceId : null,
    workspaceName: null,
    taskId: overdue.length === 1 ? first.detail.mission.leadTaskId : null,
    taskTitle: overdue.length === 1 ? first.taskTitle : null,
    turnId: null,
    providerId: null,
    action: null,
    payload: { source: "mission-reminder", missionIds: overdue.map((entry) => entry.detail.mission.id) },
    dedupeKey: `mission-reminder:${window}`,
  };
}
