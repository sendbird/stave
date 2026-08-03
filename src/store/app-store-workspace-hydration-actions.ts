import type { StoreApi } from "zustand";
import { listActiveWorkspaceTurns } from "@/lib/db/turns.db";
import {
  closeWorkspacePersistence,
  listWorkspaceSummaries,
  loadTaskMessagesPage,
  loadProjectRegistrySnapshot,
  loadWorkspaceShellForRestore,
  loadWorkspaceShellSummary,
  saveProjectRegistrySnapshot,
  type WorkspaceSummary,
} from "@/lib/db/workspaces.db";
import { workspaceFsAdapter } from "@/lib/fs";
import {
  normalizeComparablePath,
  parseGitWorktrees,
} from "@/lib/source-control-worktrees";
import type { AppState } from "@/store/app-store.types";
import type {
  HydrateWorkspaceMessagesInBackground,
  LoadTaskMessagesIntoSession,
  RefreshWorkspaceFilesInBackground,
} from "@/store/app-store-workspace-action-types";
import {
  beginWorkspaceIdentityRequest,
  isCurrentWorkspaceIdentityRequest,
} from "@/store/app-store-workspace-management-actions";
import { resolveEditorDiffMode } from "@/store/layout.utils";
import {
  hydrateNotificationsAction,
  purgeWorkspaceNotificationsAction,
  reconcileOrphanedNotificationsAction,
} from "@/store/notification-actions";
import {
  buildImportedWorktreeWorkspaceId,
  captureCurrentProjectState,
  normalizeProjectDisplayName,
  normalizeRecentProjectStates,
  reconcileArchivedWorkspacePaths,
  registerTaskWorkspaceOwnership,
  resolveCurrentProjectDefaultWorkspaceId,
  resolveImportedWorktreeName,
  resolveRecentProjectPreferences,
  retainTaskWorkspaceOwnership,
  toWorkspaceFolderName,
  upsertRecentProjectState,
  type RecentProjectState,
} from "@/store/project.utils";
import {
  getArchivedWorktreePathSetForProject,
  getLinkedWorktreePathSetForProject,
} from "@/store/workspace-archive-cleanup";
import {
  rememberCachedWorkspaceFiles,
  removeCachedWorkspaceFiles,
  resolveInitialWorkspaceFiles,
} from "@/store/workspace-file-cache";
import {
  buildWorkspaceSessionState,
  buildWorkspaceSessionStateFromShell,
  createWorkspaceSnapshot,
  defaultWorkspaceName,
  persistWorkspaceSnapshot,
} from "@/store/workspace-session-state";
import { TASK_MESSAGES_PAGE_SIZE } from "@/store/task-message-loading";
import {
  shouldPreferLoadedWorkspaceState,
  shouldReloadWorkspaceShellFromPersistence,
  summarizeWorkspaceShell,
} from "@/store/workspace-shell-summary";
import type { ChatMessage } from "@/types/chat";

function getRetainedLoadedMessageTaskIds(args: {
  activeTaskId: string;
  activeTurnIdsByTask: Record<string, string | undefined>;
  openTaskTabIds: string[];
}) {
  const retained = new Set(args.openTaskTabIds);
  if (args.activeTaskId) {
    retained.add(args.activeTaskId);
  }
  for (const [taskId, turnId] of Object.entries(args.activeTurnIdsByTask)) {
    if (turnId) {
      retained.add(taskId);
    }
  }
  return retained;
}

function compactLoadedMessagesByTask(args: {
  messagesByTask: Record<string, ChatMessage[]>;
  activeTaskId: string;
  activeTurnIdsByTask: Record<string, string | undefined>;
  openTaskTabIds: string[];
}) {
  const retained = getRetainedLoadedMessageTaskIds({
    activeTaskId: args.activeTaskId,
    activeTurnIdsByTask: args.activeTurnIdsByTask,
    openTaskTabIds: args.openTaskTabIds,
  });
  let changed = false;
  const nextEntries = Object.entries(args.messagesByTask).filter(([taskId]) => {
    const keep = retained.has(taskId);
    if (!keep) {
      changed = true;
    }
    return keep;
  });
  return changed ? Object.fromEntries(nextEntries) : args.messagesByTask;
}

function mergeRecentProjectsByPath(args: {
  persistedProjects: RecentProjectState[];
  stateProjects: RecentProjectState[];
}) {
  const persistedProjects = normalizeRecentProjectStates({
    projects: args.persistedProjects,
  });
  const stateProjects = normalizeRecentProjectStates({
    projects: args.stateProjects,
  });
  let merged = persistedProjects;
  for (const project of stateProjects) {
    const existing = merged.find(
      (item) => item.projectPath === project.projectPath,
    );
    if (!existing || project.lastOpenedAt >= existing.lastOpenedAt) {
      merged = upsertRecentProjectState({
        projects: merged,
        project,
      });
    }
  }
  // Archive tombstones must survive either durable source losing them —
  // otherwise `refreshWorkspaces` re-discovers a preserved dirty worktree and
  // the archived workspace resurrects. Union both sources per project, minus
  // any path that is registered as a live workspace again.
  return merged.map((project) => {
    const persisted = persistedProjects.find(
      (item) => item.projectPath === project.projectPath,
    );
    const fromState = stateProjects.find(
      (item) => item.projectPath === project.projectPath,
    );
    const archivedWorkspacePaths = reconcileArchivedWorkspacePaths({
      primary: persisted?.archivedWorkspacePaths,
      secondary: fromState?.archivedWorkspacePaths,
      workspacePathById: project.workspacePathById,
    });
    const { archivedWorkspacePaths: _current, ...projectRest } = project;
    return {
      ...projectRest,
      ...(archivedWorkspacePaths.length > 0 ? { archivedWorkspacePaths } : {}),
    };
  });
}

