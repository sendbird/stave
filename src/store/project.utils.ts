import type { WorkspaceSummary } from "@/lib/db/workspaces.db";
import type { Task } from "@/types/chat";
import {
  defaultWorkspaceName,
  starterWorkspaceId,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";
import { resolvePathBaseName } from "@/lib/path-utils";

export { resolvePathBaseName } from "@/lib/path-utils";

const MAX_RECENT_PROJECTS = 12;

export const PROJECT_APPEARANCE_ICON_IDS = [
  "folder",
  "code",
  "layers",
  "package",
  "database",
  "sparkles",
  "bot",
  "blocks",
  "braces",
  "globe",
  "rocket",
  "terminal",
] as const;

export const PROJECT_APPEARANCE_COLOR_IDS = [
  "blue",
  "violet",
  "emerald",
  "amber",
  "rose",
  "slate",
] as const;

export type ProjectAppearanceIconId =
  (typeof PROJECT_APPEARANCE_ICON_IDS)[number];
export type ProjectAppearanceColorId =
  (typeof PROJECT_APPEARANCE_COLOR_IDS)[number];

export interface RecentProjectState {
  projectPath: string;
  projectName: string;
  lastOpenedAt: string;
  defaultBranch: string;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  projectBasePrompt?: string;
  kickoffBranchNamingRule?: string;
  newWorkspaceInitCommand?: string;
  newWorkspaceUseRootNodeModulesSymlink?: boolean;
  appearanceIcon?: ProjectAppearanceIconId;
  appearanceColor?: ProjectAppearanceColorId;
  archivedWorkspacePaths?: string[];
  linkedWorkspacePaths?: string[];
}

export function normalizeProjectAppearanceIcon(
  value?: string | null,
): ProjectAppearanceIconId {
  return PROJECT_APPEARANCE_ICON_IDS.includes(value as ProjectAppearanceIconId)
    ? (value as ProjectAppearanceIconId)
    : "folder";
}

export function normalizeProjectAppearanceColor(
  value?: string | null,
): ProjectAppearanceColorId {
  return PROJECT_APPEARANCE_COLOR_IDS.includes(
    value as ProjectAppearanceColorId,
  )
    ? (value as ProjectAppearanceColorId)
    : "blue";
}

export function normalizeWorkspaceInitCommand(args: { value?: string | null }) {
  return args.value?.trim() ?? "";
}

export function normalizeProjectWorkspaceInitCommand(args: {
  value?: string | null;
}) {
  return normalizeWorkspaceInitCommand({ value: args.value });
}

export function normalizeProjectBasePrompt(args: { value?: string | null }) {
  return args.value?.trim() ?? "";
}

export function normalizeProjectKickoffBranchNamingRule(args: {
  value?: string | null;
}) {
  return args.value?.trim() ?? "";
}

export function normalizeProjectWorkspaceRootNodeModulesSymlinkPreference(args: {
  value?: boolean | null;
}) {
  return args.value === true;
}

export function parseRemoteTrackingBranchName(value?: string | null) {
  const branch = value?.trim();
  if (!branch) {
    return null;
  }

  const separatorIndex = branch.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === branch.length - 1) {
    return null;
  }

  return {
    remoteName: branch.slice(0, separatorIndex),
    localBranch: branch.slice(separatorIndex + 1),
  };
}

export async function resolveWorkspaceRemoteBaseBranchTarget(args: {
  baseBranch?: string | null;
  fromBranchKind?: "local" | "remote";
  verifyRef: (ref: string) => Promise<boolean>;
}) {
  const remoteTarget = parseRemoteTrackingBranchName(args.baseBranch);
  if (!remoteTarget) {
    return null;
  }

  if (args.fromBranchKind === "remote") {
    return remoteTarget;
  }
  if (args.fromBranchKind === "local") {
    return null;
  }

  const baseBranch = args.baseBranch?.trim();
  if (!baseBranch) {
    return null;
  }

  const [hasRemoteTrackingRef, hasLocalRef] = await Promise.all([
    args.verifyRef(`refs/remotes/${baseBranch}`),
    args.verifyRef(`refs/heads/${baseBranch}`),
  ]);

  return hasRemoteTrackingRef && !hasLocalRef ? remoteTarget : null;
}

export function formatWorkspacePathLabel(args: {
  workspacePath?: string;
  projectPath?: string | null;
}) {
  const workspacePath = args.workspacePath?.trim();
  if (!workspacePath) {
    return "";
  }

  const projectPath = args.projectPath?.trim();
  if (projectPath && workspacePath.startsWith(`${projectPath}/`)) {
    return workspacePath.slice(projectPath.length + 1);
  }

  return workspacePath;
}

export function isDefaultWorkspaceName(value?: string | null) {
  return value?.trim().toLowerCase() === defaultWorkspaceName.toLowerCase();
}

