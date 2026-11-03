import { isTaskManaged } from "@/lib/tasks";
import type { AppState } from "@/store/app-store.types";
import type { ApprovalPart } from "@/types/chat";

type ApprovalDeliveryState = Pick<
  AppState,
  | "activeWorkspaceId"
  | "taskWorkspaceIdById"
  | "tasks"
  | "activeTurnIdsByTask"
  | "hostOwnedTurnIdsByTask"
  | "workspaceRuntimeCacheById"
>;

/**
 * Whether the task's approvals are answered through the Stave host rather
 * than straight to the provider runtime: a managed task, or a turn the host
 * started. The host delivers a plain allow, keeps no standing grant and does
 * not answer later requests from the trusted tools, so these surfaces do not
 * offer "Always allow". Returns a boolean so it is safe as a store selector.
 */
export function selectApprovalAnswersThroughHost(
  state: ApprovalDeliveryState,
  taskId: string,
): boolean {
  const workspaceId = state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
  const active = workspaceId === state.activeWorkspaceId;
  const cached = active ? null : state.workspaceRuntimeCacheById[workspaceId];
  const tasks = active ? state.tasks : (cached?.tasks ?? state.tasks);
  const task = tasks.find((candidate) => candidate.id === taskId) ?? null;
  if (isTaskManaged(task)) {
    return true;
  }
  const activeTurnId = active
    ? state.activeTurnIdsByTask[taskId]
    : cached?.activeTurnIdsByTask[taskId];
  return activeTurnId != null && state.hostOwnedTurnIdsByTask[taskId] === activeTurnId;
}

/**
 * Whether a surface offers "Always allow" for this request: the runtime said
 * the grant is honored on later calls, and the answer goes straight to the
 * runtime. One rule for the transcript, the composer and Fleet.
 */
export function canOfferAllowAlways(args: {
  part: Pick<ApprovalPart, "supportsAllowAlways">;
  answersThroughHost: boolean;
}) {
  return args.part.supportsAllowAlways === true && !args.answersThroughHost;
}
