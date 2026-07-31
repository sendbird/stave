import {
  findPendingApprovalMessageByRequestId,
  findPendingUserInputMessageByRequestId,
} from "@/store/provider-message.utils";
import type { RecentProjectState } from "@/store/project.utils";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type { ChatMessage } from "@/types/chat";

export interface FleetTaskControlIdentity {
  projectPath: string;
  workspaceId: string;
  taskId: string;
  turnId?: string | null;
}

export interface FleetInteractionControlIdentity
  extends FleetTaskControlIdentity {
  kind: "approval" | "user-input";
  requestId: string;
  messageId?: string | null;
}

export interface FleetCurrentTaskControlState {
  projectPath: string | null;
  workspaceId: string | null;
  taskId: string | null;
  turnId: string | null;
  messages: ChatMessage[];
}

export type FleetControlValidation =
  | { ok: true; messageId?: string }
  | { ok: false; reason: string };

interface FleetControlStoreState {
  projectPath: string | null;
  activeWorkspaceId: string;
  workspaces: Array<{ id: string }>;
  recentProjects: RecentProjectState[];
  tasks: WorkspaceSessionState["tasks"];
  messagesByTask: WorkspaceSessionState["messagesByTask"];
  activeTurnIdsByTask: WorkspaceSessionState["activeTurnIdsByTask"];
  workspaceRuntimeCacheById: Record<string, WorkspaceSessionState>;
  taskWorkspaceIdById: Record<string, string>;
}

export function resolveFleetCurrentTaskControlState(args: {
  state: FleetControlStoreState;
  expected: FleetTaskControlIdentity;
}): FleetCurrentTaskControlState {
  const projectOwnsWorkspace =
    (args.state.projectPath === args.expected.projectPath &&
      args.state.workspaces.some(
        (workspace) => workspace.id === args.expected.workspaceId,
      )) ||
    args.state.recentProjects.some(
      (project) =>
        project.projectPath === args.expected.projectPath &&
        project.workspaces.some(
          (workspace) => workspace.id === args.expected.workspaceId,
        ),
    );
  const workspaceOwnership =
    args.state.taskWorkspaceIdById[args.expected.taskId];
  const workspaceMatches =
    projectOwnsWorkspace &&
    (!workspaceOwnership || workspaceOwnership === args.expected.workspaceId);
  const active =
    args.state.projectPath === args.expected.projectPath &&
    args.state.activeWorkspaceId === args.expected.workspaceId;
  const session = active
    ? {
        tasks: args.state.tasks,
        messagesByTask: args.state.messagesByTask,
        activeTurnIdsByTask: args.state.activeTurnIdsByTask,
      }
    : args.state.workspaceRuntimeCacheById[args.expected.workspaceId];
  const taskMatches =
    workspaceMatches &&
    Boolean(
      session?.tasks.some((task) => task.id === args.expected.taskId),
    );

  return {
    projectPath: projectOwnsWorkspace ? args.expected.projectPath : null,
    workspaceId: workspaceMatches ? args.expected.workspaceId : null,
    taskId: taskMatches ? args.expected.taskId : null,
    turnId: taskMatches
      ? (session?.activeTurnIdsByTask[args.expected.taskId] ?? null)
      : null,
    messages: taskMatches
      ? (session?.messagesByTask[args.expected.taskId] ?? [])
      : [],
  };
}

function validateTaskIdentity(args: {
  expected: FleetTaskControlIdentity;
  current: FleetCurrentTaskControlState;
  requireTurn: boolean;
}): FleetControlValidation {
  if (
    args.current.projectPath !== args.expected.projectPath ||
    args.current.workspaceId !== args.expected.workspaceId ||
    args.current.taskId !== args.expected.taskId
  ) {
    return {
      ok: false,
      reason:
        "This task moved or is no longer loaded. Open the task to refresh it.",
    };
  }
  if (
    args.requireTurn &&
    (!args.expected.turnId ||
      args.current.turnId !== args.expected.turnId)
  ) {
    return {
      ok: false,
      reason:
        "The turn changed before this action was sent. Review the latest task state.",
    };
  }
  return { ok: true };
}

export function validateFleetTurnAction(args: {
  expected: FleetTaskControlIdentity;
  current: FleetCurrentTaskControlState;
}): FleetControlValidation {
  return validateTaskIdentity({
    ...args,
    requireTurn: true,
  });
}

export function validateFleetQueueAction(args: {
  expected: FleetTaskControlIdentity;
  current: FleetCurrentTaskControlState;
}): FleetControlValidation {
  return validateTaskIdentity({
    ...args,
    requireTurn: Boolean(args.expected.turnId),
  });
}

export function validateFleetInteractionAction(args: {
  expected: FleetInteractionControlIdentity;
  current: FleetCurrentTaskControlState;
}): FleetControlValidation {
  const identity = validateTaskIdentity({
    expected: args.expected,
    current: args.current,
    requireTurn: Boolean(args.expected.turnId),
  });
  if (!identity.ok) {
    return identity;
  }

  const pending =
    args.expected.kind === "approval"
      ? findPendingApprovalMessageByRequestId({
          messages: args.current.messages,
          requestId: args.expected.requestId,
        })
      : findPendingUserInputMessageByRequestId({
          messages: args.current.messages,
          requestId: args.expected.requestId,
        });
  if (!pending) {
    return {
      ok: false,
      reason:
        "This request was already answered or expired. Review the latest task state.",
    };
  }
  if (
    args.expected.messageId &&
    pending.messageId !== args.expected.messageId
  ) {
    return {
      ok: false,
      reason:
        "The request identity changed before this action was sent. Review the latest task state.",
    };
  }
  return { ok: true, messageId: pending.messageId };
}
