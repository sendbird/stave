import type { StoreApi } from "zustand";
import { loadWorkspaceShell } from "@/lib/db/workspaces.db";
import { stampWorkspaceActive } from "@/lib/fleet/workspace-activity";
import { maybeRefreshMartinContext } from "@/lib/martin-sync/renderer-triggers";
import { workspaceFsAdapter } from "@/lib/fs";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";
import {
  getWorkspaceSwitchMetricNow,
  recordWorkspaceSwitchPhase,
  registerWorkspaceSwitchMetric,
} from "@/lib/performance/workspace-switch-metrics";
import { stampSidebarActiveWorkspaceDismissal } from "@/components/layout/ProjectWorkspaceSidebar.utils";
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
  areStringArraysEqual,
  captureCurrentProjectState,
  cloneRecentProjectState,
  isDefaultWorkspaceName,
  moveArrayItem,
  registerTaskWorkspaceOwnership,
  removeWorkspaceRuntimeCacheEntries,
  resolveRecentProjectPreferences,
  retainTaskWorkspaceOwnership,
  upsertRecentProjectState,
  type RecentProjectState,
} from "@/store/project.utils";
import {
  getLinkedWorktreePathSetForProject,
  startWorkspaceArchiveCleanup,
} from "@/store/workspace-archive-cleanup";
import {
  getCachedWorkspaceFiles,
  isWorkspaceTargetCurrent,
  rememberCachedWorkspaceFiles,
  removeCachedWorkspaceFiles,
  resolveWorkspacePathForId,
} from "@/store/workspace-file-cache";
import { saveActiveWorkspaceRuntimeCache } from "@/store/workspace-runtime-state";
import {
  buildWorkspaceSessionState,
  persistWorkspaceSnapshot,
  starterWorkspaceId,
} from "@/store/workspace-session-state";
import {
  shouldPreferLoadedWorkspaceState,
  shouldReloadWorkspaceShellFromPersistence,
} from "@/store/workspace-shell-summary";

let workspaceSwitchMetricTokenCounter = 0;
let workspaceIdentityRequestTokenCounter = 0;
let activeWorkspaceIdentityRequestToken = 0;

export function beginWorkspaceIdentityRequest() {
  workspaceIdentityRequestTokenCounter += 1;
  activeWorkspaceIdentityRequestToken = workspaceIdentityRequestTokenCounter;
  return activeWorkspaceIdentityRequestToken;
}

export function isCurrentWorkspaceIdentityRequest(token: number) {
  return token === activeWorkspaceIdentityRequestToken;
}

export function logWorkspaceSwitchMetric(args: {
  workspaceId: string;
  token?: number;
  phase: "active" | "files" | "messages";
  extra?: Record<string, unknown>;
}) {
  recordWorkspaceSwitchPhase(args);
}

