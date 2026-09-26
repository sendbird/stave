import type { StoreApi } from "zustand";
import type { PersistedTurnSummary } from "@/lib/db/turns.db";
import { loadWorkspaceShellSummary } from "@/lib/db/workspaces.db";
import { stampWorkspaceActive } from "@/lib/fleet/workspace-activity";
import { workspaceFsAdapter } from "@/lib/fs";
import { WORKSPACE_APP_SURFACE } from "@/store/app-surface";
import type { AppState } from "@/store/app-store.types";
import type {
  HydrateWorkspaceMessagesInBackground,
  LoadTaskMessagesIntoSession,
  LoadWorkspaceShellStateFromPersistence,
  RefreshWorkspaceFilesInBackground,
} from "@/store/app-store-workspace-action-types";
import { resolveEditorDiffMode } from "@/store/layout.utils";
import {
  buildRepositoryDefaultWorkspaceId,
  captureCurrentRepositoryState,
  cloneRecentRepositoryState,
  moveArrayItem,
  registerTaskWorkspaceOwnership,
  removeWorkspaceRuntimeCacheEntries,
  resolveRepositoryNameFromPath,
  resolveRecentRepositoryPreferences,
  retainTaskWorkspaceOwnership,
  upsertRecentRepositoryState,
  type RecentRepositoryState,
} from "@/store/project.utils";
import {
  rememberCachedWorkspaceFiles,
  removeCachedWorkspaceFiles,
  resolveInitialWorkspaceFiles,
  resolveWorkspacePathForId,
} from "@/store/workspace-file-cache";
import {
  listTaskIdsForWorkspaces,
  removeRecordEntries,
  removeTaskTurnRuntimeEntries,
} from "@/store/task-turn-runtime-cleanup";
import {
  saveActiveWorkspaceRuntimeCacheWithLensCleanup,
} from "@/store/workspace-runtime-state";
import {
  buildWorkspaceSessionState,
  buildWorkspaceSessionStateFromShell,
  createEmptyWorkspaceState,
  createWorkspaceSnapshot,
  defaultWorkspaceName,
  persistWorkspaceSnapshot,
} from "@/store/workspace-session-state";
import { closeTerminalSessionsForWorkspaces } from "@/store/workspace-terminal-cleanup";

type RepositoryActionKey =
  | "createRepository"
  | "openRepositoryFromPath"
  | "openRepository"
  | "removeRepositoryFromList"
  | "moveRepositoryInList";

