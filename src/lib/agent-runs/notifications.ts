import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { i18n } from "@/i18n/runtime";
/**
 * The notification an agent run raises when it stops for the user or finishes:
 * a sign-off, a blocker, a stuck stage, or the end. One per state, keyed so a
 * repeated change never notifies twice. Pure.
 */
import type {
  AppNotificationCreateInput,
  AppNotificationKind,
} from "@/lib/notifications/notification.types";
import type { AgentRunDetail } from "./api";
import { hasAgentOrigin } from "./agent-run";
import { currentStageRecord } from "./domain";

export interface AgentRunNotificationContext {
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
  detail: AgentRunDetail,
  context: AgentRunNotificationContext,
  args: { kind: AppNotificationKind; title: string; detail: string | null; key: string },
): AppNotificationCreateInput {
  const { agentRun } = detail;
  const record = currentStageRecord(detail);
  return {
    id: `agent-run-${agentRun.id}-${args.key}`.slice(0, 190),
    kind: args.kind,
    title: args.title,
    body: `${agentRun.workflow.name} · ${firstLine(agentRun.assignment)}`,
    repositoryPath: context.repositoryPath,
    repositoryName: context.repositoryName,
    workspaceId: agentRun.workspaceId,
    workspaceName: context.workspaceName,
    taskId: agentRun.leadTaskId,
    taskTitle: context.taskTitle,
    turnId: null,
    providerId: agentRun.fingerprint.providerId,
    action: null,
    payload: {
      source: "agent-run",
      agentRunId: agentRun.id,
      stageId: record.stageId,
      attempt: record.attempt,
      ...(args.detail ? { detail: args.detail } : {}),
    },
    dedupeKey: `agent-run:${agentRun.id}:${args.key}`,
  };
}

/**
 * An agent run is named by its agent and state, never as an agent run: "Ready —
 * Implementer", "Needs you — Implementer", "Failed — Implementer".
 */
function describeAgentOriginNotification(
  detail: AgentRunDetail,
  context: AgentRunNotificationContext,
): AppNotificationCreateInput | null {
  const { agentRun } = detail;
  const record = currentStageRecord(detail);
  const agent = agentRun.workflow.name;
  const attemptKey = `${record.stageId}:${record.attempt}`;
  switch (agentRun.state) {
    case "completed":
      return draft(detail, context, { kind: "agent_run.completed", title: i18n.t("agentRuns:notifications.title", { value1: agent }), detail: null, key: "completed" });
    case "stopped":
      return draft(detail, context, { kind: "agent_run.blocked", title: i18n.t("agentRuns:notifications.title2", { value1: agent }), detail: agentRun.reasonDetail, key: "stopped" });
    case "paused":
      if (agentRun.pauseReason === "paused-by-user" || agentRun.pauseReason === "taken-over") return null;
      return draft(detail, context, {
        kind: "agent_run.blocked",
        title: i18n.t("agentRuns:notifications.title3", { value1: agent }),
        detail: agentRun.reasonDetail,
        key: `paused:${agentRun.pauseReason}:${attemptKey}`,
      });
    case "cancelled":
      return null;
    case "running":
      break;
  }
  if (record.status === "blocked" || record.status === "stuck") {
    return draft(detail, context, {
      kind: record.status === "stuck" ? "agent_run.stuck" : "agent_run.blocked",
      title: i18n.t("agentRuns:notifications.title4", { value1: agent }),
      detail: record.detail,
      key: `${record.status}:${attemptKey}`,
    });
  }
  return null;
}