type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createRefreshWorkspaceFilesInBackground(args: {
  set: StoreSet;
  get: StoreGet;
}): RefreshWorkspaceFilesInBackground {
  const { set, get } = args;
  const refreshWorkspaceFilesInBackground = (args: {
    workspaceId: string;
    workspacePath: string;
    switchMetricToken?: number;
  }) => {
    const stateBeforeRefresh = get();
    const activeWorkspacePath = resolveWorkspacePathForId({
      activeWorkspaceId: stateBeforeRefresh.activeWorkspaceId,
      workspacePathById: stateBeforeRefresh.workspacePathById,
      workspaceDefaultById: stateBeforeRefresh.workspaceDefaultById,
      projectPath: stateBeforeRefresh.projectPath,
    });
    if (
      stateBeforeRefresh.activeWorkspaceId !== args.workspaceId ||
      normalizeComparablePath(activeWorkspacePath) !==
        normalizeComparablePath(args.workspacePath) ||
      normalizeComparablePath(workspaceFsAdapter.getRootPath?.()) !==
        normalizeComparablePath(args.workspacePath)
    ) {
      return;
    }
    void workspaceFsAdapter
      .listFiles()
      .then((files) => {
        set((state) => {
          if (
            state.activeWorkspaceId !== args.workspaceId ||
            normalizeComparablePath(workspaceFsAdapter.getRootPath?.()) !==
              normalizeComparablePath(args.workspacePath)
          ) {
            return state;
          }
          const nextWorkspaceFileCacheByPath = rememberCachedWorkspaceFiles({
            workspaceFileCacheByPath: state.workspaceFileCacheByPath,
            workspacePath: args.workspacePath,
            files,
          });
          const activeWorkspacePath = resolveWorkspacePathForId({
            activeWorkspaceId: state.activeWorkspaceId,
            workspacePathById: state.workspacePathById,
            workspaceDefaultById: state.workspaceDefaultById,
            projectPath: state.projectPath,
          });
          const shouldUpdateActiveFiles =
            state.activeWorkspaceId === args.workspaceId &&
            activeWorkspacePath === args.workspacePath &&
            !areStringArraysEqual(state.projectFiles, files);
          if (
            !shouldUpdateActiveFiles &&
            nextWorkspaceFileCacheByPath === state.workspaceFileCacheByPath
          ) {
            return state;
          }
          return {
            workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
            ...(shouldUpdateActiveFiles ? { projectFiles: files } : {}),
          };
        });
        logWorkspaceSwitchMetric({
          workspaceId: args.workspaceId,
          token: args.switchMetricToken,
          phase: "files",
          extra: {
            fileCount: files.length,
          },
        });
      })
      .catch((error) => {
        console.warn("[workspace] failed to refresh workspace files", {
          workspaceId: args.workspaceId,
          workspacePath: args.workspacePath,
          error: String(error),
        });
      });
  };
  return refreshWorkspaceFilesInBackground;
}

type WorkspaceManagementActionKey =
  | "closeWorkspace"
  | "switchWorkspace"
  | "moveWorkspaceInProjectList"
  | "dismissSidebarActiveWorkspace"
  | "restoreSidebarActiveWorkspaces"
  | "renameWorkspace";

type WorkspaceManagementActions = Pick<AppState, WorkspaceManagementActionKey>;