export const loadWorkspaceShellStateFromPersistence = async (args: {
  workspaceId: string;
}) => {
  const [shell, latestTurns] = await Promise.all([
    loadWorkspaceShellForRestore({ workspaceId: args.workspaceId }),
    listActiveWorkspaceTurns({ workspaceId: args.workspaceId }),
  ]);
  const interruptedTaskIds = new Set(
    latestTurns.filter((turn) => !turn.completedAt).map((turn) => turn.taskId),
  );
  const activeTaskId =
    shell?.activeTaskId &&
    ((shell.messageCountByTask[shell.activeTaskId] ?? 0) > 0 ||
      interruptedTaskIds.has(shell.activeTaskId))
      ? shell.activeTaskId
      : null;
  const initialTaskIds = new Set<string>();
  for (const taskId of interruptedTaskIds) {
    initialTaskIds.add(taskId);
  }
  const workspaceState = buildWorkspaceSessionStateFromShell({
    shell,
    latestTurns,
  });
  return {
    shell,
    activeTaskIdForLatestHydration: activeTaskId,
    latestTurns,
    initialTaskIds: [...initialTaskIds],
    workspaceState:
      interruptedTaskIds.size > 0
        ? {
            ...workspaceState,
            activeTurnIdsByTask: {},
          }
        : workspaceState,
  };
};

export const loadWorkspaceSessionFromPersistence = async (args: {
  workspaceId: string;
  appendInterruptedNotices?: boolean;
}) => {
  const [shell, latestTurns] = await Promise.all([
    loadWorkspaceShellForRestore({ workspaceId: args.workspaceId }),
    listActiveWorkspaceTurns({ workspaceId: args.workspaceId }),
  ]);
  const initialTaskIds = new Set<string>();
  if (shell?.activeTaskId) {
    initialTaskIds.add(shell.activeTaskId);
  }
  for (const turn of latestTurns) {
    if (!turn.completedAt) {
      initialTaskIds.add(turn.taskId);
    }
  }
  const pageEntries = await Promise.all(
    [...initialTaskIds].map(async (taskId) => ({
      taskId,
      page: await loadTaskMessagesPage({
        workspaceId: args.workspaceId,
        taskId,
        limit: TASK_MESSAGES_PAGE_SIZE,
        offset: 0,
      }),
    })),
  );
  const workspaceState = buildWorkspaceSessionStateFromShell({
    shell,
    messagesByTask: Object.fromEntries(
      pageEntries.map(({ taskId, page }) => [taskId, page.messages] as const),
    ),
    messageCountByTaskOverrides: Object.fromEntries(
      pageEntries.map(({ taskId, page }) => [taskId, page.totalCount] as const),
    ),
    latestTurns,
    appendInterruptedNotices: args.appendInterruptedNotices,
  });
  return { shell, latestTurns, workspaceState };
};

type WorkspaceHydrationActionKey =
  | "hydrateProjectRegistry"
  | "flushProjectRegistry"
  | "hydrateWorkspaces"
  | "refreshWorkspaces"
  | "hydrateNotifications"
  | "reconcileOrphanedNotifications"
  | "purgeWorkspaceNotifications"
  | "flushActiveWorkspaceSnapshot";