function findRecentProjectByPath(args: {
  projectPath?: string | null;
  recentProjects: RecentProjectState[];
}) {
  const projectPath = args.projectPath?.trim();
  if (!projectPath) {
    return null;
  }

  return (
    args.recentProjects.find((item) => item.projectPath === projectPath) ?? null
  );
}

function normalizeRecentProjectPreferences(args: {
  projectBasePrompt?: string | null;
  kickoffBranchNamingRule?: string | null;
  newWorkspaceInitCommand?: string | null;
  newWorkspaceUseRootNodeModulesSymlink?: boolean | null;
  appearanceIcon?: string | null;
  appearanceColor?: string | null;
}) {
  return {
    projectBasePrompt: normalizeProjectBasePrompt({
      value: args.projectBasePrompt,
    }),
    kickoffBranchNamingRule: normalizeProjectKickoffBranchNamingRule({
      value: args.kickoffBranchNamingRule,
    }),
    newWorkspaceInitCommand: normalizeProjectWorkspaceInitCommand({
      value: args.newWorkspaceInitCommand,
    }),
    newWorkspaceUseRootNodeModulesSymlink:
      normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
        value: args.newWorkspaceUseRootNodeModulesSymlink,
      }),
    appearanceIcon: normalizeProjectAppearanceIcon(args.appearanceIcon),
    appearanceColor: normalizeProjectAppearanceColor(args.appearanceColor),
  };
}

export function resolveRecentProjectPreferences(args: {
  projectPath?: string | null;
  recentProjects: RecentProjectState[];
}) {
  return {
    projectBasePrompt: resolveProjectBasePrompt(args),
    kickoffBranchNamingRule: resolveProjectKickoffBranchNamingRule(args),
    newWorkspaceInitCommand: resolveProjectWorkspaceInitCommand(args),
    newWorkspaceUseRootNodeModulesSymlink:
      resolveProjectWorkspaceRootNodeModulesSymlinkPreference(args),
    appearanceIcon: normalizeProjectAppearanceIcon(
      findRecentProjectByPath(args)?.appearanceIcon,
    ),
    appearanceColor: normalizeProjectAppearanceColor(
      findRecentProjectByPath(args)?.appearanceColor,
    ),
  };
}

export function updateCurrentProjectAppearance(args: {
  state: {
    recentProjects: RecentProjectState[];
    projectPath: string | null;
    projectName: string | null;
    defaultBranch: string;
    workspaces: WorkspaceSummary[];
    activeWorkspaceId: string;
    workspaceBranchById: Record<string, string>;
    workspacePathById: Record<string, string>;
    workspaceDefaultById: Record<string, boolean>;
  };
  projectPath?: string;
  icon: ProjectAppearanceIconId;
  color: ProjectAppearanceColorId;
}): RecentProjectState[] | null {
  const projectPath = args.projectPath?.trim() || args.state.projectPath || "";
  if (!projectPath) {
    return null;
  }
  const projects = captureCurrentProjectState(args.state);
  const project = projects.find((item) => item.projectPath === projectPath);
  if (!project) {
    return null;
  }
  const appearanceIcon = normalizeProjectAppearanceIcon(args.icon);
  const appearanceColor = normalizeProjectAppearanceColor(args.color);
  if (
    normalizeProjectAppearanceIcon(project.appearanceIcon) === appearanceIcon &&
    normalizeProjectAppearanceColor(project.appearanceColor) === appearanceColor
  ) {
    return null;
  }
  return upsertRecentProjectState({
    projects,
    project: {
      ...cloneRecentProjectState(project),
      appearanceIcon,
      appearanceColor,
    },
  });
}

export function resolveProjectWorkspaceInitCommand(args: {
  projectPath?: string | null;
  recentProjects: RecentProjectState[];
}) {
  const project = findRecentProjectByPath(args);
  return normalizeProjectWorkspaceInitCommand({
    value: project?.newWorkspaceInitCommand,
  });
}

export function resolveProjectWorkspaceRootNodeModulesSymlinkPreference(args: {
  projectPath?: string | null;
  recentProjects: RecentProjectState[];
}) {
  const project = findRecentProjectByPath(args);
  return normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
    value: project?.newWorkspaceUseRootNodeModulesSymlink,
  });
}

export function resolveProjectBasePrompt(args: {
  projectPath?: string | null;
  recentProjects: RecentProjectState[];
}) {
  const project = findRecentProjectByPath(args);
  return normalizeProjectBasePrompt({ value: project?.projectBasePrompt });
}

export function resolveProjectKickoffBranchNamingRule(args: {
  projectPath?: string | null;
  recentProjects: RecentProjectState[];
}) {
  const project = findRecentProjectByPath(args);
  return normalizeProjectKickoffBranchNamingRule({
    value: project?.kickoffBranchNamingRule,
  });
}

type ProjectTextPreference =
  | { key: "projectBasePrompt"; value: string }
  | { key: "kickoffBranchNamingRule"; value: string };