/** The notification for where the agent run stands now, or null when it needs nothing. */
export function describeAgentRunNotification(
  detail: AgentRunDetail,
  context: AgentRunNotificationContext,
): AppNotificationCreateInput | null {
  const { agentRun } = detail;
  if (hasAgentOrigin(agentRun)) return describeAgentOriginNotification(detail, context);
  const record = currentStageRecord(detail);
  const stage = agentRun.workflow.stages[agentRun.currentStageIndex]!;
  const attemptKey = `${record.stageId}:${record.attempt}`;
  switch (agentRun.state) {
    case "completed":
      return draft(detail, context, {
        kind: "agent_run.completed",
        title: i18n.t("agentRuns:notifications.title5", { value1: agentRun.workflow.name }),
        detail: null,
        key: "completed",
      });
    case "stopped":
      return draft(detail, context, {
        kind: "agent_run.blocked",
        title: i18n.t("agentRuns:notifications.title6"),
        detail: agentRun.reasonDetail,
        key: "stopped",
      });
    case "paused":
      // A pause the user chose needs no notification; one Stave chose does.
      if (agentRun.pauseReason === "paused-by-user" || agentRun.pauseReason === "taken-over") return null;
      return draft(detail, context, {
        kind: "agent_run.blocked",
        title: i18n.t("agentRuns:notifications.title7", { value1: getStageDisplayTitle(stage) }),
        detail: agentRun.reasonDetail,
        key: `paused:${agentRun.pauseReason}:${attemptKey}`,
      });
    case "cancelled":
      return null;
    case "running":
      break;
  }
  switch (record.status) {
    case "awaiting-sign-off":
      return draft(detail, context, {
        kind: "agent_run.sign_off_requested",
        title: i18n.t("agentRuns:remaining.presentationCopy439", { v1: getStageDisplayTitle(stage) }),
        detail: null,
        key: `sign-off:${attemptKey}`,
      });
    case "blocked":
      return draft(detail, context, {
        kind: "agent_run.blocked",
        title:
          record.blockReason === "reporting-unavailable"
            ? i18n.t("agentRuns:notifications.title8", { value1: getStageDisplayTitle(stage) })
            : i18n.t("agentRuns:notifications.title9", { value1: getStageDisplayTitle(stage) }),
        detail: record.detail,
        key: `blocked:${attemptKey}`,
      });
    case "stuck":
      return draft(detail, context, {
        kind: "agent_run.stuck",
        title: i18n.t("agentRuns:notifications.title10", { value1: getStageDisplayTitle(stage) }),
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
 * into a single notification at most once per interval.
 *
 * Each sign-off falls due once per interval of its own wait, counted from
 * when it began, and the reminder is keyed on the wait that fell due last.
 * Keying on the wait rather than on clock windows means a boundary of the
 * clock never sends a second reminder; `lastRemindedAt` keeps waits that fall
 * due close together in one reminder.
 */
export function describeSignOffReminder(args: {
  waiting: ReadonlyArray<{ detail: AgentRunDetail; since: string; taskTitle: string | null }>;
  now: Date;
  intervalMinutes: number;
  /** When the previous reminder went out, in epoch ms, if one did. */
  lastRemindedAt?: number | null;
}): AppNotificationCreateInput | null {
  if (args.intervalMinutes <= 0) return null;
  const intervalMs = args.intervalMinutes * 60_000;
  const nowMs = args.now.getTime();
  if (args.lastRemindedAt != null && nowMs - args.lastRemindedAt < intervalMs) return null;
  const overdue = args.waiting.filter((entry) => nowMs - Date.parse(entry.since) >= intervalMs);
  if (overdue.length === 0) return null;
  let key = "";
  let latestDueAt = -Infinity;
  for (const entry of overdue) {
    const since = Date.parse(entry.since);
    const round = Math.floor((nowMs - since) / intervalMs);
    const dueAt = since + round * intervalMs;
    if (dueAt > latestDueAt) {
      latestDueAt = dueAt;
      key = `${entry.detail.agentRun.id}:${since}:${round}`;
    }
  }
  const first = overdue[0]!;
  const names = overdue.map((entry) => entry.taskTitle ?? entry.detail.agentRun.workflow.name);
  return {
    id: `agent-run-reminder-${key}`.slice(0, 190),
    kind: "agent_run.sign_off_requested",
    title:
      overdue.length === 1
        ? i18n.t("agentRuns:notifications.title11", { value1: names[0] })
        : i18n.t("agentRuns:remaining.presentationCopy444", { v1: overdue.length }),
    body: names.slice(0, 3).join(", ") + (names.length > 3 ? i18n.t("agentRuns:notifications.body", { value1: names.length - 3 }) : ""),
    repositoryPath: null,
    repositoryName: null,
    workspaceId: overdue.length === 1 ? first.detail.agentRun.workspaceId : null,
    workspaceName: null,
    taskId: overdue.length === 1 ? first.detail.agentRun.leadTaskId : null,
    taskTitle: overdue.length === 1 ? first.taskTitle : null,
    turnId: null,
    providerId: null,
    action: null,
    payload: { source: "agent-run-reminder", agentRunIds: overdue.map((entry) => entry.detail.agentRun.id) },
    dedupeKey: `agent-run-reminder:${key}`,
  };
}