type WorkspaceHydrationActions = Pick<AppState, WorkspaceHydrationActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createWorkspaceHydrationActions(args: {
  set: StoreSet;
  get: StoreGet;
  loadTaskMessagesIntoSession: LoadTaskMessagesIntoSession;
  hydrateWorkspaceMessagesInBackground: HydrateWorkspaceMessagesInBackground;
  refreshWorkspaceFilesInBackground: RefreshWorkspaceFilesInBackground;
}): WorkspaceHydrationActions {
  const {
    set,
    get,
    loadTaskMessagesIntoSession,
    hydrateWorkspaceMessagesInBackground,
    refreshWorkspaceFilesInBackground,
  } = args;

  return {
    hydrateProjectRegistry: async () => {
      const rawPersistedProjects =
        (await loadProjectRegistrySnapshot()) as RecentProjectState[];
      const persistedProjects = normalizeRecentProjectStates({
        projects: rawPersistedProjects,
      });
      if (persistedProjects.length === 0) {
        return;
      }
      const state = get();
      const mergedProjects = mergeRecentProjectsByPath({
        persistedProjects,
        stateProjects: state.recentProjects,
      });
      const currentProject = state.projectPath
        ? (mergedProjects.find(
            (project) => project.projectPath === state.projectPath,
          ) ?? null)
        : null;
      if (
        currentProject ||
        mergedProjects.length !== state.recentProjects.length
      ) {
        set(() => ({
          recentProjects: mergedProjects,
          ...(currentProject
            ? {
                projectName: normalizeProjectDisplayName({
                  projectPath: currentProject.projectPath,
                  projectName:
                    state.projectName?.trim() || currentProject.projectName,
                }),
                defaultBranch:
                  state.defaultBranch || currentProject.defaultBranch,
              }
            : {}),
        }));
      }
      if (
        JSON.stringify(rawPersistedProjects) !== JSON.stringify(mergedProjects)
      ) {
        await saveProjectRegistrySnapshot({
          projects: mergedProjects,
        });
      }
    },
    flushProjectRegistry: async () => {
      const state = get();
      const projects = captureCurrentProjectState({
        recentProjects: state.recentProjects,
        projectPath: state.projectPath,
        projectName: state.projectPath
          ? normalizeProjectDisplayName({
              projectPath: state.projectPath,
              projectName: state.projectName,
            })
          : null,
        defaultBranch: state.defaultBranch,
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        workspaceBranchById: state.workspaceBranchById,
        workspacePathById: state.workspacePathById,
        workspaceDefaultById: state.workspaceDefaultById,
        workspaceLastActiveAtById: state.workspaceLastActiveAtById,
      });
      await saveProjectRegistrySnapshot({
        projects,
      });
    },
    hydrateWorkspaces: async () => {
      const workspaceIdentityRequestToken = beginWorkspaceIdentityRequest();
      await get().hydrateProjectRegistry();
      let initialRows = await listWorkspaceSummaries();
      const stateBeforeHydrate = get();
      const currentProject = stateBeforeHydrate.projectPath
        ? (stateBeforeHydrate.recentProjects.find(
            (project) => project.projectPath === stateBeforeHydrate.projectPath,
          ) ?? null)
        : null;
      const rememberedWorkspaceIds = new Set([
        ...(currentProject?.workspaces.map((workspace) => workspace.id) ??
          stateBeforeHydrate.workspaces.map((workspace) => workspace.id)),
        ...Object.keys(
          currentProject?.workspacePathById ??
            stateBeforeHydrate.workspacePathById,
        ),
      ]);
      const currentProjectDefaultWorkspaceId =
        resolveCurrentProjectDefaultWorkspaceId({
          projectPath: stateBeforeHydrate.projectPath,
          workspaces:
            currentProject?.workspaces ?? stateBeforeHydrate.workspaces,
          workspaceDefaultById:
            currentProject?.workspaceDefaultById ??
            stateBeforeHydrate.workspaceDefaultById,
          workspacePathById:
            currentProject?.workspacePathById ??
            stateBeforeHydrate.workspacePathById,
        });
      if (initialRows.length === 0 && stateBeforeHydrate.projectPath) {
        await persistWorkspaceSnapshot({
          workspaceId: currentProjectDefaultWorkspaceId,
          workspaceName: defaultWorkspaceName,
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
          promptDraftByTask: {},
          editorTabs: [],
          activeEditorTabId: null,
          terminalTabs: [],
          activeTerminalTabId: null,
          terminalDocked: false,
          cliSessionTabs: [],
          activeCliSessionTabId: null,
          activeSurface: { kind: "task", taskId: "" },
          providerSessionByTask: {},
        });
        initialRows = await listWorkspaceSummaries();
      }
      const persistedRowsById = new Map(
        initialRows.map((workspace) => [workspace.id, workspace] as const),
      );
      const rememberedRows =
        currentProject?.workspaces ?? stateBeforeHydrate.workspaces;
      let rows =
        rememberedWorkspaceIds.size > 0
          ? rememberedRows.map(
              (workspace) => persistedRowsById.get(workspace.id) ?? workspace,
            )
          : initialRows;
      if (rows.length === 0 && stateBeforeHydrate.projectPath) {
        rows = [
          {
            id: currentProjectDefaultWorkspaceId,
            name: defaultWorkspaceName,
            updatedAt: new Date().toISOString(),
          },
        ];
      }
      const defaultWorkspaceId = resolveCurrentProjectDefaultWorkspaceId({
        projectPath: stateBeforeHydrate.projectPath,
        workspaces: rows,
        workspaceDefaultById:
          currentProject?.workspaceDefaultById ??
          stateBeforeHydrate.workspaceDefaultById,
        workspacePathById:
          currentProject?.workspacePathById ??
          stateBeforeHydrate.workspacePathById,
      });
      const branchById: Record<string, string> = {
        ...(currentProject?.workspaceBranchById ??
          stateBeforeHydrate.workspaceBranchById),
      };
      const pathById: Record<string, string> = {
        ...(currentProject?.workspacePathById ??
          stateBeforeHydrate.workspacePathById),
      };
      const archivedWorktreePathSet = getArchivedWorktreePathSetForProject({
        projectPath: stateBeforeHydrate.projectPath,
        recentProjects: stateBeforeHydrate.recentProjects,
      });
      if (archivedWorktreePathSet.size > 0) {
        const archivedRowIds = rows
          .filter((row) => {
            if (row.id === defaultWorkspaceId) {
              return false;
            }
            const comparablePath = normalizeComparablePath(
              pathById[row.id] ??
                (stateBeforeHydrate.projectPath
                  ? `${stateBeforeHydrate.projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`
                  : null),
            );
            return archivedWorktreePathSet.has(comparablePath);
          })
          .map((row) => row.id);
        if (archivedRowIds.length > 0) {
          const archivedRowIdSet = new Set(archivedRowIds);
          rows = rows.filter((row) => !archivedRowIdSet.has(row.id));
          for (const workspaceId of archivedRowIds) {
            delete branchById[workspaceId];
            delete pathById[workspaceId];
          }
        }
      }

      // Worktree cleanup: remove DB workspaces whose git worktrees no longer exist
      const runner = window.api?.terminal?.runCommand;
      const projectPath = stateBeforeHydrate.projectPath;
      const linkedWorktreePathSet = getLinkedWorktreePathSetForProject({
        projectPath: stateBeforeHydrate.projectPath,
        recentProjects: stateBeforeHydrate.recentProjects,
      });
      if (runner && projectPath) {
        await runner({ cwd: projectPath, command: "git worktree prune" });
        const listResult = await runner({
          cwd: projectPath,
          command: "git worktree list --porcelain",
        });
        if (listResult.ok) {
          const discoveredWorktrees = parseGitWorktrees({
            stdout: listResult.stdout,
          });
          const rowPathEntries = await Promise.all(
            rows.map(async (row) => {
              const comparablePath = normalizeComparablePath(
                pathById[row.id] ??
                  (row.id === defaultWorkspaceId
                    ? projectPath
                    : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
              );
              const snapshotScore =
                row.id === defaultWorkspaceId
                  ? Number.MAX_SAFE_INTEGER
                  : summarizeWorkspaceShell(
                      await loadWorkspaceShellSummary({
                        workspaceId: row.id,
                      }),
                    );
              return {
                row,
                comparablePath,
                snapshotScore,
              };
            }),
          );
          const bestRowByPath = new Map<
            string,
            { row: WorkspaceSummary; snapshotScore: number }
          >();
          for (const entry of rowPathEntries) {
            if (!entry.comparablePath) {
              continue;
            }
            const existing = bestRowByPath.get(entry.comparablePath);
            if (
              !existing ||
              entry.snapshotScore > existing.snapshotScore ||
              (entry.snapshotScore === existing.snapshotScore &&
                entry.row.updatedAt > existing.row.updatedAt)
            ) {
              bestRowByPath.set(entry.comparablePath, {
                row: entry.row,
                snapshotScore: entry.snapshotScore,
              });
            }
          }
          rows = rows.filter((row) => {
            const comparablePath = normalizeComparablePath(
              pathById[row.id] ??
                (row.id === defaultWorkspaceId
                  ? projectPath
                  : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
            );
            if (!comparablePath) {
              return true;
            }
            return bestRowByPath.get(comparablePath)?.row.id === row.id;
          });
          const registeredPaths = new Set(
            discoveredWorktrees
              .map((entry) => normalizeComparablePath(entry.path))
              .filter(Boolean),
          );
          const staleIds: string[] = [];
          for (const row of rows) {
            if (row.id === defaultWorkspaceId) continue;
            const wsPath =
              pathById[row.id] ??
              `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`;
            const comparableWsPath = normalizeComparablePath(wsPath);
            if (
              !registeredPaths.has(comparableWsPath) &&
              !linkedWorktreePathSet.has(comparableWsPath)
            ) {
              staleIds.push(row.id);
            }
          }
          for (const id of staleIds) {
            await closeWorkspacePersistence({ workspaceId: id });
          }
          if (staleIds.length > 0) {
            rows = rows.filter((row) => !staleIds.includes(row.id));
            for (const id of staleIds) {
              delete pathById[id];
              delete branchById[id];
            }
          }

          for (const row of rows) {
            const isDefault = row.id === defaultWorkspaceId;
            if (!branchById[row.id]) {
              branchById[row.id] = isDefault
                ? stateBeforeHydrate.defaultBranch
                : row.name;
            }
            if (!pathById[row.id]) {
              pathById[row.id] = isDefault
                ? projectPath
                : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`;
            }
          }

          const knownPaths = new Set(
            rows
              .map((row) =>
                normalizeComparablePath(
                  pathById[row.id] ??
                    (row.id === defaultWorkspaceId
                      ? projectPath
                      : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
                ),
              )
              .filter(Boolean),
          );
          const currentProjectPath = normalizeComparablePath(projectPath);

          for (const worktree of discoveredWorktrees) {
            const normalizedWorktreePath = normalizeComparablePath(
              worktree.path,
            );
            if (
              !worktree.branch ||
              !normalizedWorktreePath ||
              normalizedWorktreePath === currentProjectPath ||
              knownPaths.has(normalizedWorktreePath) ||
              archivedWorktreePathSet.has(normalizedWorktreePath)
            ) {
              continue;
            }

            const workspaceName = resolveImportedWorktreeName({
              branch: worktree.branch,
              worktreePath: worktree.path,
            });
            let matchedWorkspace =
              rows.find((row) => {
                const comparablePath = normalizeComparablePath(
                  pathById[row.id] ??
                    (row.id === defaultWorkspaceId
                      ? projectPath
                      : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
                );
                return comparablePath === normalizedWorktreePath;
              }) ?? null;

            if (!matchedWorkspace) {
              const candidateRows = initialRows.filter((row) => {
                if (row.id === defaultWorkspaceId) {
                  return false;
                }
                const comparablePath = normalizeComparablePath(
                  pathById[row.id] ??
                    `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`,
                );
                return (
                  comparablePath === normalizedWorktreePath ||
                  row.name === workspaceName
                );
              });
              if (candidateRows.length > 0) {
                const scoredCandidates = await Promise.all(
                  candidateRows.map(async (row) => ({
                    row,
                    score: summarizeWorkspaceShell(
                      await loadWorkspaceShellSummary({
                        workspaceId: row.id,
                      }),
                    ),
                  })),
                );
                scoredCandidates.sort(
                  (left, right) =>
                    right.score - left.score ||
                    right.row.updatedAt.localeCompare(left.row.updatedAt),
                );
                matchedWorkspace = scoredCandidates[0]?.row ?? null;
              }
            }

            const workspaceId =
              matchedWorkspace?.id ??
              buildImportedWorktreeWorkspaceId({
                projectPath,
                worktreePath: worktree.path,
              });
            const persistedWorkspace =
              matchedWorkspace ??
              rows.find((row) => row.id === workspaceId) ??
              persistedRowsById.get(workspaceId);

            if (!persistedWorkspace) {
              await persistWorkspaceSnapshot({
                workspaceId,
                workspaceName,
                activeTaskId: "",
                tasks: [],
                messagesByTask: {},
                promptDraftByTask: {},
                editorTabs: [],
                activeEditorTabId: null,
                terminalTabs: [],
                activeTerminalTabId: null,
                terminalDocked: false,
                cliSessionTabs: [],
                activeCliSessionTabId: null,
                activeSurface: { kind: "task", taskId: "" },
                providerSessionByTask: {},
              });
            }

            if (!rows.some((row) => row.id === workspaceId)) {
              rows = [
                ...rows,
                persistedWorkspace ?? {
                  id: workspaceId,
                  name: workspaceName,
                  updatedAt: new Date().toISOString(),
                },
              ];
            }

            branchById[workspaceId] = worktree.branch;
            pathById[workspaceId] = worktree.path;
            knownPaths.add(normalizedWorktreePath);
          }
        }
      }

      for (const row of rows) {
        const isDefault = row.id === defaultWorkspaceId;
        if (!branchById[row.id]) {
          branchById[row.id] = isDefault
            ? stateBeforeHydrate.defaultBranch
            : row.name;
        }
        if (!pathById[row.id] && projectPath) {
          pathById[row.id] = isDefault
            ? projectPath
            : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`;
        }
      }

      const preferredWorkspaceId = rows.some(
        (workspace) => workspace.id === stateBeforeHydrate.activeWorkspaceId,
      )
        ? stateBeforeHydrate.activeWorkspaceId
        : (rows.find((workspace) => workspace.id === defaultWorkspaceId)?.id ??
          rows[0]?.id ??
          "");
      const cachedWorkspaceState = preferredWorkspaceId
        ? stateBeforeHydrate.workspaceRuntimeCacheById[preferredWorkspaceId]
        : undefined;
      const loadedWorkspaceShellState =
        preferredWorkspaceId &&
        (!cachedWorkspaceState ||
          shouldReloadWorkspaceShellFromPersistence({
            cachedWorkspaceState,
          }))
          ? await loadWorkspaceShellStateFromPersistence({
              workspaceId: preferredWorkspaceId,
            })
          : null;
      const preferLoadedWorkspaceState = shouldPreferLoadedWorkspaceState({
        cachedWorkspaceState,
        loadedWorkspaceShellState,
      });

      const preferredWorkspacePath = pathById[preferredWorkspaceId] ?? null;
      const projectFiles = resolveInitialWorkspaceFiles({
        workspacePath: preferredWorkspacePath,
        activeProjectPath: stateBeforeHydrate.projectPath,
        activeProjectFiles: stateBeforeHydrate.projectFiles,
        workspaceFileCacheByPath: stateBeforeHydrate.workspaceFileCacheByPath,
      });
      if (preferredWorkspacePath) {
        await workspaceFsAdapter.setRoot?.({
          rootPath: preferredWorkspacePath,
          rootName: stateBeforeHydrate.projectPath
            ? normalizeProjectDisplayName({
                projectPath: stateBeforeHydrate.projectPath,
                projectName: stateBeforeHydrate.projectName,
              })
            : "project",
          files: projectFiles,
        });
      }

      set((state) => {
        if (
          !isCurrentWorkspaceIdentityRequest(workspaceIdentityRequestToken) ||
          normalizeComparablePath(state.projectPath) !==
            normalizeComparablePath(stateBeforeHydrate.projectPath)
        ) {
          return state;
        }
        const workspaceState =
          (preferLoadedWorkspaceState
            ? loadedWorkspaceShellState?.workspaceState
            : (cachedWorkspaceState ??
              loadedWorkspaceShellState?.workspaceState)) ??
          buildWorkspaceSessionState({ snapshot: null });
        const workspaceIds = rows.map((workspace) => workspace.id);
        const nextRuntimeCacheById =
          preferLoadedWorkspaceState && preferredWorkspaceId
            ? Object.fromEntries(
                Object.entries(state.workspaceRuntimeCacheById).filter(
                  ([workspaceId]) => workspaceId !== preferredWorkspaceId,
                ),
              )
            : state.workspaceRuntimeCacheById;
        const staleWorkspacePaths = rememberedRows
          .filter((workspace) => !rows.some((row) => row.id === workspace.id))
          .map(
            (workspace) =>
              (currentProject?.workspacePathById ??
                stateBeforeHydrate.workspacePathById)[workspace.id] ??
              (workspace.id === defaultWorkspaceId
                ? stateBeforeHydrate.projectPath
                : null),
          );

        return {
          hasHydratedWorkspaces: true,
          workspaceSnapshotVersion: 0,
          promptDraftPersistenceVersion: 0,
          taskMessagesLoadingByTask: {},
          workspaces: rows,
          activeWorkspaceId: preferredWorkspaceId,
          recentProjects: state.projectPath
            ? upsertRecentProjectState({
                projects: state.recentProjects,
                project: {
                  projectPath: state.projectPath,
                  projectName: normalizeProjectDisplayName({
                    projectPath: state.projectPath,
                    projectName: state.projectName,
                  }),
                  lastOpenedAt: new Date().toISOString(),
                  defaultBranch: state.defaultBranch,
                  workspaces: rows,
                  activeWorkspaceId: preferredWorkspaceId,
                  workspaceBranchById: branchById,
                  workspacePathById: pathById,
                  workspaceDefaultById: defaultWorkspaceId
                    ? { [defaultWorkspaceId]: true }
                    : {},
                  ...resolveRecentProjectPreferences({
                    projectPath: state.projectPath,
                    recentProjects: state.recentProjects,
                  }),
                },
              })
            : state.recentProjects,
          workspaceDefaultById: defaultWorkspaceId
            ? { [defaultWorkspaceId]: true }
            : {},
          workspaceBranchById: branchById,
          workspacePathById: pathById,
          projectFiles,
          workspaceFileCacheByPath: rememberCachedWorkspaceFiles({
            workspaceFileCacheByPath: removeCachedWorkspaceFiles({
              workspaceFileCacheByPath: state.workspaceFileCacheByPath,
              workspacePaths: staleWorkspacePaths,
            }),
            workspacePath: preferredWorkspacePath,
            files: projectFiles,
          }),
          workspaceRuntimeCacheById: nextRuntimeCacheById,
          taskWorkspaceIdById: registerTaskWorkspaceOwnership({
            taskWorkspaceIdById: retainTaskWorkspaceOwnership({
              taskWorkspaceIdById: state.taskWorkspaceIdById,
              workspaceIds,
            }),
            workspaceId: preferredWorkspaceId,
            tasks: workspaceState.tasks,
          }),
          ...workspaceState,
          layout: {
            ...state.layout,
            terminalDocked: workspaceState.terminalDocked,
            editorDiffMode: resolveEditorDiffMode({
              editorTabs: workspaceState.editorTabs,
              activeEditorTabId: workspaceState.activeEditorTabId,
            }),
            editorMarkdownPreviewMode: false,
          },
        };
      });
      if (
        !isCurrentWorkspaceIdentityRequest(workspaceIdentityRequestToken) ||
        get().activeWorkspaceId !== preferredWorkspaceId
      ) {
        return;
      }
      if (
        loadedWorkspaceShellState &&
        (preferLoadedWorkspaceState || !cachedWorkspaceState)
      ) {
        if (loadedWorkspaceShellState.activeTaskIdForLatestHydration) {
          void loadTaskMessagesIntoSession({
            workspaceId: preferredWorkspaceId,
            taskId: loadedWorkspaceShellState.activeTaskIdForLatestHydration,
            mode: "latest",
          });
        }
        hydrateWorkspaceMessagesInBackground({
          workspaceId: preferredWorkspaceId,
          taskIds: loadedWorkspaceShellState.initialTaskIds,
          latestTurns: loadedWorkspaceShellState.latestTurns,
        });
      }
      if (preferredWorkspaceId && preferredWorkspacePath) {
        refreshWorkspaceFilesInBackground({
          workspaceId: preferredWorkspaceId,
          workspacePath: preferredWorkspacePath,
        });
      }
    },
    refreshWorkspaces: async () => {
      const state = get();
      if (!state.hasHydratedWorkspaces || !state.projectPath) {
        return;
      }
      const runner = window.api?.terminal?.runCommand;
      if (!runner) {
        return;
      }
      const projectPath = state.projectPath;
      const persistedRowsById = new Map(
        (await listWorkspaceSummaries()).map(
          (workspace) => [workspace.id, workspace] as const,
        ),
      );

      // Prune and list current git worktrees.
      await runner({ cwd: projectPath, command: "git worktree prune" });
      const listResult = await runner({
        cwd: projectPath,
        command: "git worktree list --porcelain",
      });
      if (!listResult.ok) {
        return;
      }
      const discoveredWorktrees = parseGitWorktrees({
        stdout: listResult.stdout,
      });

      const defaultWorkspaceId = resolveCurrentProjectDefaultWorkspaceId({
        projectPath,
        workspaces: state.workspaces,
        workspaceDefaultById: state.workspaceDefaultById,
        workspacePathById: state.workspacePathById,
      });
      const archivedWorktreePathSet = getArchivedWorktreePathSetForProject({
        projectPath,
        recentProjects: state.recentProjects,
      });
      const linkedWorktreePathSet = getLinkedWorktreePathSetForProject({
        projectPath,
        recentProjects: state.recentProjects,
      });

      // Build set of known workspace paths for quick lookup.
      const knownPathToId = new Map<string, string>();
      for (const workspace of state.workspaces) {
        const wsPath = normalizeComparablePath(
          state.workspacePathById[workspace.id] ??
            (workspace.id === defaultWorkspaceId
              ? projectPath
              : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: workspace.name })}`),
        );
        if (wsPath) {
          knownPathToId.set(wsPath, workspace.id);
        }
      }

      const registeredWorktreePaths = new Set(
        discoveredWorktrees
          .map((entry) => normalizeComparablePath(entry.path))
          .filter(Boolean),
      );
      const currentProjectPath = normalizeComparablePath(projectPath);

      // Detect new worktrees not yet tracked as workspaces.
      const newRows: WorkspaceSummary[] = [];
      const newBranchById: Record<string, string> = {};
      const newPathById: Record<string, string> = {};
      for (const worktree of discoveredWorktrees) {
        const normalizedWorktreePath = normalizeComparablePath(worktree.path);
        if (
          !worktree.branch ||
          !normalizedWorktreePath ||
          normalizedWorktreePath === currentProjectPath ||
          knownPathToId.has(normalizedWorktreePath) ||
          // Skip worktrees the user archived; re-registering preserved
          // dirty worktrees is the "archive resurrection" bug.
          archivedWorktreePathSet.has(normalizedWorktreePath)
        ) {
          continue;
        }

        const workspaceName = resolveImportedWorktreeName({
          branch: worktree.branch,
          worktreePath: worktree.path,
        });
        const workspaceId = buildImportedWorktreeWorkspaceId({
          projectPath,
          worktreePath: worktree.path,
        });
        const persistedWorkspace = persistedRowsById.get(workspaceId);

        // Only create a fresh empty snapshot for true first-time workspaces.
        if (!persistedWorkspace) {
          await persistWorkspaceSnapshot({
            workspaceId,
            workspaceName,
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
            promptDraftByTask: {},
            editorTabs: [],
            activeEditorTabId: null,
            terminalTabs: [],
            activeTerminalTabId: null,
            terminalDocked: false,
            cliSessionTabs: [],
            activeCliSessionTabId: null,
            activeSurface: { kind: "task", taskId: "" },
            providerSessionByTask: {},
          });
        }

        newRows.push(
          persistedWorkspace ?? {
            id: workspaceId,
            name: workspaceName,
            updatedAt: new Date().toISOString(),
          },
        );
        newBranchById[workspaceId] = worktree.branch;
        newPathById[workspaceId] = worktree.path;
      }

      // Detect stale workspaces whose git worktrees no longer exist.
      const staleIds: string[] = [];
      for (const workspace of state.workspaces) {
        if (workspace.id === defaultWorkspaceId) continue;
        const wsPath = normalizeComparablePath(
          state.workspacePathById[workspace.id] ??
            `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: workspace.name })}`,
        );
        if (
          wsPath &&
          !registeredWorktreePaths.has(wsPath) &&
          !linkedWorktreePathSet.has(wsPath)
        ) {
          staleIds.push(workspace.id);
        }
      }
      for (const id of staleIds) {
        await closeWorkspacePersistence({ workspaceId: id });
      }

      // Nothing changed – skip store update.
      if (newRows.length === 0 && staleIds.length === 0) {
        return;
      }

      const staleIdSet = new Set(staleIds);
      set((current) => {
        let nextWorkspaces = current.workspaces;
        if (staleIds.length > 0) {
          nextWorkspaces = nextWorkspaces.filter(
            (ws) => !staleIdSet.has(ws.id),
          );
        }
        if (newRows.length > 0) {
          nextWorkspaces = [...nextWorkspaces, ...newRows];
        }

        const nextBranch = {
          ...current.workspaceBranchById,
          ...newBranchById,
        };
        const nextPath = { ...current.workspacePathById, ...newPathById };
        const nextDefault = { ...current.workspaceDefaultById };
        const nextRuntimeCache = { ...current.workspaceRuntimeCacheById };
        const nextTaskOwnership = { ...current.taskWorkspaceIdById };
        const staleWorkspacePaths = staleIds.map(
          (id) => current.workspacePathById[id],
        );

        for (const id of staleIds) {
          delete nextBranch[id];
          delete nextPath[id];
          delete nextDefault[id];
          delete nextRuntimeCache[id];
        }
        // Clean up task-workspace ownership for stale workspaces.
        if (staleIds.length > 0) {
          for (const [taskId, ownerId] of Object.entries(nextTaskOwnership)) {
            if (staleIdSet.has(ownerId)) {
              delete nextTaskOwnership[taskId];
            }
          }
        }

        // If the active workspace was removed, fall back to the default.
        let nextActiveWorkspaceId = current.activeWorkspaceId;
        if (staleIdSet.has(nextActiveWorkspaceId)) {
          nextActiveWorkspaceId =
            defaultWorkspaceId || nextWorkspaces[0]?.id || "";
        }

        return {
          workspaces: nextWorkspaces,
          activeWorkspaceId: nextActiveWorkspaceId,
          workspaceBranchById: nextBranch,
          workspacePathById: nextPath,
          workspaceDefaultById: nextDefault,
          workspaceFileCacheByPath: removeCachedWorkspaceFiles({
            workspaceFileCacheByPath: current.workspaceFileCacheByPath,
            workspacePaths: staleWorkspacePaths,
          }),
          workspaceRuntimeCacheById: nextRuntimeCache,
          taskWorkspaceIdById: nextTaskOwnership,
          recentProjects: current.projectPath
            ? upsertRecentProjectState({
                projects: current.recentProjects,
                project: {
                  projectPath: current.projectPath,
                  projectName: normalizeProjectDisplayName({
                    projectPath: current.projectPath,
                    projectName: current.projectName,
                  }),
                  lastOpenedAt:
                    current.recentProjects.find(
                      (p) => p.projectPath === current.projectPath,
                    )?.lastOpenedAt ?? new Date().toISOString(),
                  defaultBranch: current.defaultBranch,
                  workspaces: nextWorkspaces,
                  activeWorkspaceId: nextActiveWorkspaceId,
                  workspaceBranchById: nextBranch,
                  workspacePathById: nextPath,
                  workspaceDefaultById: nextDefault,
                  ...resolveRecentProjectPreferences({
                    projectPath: current.projectPath,
                    recentProjects: current.recentProjects,
                  }),
                },
              })
            : current.recentProjects,
        };
      });
    },
    hydrateNotifications: () => hydrateNotificationsAction({ set, get }),
    reconcileOrphanedNotifications: async () => {
      await reconcileOrphanedNotificationsAction({ set, get });
    },
    purgeWorkspaceNotifications: async ({ workspaceIds }) => {
      await purgeWorkspaceNotificationsAction({ set, get, workspaceIds });
    },
    flushActiveWorkspaceSnapshot: async ({ sync } = {}) => {
      const state = get();
      if (!state.hasHydratedWorkspaces) {
        return;
      }
      const workspaceId = state.activeWorkspaceId;
      const workspace = state.workspaces.find(
        (item) => item.id === workspaceId,
      );
      if (!workspaceId || !workspace) {
        return;
      }

      const snapshot = createWorkspaceSnapshot({
        activeTaskId: state.activeTaskId,
        tasks: state.tasks,
        messagesByTask: state.messagesByTask,
        promptDraftByTask: state.promptDraftByTask,
        workspaceInformation: state.workspaceInformation,
        editorTabs: state.editorTabs,
        activeEditorTabId: state.activeEditorTabId,
        terminalTabs: state.terminalTabs,
        activeTerminalTabId: state.activeTerminalTabId,
        terminalDocked: state.layout.terminalDocked,
        cliSessionTabs: state.cliSessionTabs,
        activeCliSessionTabId: state.activeCliSessionTabId,
        activeSurface: state.activeSurface,
        openTaskTabIds: state.openTaskTabIds,
        lensTabs: state.lensTabs,
        paneTabMeta: state.paneTabMeta,
        dockLayout: state.dockLayout,
        providerSessionByTask: state.providerSessionByTask,
      });

      if (sync) {
        const upsertSync = window.api?.persistence?.upsertWorkspaceSync;
        if (upsertSync) {
          upsertSync({
            id: workspaceId,
            name: workspace.name,
            snapshot,
          });
          return;
        }
      }

      await persistWorkspaceSnapshot({
        workspaceId,
        workspaceName: workspace.name,
        activeTaskId: state.activeTaskId,
        tasks: state.tasks,
        messagesByTask: state.messagesByTask,
        promptDraftByTask: state.promptDraftByTask,
        workspaceInformation: state.workspaceInformation,
        editorTabs: state.editorTabs,
        activeEditorTabId: state.activeEditorTabId,
        terminalTabs: state.terminalTabs,
        activeTerminalTabId: state.activeTerminalTabId,
        terminalDocked: state.layout.terminalDocked,
        cliSessionTabs: state.cliSessionTabs,
        activeCliSessionTabId: state.activeCliSessionTabId,
        activeSurface: state.activeSurface,
        openTaskTabIds: state.openTaskTabIds,
        lensTabs: state.lensTabs,
        paneTabMeta: state.paneTabMeta,
        dockLayout: state.dockLayout,
        providerSessionByTask: state.providerSessionByTask,
      });

      set((current) => {
        if (current.activeWorkspaceId !== workspaceId) {
          return current;
        }
        const compactedMessagesByTask = compactLoadedMessagesByTask({
          messagesByTask: current.messagesByTask,
          activeTaskId: current.activeTaskId,
          activeTurnIdsByTask: current.activeTurnIdsByTask,
          openTaskTabIds: current.openTaskTabIds,
        });
        if (compactedMessagesByTask === current.messagesByTask) {
          return current;
        }
        return {
          messagesByTask: compactedMessagesByTask,
        };
      });
    },
  };
}
