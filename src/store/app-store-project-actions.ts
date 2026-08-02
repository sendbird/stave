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
  buildProjectDefaultWorkspaceId,
  captureCurrentProjectState,
  cloneRecentProjectState,
  moveArrayItem,
  registerTaskWorkspaceOwnership,
  removeWorkspaceRuntimeCacheEntries,
  resolveProjectNameFromPath,
  resolveRecentProjectPreferences,
  retainTaskWorkspaceOwnership,
  upsertRecentProjectState,
  type RecentProjectState,
} from "@/store/project.utils";
import {
  rememberCachedWorkspaceFiles,
  removeCachedWorkspaceFiles,
  resolveInitialWorkspaceFiles,
  resolveWorkspacePathForId,
} from "@/store/workspace-file-cache";
import { saveActiveWorkspaceRuntimeCache } from "@/store/workspace-runtime-state";
import {
  buildWorkspaceSessionState,
  buildWorkspaceSessionStateFromShell,
  createEmptyWorkspaceState,
  createWorkspaceSnapshot,
  defaultWorkspaceName,
  persistWorkspaceSnapshot,
} from "@/store/workspace-session-state";
import { closeTerminalSessionsForWorkspaces } from "@/store/workspace-terminal-cleanup";

type ProjectActionKey =
  | "createProject"
  | "openProjectFromPath"
  | "openProject"
  | "removeProjectFromList"
  | "moveProjectInList";

