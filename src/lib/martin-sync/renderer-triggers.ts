import type { StaveSyncEventKind } from "./contract";
import { buildMartinSyncLinks } from "./links";
import { isMartinContextStale } from "./staleness";
import type { MartinSyncSettings } from "./types";
import type {
  WorkspaceMartinProjectLink,
  WorkspaceInformationState,
} from "../workspace-information";

export interface MartinTriggerWorkspaceContext {
  workspaceId: string;
  workspaceName: string;
  branch: string;
  martinProject: WorkspaceMartinProjectLink | null | undefined;
}

interface MartinTriggerState {
  workspaces: ReadonlyArray<{ id: string; name: string }>;
  workspaceBranchById: Record<string, string | undefined>;
  activeWorkspaceId: string;
  workspaceInformation: WorkspaceInformationState;
  workspaceRuntimeCacheById: Record<
    string,
    { workspaceInformation: WorkspaceInformationState } | undefined
  >;
}

export function collectMartinTriggerContext(
  state: MartinTriggerState,
  workspaceId: string,
): MartinTriggerWorkspaceContext {
  const branch = state.workspaceBranchById[workspaceId] ?? "";
  const workspaceName =
    state.workspaces.find((workspace) => workspace.id === workspaceId)?.name ??
    (branch || workspaceId);
  const workspaceInformation =
    workspaceId === state.activeWorkspaceId
      ? state.workspaceInformation
      : state.workspaceRuntimeCacheById[workspaceId]?.workspaceInformation;
  return {
    workspaceId,
    workspaceName,
    branch,
    martinProject: workspaceInformation?.martinProject,
  };
}

export function shouldPushMartinEvent(args: {
  settings: MartinSyncSettings;
  kind: StaveSyncEventKind;
}): boolean {
  if (!args.settings.enabled) return false;
  switch (args.kind) {
    case "pr_opened":
      return args.settings.prOpened;
    case "task_completed":
      return args.settings.taskCompleted;
    case "work_update":
      return args.settings.turnSummaries;
    case "workspace_linked":
    case "workspace_unlinked":
      return true;
    default:
      args.kind satisfies never;
      return false;
  }
}

function notifyMartinEvent(args: {
  context: MartinTriggerWorkspaceContext;
  settings: MartinSyncSettings;
  kind: StaveSyncEventKind;
  summary: string;
  sourceUrl?: string;
}) {
  const project = args.context.martinProject;
  const summary = args.summary.trim();
  if (
    !project ||
    project.stale ||
    !summary ||
    !shouldPushMartinEvent({
      settings: args.settings,
      kind: args.kind,
    }) ||
    typeof window === "undefined"
  ) {
    return;
  }
  void window.api?.martinSync
    ?.enqueue?.({
      workspaceId: args.context.workspaceId,
      projectRef: project.ref,
      kind: args.kind,
      summary,
      ...(args.sourceUrl ? { sourceUrl: args.sourceUrl } : {}),
      workspaceName: args.context.workspaceName,
      branch: args.context.branch,
    })
    .catch(() => undefined);
}

export function notifyMartinTaskArchived(args: {
  context: MartinTriggerWorkspaceContext;
  settings: MartinSyncSettings;
  taskTitle: string;
}): void {
  notifyMartinEvent({
    context: args.context,
    settings: args.settings,
    kind: "task_completed",
    summary: args.taskTitle,
  });
}

export function notifyMartinPrOpened(args: {
  context: MartinTriggerWorkspaceContext;
  settings: MartinSyncSettings;
  prUrl: string;
  prTitle: string;
}): void {
  notifyMartinEvent({
    context: args.context,
    settings: args.settings,
    kind: "pr_opened",
    summary: args.prTitle,
    sourceUrl: args.prUrl,
  });
}

export function notifyMartinTurnSummary(args: {
  context: MartinTriggerWorkspaceContext;
  settings: MartinSyncSettings;
  workSummary: string;
}): void {
  notifyMartinEvent({
    context: args.context,
    settings: args.settings,
    kind: "work_update",
    summary: args.workSummary,
  });
}

export function notifyMartinInformationEdited(args: {
  context: MartinTriggerWorkspaceContext;
  settings: MartinSyncSettings;
  previous: WorkspaceInformationState;
  next: WorkspaceInformationState;
}): void {
  const project = args.context.martinProject;
  if (
    !project ||
    project.stale ||
    !args.settings.enabled ||
    !args.settings.resourceLinks ||
    typeof window === "undefined"
  ) {
    return;
  }
  const previousLinks = buildMartinSyncLinks(args.previous);
  const nextLinks = buildMartinSyncLinks(args.next);
  if (JSON.stringify(previousLinks) === JSON.stringify(nextLinks)) return;
  void window.api?.martinSync
    ?.notifyLinksChanged?.({
      workspaceId: args.context.workspaceId,
      projectRef: project.ref,
      links: nextLinks,
    })
    .catch(() => undefined);
}

export function maybeRefreshMartinContext(args: {
  workspaceId: string;
  martinProject: WorkspaceMartinProjectLink | null | undefined;
}): void {
  if (
    !args.martinProject ||
    args.martinProject.stale ||
    !isMartinContextStale({
      lastPulledAt: args.martinProject.lastPulledAt,
    }) ||
    typeof window === "undefined"
  ) {
    return;
  }
  void window.api?.martinSync
    ?.refreshContext?.({ workspaceId: args.workspaceId })
    .catch(() => undefined);
}
