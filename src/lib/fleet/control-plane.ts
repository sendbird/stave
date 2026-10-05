import { i18n } from "@/i18n/runtime";
import {
  findPendingApprovalMessageByRequestId,
  findPendingUserInputMessageByRequestId,
} from "@/store/provider-message.utils";
import type { RecentRepositoryState } from "@/store/repository.utils";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type { ChatMessage } from "@/types/chat";

export interface FleetTaskControlIdentity {
  repositoryPath: string;
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
  repositoryPath: string | null;
  workspaceId: string | null;
  taskId: string | null;
  turnId: string | null;
  messages: ChatMessage[];
}

export type FleetControlValidation =
  | { ok: true; messageId?: string }
  | { ok: false; reason: string };

interface FleetControlStoreState {
  repositoryPath: string | null;
  activeWorkspaceId: string;
  workspaces: Array<{ id: string }>;
  recentRepositories: RecentRepositoryState[];
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
  const repositoryOwnsWorkspace =
    (args.state.repositoryPath === args.expected.repositoryPath &&
      args.state.workspaces.some(
        (workspace) => workspace.id === args.expected.workspaceId,
      )) ||
    args.state.recentRepositories.some(
      (repository) =>
        repository.repositoryPath === args.expected.repositoryPath &&
        repository.workspaces.some(
          (workspace) => workspace.id === args.expected.workspaceId,
        ),
    );
  const workspaceOwnership =
    args.state.taskWorkspaceIdById[args.expected.taskId];
  const workspaceMatches =
    repositoryOwnsWorkspace &&
    (!workspaceOwnership || workspaceOwnership === args.expected.workspaceId);
  const active =
    args.state.repositoryPath === args.expected.repositoryPath &&
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
    repositoryPath: repositoryOwnsWorkspace ? args.expected.repositoryPath : null,
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
    args.current.repositoryPath !== args.expected.repositoryPath ||
    args.current.workspaceId !== args.expected.workspaceId ||
    args.current.taskId !== args.expected.taskId
  ) {
    return {
      ok: false,
      reason:
        i18n.t("fleet:additionalCopy.message31"),
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
        i18n.t("fleet:additionalCopy.message32"),
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
        i18n.t("fleet:additionalCopy.message33"),
    };
  }
  if (
    args.expected.messageId &&
    pending.messageId !== args.expected.messageId
  ) {
    return {
      ok: false,
      reason:
        i18n.t("fleet:additionalCopy.message34"),
    };
  }
  return { ok: true, messageId: pending.messageId };
}
