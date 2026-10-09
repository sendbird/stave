import { i18n } from "@/i18n/runtime";
import type { WorkspaceSummary } from "@/lib/db/workspaces.db";
import type { Task } from "@/types/chat";
import {
  defaultWorkspaceName,
  starterWorkspaceId,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";
import { resolvePathBaseName } from "@/lib/path-utils";
import {
  normalizeProjectSettingsOverrides,
  type ProjectSettingsOverrides,
} from "@/store/project-settings-overrides";

export { resolvePathBaseName } from "@/lib/path-utils";

const MAX_RECENT_REPOSITORIES = 12;

export const REPOSITORY_APPEARANCE_ICON_IDS = [
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

export const REPOSITORY_APPEARANCE_COLOR_IDS = [
  "blue",
  "violet",
  "emerald",
  "amber",
  "rose",
  "slate",
] as const;

export type RepositoryAppearanceIconId =
  (typeof REPOSITORY_APPEARANCE_ICON_IDS)[number];
export type RepositoryAppearanceColorId =
  (typeof REPOSITORY_APPEARANCE_COLOR_IDS)[number];

export interface RecentRepositoryState {
  repositoryPath: string;
  repositoryName: string;
  lastOpenedAt: string;
  defaultBranch: string;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  /**
   * Last time the user actually worked in each workspace. Distinct from
   * `WorkspaceSummary.updatedAt`, which bumps on any snapshot flush and so
   * cannot tell a live workspace apart from a dormant one.
   */
  workspaceLastActiveAtById?: Record<string, string>;
  repositoryBasePrompt?: string;
  kickoffBranchNamingRule?: string;
  newWorkspaceInitCommand?: string;
  newWorkspaceUseRootNodeModulesSymlink?: boolean;
  appearanceIcon?: RepositoryAppearanceIconId;
  appearanceColor?: RepositoryAppearanceColorId;
  archivedWorkspacePaths?: string[];
  linkedWorkspacePaths?: string[];
  /**
   * Settings scope: this project's values for the allow-listed settings in
   * `project-settings-overrides.ts`. Travels with the repository entry, so
   * removing the repository removes its overrides.
   */
  settingsOverrides?: ProjectSettingsOverrides;
}

export function normalizeRepositoryAppearanceIcon(
  value?: string | null,
): RepositoryAppearanceIconId {
  return REPOSITORY_APPEARANCE_ICON_IDS.includes(value as RepositoryAppearanceIconId)
    ? (value as RepositoryAppearanceIconId)
    : "folder";
}

export function normalizeRepositoryAppearanceColor(
  value?: string | null,
): RepositoryAppearanceColorId {
  return REPOSITORY_APPEARANCE_COLOR_IDS.includes(
    value as RepositoryAppearanceColorId,
  )
    ? (value as RepositoryAppearanceColorId)
    : "blue";
}

export function normalizeWorkspaceInitCommand(args: { value?: string | null }) {
  return args.value?.trim() ?? "";
}

export function normalizeRepositoryWorkspaceInitCommand(args: {
  value?: string | null;
}) {
  return normalizeWorkspaceInitCommand({ value: args.value });
}

export function normalizeRepositoryBasePrompt(args: { value?: string | null }) {
  return args.value?.trim() ?? "";
}

export function normalizeRepositoryKickoffBranchNamingRule(args: {
  value?: string | null;
}) {
  return args.value?.trim() ?? "";
}

export function normalizeRepositoryWorkspaceRootNodeModulesSymlinkPreference(args: {
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
  repositoryPath?: string | null;
}) {
  const workspacePath = args.workspacePath?.trim();
  if (!workspacePath) {
    return "";
  }

  const repositoryPath = args.repositoryPath?.trim();
  if (repositoryPath && workspacePath.startsWith(`${repositoryPath}/`)) {
    return workspacePath.slice(repositoryPath.length + 1);
  }

  return workspacePath;
}

export function isDefaultWorkspaceName(value?: string | null) {
  return value?.trim().toLowerCase() === defaultWorkspaceName.toLowerCase();
}

function findRecentRepositoryByPath(args: {
  repositoryPath?: string | null;
  recentRepositories: RecentRepositoryState[];
}) {
  const repositoryPath = args.repositoryPath?.trim();
  if (!repositoryPath) {
    return null;
  }

  return (
    args.recentRepositories.find((item) => item.repositoryPath === repositoryPath) ?? null
  );
}

function normalizeRecentRepositoryPreferences(args: {
  repositoryBasePrompt?: string | null;
  kickoffBranchNamingRule?: string | null;
  newWorkspaceInitCommand?: string | null;
  newWorkspaceUseRootNodeModulesSymlink?: boolean | null;
  appearanceIcon?: string | null;
  appearanceColor?: string | null;
  settingsOverrides?: unknown;
}) {
  return {
    ...normalizeSettingsOverridesField(args.settingsOverrides),
    repositoryBasePrompt: normalizeRepositoryBasePrompt({
      value: args.repositoryBasePrompt,
    }),
    kickoffBranchNamingRule: normalizeRepositoryKickoffBranchNamingRule({
      value: args.kickoffBranchNamingRule,
    }),
    newWorkspaceInitCommand: normalizeRepositoryWorkspaceInitCommand({
      value: args.newWorkspaceInitCommand,
    }),
    newWorkspaceUseRootNodeModulesSymlink:
      normalizeRepositoryWorkspaceRootNodeModulesSymlinkPreference({
        value: args.newWorkspaceUseRootNodeModulesSymlink,
      }),
    appearanceIcon: normalizeRepositoryAppearanceIcon(args.appearanceIcon),
    appearanceColor: normalizeRepositoryAppearanceColor(args.appearanceColor),
  };
}

export function resolveRecentRepositoryPreferences(args: {
  repositoryPath?: string | null;
  recentRepositories: RecentRepositoryState[];
}) {
  return {
    repositoryBasePrompt: resolveRepositoryBasePrompt(args),
    kickoffBranchNamingRule: resolveRepositoryKickoffBranchNamingRule(args),
    newWorkspaceInitCommand: resolveRepositoryWorkspaceInitCommand(args),
    newWorkspaceUseRootNodeModulesSymlink:
      resolveRepositoryWorkspaceRootNodeModulesSymlinkPreference(args),
    appearanceIcon: normalizeRepositoryAppearanceIcon(
      findRecentRepositoryByPath(args)?.appearanceIcon,
    ),
    appearanceColor: normalizeRepositoryAppearanceColor(
      findRecentRepositoryByPath(args)?.appearanceColor,
    ),
    ...normalizeSettingsOverridesField(
      findRecentRepositoryByPath(args)?.settingsOverrides,
    ),
  };
}

function normalizeSettingsOverridesField(value: unknown) {
  const settingsOverrides = normalizeProjectSettingsOverrides(value);
  return settingsOverrides ? { settingsOverrides } : {};
}

export function updateCurrentRepositoryAppearance(args: {
  state: {
    recentRepositories: RecentRepositoryState[];
    repositoryPath: string | null;
    repositoryName: string | null;
    defaultBranch: string;
    workspaces: WorkspaceSummary[];
    activeWorkspaceId: string;
    workspaceBranchById: Record<string, string>;
    workspacePathById: Record<string, string>;
    workspaceDefaultById: Record<string, boolean>;
    workspaceLastActiveAtById?: Record<string, string>;
  };
  repositoryPath?: string;
  icon: RepositoryAppearanceIconId;
  color: RepositoryAppearanceColorId;
}): RecentRepositoryState[] | null {
  const repositoryPath = args.repositoryPath?.trim() || args.state.repositoryPath || "";
  if (!repositoryPath) {
    return null;
  }
  const repositories = captureCurrentRepositoryState(args.state);
  const repository = repositories.find((item) => item.repositoryPath === repositoryPath);
  if (!repository) {
    return null;
  }
  const appearanceIcon = normalizeRepositoryAppearanceIcon(args.icon);
  const appearanceColor = normalizeRepositoryAppearanceColor(args.color);
  if (
    normalizeRepositoryAppearanceIcon(repository.appearanceIcon) === appearanceIcon &&
    normalizeRepositoryAppearanceColor(repository.appearanceColor) === appearanceColor
  ) {
    return null;
  }
  return upsertRecentRepositoryState({
    repositories,
    repository: {
      ...cloneRecentRepositoryState(repository),
      appearanceIcon,
      appearanceColor,
    },
  });
}

export function resolveRepositoryWorkspaceInitCommand(args: {
  repositoryPath?: string | null;
  recentRepositories: RecentRepositoryState[];
}) {
  const repository = findRecentRepositoryByPath(args);
  return normalizeRepositoryWorkspaceInitCommand({
    value: repository?.newWorkspaceInitCommand,
  });
}

export function resolveRepositoryWorkspaceRootNodeModulesSymlinkPreference(args: {
  repositoryPath?: string | null;
  recentRepositories: RecentRepositoryState[];
}) {
  const repository = findRecentRepositoryByPath(args);
  return normalizeRepositoryWorkspaceRootNodeModulesSymlinkPreference({
    value: repository?.newWorkspaceUseRootNodeModulesSymlink,
  });
}

export function resolveRepositoryBasePrompt(args: {
  repositoryPath?: string | null;
  recentRepositories: RecentRepositoryState[];
}) {
  const repository = findRecentRepositoryByPath(args);
  return normalizeRepositoryBasePrompt({ value: repository?.repositoryBasePrompt });
}

export function resolveRepositoryKickoffBranchNamingRule(args: {
  repositoryPath?: string | null;
  recentRepositories: RecentRepositoryState[];
}) {
  const repository = findRecentRepositoryByPath(args);
  return normalizeRepositoryKickoffBranchNamingRule({
    value: repository?.kickoffBranchNamingRule,
  });
}

type RepositoryTextPreference =
  | { key: "repositoryBasePrompt"; value: string }
  | { key: "kickoffBranchNamingRule"; value: string };

export function updateCurrentRepositoryTextPreference(args: {
  state: {
    recentRepositories: RecentRepositoryState[];
    repositoryPath: string | null;
    repositoryName: string | null;
    defaultBranch: string;
    workspaces: WorkspaceSummary[];
    activeWorkspaceId: string;
    workspaceBranchById: Record<string, string>;
    workspacePathById: Record<string, string>;
    workspaceDefaultById: Record<string, boolean>;
    workspaceLastActiveAtById?: Record<string, string>;
  };
  repositoryPath?: string;
  preference: RepositoryTextPreference;
}): RecentRepositoryState[] | null {
  const repositoryPath = args.repositoryPath?.trim() || args.state.repositoryPath || "";
  if (!repositoryPath) {
    return null;
  }
  const repositories = captureCurrentRepositoryState(args.state);
  const repository = repositories.find((item) => item.repositoryPath === repositoryPath);
  if (!repository) {
    return null;
  }
  const normalize =
    args.preference.key === "repositoryBasePrompt"
      ? normalizeRepositoryBasePrompt
      : normalizeRepositoryKickoffBranchNamingRule;
  const nextValue = normalize({ value: args.preference.value });
  if (normalize({ value: repository[args.preference.key] }) === nextValue) {
    return null;
  }
  return upsertRecentRepositoryState({
    repositories,
    repository: {
      ...cloneRecentRepositoryState(repository),
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
  repositoryPath: string;
}) {
  const sourcePath = `${args.repositoryPath}/node_modules`;
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
    message: i18n.t("notifications:repositoryUtils.workspaceCreated", { warnings: noticeLevel === "warning" ? i18n.t("notifications:repositoryUtils.withWarnings") : "", detail: args.notices.map((notice) => notice.message).join(" ") }),
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

function findRecentRepositoryWorkspaceById(args: {
  workspaceId: string;
  recentRepositories: RecentRepositoryState[];
}) {
  for (const repository of args.recentRepositories) {
    const workspace = findWorkspaceById({
      workspaceId: args.workspaceId,
      workspaces: repository.workspaces,
    });
    if (workspace) {
      return { project: repository, workspace };
    }
  }

  return null;
}

export function resolveWorkspaceName(args: {
  state: Pick<
    { workspaces: WorkspaceSummary[]; recentRepositories: RecentRepositoryState[] },
    "workspaces" | "recentRepositories"
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

  const recentWorkspace = findRecentRepositoryWorkspaceById({
    workspaceId: args.workspaceId,
    recentRepositories: args.state.recentRepositories,
  });
  if (recentWorkspace?.workspace.name) {
    return recentWorkspace.workspace.name;
  }

  return defaultWorkspaceName;
}

export function resolveRepositoryForWorkspaceId(args: {
  state: Pick<
    {
      repositoryPath: string | null;
      repositoryName: string | null;
      workspaces: WorkspaceSummary[];
      recentRepositories: RecentRepositoryState[];
    },
    "repositoryPath" | "repositoryName" | "workspaces" | "recentRepositories"
  >;
  workspaceId: string;
}) {
  const currentWorkspace = findWorkspaceById({
    workspaceId: args.workspaceId,
    workspaces: args.state.workspaces,
  });
  if (args.state.repositoryPath && currentWorkspace) {
    return {
      repositoryPath: args.state.repositoryPath,
      repositoryName:
        args.state.repositoryName ??
        resolveRepositoryNameFromPath({ repositoryPath: args.state.repositoryPath }),
    };
  }

  const recentWorkspace = findRecentRepositoryWorkspaceById({
    workspaceId: args.workspaceId,
    recentRepositories: args.state.recentRepositories,
  });
  if (recentWorkspace) {
    return {
      repositoryPath: recentWorkspace.project.repositoryPath,
      repositoryName: recentWorkspace.project.repositoryName,
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
  const suffix = hashRepositoryPath(args.branch).slice(0, 8);
  return `${readablePrefix}--${suffix}`;
}

export function resolveRepositoryNameFromPath(args: { repositoryPath: string }) {
  return resolvePathBaseName({ path: args.repositoryPath, fallback: "project" });
}

export function normalizeRepositoryDisplayName(args: {
  repositoryPath: string;
  repositoryName?: string | null;
}) {
  const fallbackName = resolveRepositoryNameFromPath({
    repositoryPath: args.repositoryPath,
  });
  const normalized = args.repositoryName?.trim();
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

export function hashRepositoryPath(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildRepositoryDefaultWorkspaceId(args: {
  repositoryPath?: string | null;
}) {
  const repositoryPath = args.repositoryPath?.trim();
  return repositoryPath
    ? `base:${hashRepositoryPath(normalizeComparablePath(repositoryPath))}`
    : starterWorkspaceId;
}

export function buildImportedWorktreeWorkspaceId(args: {
  repositoryPath: string;
  worktreePath: string;
}) {
  return `worktree:${hashRepositoryPath(`${normalizeComparablePath(args.repositoryPath)}::${normalizeComparablePath(args.worktreePath)}`)}`;
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
  return `${readable}--${hashRepositoryPath(normalizeComparablePath(args.worktreePath))}`;
}

export function buildLinkedWorktreeSymlinkPath(args: {
  repositoryPath: string;
  worktreePath: string;
}) {
  return `${args.repositoryPath}/.stave/workspaces/${buildLinkedWorktreeFolderName(
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
 * Reconcile archived-workspace tombstones for one repository across two durable
 * sources (the SQLite repository registry mirror and the localStorage cache).
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
    resolveRepositoryNameFromPath({ repositoryPath: args.worktreePath })
  );
}

export function resolveCurrentRepositoryDefaultWorkspaceId(args: {
  repositoryPath?: string | null;
  workspaces: WorkspaceSummary[];
  workspaceDefaultById: Record<string, boolean>;
  workspacePathById?: Record<string, string>;
}) {
  const expectedDefaultWorkspaceId = buildRepositoryDefaultWorkspaceId({
    repositoryPath: args.repositoryPath,
  });
  const comparableRepositoryPath = normalizeComparablePath(args.repositoryPath);
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
    if (!comparableRepositoryPath) {
      return true;
    }

    const comparableWorkspacePath = normalizeComparablePath(
      workspacePathById[workspaceId],
    );
    if (comparableWorkspacePath) {
      return comparableWorkspacePath === comparableRepositoryPath;
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
  if (comparableRepositoryPath) {
    const rootWorkspace = args.workspaces.find(
      (workspace) =>
        normalizeComparablePath(workspacePathById[workspace.id]) ===
        comparableRepositoryPath,
    );
    if (rootWorkspace) {
      return rootWorkspace.id;
    }
  }
  const compatibleNamedDefaultWorkspace = args.workspaces.find(
    (workspace) =>
      isDefaultWorkspaceName(workspace.name) &&
      (!comparableRepositoryPath ||
        normalizeComparablePath(workspacePathById[workspace.id]) ===
          comparableRepositoryPath),
  );
  return (
    args.workspaces.find((workspace) => workspace.id === starterWorkspaceId)
      ?.id ??
    compatibleNamedDefaultWorkspace?.id ??
    expectedDefaultWorkspaceId
  );
}

function normalizeRecentRepositoryStateEntry(
  repository: RecentRepositoryState,
): RecentRepositoryState | null {
  const repositoryPath = repository?.repositoryPath?.trim();
  if (!repositoryPath) {
    return null;
  }

  const lastOpenedAt = repository.lastOpenedAt?.trim() || new Date().toISOString();
  const defaultBranch = repository.defaultBranch?.trim() || "main";
  const workspaceBranchById = { ...(repository.workspaceBranchById ?? {}) };
  const workspacePathById = { ...(repository.workspacePathById ?? {}) };
  const archivedWorkspacePaths = normalizeArchivedWorkspacePaths({
    paths: repository.archivedWorkspacePaths,
  });
  const linkedWorkspacePaths = normalizeArchivedWorkspacePaths({
    paths: repository.linkedWorkspacePaths,
  });
  const providedWorkspaces = Array.isArray(repository.workspaces)
    ? repository.workspaces.filter((workspace) =>
        Boolean(workspace?.id && workspace?.name),
      )
    : [];
  const defaultWorkspaceId = resolveCurrentRepositoryDefaultWorkspaceId({
    repositoryPath,
    workspaces: providedWorkspaces,
    workspaceDefaultById: { ...(repository.workspaceDefaultById ?? {}) },
    workspacePathById,
  });
  const comparableRepositoryPath = normalizeComparablePath(repositoryPath);
  const defaultWorkspaceSource = providedWorkspaces.find(
    (workspace) =>
      workspace.id === defaultWorkspaceId ||
      normalizeComparablePath(workspacePathById[workspace.id]) ===
        comparableRepositoryPath,
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
    const representsRepositoryRoot =
      workspace.id === defaultWorkspaceId ||
      comparableWorkspacePath === comparableRepositoryPath ||
      isDefaultWorkspaceName(workspace.name);
    if (representsRepositoryRoot || seenWorkspaceIds.has(workspace.id)) {
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
    [defaultWorkspaceId]: repositoryPath,
  };
  const nextWorkspaceDefaultById: Record<string, boolean> = {
    [defaultWorkspaceId]: true,
  };
  const workspaceLastActiveAtById = {
    ...(repository.workspaceLastActiveAtById ?? {}),
  };
  const nextWorkspaceLastActiveAtById: Record<string, string> = {};
  const defaultLastActiveAt =
    workspaceLastActiveAtById[defaultWorkspaceId] ||
    (defaultWorkspaceSource
      ? workspaceLastActiveAtById[defaultWorkspaceSource.id]
      : undefined);
  if (defaultLastActiveAt) {
    nextWorkspaceLastActiveAtById[defaultWorkspaceId] = defaultLastActiveAt;
  }

  for (const workspace of workspaces) {
    const lastActiveAt = workspaceLastActiveAtById[workspace.id];
    if (lastActiveAt && workspace.id !== defaultWorkspaceId) {
      nextWorkspaceLastActiveAtById[workspace.id] = lastActiveAt;
    }
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
    (workspace) => workspace.id === repository.activeWorkspaceId,
  )
    ? repository.activeWorkspaceId
    : defaultWorkspaceId;

  return {
    repositoryPath,
    repositoryName: normalizeRepositoryDisplayName({
      repositoryPath,
      repositoryName: repository.repositoryName,
    }),
    lastOpenedAt,
    defaultBranch,
    workspaces,
    activeWorkspaceId,
    workspaceBranchById: nextWorkspaceBranchById,
    workspacePathById: nextWorkspacePathById,
    workspaceDefaultById: nextWorkspaceDefaultById,
    ...(Object.keys(nextWorkspaceLastActiveAtById).length > 0
      ? { workspaceLastActiveAtById: nextWorkspaceLastActiveAtById }
      : {}),
    ...(archivedWorkspacePaths.length > 0 ? { archivedWorkspacePaths } : {}),
    ...(linkedWorkspacePaths.length > 0 ? { linkedWorkspacePaths } : {}),
    ...normalizeRecentRepositoryPreferences({
      repositoryBasePrompt: repository.repositoryBasePrompt,
      kickoffBranchNamingRule: repository.kickoffBranchNamingRule,
      newWorkspaceInitCommand: repository.newWorkspaceInitCommand,
      newWorkspaceUseRootNodeModulesSymlink:
        repository.newWorkspaceUseRootNodeModulesSymlink,
      appearanceIcon: repository.appearanceIcon,
      appearanceColor: repository.appearanceColor,
      settingsOverrides: repository.settingsOverrides,
    }),
  };
}

export function normalizeCurrentRepositoryState(args: {
  repositoryPath: string | null;
  repositoryName: string | null;
  defaultBranch: string;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  workspaceLastActiveAtById?: Record<string, string>;
  recentRepositories: RecentRepositoryState[];
}) {
  const repositoryPath = args.repositoryPath?.trim();
  if (!repositoryPath) {
    return null;
  }

  const rememberedRepository = findRecentRepositoryByPath({
    repositoryPath,
    recentRepositories: args.recentRepositories,
  });
  return normalizeRecentRepositoryStateEntry({
    repositoryPath,
    repositoryName:
      args.repositoryName?.trim() ||
      rememberedRepository?.repositoryName ||
      resolveRepositoryNameFromPath({ repositoryPath }),
    lastOpenedAt: rememberedRepository?.lastOpenedAt || new Date().toISOString(),
    defaultBranch:
      args.defaultBranch || rememberedRepository?.defaultBranch || "main",
    workspaces: args.workspaces,
    activeWorkspaceId: args.activeWorkspaceId,
    workspaceBranchById: args.workspaceBranchById,
    workspacePathById: args.workspacePathById,
    workspaceDefaultById: args.workspaceDefaultById,
    workspaceLastActiveAtById: {
      ...(rememberedRepository?.workspaceLastActiveAtById ?? {}),
      ...(args.workspaceLastActiveAtById ?? {}),
    },
    repositoryBasePrompt: rememberedRepository?.repositoryBasePrompt,
    kickoffBranchNamingRule: rememberedRepository?.kickoffBranchNamingRule,
    newWorkspaceInitCommand: rememberedRepository?.newWorkspaceInitCommand,
    newWorkspaceUseRootNodeModulesSymlink:
      rememberedRepository?.newWorkspaceUseRootNodeModulesSymlink,
  });
}

export function resolveTaskWorkspaceContext(args: {
  taskId: string;
  activeWorkspaceId: string;
  taskWorkspaceIdById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById?: Record<string, boolean>;
  repositoryPath?: string | null;
}) {
  const ownedWorkspaceId = args.taskWorkspaceIdById[args.taskId];
  const workspaceId = ownedWorkspaceId ?? args.activeWorkspaceId;
  const repositoryPath = args.repositoryPath?.trim();
  const workspacePath = args.workspacePathById[workspaceId]?.trim();
  const canUseRepositoryRoot =
    args.workspaceDefaultById?.[workspaceId] === true ||
    ownedWorkspaceId === undefined;

  return {
    workspaceId,
    cwd:
      workspacePath ||
      (args.workspaceDefaultById?.[workspaceId] ? repositoryPath : undefined) ||
      (canUseRepositoryRoot ? repositoryPath : undefined) ||
      undefined,
  };
}

export function cloneRecentRepositoryState(
  repository: RecentRepositoryState,
): RecentRepositoryState {
  const {
    archivedWorkspacePaths: rawArchivedWorkspacePaths,
    linkedWorkspacePaths: rawLinkedWorkspacePaths,
    // Re-added below only when it still holds a valid override.
    settingsOverrides: _rawSettingsOverrides,
    ...repositoryRest
  } = repository;
  const archivedWorkspacePaths = normalizeArchivedWorkspacePaths({
    paths: rawArchivedWorkspacePaths,
  });
  const linkedWorkspacePaths = normalizeArchivedWorkspacePaths({
    paths: rawLinkedWorkspacePaths,
  });
  return {
    ...repositoryRest,
    workspaces: [...repository.workspaces],
    workspaceBranchById: { ...repository.workspaceBranchById },
    workspacePathById: { ...repository.workspacePathById },
    workspaceDefaultById: { ...repository.workspaceDefaultById },
    ...(repository.workspaceLastActiveAtById
      ? {
          workspaceLastActiveAtById: { ...repository.workspaceLastActiveAtById },
        }
      : {}),
    ...(archivedWorkspacePaths.length > 0 ? { archivedWorkspacePaths } : {}),
    ...(linkedWorkspacePaths.length > 0 ? { linkedWorkspacePaths } : {}),
    ...normalizeRecentRepositoryPreferences({
      repositoryBasePrompt: repository.repositoryBasePrompt,
      kickoffBranchNamingRule: repository.kickoffBranchNamingRule,
      newWorkspaceInitCommand: repository.newWorkspaceInitCommand,
      newWorkspaceUseRootNodeModulesSymlink:
        repository.newWorkspaceUseRootNodeModulesSymlink,
      appearanceIcon: repository.appearanceIcon,
      appearanceColor: repository.appearanceColor,
      settingsOverrides: repository.settingsOverrides,
    }),
  };
}

export function normalizeRecentRepositoryStates(args: {
  repositories?: RecentRepositoryState[] | null;
}) {
  let normalizedRepositories: RecentRepositoryState[] = [];

  for (const repository of args.repositories ?? []) {
    const normalizedRepository = normalizeRecentRepositoryStateEntry(repository);
    if (!normalizedRepository) {
      continue;
    }
    normalizedRepositories = upsertRecentRepositoryState({
      repositories: normalizedRepositories,
      repository: normalizedRepository,
    });
  }

  return normalizedRepositories;
}

export function upsertRecentRepositoryState(args: {
  repositories: RecentRepositoryState[];
  repository: RecentRepositoryState;
}) {
  const existingRepository = args.repositories.find(
    (item) => item.repositoryPath === args.repository.repositoryPath,
  );
  const normalizedRepository = normalizeRecentRepositoryStateEntry({
    ...args.repository,
    // Several registry update paths replace the workspace inventory without
    // touching activity metadata. Preserve remembered stamps unless the caller
    // supplied a freshly captured map, just like the other repository-scoped
    // metadata below.
    workspaceLastActiveAtById:
      args.repository.workspaceLastActiveAtById ??
      existingRepository?.workspaceLastActiveAtById,
    archivedWorkspacePaths:
      args.repository.archivedWorkspacePaths ??
      existingRepository?.archivedWorkspacePaths,
    linkedWorkspacePaths:
      args.repository.linkedWorkspacePaths ??
      existingRepository?.linkedWorkspacePaths,
  });
  if (!normalizedRepository) {
    return args.repositories.map((repository) => cloneRecentRepositoryState(repository));
  }
  const nextRepository = cloneRecentRepositoryState(normalizedRepository);
  const existingIndex = args.repositories.findIndex(
    (item) => item.repositoryPath === normalizedRepository.repositoryPath,
  );
  if (existingIndex >= 0) {
    return args.repositories.map((item, index) =>
      index === existingIndex ? nextRepository : cloneRecentRepositoryState(item),
    );
  }
  return [
    ...args.repositories.map((repository) => cloneRecentRepositoryState(repository)),
    nextRepository,
  ].slice(-MAX_RECENT_REPOSITORIES);
}

export function captureCurrentRepositoryState(args: {
  recentRepositories: RecentRepositoryState[];
  repositoryPath: string | null;
  repositoryName: string | null;
  defaultBranch: string;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  workspaceLastActiveAtById?: Record<string, string>;
  archivedWorkspacePathsToAdd?: Array<string | null | undefined>;
  archivedWorkspacePathsToRemove?: Array<string | null | undefined>;
  linkedWorkspacePathsToAdd?: Array<string | null | undefined>;
  linkedWorkspacePathsToRemove?: Array<string | null | undefined>;
}): RecentRepositoryState[] {
  if (!args.repositoryPath) {
    return args.recentRepositories.map((repository) =>
      cloneRecentRepositoryState(repository),
    );
  }
  const rememberedRepository = findRecentRepositoryByPath({
    repositoryPath: args.repositoryPath,
    recentRepositories: args.recentRepositories,
  });
  const archivedWorkspacePaths = mergeArchivedWorkspacePaths({
    current: rememberedRepository?.archivedWorkspacePaths,
    add: args.archivedWorkspacePathsToAdd,
    remove: args.archivedWorkspacePathsToRemove,
  });
  const shouldWriteArchivedWorkspacePaths =
    archivedWorkspacePaths.length > 0 ||
    args.archivedWorkspacePathsToAdd !== undefined ||
    args.archivedWorkspacePathsToRemove !== undefined;
  const linkedWorkspacePaths = mergeArchivedWorkspacePaths({
    current: rememberedRepository?.linkedWorkspacePaths,
    add: args.linkedWorkspacePathsToAdd,
    remove: args.linkedWorkspacePathsToRemove,
  });
  const shouldWriteLinkedWorkspacePaths =
    linkedWorkspacePaths.length > 0 ||
    args.linkedWorkspacePathsToAdd !== undefined ||
    args.linkedWorkspacePathsToRemove !== undefined;
  return upsertRecentRepositoryState({
    repositories: args.recentRepositories,
    repository: {
      repositoryPath: args.repositoryPath,
      repositoryName: normalizeRepositoryDisplayName({
        repositoryPath: args.repositoryPath,
        repositoryName: args.repositoryName,
      }),
      lastOpenedAt: new Date().toISOString(),
      defaultBranch: args.defaultBranch,
      workspaces: args.workspaces,
      activeWorkspaceId: args.activeWorkspaceId,
      workspaceBranchById: args.workspaceBranchById,
      workspacePathById: args.workspacePathById,
      workspaceDefaultById: args.workspaceDefaultById,
      // Callers that do not track activity must not wipe what is already
      // remembered, so fall back to the stored map instead of an empty one.
      workspaceLastActiveAtById: {
        ...(rememberedRepository?.workspaceLastActiveAtById ?? {}),
        ...(args.workspaceLastActiveAtById ?? {}),
      },
      ...(shouldWriteArchivedWorkspacePaths ? { archivedWorkspacePaths } : {}),
      ...(shouldWriteLinkedWorkspacePaths ? { linkedWorkspacePaths } : {}),
      ...resolveRecentRepositoryPreferences({
        repositoryPath: args.repositoryPath,
        recentRepositories: args.recentRepositories,
      }),
    },
  });
}