export function updateCurrentProjectTextPreference(args: {
  state: {
    recentProjects: RecentProjectState[];
    projectPath: string | null;
    projectName: string | null;
    defaultBranch: string;
    workspaces: WorkspaceSummary[];
    activeWorkspaceId: string;
    workspaceBranchById: Record<string, string>;
    workspacePathById: Record<string, string>;
    workspaceDefaultById: Record<string, boolean>;
  };
  projectPath?: string;
  preference: ProjectTextPreference;
}): RecentProjectState[] | null {
  const projectPath = args.projectPath?.trim() || args.state.projectPath || "";
  if (!projectPath) {
    return null;
  }
  const projects = captureCurrentProjectState(args.state);
  const project = projects.find((item) => item.projectPath === projectPath);
  if (!project) {
    return null;
  }
  const normalize =
    args.preference.key === "projectBasePrompt"
      ? normalizeProjectBasePrompt
      : normalizeProjectKickoffBranchNamingRule;
  const nextValue = normalize({ value: args.preference.value });
  if (normalize({ value: project[args.preference.key] }) === nextValue) {
    return null;
  }
  return upsertRecentProjectState({
    projects,
    project: {
      ...cloneRecentProjectState(project),
      [args.preference.key]: nextValue,
    },
  });
}

export function summarizeTerminalCommandDetail(args: {
  stdout?: string;
  stderr?: string;
  fallback: string;
}) {
  const detail = (args.stderr || args.stdout || "").trim();
  if (!detail) {
    return args.fallback;
  }

  return detail.split("\n")[0]?.trim().slice(0, 240) || args.fallback;
}

export function summarizeWorkspaceInitCommand(args: {
  command: string;
  maxLength?: number;
}) {
  const normalized = normalizeWorkspaceInitCommand({ value: args.command });
  const maxLength = args.maxLength ?? 96;
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function buildWorkspaceRootNodeModulesSymlinkCommand(args: {
  projectPath: string;
}) {
  const sourcePath = `${args.projectPath}/node_modules`;
  return [
    "if [ -e node_modules ] || [ -L node_modules ]; then",
    '  echo "node_modules already exists; skipping shared root symlink."',
    `elif [ ! -e ${JSON.stringify(sourcePath)} ] && [ ! -L ${JSON.stringify(sourcePath)} ]; then`,
    '  echo "Repository root is missing node_modules; cannot create shared symlink." >&2',
    "  exit 1",
    "else",
    `  ln -s ${JSON.stringify(sourcePath)} node_modules`,
    "fi",
  ].join("\n");
}

export function buildWorkspaceCreationNotice(args: {
  notices: Array<{ level: "success" | "warning"; message: string }>;
}): { noticeLevel: "success" | "warning"; message: string } | undefined {
  if (args.notices.length === 0) {
    return undefined;
  }

  const noticeLevel = args.notices.some((notice) => notice.level === "warning")
    ? "warning"
    : "success";
  return {
    noticeLevel,
    message: `Workspace created${noticeLevel === "warning" ? ", with warnings" : ""}. ${args.notices.map((notice) => notice.message).join(" ")}`,
  };
}

export function registerTaskWorkspaceOwnership(args: {
  taskWorkspaceIdById: Record<string, string>;
  workspaceId: string;
  tasks: Task[];
}) {
  const next = { ...args.taskWorkspaceIdById };
  for (const task of args.tasks) {
    next[task.id] = args.workspaceId;
  }
  return next;
}

export function retainTaskWorkspaceOwnership(args: {
  taskWorkspaceIdById: Record<string, string>;
  workspaceIds: string[];
}) {
  if (args.workspaceIds.length === 0) {
    return {};
  }

  const workspaceIds = new Set(args.workspaceIds);
  return Object.fromEntries(
    Object.entries(args.taskWorkspaceIdById).filter(([, workspaceId]) =>
      workspaceIds.has(workspaceId),
    ),
  );
}

function findWorkspaceById(args: {
  workspaceId: string;
  workspaces: WorkspaceSummary[];
}) {
  return (
    args.workspaces.find((workspace) => workspace.id === args.workspaceId) ??
    null
  );
}

function findRecentProjectWorkspaceById(args: {
  workspaceId: string;
  recentProjects: RecentProjectState[];
}) {
  for (const project of args.recentProjects) {
    const workspace = findWorkspaceById({
      workspaceId: args.workspaceId,
      workspaces: project.workspaces,
    });
    if (workspace) {
      return { project, workspace };
    }
  }

  return null;
}

export function resolveWorkspaceName(args: {
  state: Pick<
    { workspaces: WorkspaceSummary[]; recentProjects: RecentProjectState[] },
    "workspaces" | "recentProjects"
  >;
  workspaceId: string;
}) {
  const currentWorkspace = findWorkspaceById({
    workspaceId: args.workspaceId,
    workspaces: args.state.workspaces,
  });
  if (currentWorkspace?.name) {
    return currentWorkspace.name;
  }

  const recentWorkspace = findRecentProjectWorkspaceById({
    workspaceId: args.workspaceId,
    recentProjects: args.state.recentProjects,
  });
  if (recentWorkspace?.workspace.name) {
    return recentWorkspace.workspace.name;
  }

  return defaultWorkspaceName;
}

export function resolveProjectForWorkspaceId(args: {
  state: Pick<
    {
      projectPath: string | null;
      projectName: string | null;
      workspaces: WorkspaceSummary[];
      recentProjects: RecentProjectState[];
    },
    "projectPath" | "projectName" | "workspaces" | "recentProjects"
  >;
  workspaceId: string;
}) {
  const currentWorkspace = findWorkspaceById({
    workspaceId: args.workspaceId,
    workspaces: args.state.workspaces,
  });
  if (args.state.projectPath && currentWorkspace) {
    return {
      projectPath: args.state.projectPath,
      projectName:
        args.state.projectName ??
        resolveProjectNameFromPath({ projectPath: args.state.projectPath }),
    };
  }

  const recentWorkspace = findRecentProjectWorkspaceById({
    workspaceId: args.workspaceId,
    recentProjects: args.state.recentProjects,
  });
  if (recentWorkspace) {
    return {
      projectPath: recentWorkspace.project.projectPath,
      projectName: recentWorkspace.project.projectName,
    };
  }

  return null;
}

export function removeWorkspaceRuntimeCacheEntries(args: {
  workspaceRuntimeCacheById: Record<string, WorkspaceSessionState>;
  workspaceIds: string[];
}) {
  if (args.workspaceIds.length === 0) {
    return args.workspaceRuntimeCacheById;
  }
  const ids = new Set(args.workspaceIds);
  return Object.fromEntries(
    Object.entries(args.workspaceRuntimeCacheById).filter(
      ([workspaceId]) => !ids.has(workspaceId),
    ),
  );
}

/**
 * Every workspace the app still knows about, across the registry and the open
 * project. Anything scoped to an id outside this set is a leftover from an
 * archived workspace or a removed project.
 */
export function collectKnownWorkspaceIds(args: {
  recentProjects: readonly { workspaces: readonly { id: string }[] }[];
  workspaces: readonly { id: string }[];
}) {
  const workspaceIds = new Set<string>();
  for (const project of args.recentProjects) {
    for (const workspace of project.workspaces) {
      workspaceIds.add(workspace.id);
    }
  }
  for (const workspace of args.workspaces) {
    workspaceIds.add(workspace.id);
  }
  return workspaceIds;
}

export function areStringArraysEqual(left: string[], right: string[]) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function moveArrayItem<T>(
  items: T[],
  fromIndex: number,
  toIndex: number,
) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (typeof moved === "undefined") {
    return items;
  }
  next.splice(toIndex, 0, moved);
  return next;
}

