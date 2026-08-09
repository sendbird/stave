import type { StaveSyncEventKind } from "./contract";
import { buildHirondelleSyncLinks } from "./links";
import { isHirondelleContextStale } from "./staleness";
import type { HirondelleSyncSettings } from "./types";
import type {
  WorkspaceHirondelleProjectLink,
  WorkspaceInformationState,
} from "../workspace-information";

export interface HirondelleTriggerWorkspaceContext {
  workspaceId: string;
  workspaceName: string;
  branch: string;
  hirondelleProject: WorkspaceHirondelleProjectLink | null | undefined;
}

interface HirondelleTriggerState {
  workspaces: ReadonlyArray<{ id: string; name: string }>;
  workspaceBranchById: Record<string, string | undefined>;
  activeWorkspaceId: string;
  workspaceInformation: WorkspaceInformationState;
  workspaceRuntimeCacheById: Record<
    string,
    { workspaceInformation: WorkspaceInformationState } | undefined
  >;
}

export function collectHirondelleTriggerContext(
  state: HirondelleTriggerState,
  workspaceId: string,
): HirondelleTriggerWorkspaceContext {
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
    hirondelleProject: workspaceInformation?.hirondelleProject,
  };
}

export function shouldPushHirondelleEvent(args: {
  settings: HirondelleSyncSettings;
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

function notifyHirondelleEvent(args: {
  context: HirondelleTriggerWorkspaceContext;
  settings: HirondelleSyncSettings;
  kind: StaveSyncEventKind;
  summary: string;
  sourceUrl?: string;
}) {
  const project = args.context.hirondelleProject;
  const summary = args.summary.trim();
  if (
    !project ||
    project.stale ||
    !summary ||
    !shouldPushHirondelleEvent({
      settings: args.settings,
      kind: args.kind,
    }) ||
    typeof window === "undefined"
  ) {
    return;
  }
  void window.api?.hirondelleSync
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

export function notifyHirondelleTaskArchived(args: {
  context: HirondelleTriggerWorkspaceContext;
  settings: HirondelleSyncSettings;
  taskTitle: string;
}): void {
  notifyHirondelleEvent({
    context: args.context,
    settings: args.settings,
    kind: "task_completed",
    summary: args.taskTitle,
  });
}

export function notifyHirondellePrOpened(args: {
  context: HirondelleTriggerWorkspaceContext;
  settings: HirondelleSyncSettings;
  prUrl: string;
  prTitle: string;
}): void {
  notifyHirondelleEvent({
    context: args.context,
    settings: args.settings,
    kind: "pr_opened",
    summary: args.prTitle,
    sourceUrl: args.prUrl,
  });
}

export function notifyHirondelleTurnSummary(args: {
  context: HirondelleTriggerWorkspaceContext;
  settings: HirondelleSyncSettings;
  workSummary: string;
}): void {
  notifyHirondelleEvent({
    context: args.context,
    settings: args.settings,
    kind: "work_update",
    summary: args.workSummary,
  });
}

export function notifyHirondelleInformationEdited(args: {
  context: HirondelleTriggerWorkspaceContext;
  settings: HirondelleSyncSettings;
  previous: WorkspaceInformationState;
  next: WorkspaceInformationState;
}): void {
  const project = args.context.hirondelleProject;
  if (
    !project ||
    project.stale ||
    !args.settings.enabled ||
    !args.settings.resourceLinks ||
    typeof window === "undefined"
  ) {
    return;
  }
  const previousLinks = buildHirondelleSyncLinks(args.previous);
  const nextLinks = buildHirondelleSyncLinks(args.next);
  if (JSON.stringify(previousLinks) === JSON.stringify(nextLinks)) return;
  void window.api?.hirondelleSync
    ?.notifyLinksChanged?.({
      workspaceId: args.context.workspaceId,
      projectRef: project.ref,
      links: nextLinks,
    })
    .catch(() => undefined);
}

export function maybeRefreshHirondelleContext(args: {
  workspaceId: string;
  hirondelleProject: WorkspaceHirondelleProjectLink | null | undefined;
}): void {
  if (
    !args.hirondelleProject ||
    args.hirondelleProject.stale ||
    !isHirondelleContextStale({
      lastPulledAt: args.hirondelleProject.lastPulledAt,
    }) ||
    typeof window === "undefined"
  ) {
    return;
  }
  void window.api?.hirondelleSync
    ?.refreshContext?.({ workspaceId: args.workspaceId })
    .catch(() => undefined);
}