export function createWorkspaceManagementActions(args: {
  set: StoreSet;
  get: StoreGet;
  loadWorkspaceShellStateFromPersistence: LoadWorkspaceShellStateFromPersistence;
  loadTaskMessagesIntoSession: LoadTaskMessagesIntoSession;
  hydrateWorkspaceMessagesInBackground: HydrateWorkspaceMessagesInBackground;
  refreshWorkspaceFilesInBackground: RefreshWorkspaceFilesInBackground;
}): WorkspaceManagementActions {
  const {
    set,
    get,
    loadWorkspaceShellStateFromPersistence,
    loadTaskMessagesIntoSession,
    hydrateWorkspaceMessagesInBackground,
    refreshWorkspaceFilesInBackground,
  } = args;

  return {
    closeWorkspace: async ({ workspaceId, deleteBranch = true }) => {
      const state = get();
      const workspace = state.workspaces.find(
        (item) => item.id === workspaceId,
      );
      const isProtectedDefault =
        state.workspaceDefaultById[workspaceId] ||
        workspaceId === starterWorkspaceId ||
        isDefaultWorkspaceName(workspace?.name);
      if (isProtectedDefault) {
        return;
      }
      // Unresolved approvals/questions never expire on their own.
      await get().purgeWorkspaceNotifications({
        workspaceIds: [workspaceId],
      });
      const workspacePath = state.workspacePathById[workspaceId];
      const workspaceBranch = state.workspaceBranchById[workspaceId];
      const projectPath = state.projectPath;
      const isLinkedWorktree = getLinkedWorktreePathSetForProject({
        projectPath,
        recentProjects: state.recentProjects,
      }).has(normalizeComparablePath(workspacePath));
      // Pick the replacement active workspace, ignoring the one being archived.
      const nextWorkspace =
        state.workspaces.find(
          (item) =>
            item.id !== workspaceId && state.workspaceDefaultById[item.id],
        ) ?? state.workspaces.find((item) => item.id !== workspaceId);
      if (!nextWorkspace) {
        const workspaceState = buildWorkspaceSessionState({
          snapshot: null,
        });
        set((nextState) => {
          const nextBranchById = { ...nextState.workspaceBranchById };
          const nextPathById = { ...nextState.workspacePathById };
          const nextDefaultById = { ...nextState.workspaceDefaultById };
          delete nextBranchById[workspaceId];
          delete nextPathById[workspaceId];
          delete nextDefaultById[workspaceId];
          const nextWorkspaces = nextState.workspaces.filter(
            (item) => item.id !== workspaceId,
          );
          const nextRuntimeCacheById = removeWorkspaceRuntimeCacheEntries({
            workspaceRuntimeCacheById: nextState.workspaceRuntimeCacheById,
            workspaceIds: [workspaceId],
          });
          const nextTaskWorkspaceIdById = Object.fromEntries(
            Object.entries(nextState.taskWorkspaceIdById).filter(
              ([, ownerWorkspaceId]) => ownerWorkspaceId !== workspaceId,
            ),
          );
          return {
            workspaces: nextWorkspaces,
            workspaceBranchById: nextBranchById,
            workspacePathById: nextPathById,
            workspaceDefaultById: nextDefaultById,
            activeWorkspaceId: "",
            recentProjects: captureCurrentProjectState({
              recentProjects: nextState.recentProjects,
              projectPath: nextState.projectPath,
              projectName: nextState.projectName,
              defaultBranch: nextState.defaultBranch,
              workspaces: nextWorkspaces,
              activeWorkspaceId: "",
              workspaceBranchById: nextBranchById,
              workspacePathById: nextPathById,
              workspaceDefaultById: nextDefaultById,
              workspaceLastActiveAtById: nextState.workspaceLastActiveAtById,
              archivedWorkspacePathsToAdd: [workspacePath],
              linkedWorkspacePathsToRemove: [workspacePath],
            }),
            workspaceSnapshotVersion: 0,
            workspaceFileCacheByPath: removeCachedWorkspaceFiles({
              workspaceFileCacheByPath: nextState.workspaceFileCacheByPath,
              workspacePaths: [workspacePath],
            }),
            workspaceRuntimeCacheById: nextRuntimeCacheById,
            taskWorkspaceIdById: nextTaskWorkspaceIdById,
            ...workspaceState,
            layout: {
              ...nextState.layout,
              terminalDocked: workspaceState.terminalDocked,
              editorDiffMode: resolveEditorDiffMode({
                editorTabs: workspaceState.editorTabs,
                activeEditorTabId: workspaceState.activeEditorTabId,
              }),
              editorMarkdownPreviewMode: false,
            },
          };
        });
        startWorkspaceArchiveCleanup({
          workspaceId,
          workspaceName: workspace?.name,
          workspacePath,
          workspaceBranch,
          projectPath,
          isLinkedWorktree,
          deleteBranch,
        });
        try {
          await get().flushProjectRegistry();
        } catch (error) {
          console.error(
            "[workspace-archive] flushProjectRegistry failed",
            { workspaceId },
            error,
          );
        }
        return;
      }
      await get().switchWorkspace({ workspaceId: nextWorkspace.id });
      set((nextState) => {
        const nextBranchById = { ...nextState.workspaceBranchById };
        const nextPathById = { ...nextState.workspacePathById };
        const nextDefaultById = { ...nextState.workspaceDefaultById };
        delete nextBranchById[workspaceId];
        delete nextPathById[workspaceId];
        delete nextDefaultById[workspaceId];
        const nextWorkspaces = nextState.workspaces.filter(
          (item) => item.id !== workspaceId,
        );
        const nextRuntimeCacheById = removeWorkspaceRuntimeCacheEntries({
          workspaceRuntimeCacheById: nextState.workspaceRuntimeCacheById,
          workspaceIds: [workspaceId],
        });
        const nextTaskWorkspaceIdById = Object.fromEntries(
          Object.entries(nextState.taskWorkspaceIdById).filter(
            ([, ownerWorkspaceId]) => ownerWorkspaceId !== workspaceId,
          ),
        );
        return {
          workspaces: nextWorkspaces,
          workspaceBranchById: nextBranchById,
          workspacePathById: nextPathById,
          workspaceDefaultById: nextDefaultById,
          recentProjects: captureCurrentProjectState({
            recentProjects: nextState.recentProjects,
            projectPath: nextState.projectPath,
            projectName: nextState.projectName,
            defaultBranch: nextState.defaultBranch,
            workspaces: nextWorkspaces,
            activeWorkspaceId: nextState.activeWorkspaceId,
            workspaceBranchById: nextBranchById,
            workspacePathById: nextPathById,
            workspaceDefaultById: nextDefaultById,
            workspaceLastActiveAtById: nextState.workspaceLastActiveAtById,
            archivedWorkspacePathsToAdd: [workspacePath],
            linkedWorkspacePathsToRemove: [workspacePath],
          }),
          workspaceFileCacheByPath: removeCachedWorkspaceFiles({
            workspaceFileCacheByPath: nextState.workspaceFileCacheByPath,
            workspacePaths: [workspacePath],
          }),
          workspaceRuntimeCacheById: nextRuntimeCacheById,
          taskWorkspaceIdById: nextTaskWorkspaceIdById,
        };
      });
      startWorkspaceArchiveCleanup({
        workspaceId,
        workspaceName: workspace?.name,
        workspacePath,
        workspaceBranch,
        projectPath,
        isLinkedWorktree,
        deleteBranch,
      });
      try {
        await get().flushProjectRegistry();
      } catch (error) {
        console.error(
          "[workspace-archive] flushProjectRegistry failed",
          { workspaceId },
          error,
        );
      }
    },
    switchWorkspace: async ({ workspaceId }) => {
      const current = get();
      if (workspaceId === current.activeWorkspaceId) {
        if (current.activeAppSurface.kind !== "workspace") {
          set(() => ({
            activeAppSurface: WORKSPACE_APP_SURFACE,
          }));
        }
        return;
      }
      if (
        !current.workspaces.some((workspace) => workspace.id === workspaceId)
      ) {
        return;
      }

      const workspacePath =
        current.workspacePathById[workspaceId] ??
        (current.workspaceDefaultById[workspaceId]
          ? (current.projectPath ?? undefined)
          : undefined);
      if (!workspacePath) {
        return;
      }
      const workspaceIdentityRequestToken = beginWorkspaceIdentityRequest();
      const switchMetricToken = ++workspaceSwitchMetricTokenCounter;
      const switchStartedAt = getWorkspaceSwitchMetricNow();
      let flushResolvedAt: number | undefined;
      // Persist the outgoing workspace before its state is swapped out.
      // Snapshot writes are otherwise driven by a single app-level trailing
      // debounce that always targets whichever workspace is active when it
      // fires, so switching re-targets that timer and silently drops the
      // pending write. The in-memory runtime cache keeps the UI looking
      // correct for the rest of the session, which is why the loss only
      // surfaces after a restart (e.g. an archived task coming back alive).
      // `activateProject` already flushes for the same reason.
      const flushWorkspacePromise = get()
        .flushActiveWorkspaceSnapshot()
        .then(() => {
          flushResolvedAt = getWorkspaceSwitchMetricNow();
        });
      const cachedFiles = getCachedWorkspaceFiles({
        workspacePath,
        workspaceFileCacheByPath: current.workspaceFileCacheByPath,
      });
      const cachedWorkspaceState =
        current.workspaceRuntimeCacheById[workspaceId];
      const shouldLoadWorkspaceShellState =
        !cachedWorkspaceState ||
        shouldReloadWorkspaceShellFromPersistence({ cachedWorkspaceState });
      let shellResolvedAt = !shouldLoadWorkspaceShellState
        ? switchStartedAt
        : undefined;
      let setRootResolvedAt = switchStartedAt;
      const workspaceShellPromise = !shouldLoadWorkspaceShellState
        ? Promise.resolve(null)
        : loadWorkspaceShellStateFromPersistence({ workspaceId }).then(
            (result) => {
              shellResolvedAt = getWorkspaceSwitchMetricNow();
              return result;
            },
          );
      const [, resolvedWorkspaceShellState] = await Promise.all([
        flushWorkspacePromise,
        workspaceShellPromise,
      ]);
      if (
        !isCurrentWorkspaceIdentityRequest(workspaceIdentityRequestToken) ||
        !isWorkspaceTargetCurrent({
          state: get(),
          workspaceId,
          workspacePath,
          projectPath: current.projectPath,
        })
      ) {
        return;
      }
      await Promise.resolve(
        workspaceFsAdapter.setRoot?.({
          rootPath: workspacePath,
          rootName: current.projectName ?? "project",
          files: cachedFiles,
        }),
      ).then(() => {
        setRootResolvedAt = getWorkspaceSwitchMetricNow();
      });
      if (
        !isCurrentWorkspaceIdentityRequest(workspaceIdentityRequestToken) ||
        !isWorkspaceTargetCurrent({
          state: get(),
          workspaceId,
          workspacePath,
          projectPath: current.projectPath,
        })
      ) {
        return;
      }
      const preferLoadedWorkspaceState = shouldPreferLoadedWorkspaceState({
        cachedWorkspaceState,
        loadedWorkspaceShellState: resolvedWorkspaceShellState,
      });
      const workspaceState =
        (preferLoadedWorkspaceState
          ? resolvedWorkspaceShellState?.workspaceState
          : (cachedWorkspaceState ??
            resolvedWorkspaceShellState?.workspaceState)) ??
        buildWorkspaceSessionState({ snapshot: null });
      set((state) => {
        if (
          !isCurrentWorkspaceIdentityRequest(workspaceIdentityRequestToken) ||
          !isWorkspaceTargetCurrent({
            state,
            workspaceId,
            workspacePath,
            projectPath: current.projectPath,
          })
        ) {
          return state;
        }
        const workspaceIds = state.workspaces.map((workspace) => workspace.id);
        const nextRuntimeCacheById = saveActiveWorkspaceRuntimeCache({
          state,
        });
        if (preferLoadedWorkspaceState) {
          delete nextRuntimeCacheById[workspaceId];
        }
        return {
          workspaces: state.workspaces,
          activeWorkspaceId: workspaceId,
          workspaceLastActiveAtById: stampWorkspaceActive({
            current: state.workspaceLastActiveAtById,
            workspaceId,
          }),
          activeAppSurface: WORKSPACE_APP_SURFACE,
          workspaceSnapshotVersion: 0,
          promptDraftPersistenceVersion: 0,
          taskMessagesLoadingByTask: {},
          workspaceRuntimeCacheById: nextRuntimeCacheById,
          taskWorkspaceIdById: registerTaskWorkspaceOwnership({
            taskWorkspaceIdById: retainTaskWorkspaceOwnership({
              taskWorkspaceIdById: state.taskWorkspaceIdById,
              workspaceIds,
            }),
            workspaceId,
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
          projectFiles: cachedFiles,
        };
      });
      if (get().activeWorkspaceId !== workspaceId) {
        return;
      }
      registerWorkspaceSwitchMetric({
        workspaceId,
        token: switchMetricToken,
        startedAt: switchStartedAt,
        cacheHit: Boolean(cachedWorkspaceState) && !preferLoadedWorkspaceState,
        ...(flushResolvedAt !== undefined ? { flushResolvedAt } : {}),
        ...(shellResolvedAt !== undefined ? { shellResolvedAt } : {}),
        setRootResolvedAt,
      });
      logWorkspaceSwitchMetric({
        workspaceId,
        token: switchMetricToken,
        phase: "active",
        extra: {
          taskCount: workspaceState.tasks.length,
          fileCount: cachedFiles.length,
        },
      });
      refreshWorkspaceFilesInBackground({
        workspaceId,
        workspacePath,
        switchMetricToken,
      });
      if (resolvedWorkspaceShellState) {
        if (
          preferLoadedWorkspaceState &&
          resolvedWorkspaceShellState.activeTaskIdForLatestHydration
        ) {
          void loadTaskMessagesIntoSession({
            workspaceId,
            taskId: resolvedWorkspaceShellState.activeTaskIdForLatestHydration,
            mode: "latest",
          });
        }
        hydrateWorkspaceMessagesInBackground({
          workspaceId,
          taskIds: resolvedWorkspaceShellState.initialTaskIds,
          latestTurns: resolvedWorkspaceShellState.latestTurns,
          switchMetricToken,
        });
      }
      maybeRefreshMartinContext({
        workspaceId,
        martinProject: get().workspaceInformation.martinProject,
      });
    },
    moveWorkspaceInProjectList: ({ projectPath, workspaceId, direction }) => {
      const normalizedProjectPath = projectPath.trim();
      const normalizedWorkspaceId = workspaceId.trim();
      if (!normalizedProjectPath || !normalizedWorkspaceId) {
        return;
      }

      set((state) => {
        const indexDelta = direction === "up" ? -1 : 1;

        if (state.projectPath === normalizedProjectPath) {
          const fromIndex = state.workspaces.findIndex(
            (workspace) => workspace.id === normalizedWorkspaceId,
          );
          const nextWorkspaces = moveArrayItem(
            state.workspaces,
            fromIndex,
            fromIndex + indexDelta,
          );
          if (nextWorkspaces === state.workspaces) {
            return state;
          }

          return {
            workspaces: nextWorkspaces,
            recentProjects: upsertRecentProjectState({
              projects: state.recentProjects,
              project: {
                projectPath: normalizedProjectPath,
                projectName: state.projectName ?? "project",
                lastOpenedAt:
                  state.recentProjects.find(
                    (project) => project.projectPath === normalizedProjectPath,
                  )?.lastOpenedAt ?? new Date().toISOString(),
                defaultBranch: state.defaultBranch,
                workspaces: nextWorkspaces,
                activeWorkspaceId: state.activeWorkspaceId,
                workspaceBranchById: state.workspaceBranchById,
                workspacePathById: state.workspacePathById,
                workspaceDefaultById: state.workspaceDefaultById,
                ...resolveRecentProjectPreferences({
                  projectPath: normalizedProjectPath,
                  recentProjects: state.recentProjects,
                }),
              },
            }),
          };
        }

        const projectIndex = state.recentProjects.findIndex(
          (project) => project.projectPath === normalizedProjectPath,
        );
        const project =
          projectIndex >= 0 ? state.recentProjects[projectIndex] : null;
        if (!project) {
          return state;
        }

        const fromIndex = project.workspaces.findIndex(
          (workspace) => workspace.id === normalizedWorkspaceId,
        );
        const nextWorkspaces = moveArrayItem(
          project.workspaces,
          fromIndex,
          fromIndex + indexDelta,
        );
        if (nextWorkspaces === project.workspaces) {
          return state;
        }

        const nextProject = {
          ...cloneRecentProjectState(project),
          workspaces: nextWorkspaces,
        } satisfies RecentProjectState;

        return {
          recentProjects: state.recentProjects.map((item, index) =>
            index === projectIndex
              ? nextProject
              : cloneRecentProjectState(item),
          ),
        };
      });
    },
    dismissSidebarActiveWorkspace: ({ workspaceId }) => {
      set((state) => {
        const next = stampSidebarActiveWorkspaceDismissal({
          current: state.sidebarActiveWorkspaceDismissedAtById,
          workspaceId,
        });
        return next === state.sidebarActiveWorkspaceDismissedAtById
          ? state
          : { sidebarActiveWorkspaceDismissedAtById: next };
      });
    },
    restoreSidebarActiveWorkspaces: () => {
      set((state) =>
        Object.keys(state.sidebarActiveWorkspaceDismissedAtById).length === 0
          ? state
          : { sidebarActiveWorkspaceDismissedAtById: {} },
      );
    },
    renameWorkspace: async ({ projectPath, workspaceId, name }) => {
      const normalizedWorkspaceId = workspaceId.trim();
      const normalizedName = name.trim();
      if (!normalizedWorkspaceId) {
        return { ok: false, message: "Workspace is required." };
      }
      if (!normalizedName) {
        return { ok: false, message: "Label is required." };
      }

      const stateBefore = get();
      const normalizedProjectPath =
        projectPath?.trim() || stateBefore.projectPath?.trim() || "";
      const targetProject =
        normalizedProjectPath &&
        normalizedProjectPath !== stateBefore.projectPath
          ? (stateBefore.recentProjects.find(
              (project) => project.projectPath === normalizedProjectPath,
            ) ?? null)
          : null;
      const targetWorkspace =
        stateBefore.workspaces.find(
          (workspace) => workspace.id === normalizedWorkspaceId,
        ) ??
        targetProject?.workspaces.find(
          (workspace) => workspace.id === normalizedWorkspaceId,
        ) ??
        null;
      const isDefaultWorkspace =
        stateBefore.workspaceDefaultById[normalizedWorkspaceId] === true ||
        targetProject?.workspaceDefaultById[normalizedWorkspaceId] === true;

      if (!targetWorkspace) {
        return { ok: false, message: "Workspace not found." };
      }
      if (isDefaultWorkspace) {
        return {
          ok: false,
          message: "Default workspace labels cannot be changed.",
        };
      }
      if (targetWorkspace.name === normalizedName) {
        return { ok: true };
      }

      set((state) => {
        const isCurrentProject =
          !normalizedProjectPath || normalizedProjectPath === state.projectPath;
        const nextWorkspaces = isCurrentProject
          ? state.workspaces.map((workspace) =>
              workspace.id === normalizedWorkspaceId
                ? { ...workspace, name: normalizedName }
                : workspace,
            )
          : state.workspaces;
        const currentProjects = captureCurrentProjectState({
          recentProjects: state.recentProjects,
          projectPath: state.projectPath,
          projectName: state.projectName,
          defaultBranch: state.defaultBranch,
          workspaces: nextWorkspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceBranchById: state.workspaceBranchById,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
          workspaceLastActiveAtById: state.workspaceLastActiveAtById,
        });
        const nextRecentProjects = currentProjects.map((project) => {
          if (project.projectPath !== normalizedProjectPath) {
            return cloneRecentProjectState(project);
          }
          return {
            ...cloneRecentProjectState(project),
            workspaces: project.workspaces.map((workspace) =>
              workspace.id === normalizedWorkspaceId
                ? { ...workspace, name: normalizedName }
                : workspace,
            ),
          };
        });

        return {
          workspaces: nextWorkspaces,
          recentProjects: nextRecentProjects,
        };
      });

      const shell = await loadWorkspaceShell({
        workspaceId: normalizedWorkspaceId,
      });
      if (shell) {
        await persistWorkspaceSnapshot({
          workspaceId: normalizedWorkspaceId,
          workspaceName: normalizedName,
          activeTaskId: shell.activeTaskId,
          tasks: shell.tasks,
          messagesByTask: {},
          promptDraftByTask: shell.promptDraftByTask,
          workspaceInformation: shell.workspaceInformation,
          editorTabs: shell.editorTabs ?? [],
          activeEditorTabId: shell.activeEditorTabId ?? null,
          terminalTabs: shell.terminalTabs ?? [],
          activeTerminalTabId: shell.activeTerminalTabId ?? null,
          terminalDocked: shell.terminalDocked ?? false,
          cliSessionTabs: shell.cliSessionTabs ?? [],
          activeCliSessionTabId: shell.activeCliSessionTabId ?? null,
          activeSurface: shell.activeSurface ?? {
            kind: "task",
            taskId: shell.activeTaskId,
          },
          openTaskTabIds: shell.openTaskTabIds,
          lensTabs: shell.lensTabs,
          paneTabMeta: shell.paneTabMeta,
          dockLayout: shell.dockLayout,
          providerSessionByTask: shell.providerSessionByTask,
        });
      }
      await get().flushProjectRegistry();
      return { ok: true };
    },
  };
}