export function sanitizeBranchName(args: { value: string }) {
  return args.value
    .trim()
    .replaceAll(/[^A-Za-z0-9._/-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function padTimestampSegment(value: number) {
  return String(value).padStart(2, "0");
}

export function formatUtcCompactTimestamp(args?: { date?: Date }) {
  const date = args?.date ?? new Date();
  return [
    `${date.getUTCFullYear()}${padTimestampSegment(date.getUTCMonth() + 1)}${padTimestampSegment(date.getUTCDate())}`,
    `${padTimestampSegment(date.getUTCHours())}${padTimestampSegment(date.getUTCMinutes())}${padTimestampSegment(date.getUTCSeconds())}`,
  ].join("-");
}

export function buildContinueWorkspaceBranchName(args: {
  sourceBranch?: string;
  date?: Date;
}) {
  const normalizedSourceBranch = sanitizeBranchName({
    value: args.sourceBranch ?? "",
  });
  const sourceBranch = normalizedSourceBranch || "follow-up";
  return `${sourceBranch}--continue--${formatUtcCompactTimestamp({ date: args.date })}`;
}

export function toWorkspaceFolderName(args: {
  branch: string;
  unique?: boolean;
}) {
  const legacy = args.branch.replaceAll("/", "__");
  if (args.unique !== true) {
    return legacy;
  }

  const normalized = legacy
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, "-")
    .replaceAll(/^\-|\-$/g, "");
  const readablePrefix = normalized || "workspace";
  const suffix = hashProjectPath(args.branch).slice(0, 8);
  return `${readablePrefix}--${suffix}`;
}

export function resolveProjectNameFromPath(args: { projectPath: string }) {
  return resolvePathBaseName({ path: args.projectPath, fallback: "project" });
}

export function normalizeProjectDisplayName(args: {
  projectPath: string;
  projectName?: string | null;
}) {
  const fallbackName = resolveProjectNameFromPath({
    projectPath: args.projectPath,
  });
  const normalized = args.projectName?.trim();
  if (!normalized) {
    return fallbackName;
  }
  if (
    normalized.toLowerCase() === "project" &&
    fallbackName.toLowerCase() !== "project"
  ) {
    return fallbackName;
  }
  return normalized;
}

export function hashProjectPath(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildProjectDefaultWorkspaceId(args: {
  projectPath?: string | null;
}) {
  const projectPath = args.projectPath?.trim();
  return projectPath
    ? `base:${hashProjectPath(normalizeComparablePath(projectPath))}`
    : starterWorkspaceId;
}

export function buildImportedWorktreeWorkspaceId(args: {
  projectPath: string;
  worktreePath: string;
}) {
  return `worktree:${hashProjectPath(`${normalizeComparablePath(args.projectPath)}::${normalizeComparablePath(args.worktreePath)}`)}`;
}

/**
 * Quote a user-typed path for a shell command while preserving a leading `~`
 * so the shell can still expand it to the user's home directory.
 */
export function toShellPathArgument(args: { path: string }) {
  const trimmed = args.path.trim();
  if (trimmed === "~") {
    return "~";
  }
  if (trimmed.startsWith("~/")) {
    return `~/${JSON.stringify(trimmed.slice(2))}`;
  }
  return JSON.stringify(trimmed);
}

export function buildLinkedWorktreeFolderName(args: { worktreePath: string }) {
  const readable =
    resolvePathBaseName({ path: args.worktreePath, fallback: "worktree" })
      .toLowerCase()
      .replaceAll(/[^a-z0-9._-]+/g, "-")
      .replaceAll(/^\-|\-$/g, "") || "worktree";
  return `${readable}--${hashProjectPath(normalizeComparablePath(args.worktreePath))}`;
}

export function buildLinkedWorktreeSymlinkPath(args: {
  projectPath: string;
  worktreePath: string;
}) {
  return `${args.projectPath}/.stave/workspaces/${buildLinkedWorktreeFolderName(
    {
      worktreePath: args.worktreePath,
    },
  )}`;
}

export function normalizeArchivedWorkspacePaths(args: {
  paths?: Array<string | null | undefined> | null;
}) {
  const normalizedPaths: string[] = [];
  const seen = new Set<string>();
  for (const path of args.paths ?? []) {
    const normalizedPath = normalizeComparablePath(path);
    if (!normalizedPath || seen.has(normalizedPath)) {
      continue;
    }
    normalizedPaths.push(normalizedPath);
    seen.add(normalizedPath);
  }
  return normalizedPaths;
}

export function mergeArchivedWorkspacePaths(args: {
  current?: Array<string | null | undefined> | null;
  add?: Array<string | null | undefined> | null;
  remove?: Array<string | null | undefined> | null;
}) {
  const removedPaths = new Set(
    normalizeArchivedWorkspacePaths({ paths: args.remove }),
  );
  return normalizeArchivedWorkspacePaths({
    paths: [...(args.current ?? []), ...(args.add ?? [])],
  }).filter((path) => !removedPaths.has(path));
}

/**
 * Reconcile archived-workspace tombstones for one project across two durable
 * sources (the SQLite project registry mirror and the localStorage cache).
 *
 * Losing a tombstone from either source must not resurrect an archived
 * workspace, so the sources are unioned. A stale tombstone must never hide a
 * workspace the user re-created at the same path either, so any path that is
 * currently registered as a workspace is dropped from the union.
 */
export function reconcileArchivedWorkspacePaths(args: {
  primary?: Array<string | null | undefined> | null;
  secondary?: Array<string | null | undefined> | null;
  workspacePathById?: Record<string, string> | null;
}): string[] {
  const registeredPaths = new Set(
    Object.values(args.workspacePathById ?? {})
      .map((path) => normalizeComparablePath(path))
      .filter(Boolean),
  );
  return normalizeArchivedWorkspacePaths({
    paths: [...(args.primary ?? []), ...(args.secondary ?? [])],
  }).filter((path) => !registeredPaths.has(path));
}

export function resolveImportedWorktreeName(args: {
  branch?: string | null;
  worktreePath: string;
}) {
  return (
    args.branch?.trim() ||
    resolveProjectNameFromPath({ projectPath: args.worktreePath })
  );
}

export function resolveCurrentProjectDefaultWorkspaceId(args: {
  projectPath?: string | null;
  workspaces: WorkspaceSummary[];
  workspaceDefaultById: Record<string, boolean>;
  workspacePathById?: Record<string, string>;
}) {
  const expectedDefaultWorkspaceId = buildProjectDefaultWorkspaceId({
    projectPath: args.projectPath,
  });
  const comparableProjectPath = normalizeComparablePath(args.projectPath);
  const workspaceIds = new Set(
    args.workspaces.map((workspace) => workspace.id),
  );
  const workspacePathById = args.workspacePathById ?? {};

  if (expectedDefaultWorkspaceId !== starterWorkspaceId) {
    if (
      args.workspaceDefaultById[expectedDefaultWorkspaceId] ||
      workspaceIds.has(expectedDefaultWorkspaceId)
    ) {
      return expectedDefaultWorkspaceId;
    }
  }

  const rememberedDefaultWorkspaceId = Object.entries(
    args.workspaceDefaultById,
  ).find(([workspaceId, isDefault]) => {
    if (!isDefault) {
      return false;
    }
    if (
      workspaceId !== starterWorkspaceId &&
      workspaceId !== expectedDefaultWorkspaceId &&
      !workspaceIds.has(workspaceId)
    ) {
      return false;
    }
    if (!comparableProjectPath) {
      return true;
    }

    const comparableWorkspacePath = normalizeComparablePath(
      workspacePathById[workspaceId],
    );
    if (comparableWorkspacePath) {
      return comparableWorkspacePath === comparableProjectPath;
    }

    if (
      workspaceId === starterWorkspaceId ||
      workspaceId === expectedDefaultWorkspaceId
    ) {
      return true;
    }

    const workspace = args.workspaces.find((item) => item.id === workspaceId);
    return isDefaultWorkspaceName(workspace?.name);
  })?.[0];
  if (rememberedDefaultWorkspaceId) {
    return rememberedDefaultWorkspaceId;
  }
  if (comparableProjectPath) {
    const rootWorkspace = args.workspaces.find(
      (workspace) =>
        normalizeComparablePath(workspacePathById[workspace.id]) ===
        comparableProjectPath,
    );
    if (rootWorkspace) {
      return rootWorkspace.id;
    }
  }
  const compatibleNamedDefaultWorkspace = args.workspaces.find(
    (workspace) =>
      isDefaultWorkspaceName(workspace.name) &&
      (!comparableProjectPath ||
        normalizeComparablePath(workspacePathById[workspace.id]) ===
          comparableProjectPath),
  );
  return (
    args.workspaces.find((workspace) => workspace.id === starterWorkspaceId)
      ?.id ??
    compatibleNamedDefaultWorkspace?.id ??
    expectedDefaultWorkspaceId
  );
}

function normalizeRecentProjectStateEntry(
  project: RecentProjectState,
): RecentProjectState | null {
  const projectPath = project?.projectPath?.trim();
  if (!projectPath) {
    return null;
  }

  const lastOpenedAt = project.lastOpenedAt?.trim() || new Date().toISOString();
  const defaultBranch = project.defaultBranch?.trim() || "main";
  const workspaceBranchById = { ...(project.workspaceBranchById ?? {}) };
  const workspacePathById = { ...(project.workspacePathById ?? {}) };
  const archivedWorkspacePaths = normalizeArchivedWorkspacePaths({
    paths: project.archivedWorkspacePaths,
  });
  const linkedWorkspacePaths = normalizeArchivedWorkspacePaths({
    paths: project.linkedWorkspacePaths,
  });
  const providedWorkspaces = Array.isArray(project.workspaces)
    ? project.workspaces.filter((workspace) =>
        Boolean(workspace?.id && workspace?.name),
      )
    : [];
  const defaultWorkspaceId = resolveCurrentProjectDefaultWorkspaceId({
    projectPath,
    workspaces: providedWorkspaces,
    workspaceDefaultById: { ...(project.workspaceDefaultById ?? {}) },
    workspacePathById,
  });
  const comparableProjectPath = normalizeComparablePath(projectPath);
  const defaultWorkspaceSource = providedWorkspaces.find(
    (workspace) =>
      workspace.id === defaultWorkspaceId ||
      normalizeComparablePath(workspacePathById[workspace.id]) ===
        comparableProjectPath,
  );
  const workspaces: WorkspaceSummary[] = [
    {
      id: defaultWorkspaceId,
      name: defaultWorkspaceName,
      updatedAt: defaultWorkspaceSource?.updatedAt || lastOpenedAt,
    },
  ];
  const seenWorkspaceIds = new Set([defaultWorkspaceId]);

  for (const workspace of providedWorkspaces) {
    const comparableWorkspacePath = normalizeComparablePath(
      workspacePathById[workspace.id],
    );
    const representsProjectRoot =
      workspace.id === defaultWorkspaceId ||
      comparableWorkspacePath === comparableProjectPath ||
      isDefaultWorkspaceName(workspace.name);
    if (representsProjectRoot || seenWorkspaceIds.has(workspace.id)) {
      continue;
    }
    workspaces.push({
      id: workspace.id,
      name: workspace.name,
      updatedAt: workspace.updatedAt || lastOpenedAt,
    });
    seenWorkspaceIds.add(workspace.id);
  }

  const nextWorkspaceBranchById: Record<string, string> = {
    [defaultWorkspaceId]:
      workspaceBranchById[defaultWorkspaceId] ||
      (defaultWorkspaceSource
        ? workspaceBranchById[defaultWorkspaceSource.id]
        : undefined) ||
      defaultBranch,
  };
  const nextWorkspacePathById: Record<string, string> = {
    [defaultWorkspaceId]: projectPath,
  };
  const nextWorkspaceDefaultById: Record<string, boolean> = {
    [defaultWorkspaceId]: true,
  };

  for (const workspace of workspaces) {
    if (workspace.id === defaultWorkspaceId) {
      continue;
    }
    nextWorkspaceBranchById[workspace.id] =
      workspaceBranchById[workspace.id] || workspace.name;
    const preservedPath = workspacePathById[workspace.id]?.trim();
    if (preservedPath) {
      nextWorkspacePathById[workspace.id] = preservedPath;
    }
    nextWorkspaceDefaultById[workspace.id] = false;
  }

  const activeWorkspaceId = workspaces.some(
    (workspace) => workspace.id === project.activeWorkspaceId,
  )
    ? project.activeWorkspaceId
    : defaultWorkspaceId;

  return {
    projectPath,
    projectName: normalizeProjectDisplayName({
      projectPath,
      projectName: project.projectName,
    }),
    lastOpenedAt,
    defaultBranch,
    workspaces,
    activeWorkspaceId,
    workspaceBranchById: nextWorkspaceBranchById,
    workspacePathById: nextWorkspacePathById,
    workspaceDefaultById: nextWorkspaceDefaultById,
    ...(archivedWorkspacePaths.length > 0 ? { archivedWorkspacePaths } : {}),
    ...(linkedWorkspacePaths.length > 0 ? { linkedWorkspacePaths } : {}),
    ...normalizeRecentProjectPreferences({
      projectBasePrompt: project.projectBasePrompt,
      kickoffBranchNamingRule: project.kickoffBranchNamingRule,
      newWorkspaceInitCommand: project.newWorkspaceInitCommand,
      newWorkspaceUseRootNodeModulesSymlink:
        project.newWorkspaceUseRootNodeModulesSymlink,
      appearanceIcon: project.appearanceIcon,
      appearanceColor: project.appearanceColor,
    }),
  };
}

export function normalizeCurrentProjectState(args: {
  projectPath: string | null;
  projectName: string | null;
  defaultBranch: string;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  recentProjects: RecentProjectState[];
}) {
  const projectPath = args.projectPath?.trim();
  if (!projectPath) {
    return null;
  }

  const rememberedProject = findRecentProjectByPath({
    projectPath,
    recentProjects: args.recentProjects,
  });
  return normalizeRecentProjectStateEntry({
    projectPath,
    projectName:
      args.projectName?.trim() ||
      rememberedProject?.projectName ||
      resolveProjectNameFromPath({ projectPath }),
    lastOpenedAt: rememberedProject?.lastOpenedAt || new Date().toISOString(),
    defaultBranch:
      args.defaultBranch || rememberedProject?.defaultBranch || "main",
    workspaces: args.workspaces,
    activeWorkspaceId: args.activeWorkspaceId,
    workspaceBranchById: args.workspaceBranchById,
    workspacePathById: args.workspacePathById,
    workspaceDefaultById: args.workspaceDefaultById,
    projectBasePrompt: rememberedProject?.projectBasePrompt,
    kickoffBranchNamingRule: rememberedProject?.kickoffBranchNamingRule,
    newWorkspaceInitCommand: rememberedProject?.newWorkspaceInitCommand,
    newWorkspaceUseRootNodeModulesSymlink:
      rememberedProject?.newWorkspaceUseRootNodeModulesSymlink,
  });
}

export function resolveTaskWorkspaceContext(args: {
  taskId: string;
  activeWorkspaceId: string;
  taskWorkspaceIdById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById?: Record<string, boolean>;
  projectPath?: string | null;
}) {
  const ownedWorkspaceId = args.taskWorkspaceIdById[args.taskId];
  const workspaceId = ownedWorkspaceId ?? args.activeWorkspaceId;
  const projectPath = args.projectPath?.trim();
  const workspacePath = args.workspacePathById[workspaceId]?.trim();
  const canUseProjectRoot =
    args.workspaceDefaultById?.[workspaceId] === true ||
    ownedWorkspaceId === undefined;

  return {
    workspaceId,
    cwd:
      workspacePath ||
      (args.workspaceDefaultById?.[workspaceId] ? projectPath : undefined) ||
      (canUseProjectRoot ? projectPath : undefined) ||
      undefined,
  };
}

export function cloneRecentProjectState(
  project: RecentProjectState,
): RecentProjectState {
  const {
    archivedWorkspacePaths: rawArchivedWorkspacePaths,
    linkedWorkspacePaths: rawLinkedWorkspacePaths,
    ...projectRest
  } = project;
  const archivedWorkspacePaths = normalizeArchivedWorkspacePaths({
    paths: rawArchivedWorkspacePaths,
  });
  const linkedWorkspacePaths = normalizeArchivedWorkspacePaths({
    paths: rawLinkedWorkspacePaths,
  });
  return {
    ...projectRest,
    workspaces: [...project.workspaces],
    workspaceBranchById: { ...project.workspaceBranchById },
    workspacePathById: { ...project.workspacePathById },
    workspaceDefaultById: { ...project.workspaceDefaultById },
    ...(archivedWorkspacePaths.length > 0 ? { archivedWorkspacePaths } : {}),
    ...(linkedWorkspacePaths.length > 0 ? { linkedWorkspacePaths } : {}),
    ...normalizeRecentProjectPreferences({
      projectBasePrompt: project.projectBasePrompt,
      kickoffBranchNamingRule: project.kickoffBranchNamingRule,
      newWorkspaceInitCommand: project.newWorkspaceInitCommand,
      newWorkspaceUseRootNodeModulesSymlink:
        project.newWorkspaceUseRootNodeModulesSymlink,
      appearanceIcon: project.appearanceIcon,
      appearanceColor: project.appearanceColor,
    }),
  };
}

export function normalizeRecentProjectStates(args: {
  projects?: RecentProjectState[] | null;
}) {
  let normalizedProjects: RecentProjectState[] = [];

  for (const project of args.projects ?? []) {
    const normalizedProject = normalizeRecentProjectStateEntry(project);
    if (!normalizedProject) {
      continue;
    }
    normalizedProjects = upsertRecentProjectState({
      projects: normalizedProjects,
      project: normalizedProject,
    });
  }

  return normalizedProjects;
}

export function upsertRecentProjectState(args: {
  projects: RecentProjectState[];
  project: RecentProjectState;
}) {
  const existingProject = args.projects.find(
    (item) => item.projectPath === args.project.projectPath,
  );
  const normalizedProject = normalizeRecentProjectStateEntry({
    ...args.project,
    archivedWorkspacePaths:
      args.project.archivedWorkspacePaths ??
      existingProject?.archivedWorkspacePaths,
    linkedWorkspacePaths:
      args.project.linkedWorkspacePaths ??
      existingProject?.linkedWorkspacePaths,
  });
  if (!normalizedProject) {
    return args.projects.map((project) => cloneRecentProjectState(project));
  }
  const nextProject = cloneRecentProjectState(normalizedProject);
  const existingIndex = args.projects.findIndex(
    (item) => item.projectPath === normalizedProject.projectPath,
  );
  if (existingIndex >= 0) {
    return args.projects.map((item, index) =>
      index === existingIndex ? nextProject : cloneRecentProjectState(item),
    );
  }
  return [
    ...args.projects.map((project) => cloneRecentProjectState(project)),
    nextProject,
  ].slice(-MAX_RECENT_PROJECTS);
}

export function captureCurrentProjectState(args: {
  recentProjects: RecentProjectState[];
  projectPath: string | null;
  projectName: string | null;
  defaultBranch: string;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  archivedWorkspacePathsToAdd?: Array<string | null | undefined>;
  archivedWorkspacePathsToRemove?: Array<string | null | undefined>;
  linkedWorkspacePathsToAdd?: Array<string | null | undefined>;
  linkedWorkspacePathsToRemove?: Array<string | null | undefined>;
}): RecentProjectState[] {
  if (!args.projectPath) {
    return args.recentProjects.map((project) =>
      cloneRecentProjectState(project),
    );
  }
  const rememberedProject = findRecentProjectByPath({
    projectPath: args.projectPath,
    recentProjects: args.recentProjects,
  });
  const archivedWorkspacePaths = mergeArchivedWorkspacePaths({
    current: rememberedProject?.archivedWorkspacePaths,
    add: args.archivedWorkspacePathsToAdd,
    remove: args.archivedWorkspacePathsToRemove,
  });
  const shouldWriteArchivedWorkspacePaths =
    archivedWorkspacePaths.length > 0 ||
    args.archivedWorkspacePathsToAdd !== undefined ||
    args.archivedWorkspacePathsToRemove !== undefined;
  const linkedWorkspacePaths = mergeArchivedWorkspacePaths({
    current: rememberedProject?.linkedWorkspacePaths,
    add: args.linkedWorkspacePathsToAdd,
    remove: args.linkedWorkspacePathsToRemove,
  });
  const shouldWriteLinkedWorkspacePaths =
    linkedWorkspacePaths.length > 0 ||
    args.linkedWorkspacePathsToAdd !== undefined ||
    args.linkedWorkspacePathsToRemove !== undefined;
  return upsertRecentProjectState({
    projects: args.recentProjects,
    project: {
      projectPath: args.projectPath,
      projectName: normalizeProjectDisplayName({
        projectPath: args.projectPath,
        projectName: args.projectName,
      }),
      lastOpenedAt: new Date().toISOString(),
      defaultBranch: args.defaultBranch,
      workspaces: args.workspaces,
      activeWorkspaceId: args.activeWorkspaceId,
      workspaceBranchById: args.workspaceBranchById,
      workspacePathById: args.workspacePathById,
      workspaceDefaultById: args.workspaceDefaultById,
      ...(shouldWriteArchivedWorkspacePaths ? { archivedWorkspacePaths } : {}),
      ...(shouldWriteLinkedWorkspacePaths ? { linkedWorkspacePaths } : {}),
      ...resolveRecentProjectPreferences({
        projectPath: args.projectPath,
        recentProjects: args.recentProjects,
      }),
    },
  });
}