type RepositoryActions = Pick<AppState, RepositoryActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createRepositoryActions(args: {
  set: StoreSet;
  get: StoreGet;
  loadWorkspaceShellStateFromPersistence: LoadWorkspaceShellStateFromPersistence;
  loadTaskMessagesIntoSession: LoadTaskMessagesIntoSession;
  hydrateWorkspaceMessagesInBackground: HydrateWorkspaceMessagesInBackground;
  refreshWorkspaceFilesInBackground: RefreshWorkspaceFilesInBackground;
}): RepositoryActions {
  const {
    set,
    get,
    loadWorkspaceShellStateFromPersistence,
    loadTaskMessagesIntoSession,
    hydrateWorkspaceMessagesInBackground,
    refreshWorkspaceFilesInBackground,
  } = args;

  const activateRepository = async (args: {
    repositoryRootPath: string;
    repositoryName: string;
    files: string[];
    defaultBranch: string;
  }) => {
    await get().flushActiveWorkspaceSnapshot();
    const stateBeforeSwitch = get();
    const savedWorkspaceRuntimeCacheById =
      saveActiveWorkspaceRuntimeCacheWithLensCleanup({
        state: stateBeforeSwitch,
      });
    const rememberedRepositories = captureCurrentRepositoryState({
      recentRepositories: stateBeforeSwitch.recentRepositories,
      repositoryPath: stateBeforeSwitch.repositoryPath,
      repositoryName: stateBeforeSwitch.repositoryName,
      defaultBranch: stateBeforeSwitch.defaultBranch,
      workspaces: stateBeforeSwitch.workspaces,
      activeWorkspaceId: stateBeforeSwitch.activeWorkspaceId,
      workspaceBranchById: stateBeforeSwitch.workspaceBranchById,
      workspacePathById: stateBeforeSwitch.workspacePathById,
      workspaceDefaultById: stateBeforeSwitch.workspaceDefaultById,
      workspaceLastActiveAtById: stateBeforeSwitch.workspaceLastActiveAtById,
    });
    const existingRepository =
      rememberedRepositories.find(
        (repository) => repository.repositoryPath === args.repositoryRootPath,
      ) ?? null;
    const nextWorkspaceFileCacheByPath = rememberCachedWorkspaceFiles({
      workspaceFileCacheByPath: stateBeforeSwitch.workspaceFileCacheByPath,
      workspacePath: args.repositoryRootPath,
      files: args.files,
    });

    if (stateBeforeSwitch.repositoryPath === args.repositoryRootPath) {
      set((state) => {
        const workspaceLastActiveAtById = stampWorkspaceActive({
          current: state.workspaceLastActiveAtById,
          workspaceId: state.activeWorkspaceId,
        });
        const activeWorkspaceLastActiveAt =
          workspaceLastActiveAtById[state.activeWorkspaceId];
        return {
          workspaceLastActiveAtById,
          recentRepositories: upsertRecentRepositoryState({
            repositories: rememberedRepositories,
            repository: {
              ...(existingRepository ?? {
                repositoryPath: args.repositoryRootPath,
                repositoryName: args.repositoryName,
                lastOpenedAt: new Date().toISOString(),
                defaultBranch: args.defaultBranch,
                workspaces: state.workspaces,
                activeWorkspaceId: state.activeWorkspaceId,
                workspaceBranchById: state.workspaceBranchById,
                workspacePathById: state.workspacePathById,
                workspaceDefaultById: state.workspaceDefaultById,
                ...resolveRecentRepositoryPreferences({
                  repositoryPath: args.repositoryRootPath,
                  recentRepositories: rememberedRepositories,
                }),
              }),
              ...(activeWorkspaceLastActiveAt
                ? {
                    workspaceLastActiveAtById: {
                      ...(existingRepository?.workspaceLastActiveAtById ?? {}),
                      [state.activeWorkspaceId]: activeWorkspaceLastActiveAt,
                    },
                  }
                : {}),
              repositoryName: args.repositoryName,
              defaultBranch: args.defaultBranch,
              lastOpenedAt: new Date().toISOString(),
            },
          }),
          defaultBranch: args.defaultBranch,
          repositoryName: args.repositoryName,
          repositoryFiles: args.files.length > 0 ? args.files : state.repositoryFiles,
          workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
          workspaceRuntimeCacheById: savedWorkspaceRuntimeCacheById,
        };
      });
      return;
    }

    await workspaceFsAdapter.setRoot?.({
      rootPath: args.repositoryRootPath,
      rootName: args.repositoryName,
      files: args.files,
    });

    if (existingRepository) {
      const nextRepository = {
        ...cloneRecentRepositoryState(existingRepository),
        repositoryName: args.repositoryName,
        defaultBranch: args.defaultBranch,
        lastOpenedAt: new Date().toISOString(),
      };
      const nextRepositoryWorkspaceIds = nextRepository.workspaces.map(
        (workspace) => workspace.id,
      );
      const cachedActiveWorkspaceState = nextRepository.activeWorkspaceId
        ? savedWorkspaceRuntimeCacheById[nextRepository.activeWorkspaceId]
        : undefined;
      const initialWorkspaceState =
        cachedActiveWorkspaceState ??
        buildWorkspaceSessionState({ snapshot: null });
      set((state) => {
        const workspaceLastActiveAtById = stampWorkspaceActive({
          current: state.workspaceLastActiveAtById,
          workspaceId: nextRepository.activeWorkspaceId,
        });
        const activeWorkspaceLastActiveAt =
          workspaceLastActiveAtById[nextRepository.activeWorkspaceId];
        const stampedNextRepository = {
          ...nextRepository,
          ...(activeWorkspaceLastActiveAt
            ? {
                workspaceLastActiveAtById: {
                  ...(nextRepository.workspaceLastActiveAtById ?? {}),
                  [nextRepository.activeWorkspaceId]: activeWorkspaceLastActiveAt,
                },
              }
            : {}),
        };
        return {
          hasHydratedWorkspaces: false,
          workspaceSnapshotVersion: 0,
          promptDraftPersistenceVersion: 0,
          taskMessagesLoadingByTask: {},
          workspaces: nextRepository.workspaces,
          activeWorkspaceId: nextRepository.activeWorkspaceId,
          // Opening a repository lands the user in this workspace without going
          // through switchWorkspace, so stamp it here too or the workspace people
          // actually use would look dormant to Fleet.
          workspaceLastActiveAtById,
          activeAppSurface: WORKSPACE_APP_SURFACE,
          repositoryPath: args.repositoryRootPath,
          recentRepositories: upsertRecentRepositoryState({
            repositories: rememberedRepositories,
            repository: stampedNextRepository,
          }),
          defaultBranch: nextRepository.defaultBranch,
          workspaceBranchById: nextRepository.workspaceBranchById,
          workspacePathById: nextRepository.workspacePathById,
          workspaceDefaultById: nextRepository.workspaceDefaultById,
          repositoryName: args.repositoryName,
          repositoryFiles: args.files,
          workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
          workspaceRuntimeCacheById: savedWorkspaceRuntimeCacheById,
          taskWorkspaceIdById: registerTaskWorkspaceOwnership({
            taskWorkspaceIdById: retainTaskWorkspaceOwnership({
              taskWorkspaceIdById: stateBeforeSwitch.taskWorkspaceIdById,
              workspaceIds: nextRepositoryWorkspaceIds,
            }),
            workspaceId: nextRepository.activeWorkspaceId,
            tasks: initialWorkspaceState.tasks,
          }),
          ...initialWorkspaceState,
          layout: {
            ...stateBeforeSwitch.layout,
            terminalDocked: initialWorkspaceState.terminalDocked,
            editorDiffMode: resolveEditorDiffMode({
              editorTabs: initialWorkspaceState.editorTabs,
              activeEditorTabId: initialWorkspaceState.activeEditorTabId,
            }),
            editorMarkdownPreviewMode: false,
          },
        };
      });
      await get().hydrateWorkspaces();
      return;
    }

    const defaultWorkspaceId = buildRepositoryDefaultWorkspaceId({
      repositoryPath: args.repositoryRootPath,
    });
    const now = new Date().toISOString();

    // Check if this workspace already has persisted data before overwriting.
    // When localStorage is cleared (e.g. dev-mode port change or origin switch),
    // the repository won't appear in recentRepositories even though the DB still holds
    // its tasks and messages.  Loading the existing snapshot prevents data loss.
    const existingShellSummary = await loadWorkspaceShellSummary({
      workspaceId: defaultWorkspaceId,
    });

    let workspaceState: ReturnType<typeof buildWorkspaceSessionStateFromShell>;
    let deferredWorkspaceMessageHydration: {
      workspaceId: string;
      activeTaskIdForLatestHydration: string | null;
      taskIds: string[];
      latestTurns: PersistedTurnSummary[];
    } | null = null;
    if (existingShellSummary) {
      const loadedWorkspaceShellState =
        await loadWorkspaceShellStateFromPersistence({
          workspaceId: defaultWorkspaceId,
        });
      workspaceState = loadedWorkspaceShellState.workspaceState;
      deferredWorkspaceMessageHydration = {
        workspaceId: defaultWorkspaceId,
        activeTaskIdForLatestHydration:
          loadedWorkspaceShellState.activeTaskIdForLatestHydration,
        taskIds: loadedWorkspaceShellState.initialTaskIds,
        latestTurns: loadedWorkspaceShellState.latestTurns,
      };
    } else {
      const empty = createEmptyWorkspaceState();
      await persistWorkspaceSnapshot({
        workspaceId: defaultWorkspaceId,
        workspaceName: defaultWorkspaceName,
        activeTaskId: empty.activeTaskId,
        tasks: empty.tasks,
        messagesByTask: empty.messagesByTask,
        promptDraftByTask: empty.promptDraftByTask,
        editorTabs: empty.editorTabs,
        activeEditorTabId: empty.activeEditorTabId,
        terminalTabs: empty.terminalTabs,
        activeTerminalTabId: empty.activeTerminalTabId,
        terminalDocked: empty.terminalDocked,
        cliSessionTabs: empty.cliSessionTabs,
        activeCliSessionTabId: empty.activeCliSessionTabId,
        activeSurface: empty.activeSurface,
        providerSessionByTask: empty.providerSessionByTask,
      });
      workspaceState = buildWorkspaceSessionState({
        snapshot: createWorkspaceSnapshot({
          activeTaskId: empty.activeTaskId,
          tasks: empty.tasks,
          messagesByTask: empty.messagesByTask,
          promptDraftByTask: empty.promptDraftByTask,
          editorTabs: empty.editorTabs,
          activeEditorTabId: empty.activeEditorTabId,
          terminalTabs: empty.terminalTabs,
          activeTerminalTabId: empty.activeTerminalTabId,
          terminalDocked: empty.terminalDocked,
          cliSessionTabs: empty.cliSessionTabs,
          activeCliSessionTabId: empty.activeCliSessionTabId,
          activeSurface: empty.activeSurface,
          providerSessionByTask: empty.providerSessionByTask,
        }),
      });
    }
    const nextRepository = {
      repositoryPath: args.repositoryRootPath,
      repositoryName: args.repositoryName,
      lastOpenedAt: now,
      defaultBranch: args.defaultBranch,
      workspaces: [
        {
          id: defaultWorkspaceId,
          name: defaultWorkspaceName,
          updatedAt: now,
        },
      ],
      activeWorkspaceId: defaultWorkspaceId,
      workspaceBranchById: { [defaultWorkspaceId]: args.defaultBranch },
      workspacePathById: { [defaultWorkspaceId]: args.repositoryRootPath },
      workspaceDefaultById: { [defaultWorkspaceId]: true },
      repositoryBasePrompt: "",
      kickoffBranchNamingRule: "",
      newWorkspaceInitCommand: "",
      newWorkspaceUseRootNodeModulesSymlink: false,
    } satisfies RecentRepositoryState;
    const nextRepositoryWorkspaceIds = nextRepository.workspaces.map(
      (workspace) => workspace.id,
    );

    set((state) => {
      const workspaceLastActiveAtById = stampWorkspaceActive({
        current: state.workspaceLastActiveAtById,
        workspaceId: nextRepository.activeWorkspaceId,
      });
      const activeWorkspaceLastActiveAt =
        workspaceLastActiveAtById[nextRepository.activeWorkspaceId];
      const stampedNextRepository = {
        ...nextRepository,
        ...(activeWorkspaceLastActiveAt
          ? {
              workspaceLastActiveAtById: {
                [nextRepository.activeWorkspaceId]: activeWorkspaceLastActiveAt,
              },
            }
          : {}),
      };
      return {
        hasHydratedWorkspaces: true,
        workspaceSnapshotVersion: 0,
        workspaces: nextRepository.workspaces,
        activeWorkspaceId: nextRepository.activeWorkspaceId,
        workspaceLastActiveAtById,
        activeAppSurface: WORKSPACE_APP_SURFACE,
        repositoryPath: args.repositoryRootPath,
        recentRepositories: upsertRecentRepositoryState({
          repositories: rememberedRepositories,
          repository: stampedNextRepository,
        }),
        defaultBranch: args.defaultBranch,
        workspaceBranchById: nextRepository.workspaceBranchById,
        workspacePathById: nextRepository.workspacePathById,
        workspaceDefaultById: nextRepository.workspaceDefaultById,
        ...workspaceState,
        layout: {
          ...get().layout,
          terminalDocked: workspaceState.terminalDocked,
          editorDiffMode: resolveEditorDiffMode({
            editorTabs: workspaceState.editorTabs,
            activeEditorTabId: workspaceState.activeEditorTabId,
          }),
          editorMarkdownPreviewMode: false,
        },
        repositoryName: args.repositoryName,
        repositoryFiles: args.files,
        workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
        workspaceRuntimeCacheById: savedWorkspaceRuntimeCacheById,
        taskWorkspaceIdById: registerTaskWorkspaceOwnership({
          taskWorkspaceIdById: retainTaskWorkspaceOwnership({
            taskWorkspaceIdById: stateBeforeSwitch.taskWorkspaceIdById,
            workspaceIds: nextRepositoryWorkspaceIds,
          }),
          workspaceId: nextRepository.activeWorkspaceId,
          tasks: workspaceState.tasks,
        }),
      };
    });
    if (deferredWorkspaceMessageHydration?.activeTaskIdForLatestHydration) {
      void loadTaskMessagesIntoSession({
        workspaceId: defaultWorkspaceId,
        taskId:
          deferredWorkspaceMessageHydration.activeTaskIdForLatestHydration,
        mode: "latest",
      });
    }
    if (deferredWorkspaceMessageHydration) {
      hydrateWorkspaceMessagesInBackground(deferredWorkspaceMessageHydration);
    }
  };

  return {
    createRepository: async ({ name }) => {
      const root = await workspaceFsAdapter.pickRoot();
      if (!root || !root.rootPath) {
        return;
      }
      const repositoryRootPath = root.rootPath;

      const terminalRun = window.api?.terminal?.runCommand;
      let defaultBranch = "main";
      if (terminalRun) {
        const branchResult = await terminalRun({
          cwd: repositoryRootPath,
          command:
            "git symbolic-ref --short refs/remotes/origin/HEAD || git symbolic-ref --short HEAD || echo main",
        });
        const branchLine = (branchResult.stdout || "")
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0);
        if (branchLine) {
          defaultBranch = branchLine.replace(/^origin\//, "");
        }
      }

      const repositoryName =
        name?.trim() ||
        root.rootName ||
        resolveRepositoryNameFromPath({ repositoryPath: repositoryRootPath });
      await activateRepository({
        repositoryRootPath,
        repositoryName,
        files: root.files,
        defaultBranch,
      });
    },
    openRepositoryFromPath: async ({ inputPath }) => {
      const resolvePath = window.api?.fs?.resolvePath;
      if (!resolvePath) {
        return { ok: false, stderr: "Filesystem bridge unavailable." };
      }
      const result = await resolvePath({ inputPath });
      if (!result.ok || !result.rootPath) {
        return { ok: false, stderr: result.stderr || "Invalid path." };
      }

      const repositoryRootPath = result.rootPath;
      const repositoryName =
        result.rootName ||
        resolveRepositoryNameFromPath({ repositoryPath: repositoryRootPath });

      const terminalRun = window.api?.terminal?.runCommand;
      let defaultBranch = "main";
      if (terminalRun) {
        const branchResult = await terminalRun({
          cwd: repositoryRootPath,
          command:
            "git symbolic-ref --short refs/remotes/origin/HEAD || git symbolic-ref --short HEAD || echo main",
        });
        const branchLine = (branchResult.stdout || "")
          .split("\n")
          .map((line: string) => line.trim())
          .find((line: string) => line.length > 0);
        if (branchLine) {
          defaultBranch = branchLine.replace(/^origin\//, "");
        }
      }

      await activateRepository({
        repositoryRootPath,
        repositoryName,
        files: result.files ?? [],
        defaultBranch,
      });
      return { ok: true };
    },
    openRepository: async ({ repositoryPath }) => {
      const normalizedRepositoryPath = repositoryPath.trim();
      if (!normalizedRepositoryPath) {
        return;
      }

      const state = get();
      const rememberedRepository = state.recentRepositories.find(
        (repository) => repository.repositoryPath === normalizedRepositoryPath,
      );
      const repositoryName =
        rememberedRepository?.repositoryName ||
        resolveRepositoryNameFromPath({ repositoryPath: normalizedRepositoryPath });
      const files = resolveInitialWorkspaceFiles({
        workspacePath: normalizedRepositoryPath,
        activeRepositoryPath: state.repositoryPath,
        activeRepositoryFiles:
          rememberedRepository?.repositoryPath === state.repositoryPath
            ? state.repositoryFiles
            : [],
        workspaceFileCacheByPath: state.workspaceFileCacheByPath,
      });

      await workspaceFsAdapter.setRoot?.({
        rootPath: normalizedRepositoryPath,
        rootName: repositoryName,
        files,
      });

      await activateRepository({
        repositoryRootPath: normalizedRepositoryPath,
        repositoryName,
        files,
        defaultBranch:
          rememberedRepository?.defaultBranch || state.defaultBranch || "main",
      });

      const nextState = get();
      const nextWorkspacePath = resolveWorkspacePathForId({
        activeWorkspaceId: nextState.activeWorkspaceId,
        workspacePathById: nextState.workspacePathById,
        workspaceDefaultById: nextState.workspaceDefaultById,
        repositoryPath: nextState.repositoryPath,
      });
      if (nextState.activeWorkspaceId && nextWorkspacePath) {
        const nextCachedFiles = resolveInitialWorkspaceFiles({
          workspacePath: nextWorkspacePath,
          activeRepositoryPath: nextState.repositoryPath,
          activeRepositoryFiles: nextState.repositoryFiles,
          workspaceFileCacheByPath: nextState.workspaceFileCacheByPath,
        });
        void Promise.resolve(
          workspaceFsAdapter.setRoot?.({
            rootPath: nextWorkspacePath,
            rootName: nextState.repositoryName ?? repositoryName,
            files: nextCachedFiles,
          }),
        ).then(() => {
          refreshWorkspaceFilesInBackground({
            workspaceId: nextState.activeWorkspaceId,
            workspacePath: nextWorkspacePath,
          });
        });
      }
    },
    removeRepositoryFromList: async ({ repositoryPath }) => {
      const normalizedRepositoryPath = repositoryPath.trim();
      if (!normalizedRepositoryPath) {
        return;
      }

      const stateBefore = get();
      const isCurrentRepository =
        stateBefore.repositoryPath === normalizedRepositoryPath;
      if (isCurrentRepository) {
        await get().flushActiveWorkspaceSnapshot();
      }

      const currentState = get();
      const matchingRepositoryForCleanup = currentState.recentRepositories.find(
        (repository) => repository.repositoryPath === normalizedRepositoryPath,
      );
      const workspaceIdsForCleanup = [
        ...(matchingRepositoryForCleanup?.workspaces.map(
          (workspace) => workspace.id,
        ) ?? []),
        ...(isCurrentRepository
          ? currentState.workspaces.map((workspace) => workspace.id)
          : []),
      ];
      await closeTerminalSessionsForWorkspaces(workspaceIdsForCleanup);
      await get().purgeWorkspaceNotifications({
        workspaceIds: workspaceIdsForCleanup,
      });

      set((state) => {
        const matchingRepository = state.recentRepositories.find(
          (repository) => repository.repositoryPath === normalizedRepositoryPath,
        );
        const workspaceIds = new Set<string>([
          ...(matchingRepository?.workspaces.map((workspace) => workspace.id) ??
            []),
          ...(isCurrentRepository
            ? state.workspaces.map((workspace) => workspace.id)
            : []),
        ]);
        const nextRuntimeCacheById = removeWorkspaceRuntimeCacheEntries({
          workspaceRuntimeCacheById: state.workspaceRuntimeCacheById,
          workspaceIds: [...workspaceIds],
        });
        const nextWorkspaceFileCacheByPath = removeCachedWorkspaceFiles({
          workspaceFileCacheByPath: state.workspaceFileCacheByPath,
          workspacePaths: [
            normalizedRepositoryPath,
            ...Object.values(matchingRepository?.workspacePathById ?? {}),
            ...(isCurrentRepository ? Object.values(state.workspacePathById) : []),
          ],
        });
        const nextTaskWorkspaceIdById = Object.fromEntries(
          Object.entries(state.taskWorkspaceIdById).filter(
            ([, workspaceId]) => !workspaceIds.has(workspaceId),
          ),
        );
        const nextRecentRepositories = state.recentRepositories.filter(
          (repository) => repository.repositoryPath !== normalizedRepositoryPath,
        );
        // Tasks removed with the repository would otherwise strand their turn
        // runtime snapshots and persisted checkpoint/verification entries.
        const removedTaskIds = [
          ...new Set([
            ...listTaskIdsForWorkspaces({
              taskWorkspaceIdById: state.taskWorkspaceIdById,
              workspaceIds: [...workspaceIds],
            }),
            ...[...workspaceIds].flatMap((removedWorkspaceId) =>
              (
                state.workspaceRuntimeCacheById[removedWorkspaceId]?.tasks ?? []
              ).map((task) => task.id),
            ),
            ...(isCurrentRepository ? state.tasks.map((task) => task.id) : []),
          ]),
        ];
        const turnRuntimePatch = removeTaskTurnRuntimeEntries({
          state,
          taskIds: removedTaskIds,
        });
        const nextTurnVerificationByWorkspace = removeRecordEntries(
          state.turnVerificationByWorkspace,
          [...workspaceIds],
        );
        const turnVerificationPatch = nextTurnVerificationByWorkspace
          ? { turnVerificationByWorkspace: nextTurnVerificationByWorkspace }
          : {};

        if (!isCurrentRepository) {
          const nextTaskCheckpointById = removeRecordEntries(
            state.taskCheckpointById,
            removedTaskIds,
          );
          return {
            recentRepositories: nextRecentRepositories,
            workspaceRuntimeCacheById: nextRuntimeCacheById,
            workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
            taskWorkspaceIdById: nextTaskWorkspaceIdById,
            ...turnRuntimePatch,
            ...turnVerificationPatch,
            ...(nextTaskCheckpointById
              ? { taskCheckpointById: nextTaskCheckpointById }
              : {}),
          };
        }

        const emptyWorkspaceState = buildWorkspaceSessionState({
          snapshot: null,
        });
        return {
          ...turnRuntimePatch,
          ...turnVerificationPatch,
          hasHydratedWorkspaces: false,
          workspaceSnapshotVersion: 0,
          workspaces: [],
          activeWorkspaceId: "",
          repositoryPath: null,
          recentRepositories: nextRecentRepositories,
          defaultBranch: "main",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
          repositoryName: null,
          repositoryFiles: [],
          workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
          taskCheckpointById: {},
          workspaceRuntimeCacheById: nextRuntimeCacheById,
          taskWorkspaceIdById: nextTaskWorkspaceIdById,
          layout: {
            ...state.layout,
            sidebarOverlayVisible: false,
            terminalDocked: false,
          },
          ...emptyWorkspaceState,
        };
      });
    },
    moveRepositoryInList: ({ repositoryPath, direction }) => {
      const normalizedRepositoryPath = repositoryPath.trim();
      if (!normalizedRepositoryPath) {
        return;
      }

      set((state) => {
        const currentRepositories = captureCurrentRepositoryState({
          recentRepositories: state.recentRepositories,
          repositoryPath: state.repositoryPath,
          repositoryName: state.repositoryName,
          defaultBranch: state.defaultBranch,
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceBranchById: state.workspaceBranchById,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
          workspaceLastActiveAtById: state.workspaceLastActiveAtById,
        });
        const fromIndex = currentRepositories.findIndex(
          (repository) => repository.repositoryPath === normalizedRepositoryPath,
        );
        const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
        const nextRepositories = moveArrayItem(currentRepositories, fromIndex, toIndex);
        return nextRepositories === currentRepositories
          ? state
          : { recentRepositories: nextRepositories };
      });
    },
  };
}
