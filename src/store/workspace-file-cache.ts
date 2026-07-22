import type { WorkspaceSummary } from "@/lib/db/workspaces.db";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";
import { areStringArraysEqual } from "@/store/project.utils";

export function getCachedWorkspaceFiles(args: {
  workspacePath?: string | null;
  workspaceFileCacheByPath: Record<string, string[]>;
}) {
  if (!args.workspacePath) {
    return [];
  }
  return args.workspaceFileCacheByPath[args.workspacePath] ?? [];
}

export function resolveInitialWorkspaceFiles(args: {
  workspacePath?: string | null;
  activeProjectPath?: string | null;
  activeProjectFiles: string[];
  workspaceFileCacheByPath: Record<string, string[]>;
}) {
  const workspacePath = args.workspacePath?.trim();
  if (!workspacePath) {
    return [];
  }
  if (
    Object.prototype.hasOwnProperty.call(
      args.workspaceFileCacheByPath,
      workspacePath,
    )
  ) {
    return args.workspaceFileCacheByPath[workspacePath] ?? [];
  }
  if (
    args.activeProjectPath &&
    normalizeComparablePath(args.activeProjectPath) ===
      normalizeComparablePath(workspacePath)
  ) {
    return args.activeProjectFiles;
  }
  return [];
}

export function rememberCachedWorkspaceFiles(args: {
  workspaceFileCacheByPath: Record<string, string[]>;
  workspacePath?: string | null;
  files: string[];
}) {
  if (!args.workspacePath) {
    return args.workspaceFileCacheByPath;
  }
  const currentFiles = args.workspaceFileCacheByPath[args.workspacePath];
  if (currentFiles && areStringArraysEqual(currentFiles, args.files)) {
    return args.workspaceFileCacheByPath;
  }
  return {
    ...args.workspaceFileCacheByPath,
    [args.workspacePath]: args.files,
  };
}

export function removeCachedWorkspaceFiles(args: {
  workspaceFileCacheByPath: Record<string, string[]>;
  workspacePaths: Array<string | null | undefined>;
}) {
  const removablePaths = [
    ...new Set(
      args.workspacePaths
        .map((workspacePath) => workspacePath?.trim())
        .filter((workspacePath): workspacePath is string =>
          Boolean(workspacePath),
        ),
    ),
  ];
  if (removablePaths.length === 0) {
    return args.workspaceFileCacheByPath;
  }
  let changed = false;
  const nextWorkspaceFileCacheByPath = { ...args.workspaceFileCacheByPath };
  for (const workspacePath of removablePaths) {
    if (!(workspacePath in nextWorkspaceFileCacheByPath)) {
      continue;
    }
    delete nextWorkspaceFileCacheByPath[workspacePath];
    changed = true;
  }
  return changed ? nextWorkspaceFileCacheByPath : args.workspaceFileCacheByPath;
}

export function resolveWorkspacePathForId(args: {
  activeWorkspaceId: string;
  workspaceId?: string;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  projectPath: string | null;
}) {
  const workspaceId = args.workspaceId ?? args.activeWorkspaceId;
  if (!workspaceId) {
    return null;
  }
  return (
    args.workspacePathById[workspaceId] ??
    (args.workspaceDefaultById[workspaceId] ? (args.projectPath ?? null) : null)
  );
}

export function isWorkspaceTargetCurrent(args: {
  state: {
    projectPath: string | null;
    workspaces: WorkspaceSummary[];
    activeWorkspaceId: string;
    workspacePathById: Record<string, string>;
    workspaceDefaultById: Record<string, boolean>;
  };
  workspaceId: string;
  workspacePath?: string | null;
  projectPath?: string | null;
}) {
  if (
    args.projectPath !== undefined &&
    normalizeComparablePath(args.state.projectPath) !==
      normalizeComparablePath(args.projectPath)
  ) {
    return false;
  }
  if (
    !args.state.workspaces.some(
      (workspace) => workspace.id === args.workspaceId,
    )
  ) {
    return false;
  }
  if (args.workspacePath === undefined) {
    return true;
  }

  const currentWorkspacePath = resolveWorkspacePathForId({
    activeWorkspaceId: args.state.activeWorkspaceId,
    workspaceId: args.workspaceId,
    workspacePathById: args.state.workspacePathById,
    workspaceDefaultById: args.state.workspaceDefaultById,
    projectPath: args.state.projectPath,
  });
  return (
    normalizeComparablePath(currentWorkspacePath) ===
    normalizeComparablePath(args.workspacePath)
  );
}
