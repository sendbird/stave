import type { StoreApi } from "zustand";
import { listActiveWorkspaceTurns } from "@/lib/db/turns.db";
import {
  closeWorkspacePersistence,
  listWorkspaceSummaries,
  loadTaskMessagesPage,
  loadRepositoryRegistryState,
  loadWorkspaceShellForRestore,
  loadWorkspaceShellSummary,
  saveRepositoryRegistrySnapshot,
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
  captureCurrentRepositoryState,
  normalizeRepositoryDisplayName,
  normalizeRecentRepositoryStates,
  reconcileArchivedWorkspacePaths,
  registerTaskWorkspaceOwnership,
  resolveCurrentRepositoryDefaultWorkspaceId,
  resolveImportedWorktreeName,
  resolveRecentRepositoryPreferences,
  retainTaskWorkspaceOwnership,
  toWorkspaceFolderName,
  upsertRecentRepositoryState,
  type RecentRepositoryState,
} from "@/store/project.utils";
import {
  getArchivedWorktreePathSetForRepository,
  getLinkedWorktreePathSetForRepository,
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
import { trimPersistedMessageWindow } from "@/store/resident-message-budget";
import { restoreActiveTurnStreaming } from "@/store/host-task-turn-sync";
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

function mergeRecentRepositoriesByPath(args: {
  persistedRepositories: RecentRepositoryState[];
  stateRepositories: RecentRepositoryState[];
}) {
  const persistedRepositories = normalizeRecentRepositoryStates({
    repositories: args.persistedRepositories,
  });
  const stateRepositories = normalizeRecentRepositoryStates({
    repositories: args.stateRepositories,
  });
  let merged = persistedRepositories;
  for (const repository of stateRepositories) {
    const existing = merged.find(
      (item) => item.repositoryPath === repository.repositoryPath,
    );
    if (!existing || repository.lastOpenedAt >= existing.lastOpenedAt) {
      merged = upsertRecentRepositoryState({
        repositories: merged,
        repository,
      });
    }
  }
  // Archive tombstones must survive either durable source losing them —
  // otherwise `refreshWorkspaces` re-discovers a preserved dirty worktree and
  // the archived workspace resurrects. Union both sources per repository, minus
  // any path that is registered as a live workspace again.
  return merged.map((repository) => {
    const persisted = persistedRepositories.find(
      (item) => item.repositoryPath === repository.repositoryPath,
    );
    const fromState = stateRepositories.find(
      (item) => item.repositoryPath === repository.repositoryPath,
    );
    const archivedWorkspacePaths = reconcileArchivedWorkspacePaths({
      primary: persisted?.archivedWorkspacePaths,
      secondary: fromState?.archivedWorkspacePaths,
      workspacePathById: repository.workspacePathById,
    });
    const { archivedWorkspacePaths: _current, ...repositoryRest } = repository;
    return {
      ...repositoryRest,
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
  const activeTurnIdByTask = Object.fromEntries(
    latestTurns
      .filter((turn) => !turn.completedAt)
      .map((turn) => [turn.taskId, turn.id] as const),
  );
  const pageEntries = await Promise.all(
    [...initialTaskIds].map(async (taskId) => ({
      taskId,
      page: await loadTaskMessagesPage({
        workspaceId: args.workspaceId,
        taskId,
        limit: TASK_MESSAGES_PAGE_SIZE,
        offset: 0,
        // This loader is the live managed-task poll. Snapshot sealing here
        // would collapse CoT and promote interim every 3s while the host
        // turn is still running.
        preserveStreaming: Boolean(activeTurnIdByTask[taskId]),
      }),
    })),
  );
  const workspaceState = buildWorkspaceSessionStateFromShell({
    shell,
    messagesByTask: Object.fromEntries(
      pageEntries.map(({ taskId, page }) => [
        taskId,
        restoreActiveTurnStreaming({
          messages: trimPersistedMessageWindow({ messages: page.messages }),
          activeTurnId: activeTurnIdByTask[taskId],
        }),
      ] as const),
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
  | "hydrateRepositoryRegistry"
  | "flushRepositoryRegistry"
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
    hydrateRepositoryRegistry: async () => {
      const registry = await loadRepositoryRegistryState();
      const rawPersistedRepositories = registry.repositories as RecentRepositoryState[];
      const persistedRepositories = normalizeRecentRepositoryStates({
        repositories: rawPersistedRepositories,
      });
      if (persistedRepositories.length === 0) {
        return;
      }
      // Chromium's lightweight selection cache can be absent after a crash.
      // Restore the acknowledged selection without opening a different repository
      // over a user's in-flight selection. An explicit null stays unselected.
      const restoredRepository = registry.activeRepositoryPath
        ? persistedRepositories.find((repository) => repository.repositoryPath === registry.activeRepositoryPath)
        : undefined;
      if (!get().repositoryPath && restoredRepository) {
        set((current) => current.repositoryPath ? current : ({
          repositoryPath: restoredRepository.repositoryPath,
          repositoryName: restoredRepository.repositoryName,
          defaultBranch: restoredRepository.defaultBranch,
          workspaces: restoredRepository.workspaces,
          activeWorkspaceId: restoredRepository.activeWorkspaceId,
          workspaceBranchById: restoredRepository.workspaceBranchById,
          workspacePathById: restoredRepository.workspacePathById,
          workspaceDefaultById: restoredRepository.workspaceDefaultById,
          workspaceLastActiveAtById: restoredRepository.workspaceLastActiveAtById ?? {},
        }));
      }
      const state = get();
      const mergedRepositories = mergeRecentRepositoriesByPath({
        persistedRepositories,
        stateRepositories: state.recentRepositories,
      });
      const currentRepository = state.repositoryPath
        ? (mergedRepositories.find(
            (repository) => repository.repositoryPath === state.repositoryPath,
          ) ?? null)
        : null;
      if (
        currentRepository ||
        mergedRepositories.length !== state.recentRepositories.length
      ) {
        set(() => ({
          recentRepositories: mergedRepositories,
          ...(currentRepository
            ? {
                repositoryName: normalizeRepositoryDisplayName({
                  repositoryPath: currentRepository.repositoryPath,
                  repositoryName:
                    state.repositoryName?.trim() || currentRepository.repositoryName,
                }),
                defaultBranch:
                  state.defaultBranch || currentRepository.defaultBranch,
              }
            : {}),
        }));
      }
      if (
        JSON.stringify(rawPersistedRepositories) !== JSON.stringify(mergedRepositories)
      ) {
        await saveRepositoryRegistrySnapshot({
          repositories: mergedRepositories,
        });
      }
    },
    flushRepositoryRegistry: async () => {
      const state = get();
      const repositories = captureCurrentRepositoryState({
        recentRepositories: state.recentRepositories,
        repositoryPath: state.repositoryPath,
        repositoryName: state.repositoryPath
          ? normalizeRepositoryDisplayName({
              repositoryPath: state.repositoryPath,
              repositoryName: state.repositoryName,
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
      await saveRepositoryRegistrySnapshot({
        repositories,
        activeRepositoryPath: state.repositoryPath,
      });
    },
    hydrateWorkspaces: async () => {
      const workspaceIdentityRequestToken = beginWorkspaceIdentityRequest();
      await get().hydrateRepositoryRegistry();
      let initialRows = await listWorkspaceSummaries();
      const stateBeforeHydrate = get();
      const currentRepository = stateBeforeHydrate.repositoryPath
        ? (stateBeforeHydrate.recentRepositories.find(
            (repository) => repository.repositoryPath === stateBeforeHydrate.repositoryPath,
          ) ?? null)
        : null;
      const rememberedWorkspaceIds = new Set([
        ...(currentRepository?.workspaces.map((workspace) => workspace.id) ??
          stateBeforeHydrate.workspaces.map((workspace) => workspace.id)),
        ...Object.keys(
          currentRepository?.workspacePathById ??
            stateBeforeHydrate.workspacePathById,
        ),
      ]);
      const currentRepositoryDefaultWorkspaceId =
        resolveCurrentRepositoryDefaultWorkspaceId({
          repositoryPath: stateBeforeHydrate.repositoryPath,
          workspaces:
            currentRepository?.workspaces ?? stateBeforeHydrate.workspaces,
          workspaceDefaultById:
            currentRepository?.workspaceDefaultById ??
            stateBeforeHydrate.workspaceDefaultById,
          workspacePathById:
            currentRepository?.workspacePathById ??
            stateBeforeHydrate.workspacePathById,
        });
      if (initialRows.length === 0 && stateBeforeHydrate.repositoryPath) {
        await persistWorkspaceSnapshot({
          workspaceId: currentRepositoryDefaultWorkspaceId,
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
        currentRepository?.workspaces ?? stateBeforeHydrate.workspaces;
      let rows =
        rememberedWorkspaceIds.size > 0
          ? rememberedRows.map(
              (workspace) => persistedRowsById.get(workspace.id) ?? workspace,
            )
          : initialRows;
      if (rows.length === 0 && stateBeforeHydrate.repositoryPath) {
        rows = [
          {
            id: currentRepositoryDefaultWorkspaceId,
            name: defaultWorkspaceName,
            updatedAt: new Date().toISOString(),
          },
        ];
      }
      const defaultWorkspaceId = resolveCurrentRepositoryDefaultWorkspaceId({
        repositoryPath: stateBeforeHydrate.repositoryPath,
        workspaces: rows,
        workspaceDefaultById:
          currentRepository?.workspaceDefaultById ??
          stateBeforeHydrate.workspaceDefaultById,
        workspacePathById:
          currentRepository?.workspacePathById ??
          stateBeforeHydrate.workspacePathById,
      });
      const branchById: Record<string, string> = {
        ...(currentRepository?.workspaceBranchById ??
          stateBeforeHydrate.workspaceBranchById),
      };
      const pathById: Record<string, string> = {
        ...(currentRepository?.workspacePathById ??
          stateBeforeHydrate.workspacePathById),
      };
      const archivedWorktreePathSet = getArchivedWorktreePathSetForRepository({
        repositoryPath: stateBeforeHydrate.repositoryPath,
        recentRepositories: stateBeforeHydrate.recentRepositories,
      });
      if (archivedWorktreePathSet.size > 0) {
        const archivedRowIds = rows
          .filter((row) => {
            if (row.id === defaultWorkspaceId) {
              return false;
            }
            const comparablePath = normalizeComparablePath(
              pathById[row.id] ??
                (stateBeforeHydrate.repositoryPath
                  ? `${stateBeforeHydrate.repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`
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
      const repositoryPath = stateBeforeHydrate.repositoryPath;
      const linkedWorktreePathSet = getLinkedWorktreePathSetForRepository({
        repositoryPath: stateBeforeHydrate.repositoryPath,
        recentRepositories: stateBeforeHydrate.recentRepositories,
      });
      if (runner && repositoryPath) {
        await runner({ cwd: repositoryPath, command: "git worktree prune" });
        const listResult = await runner({
          cwd: repositoryPath,
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
                    ? repositoryPath
                    : `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
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
                  ? repositoryPath
                  : `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
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
              `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`;
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
                ? repositoryPath
                : `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`;
            }
          }

          const knownPaths = new Set(
            rows
              .map((row) =>
                normalizeComparablePath(
                  pathById[row.id] ??
                    (row.id === defaultWorkspaceId
                      ? repositoryPath
                      : `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
                ),
              )
              .filter(Boolean),
          );
          const currentRepositoryPath = normalizeComparablePath(repositoryPath);

          for (const worktree of discoveredWorktrees) {
            const normalizedWorktreePath = normalizeComparablePath(
              worktree.path,
            );
            if (
              !worktree.branch ||
              !normalizedWorktreePath ||
              normalizedWorktreePath === currentRepositoryPath ||
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
                      ? repositoryPath
                      : `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
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
                    `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`,
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
                repositoryPath,
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
        if (!pathById[row.id] && repositoryPath) {
          pathById[row.id] = isDefault
            ? repositoryPath
            : `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`;
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
      const repositoryFiles = resolveInitialWorkspaceFiles({
        workspacePath: preferredWorkspacePath,
        activeRepositoryPath: stateBeforeHydrate.repositoryPath,
        activeRepositoryFiles: stateBeforeHydrate.repositoryFiles,
        workspaceFileCacheByPath: stateBeforeHydrate.workspaceFileCacheByPath,
      });
      if (preferredWorkspacePath) {
        await workspaceFsAdapter.setRoot?.({
          rootPath: preferredWorkspacePath,
          rootName: stateBeforeHydrate.repositoryPath
            ? normalizeRepositoryDisplayName({
                repositoryPath: stateBeforeHydrate.repositoryPath,
                repositoryName: stateBeforeHydrate.repositoryName,
              })
            : "project",
          files: repositoryFiles,
        });
      }

      set((state) => {
        if (
          !isCurrentWorkspaceIdentityRequest(workspaceIdentityRequestToken) ||
          normalizeComparablePath(state.repositoryPath) !==
            normalizeComparablePath(stateBeforeHydrate.repositoryPath)
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
              (currentRepository?.workspacePathById ??
                stateBeforeHydrate.workspacePathById)[workspace.id] ??
              (workspace.id === defaultWorkspaceId
                ? stateBeforeHydrate.repositoryPath
                : null),
          );

        return {
          hasHydratedWorkspaces: true,
          workspaceSnapshotVersion: 0,
          promptDraftPersistenceVersion: 0,
          taskMessagesLoadingByTask: {},
          workspaces: rows,
          activeWorkspaceId: preferredWorkspaceId,
          recentRepositories: state.repositoryPath
            ? upsertRecentRepositoryState({
                repositories: state.recentRepositories,
                repository: {
                  repositoryPath: state.repositoryPath,
                  repositoryName: normalizeRepositoryDisplayName({
                    repositoryPath: state.repositoryPath,
                    repositoryName: state.repositoryName,
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
                  ...resolveRecentRepositoryPreferences({
                    repositoryPath: state.repositoryPath,
                    recentRepositories: state.recentRepositories,
                  }),
                },
              })
            : state.recentRepositories,
          workspaceDefaultById: defaultWorkspaceId
            ? { [defaultWorkspaceId]: true }
            : {},
          workspaceBranchById: branchById,
          workspacePathById: pathById,
          repositoryFiles,
          workspaceFileCacheByPath: rememberCachedWorkspaceFiles({
            workspaceFileCacheByPath: removeCachedWorkspaceFiles({
              workspaceFileCacheByPath: state.workspaceFileCacheByPath,
              workspacePaths: staleWorkspacePaths,
            }),
            workspacePath: preferredWorkspacePath,
            files: repositoryFiles,
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
      if (!state.hasHydratedWorkspaces || !state.repositoryPath) {
        return;
      }
      const runner = window.api?.terminal?.runCommand;
      if (!runner) {
        return;
      }
      const repositoryPath = state.repositoryPath;
      const persistedRowsById = new Map(
        (await listWorkspaceSummaries()).map(
          (workspace) => [workspace.id, workspace] as const,
        ),
      );

      // Prune and list current git worktrees.
      await runner({ cwd: repositoryPath, command: "git worktree prune" });
      const listResult = await runner({
        cwd: repositoryPath,
        command: "git worktree list --porcelain",
      });
      if (!listResult.ok) {
        return;
      }
      const discoveredWorktrees = parseGitWorktrees({
        stdout: listResult.stdout,
      });

      const defaultWorkspaceId = resolveCurrentRepositoryDefaultWorkspaceId({
        repositoryPath,
        workspaces: state.workspaces,
        workspaceDefaultById: state.workspaceDefaultById,
        workspacePathById: state.workspacePathById,
      });
      const archivedWorktreePathSet = getArchivedWorktreePathSetForRepository({
        repositoryPath,
        recentRepositories: state.recentRepositories,
      });
      const linkedWorktreePathSet = getLinkedWorktreePathSetForRepository({
        repositoryPath,
        recentRepositories: state.recentRepositories,
      });

      // Build set of known workspace paths for quick lookup.
      const knownPathToId = new Map<string, string>();
      for (const workspace of state.workspaces) {
        const wsPath = normalizeComparablePath(
          state.workspacePathById[workspace.id] ??
            (workspace.id === defaultWorkspaceId
              ? repositoryPath
              : `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: workspace.name })}`),
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
      const currentRepositoryPath = normalizeComparablePath(repositoryPath);

      // Detect new worktrees not yet tracked as workspaces.
      const newRows: WorkspaceSummary[] = [];
      const newBranchById: Record<string, string> = {};
      const newPathById: Record<string, string> = {};
      for (const worktree of discoveredWorktrees) {
        const normalizedWorktreePath = normalizeComparablePath(worktree.path);
        if (
          !worktree.branch ||
          !normalizedWorktreePath ||
          normalizedWorktreePath === currentRepositoryPath ||
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
          repositoryPath,
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
            `${repositoryPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: workspace.name })}`,
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
          recentRepositories: current.repositoryPath
            ? upsertRecentRepositoryState({
                repositories: current.recentRepositories,
                repository: {
                  repositoryPath: current.repositoryPath,
                  repositoryName: normalizeRepositoryDisplayName({
                    repositoryPath: current.repositoryPath,
                    repositoryName: current.repositoryName,
                  }),
                  lastOpenedAt:
                    current.recentRepositories.find(
                      (p) => p.repositoryPath === current.repositoryPath,
                    )?.lastOpenedAt ?? new Date().toISOString(),
                  defaultBranch: current.defaultBranch,
                  workspaces: nextWorkspaces,
                  activeWorkspaceId: nextActiveWorkspaceId,
                  workspaceBranchById: nextBranch,
                  workspacePathById: nextPath,
                  workspaceDefaultById: nextDefault,
                  ...resolveRecentRepositoryPreferences({
                    repositoryPath: current.repositoryPath,
                    recentRepositories: current.recentRepositories,
                  }),
                },
              })
            : current.recentRepositories,
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
    // `sync` is accepted for call-site compatibility but no longer changes
    // behaviour: the blocking `upsertWorkspaceSync` bridge is gone and quit
    // durability now comes from the main-process flush gate awaiting this
    // ordinary async write (see electron/main/persistence-flush-gate.ts).
    flushActiveWorkspaceSnapshot: async () => {
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

      await persistWorkspaceSnapshot({
        workspaceId,
        workspaceName: workspace.name,
        activeTaskId: state.activeTaskId,
        tasks: state.tasks,
        messagesByTask: state.messagesByTask,
        promptDraftByTask: state.promptDraftByTask,
        reviewCommentsByTask: state.reviewCommentsByTask,
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
        if (
          current.activeWorkspaceId !== workspaceId ||
          current.messagesByTask !== state.messagesByTask
        ) {
          // Messages arriving while the write was in flight are not covered
          // by its acknowledgement. Never evict those unsaved rows.
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