type ProjectActions = Pick<AppState, ProjectActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createProjectActions(args: {
  set: StoreSet;
  get: StoreGet;
  loadWorkspaceShellStateFromPersistence: LoadWorkspaceShellStateFromPersistence;
  loadTaskMessagesIntoSession: LoadTaskMessagesIntoSession;
  hydrateWorkspaceMessagesInBackground: HydrateWorkspaceMessagesInBackground;
  refreshWorkspaceFilesInBackground: RefreshWorkspaceFilesInBackground;
}): ProjectActions {
  const {
    set,
    get,
    loadWorkspaceShellStateFromPersistence,
    loadTaskMessagesIntoSession,
    hydrateWorkspaceMessagesInBackground,
    refreshWorkspaceFilesInBackground,
  } = args;

  const activateProject = async (args: {
    projectRootPath: string;
    projectName: string;
    files: string[];
    defaultBranch: string;
  }) => {
    await get().flushActiveWorkspaceSnapshot({ sync: true });
    const stateBeforeSwitch = get();
    const savedWorkspaceRuntimeCacheById = saveActiveWorkspaceRuntimeCache({
      state: stateBeforeSwitch,
    });
    const rememberedProjects = captureCurrentProjectState({
      recentProjects: stateBeforeSwitch.recentProjects,
      projectPath: stateBeforeSwitch.projectPath,
      projectName: stateBeforeSwitch.projectName,
      defaultBranch: stateBeforeSwitch.defaultBranch,
      workspaces: stateBeforeSwitch.workspaces,
      activeWorkspaceId: stateBeforeSwitch.activeWorkspaceId,
      workspaceBranchById: stateBeforeSwitch.workspaceBranchById,
      workspacePathById: stateBeforeSwitch.workspacePathById,
      workspaceDefaultById: stateBeforeSwitch.workspaceDefaultById,
      workspaceLastActiveAtById: stateBeforeSwitch.workspaceLastActiveAtById,
    });
    const existingProject =
      rememberedProjects.find(
        (project) => project.projectPath === args.projectRootPath,
      ) ?? null;
    const nextWorkspaceFileCacheByPath = rememberCachedWorkspaceFiles({
      workspaceFileCacheByPath: stateBeforeSwitch.workspaceFileCacheByPath,
      workspacePath: args.projectRootPath,
      files: args.files,
    });

    if (stateBeforeSwitch.projectPath === args.projectRootPath) {
      set((state) => {
        const workspaceLastActiveAtById = stampWorkspaceActive({
          current: state.workspaceLastActiveAtById,
          workspaceId: state.activeWorkspaceId,
        });
        const activeWorkspaceLastActiveAt =
          workspaceLastActiveAtById[state.activeWorkspaceId];
        return {
          workspaceLastActiveAtById,
          recentProjects: upsertRecentProjectState({
            projects: rememberedProjects,
            project: {
              ...(existingProject ?? {
                projectPath: args.projectRootPath,
                projectName: args.projectName,
                lastOpenedAt: new Date().toISOString(),
                defaultBranch: args.defaultBranch,
                workspaces: state.workspaces,
                activeWorkspaceId: state.activeWorkspaceId,
                workspaceBranchById: state.workspaceBranchById,
                workspacePathById: state.workspacePathById,
                workspaceDefaultById: state.workspaceDefaultById,
                ...resolveRecentProjectPreferences({
                  projectPath: args.projectRootPath,
                  recentProjects: rememberedProjects,
                }),
              }),
              ...(activeWorkspaceLastActiveAt
                ? {
                    workspaceLastActiveAtById: {
                      ...(existingProject?.workspaceLastActiveAtById ?? {}),
                      [state.activeWorkspaceId]: activeWorkspaceLastActiveAt,
                    },
                  }
                : {}),
              projectName: args.projectName,
              defaultBranch: args.defaultBranch,
              lastOpenedAt: new Date().toISOString(),
            },
          }),
          defaultBranch: args.defaultBranch,
          projectName: args.projectName,
          projectFiles: args.files.length > 0 ? args.files : state.projectFiles,
          workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
          workspaceRuntimeCacheById: savedWorkspaceRuntimeCacheById,
        };
      });
      return;
    }

    await workspaceFsAdapter.setRoot?.({
      rootPath: args.projectRootPath,
      rootName: args.projectName,
      files: args.files,
    });

    if (existingProject) {
      const nextProject = {
        ...cloneRecentProjectState(existingProject),
        projectName: args.projectName,
        defaultBranch: args.defaultBranch,
        lastOpenedAt: new Date().toISOString(),
      };
      const nextProjectWorkspaceIds = nextProject.workspaces.map(
        (workspace) => workspace.id,
      );
      const cachedActiveWorkspaceState = nextProject.activeWorkspaceId
        ? savedWorkspaceRuntimeCacheById[nextProject.activeWorkspaceId]
        : undefined;
      const initialWorkspaceState =
        cachedActiveWorkspaceState ??
        buildWorkspaceSessionState({ snapshot: null });
      set((state) => {
        const workspaceLastActiveAtById = stampWorkspaceActive({
          current: state.workspaceLastActiveAtById,
          workspaceId: nextProject.activeWorkspaceId,
        });
        const activeWorkspaceLastActiveAt =
          workspaceLastActiveAtById[nextProject.activeWorkspaceId];
        const stampedNextProject = {
          ...nextProject,
          ...(activeWorkspaceLastActiveAt
            ? {
                workspaceLastActiveAtById: {
                  ...(nextProject.workspaceLastActiveAtById ?? {}),
                  [nextProject.activeWorkspaceId]: activeWorkspaceLastActiveAt,
                },
              }
            : {}),
        };
        return {
          hasHydratedWorkspaces: false,
          workspaceSnapshotVersion: 0,
          promptDraftPersistenceVersion: 0,
          taskMessagesLoadingByTask: {},
          workspaces: nextProject.workspaces,
          activeWorkspaceId: nextProject.activeWorkspaceId,
          // Opening a project lands the user in this workspace without going
          // through switchWorkspace, so stamp it here too or the workspace people
          // actually use would look dormant to Fleet.
          workspaceLastActiveAtById,
          activeAppSurface: WORKSPACE_APP_SURFACE,
          projectPath: args.projectRootPath,
          recentProjects: upsertRecentProjectState({
            projects: rememberedProjects,
            project: stampedNextProject,
          }),
          defaultBranch: nextProject.defaultBranch,
          workspaceBranchById: nextProject.workspaceBranchById,
          workspacePathById: nextProject.workspacePathById,
          workspaceDefaultById: nextProject.workspaceDefaultById,
          projectName: args.projectName,
          projectFiles: args.files,
          workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
          workspaceRuntimeCacheById: savedWorkspaceRuntimeCacheById,
          taskWorkspaceIdById: registerTaskWorkspaceOwnership({
            taskWorkspaceIdById: retainTaskWorkspaceOwnership({
              taskWorkspaceIdById: stateBeforeSwitch.taskWorkspaceIdById,
              workspaceIds: nextProjectWorkspaceIds,
            }),
            workspaceId: nextProject.activeWorkspaceId,
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

    const defaultWorkspaceId = buildProjectDefaultWorkspaceId({
      projectPath: args.projectRootPath,
    });
    const now = new Date().toISOString();

    // Check if this workspace already has persisted data before overwriting.
    // When localStorage is cleared (e.g. dev-mode port change or origin switch),
    // the project won't appear in recentProjects even though the DB still holds
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
    const nextProject = {
      projectPath: args.projectRootPath,
      projectName: args.projectName,
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
      workspacePathById: { [defaultWorkspaceId]: args.projectRootPath },
      workspaceDefaultById: { [defaultWorkspaceId]: true },
      projectBasePrompt: "",
      kickoffBranchNamingRule: "",
      newWorkspaceInitCommand: "",
      newWorkspaceUseRootNodeModulesSymlink: false,
    } satisfies RecentProjectState;
    const nextProjectWorkspaceIds = nextProject.workspaces.map(
      (workspace) => workspace.id,
    );

    set((state) => {
      const workspaceLastActiveAtById = stampWorkspaceActive({
        current: state.workspaceLastActiveAtById,
        workspaceId: nextProject.activeWorkspaceId,
      });
      const activeWorkspaceLastActiveAt =
        workspaceLastActiveAtById[nextProject.activeWorkspaceId];
      const stampedNextProject = {
        ...nextProject,
        ...(activeWorkspaceLastActiveAt
          ? {
              workspaceLastActiveAtById: {
                [nextProject.activeWorkspaceId]: activeWorkspaceLastActiveAt,
              },
            }
          : {}),
      };
      return {
        hasHydratedWorkspaces: true,
        workspaceSnapshotVersion: 0,
        workspaces: nextProject.workspaces,
        activeWorkspaceId: nextProject.activeWorkspaceId,
        workspaceLastActiveAtById,
        activeAppSurface: WORKSPACE_APP_SURFACE,
        projectPath: args.projectRootPath,
        recentProjects: upsertRecentProjectState({
          projects: rememberedProjects,
          project: stampedNextProject,
        }),
        defaultBranch: args.defaultBranch,
        workspaceBranchById: nextProject.workspaceBranchById,
        workspacePathById: nextProject.workspacePathById,
        workspaceDefaultById: nextProject.workspaceDefaultById,
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
        projectName: args.projectName,
        projectFiles: args.files,
        workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
        workspaceRuntimeCacheById: savedWorkspaceRuntimeCacheById,
        taskWorkspaceIdById: registerTaskWorkspaceOwnership({
          taskWorkspaceIdById: retainTaskWorkspaceOwnership({
            taskWorkspaceIdById: stateBeforeSwitch.taskWorkspaceIdById,
            workspaceIds: nextProjectWorkspaceIds,
          }),
          workspaceId: nextProject.activeWorkspaceId,
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
    createProject: async ({ name }) => {
      const root = await workspaceFsAdapter.pickRoot();
      if (!root || !root.rootPath) {
        return;
      }
      const projectRootPath = root.rootPath;

      const terminalRun = window.api?.terminal?.runCommand;
      let defaultBranch = "main";
      if (terminalRun) {
        const branchResult = await terminalRun({
          cwd: projectRootPath,
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

      const projectName =
        name?.trim() ||
        root.rootName ||
        resolveProjectNameFromPath({ projectPath: projectRootPath });
      await activateProject({
        projectRootPath,
        projectName,
        files: root.files,
        defaultBranch,
      });
    },
    openProjectFromPath: async ({ inputPath }) => {
      const resolvePath = window.api?.fs?.resolvePath;
      if (!resolvePath) {
        return { ok: false, stderr: "Filesystem bridge unavailable." };
      }
      const result = await resolvePath({ inputPath });
      if (!result.ok || !result.rootPath) {
        return { ok: false, stderr: result.stderr || "Invalid path." };
      }

      const projectRootPath = result.rootPath;
      const projectName =
        result.rootName ||
        resolveProjectNameFromPath({ projectPath: projectRootPath });

      const terminalRun = window.api?.terminal?.runCommand;
      let defaultBranch = "main";
      if (terminalRun) {
        const branchResult = await terminalRun({
          cwd: projectRootPath,
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

      await activateProject({
        projectRootPath,
        projectName,
        files: result.files ?? [],
        defaultBranch,
      });
      return { ok: true };
    },
    openProject: async ({ projectPath }) => {
      const normalizedProjectPath = projectPath.trim();
      if (!normalizedProjectPath) {
        return;
      }

      const state = get();
      const rememberedProject = state.recentProjects.find(
        (project) => project.projectPath === normalizedProjectPath,
      );
      const projectName =
        rememberedProject?.projectName ||
        resolveProjectNameFromPath({ projectPath: normalizedProjectPath });
      const files = resolveInitialWorkspaceFiles({
        workspacePath: normalizedProjectPath,
        activeProjectPath: state.projectPath,
        activeProjectFiles:
          rememberedProject?.projectPath === state.projectPath
            ? state.projectFiles
            : [],
        workspaceFileCacheByPath: state.workspaceFileCacheByPath,
      });

      await workspaceFsAdapter.setRoot?.({
        rootPath: normalizedProjectPath,
        rootName: projectName,
        files,
      });

      await activateProject({
        projectRootPath: normalizedProjectPath,
        projectName,
        files,
        defaultBranch:
          rememberedProject?.defaultBranch || state.defaultBranch || "main",
      });

      const nextState = get();
      const nextWorkspacePath = resolveWorkspacePathForId({
        activeWorkspaceId: nextState.activeWorkspaceId,
        workspacePathById: nextState.workspacePathById,
        workspaceDefaultById: nextState.workspaceDefaultById,
        projectPath: nextState.projectPath,
      });
      if (nextState.activeWorkspaceId && nextWorkspacePath) {
        const nextCachedFiles = resolveInitialWorkspaceFiles({
          workspacePath: nextWorkspacePath,
          activeProjectPath: nextState.projectPath,
          activeProjectFiles: nextState.projectFiles,
          workspaceFileCacheByPath: nextState.workspaceFileCacheByPath,
        });
        void Promise.resolve(
          workspaceFsAdapter.setRoot?.({
            rootPath: nextWorkspacePath,
            rootName: nextState.projectName ?? projectName,
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
    removeProjectFromList: async ({ projectPath }) => {
      const normalizedProjectPath = projectPath.trim();
      if (!normalizedProjectPath) {
        return;
      }

      const stateBefore = get();
      const isCurrentProject =
        stateBefore.projectPath === normalizedProjectPath;
      if (isCurrentProject) {
        await get().flushActiveWorkspaceSnapshot({ sync: true });
      }

      const currentState = get();
      const matchingProjectForCleanup = currentState.recentProjects.find(
        (project) => project.projectPath === normalizedProjectPath,
      );
      const workspaceIdsForCleanup = [
        ...(matchingProjectForCleanup?.workspaces.map(
          (workspace) => workspace.id,
        ) ?? []),
        ...(isCurrentProject
          ? currentState.workspaces.map((workspace) => workspace.id)
          : []),
      ];
      await closeTerminalSessionsForWorkspaces(workspaceIdsForCleanup);
      await get().purgeWorkspaceNotifications({
        workspaceIds: workspaceIdsForCleanup,
      });

      set((state) => {
        const matchingProject = state.recentProjects.find(
          (project) => project.projectPath === normalizedProjectPath,
        );
        const workspaceIds = new Set<string>([
          ...(matchingProject?.workspaces.map((workspace) => workspace.id) ??
            []),
          ...(isCurrentProject
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
            normalizedProjectPath,
            ...Object.values(matchingProject?.workspacePathById ?? {}),
            ...(isCurrentProject ? Object.values(state.workspacePathById) : []),
          ],
        });
        const nextTaskWorkspaceIdById = Object.fromEntries(
          Object.entries(state.taskWorkspaceIdById).filter(
            ([, workspaceId]) => !workspaceIds.has(workspaceId),
          ),
        );
        const nextRecentProjects = state.recentProjects.filter(
          (project) => project.projectPath !== normalizedProjectPath,
        );

        if (!isCurrentProject) {
          return {
            recentProjects: nextRecentProjects,
            workspaceRuntimeCacheById: nextRuntimeCacheById,
            workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
            taskWorkspaceIdById: nextTaskWorkspaceIdById,
          };
        }

        const emptyWorkspaceState = buildWorkspaceSessionState({
          snapshot: null,
        });
        return {
          hasHydratedWorkspaces: false,
          workspaceSnapshotVersion: 0,
          workspaces: [],
          activeWorkspaceId: "",
          projectPath: null,
          recentProjects: nextRecentProjects,
          defaultBranch: "main",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
          projectName: null,
          projectFiles: [],
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
    moveProjectInList: ({ projectPath, direction }) => {
      const normalizedProjectPath = projectPath.trim();
      if (!normalizedProjectPath) {
        return;
      }

      set((state) => {
        const currentProjects = captureCurrentProjectState({
          recentProjects: state.recentProjects,
          projectPath: state.projectPath,
          projectName: state.projectName,
          defaultBranch: state.defaultBranch,
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceBranchById: state.workspaceBranchById,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
          workspaceLastActiveAtById: state.workspaceLastActiveAtById,
        });
        const fromIndex = currentProjects.findIndex(
          (project) => project.projectPath === normalizedProjectPath,
        );
        const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
        const nextProjects = moveArrayItem(currentProjects, fromIndex, toIndex);
        return nextProjects === currentProjects
          ? state
          : { recentProjects: nextProjects };
      });
    },
  };
}
