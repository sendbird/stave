import type { StoreApi } from "zustand";
import { stampWorkspaceActive } from "@/lib/fleet/workspace-activity";
import { workspaceFsAdapter } from "@/lib/fs";
import {
  normalizeComparablePath,
  parseGitWorktrees,
} from "@/lib/source-control-worktrees";
import {
  buildWorkspaceContinueSummaryFilePath,
  buildWorkspaceContinueSummaryMarkdown,
} from "@/lib/workspace-continue";
import { WORKSPACE_APP_SURFACE } from "@/store/app-surface";
import type { AppState } from "@/store/app-store.types";
import type { RunScriptHookInBackground } from "@/store/app-store-workspace-action-types";
import { buildRecentTimestamp } from "@/store/chat-state-helpers";
import {
  buildImportedWorktreeWorkspaceId,
  buildLinkedWorktreeSymlinkPath,
  buildWorkspaceCreationNotice,
  buildWorkspaceRootNodeModulesSymlinkCommand,
  captureCurrentProjectState,
  normalizeProjectWorkspaceRootNodeModulesSymlinkPreference,
  normalizeWorkspaceInitCommand,
  registerTaskWorkspaceOwnership,
  resolveImportedWorktreeName,
  resolveProjectWorkspaceInitCommand,
  resolveProjectWorkspaceRootNodeModulesSymlinkPreference,
  resolveWorkspaceRemoteBaseBranchTarget,
  sanitizeBranchName,
  summarizeTerminalCommandDetail,
  summarizeWorkspaceInitCommand,
  toShellPathArgument,
  toWorkspaceFolderName,
} from "@/store/project.utils";
import { archivedWorktreePaths } from "@/store/workspace-archive-cleanup";
import { rememberCachedWorkspaceFiles } from "@/store/workspace-file-cache";
import { runWorkspaceKickoff } from "@/store/workspace-kickoff-actions";
import { saveActiveWorkspaceRuntimeCache } from "@/store/workspace-runtime-state";
import {
  buildWorkspaceSessionState,
  createEmptyWorkspaceState,
  createWorkspaceSnapshot,
  persistWorkspaceSnapshot,
} from "@/store/workspace-session-state";
import type { Task } from "@/types/chat";

type WorkspaceCreateActionKey =
  | "resolveKickoffProposal"
  | "cancelKickoffResolution"
  | "createWorkspace"
  | "kickoffWorkspace"
  | "importWorkspaceFromWorktree"
  | "continueWorkspaceFromSummary";

type WorkspaceCreateActions = Pick<AppState, WorkspaceCreateActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createWorkspaceCreateActions(args: {
  set: StoreSet;
  get: StoreGet;
  runScriptHookInBackground: RunScriptHookInBackground;
  kickoffResolver: {
    resolve: AppState["resolveKickoffProposal"];
    cancel: AppState["cancelKickoffResolution"];
  };
}): WorkspaceCreateActions {
  const { set, get, runScriptHookInBackground, kickoffResolver } = args;

  return {
    resolveKickoffProposal: kickoffResolver.resolve,
    cancelKickoffResolution: kickoffResolver.cancel,
    createWorkspace: async ({
      name,
      label,
      mode,
      fromBranch,
      fromBranchKind,
      initCommand,
      useRootNodeModulesSymlink: requestedRootNodeModulesSymlink,
      initialTaskTitle,
      workspaceInformation,
    }) => {
      const trimmed = name.trim();
      if (!trimmed) {
        return { ok: false, message: "Workspace name is required." };
      }

      const current = get();
      if (!current.projectPath) {
        return {
          ok: false,
          message: "Open a project before creating a workspace.",
        };
      }
      const nextRuntimeCacheById = saveActiveWorkspaceRuntimeCache({
        state: current,
      });

      const branchName = sanitizeBranchName({ value: trimmed });
      if (!branchName) {
        return { ok: false, message: "Workspace branch name is invalid." };
      }
      const workspaceDisplayName = label?.trim() || branchName;
      const projectWorkspaceInitCommand = resolveProjectWorkspaceInitCommand({
        projectPath: current.projectPath,
        recentProjects: current.recentProjects,
      });
      const projectUseRootNodeModulesSymlink =
        resolveProjectWorkspaceRootNodeModulesSymlinkPreference({
          projectPath: current.projectPath,
          recentProjects: current.recentProjects,
        });
      const workspaceInitCommand = normalizeWorkspaceInitCommand({
        value: initCommand ?? projectWorkspaceInitCommand,
      });
      const useRootNodeModulesSymlink =
        requestedRootNodeModulesSymlink === undefined
          ? projectUseRootNodeModulesSymlink
          : normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
              value: requestedRootNodeModulesSymlink,
            });
      const workspacePath = `${current.projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: branchName, unique: true })}`;
      const workspaceId = buildImportedWorktreeWorkspaceId({
        projectPath: current.projectPath,
        worktreePath: workspacePath,
      });
      let baseBranch = fromBranch?.trim() || current.defaultBranch || "main";
      const creationNotices: Array<{
        level: "success" | "warning";
        message: string;
      }> = [];
      const runner = window.api?.terminal?.runCommand;
      if (runner) {
        const remoteTarget =
          mode === "branch"
            ? await resolveWorkspaceRemoteBaseBranchTarget({
                baseBranch,
                fromBranchKind,
                verifyRef: async (ref) =>
                  (
                    await runner({
                      cwd: current.projectPath ?? undefined,
                      command: `git show-ref --verify --quiet ${JSON.stringify(ref)}`,
                    })
                  ).ok,
              })
            : null;
        if (remoteTarget) {
          const fetchResult = await runner({
            cwd: current.projectPath,
            command: `git fetch ${remoteTarget.remoteName} --prune`,
          });
          if (!fetchResult.ok) {
            const localBranchProbe = await runner({
              cwd: current.projectPath,
              command: `git show-ref --verify --quiet ${JSON.stringify(`refs/heads/${remoteTarget.localBranch}`)}`,
            });
            const fallbackBranch = localBranchProbe.ok
              ? remoteTarget.localBranch
              : baseBranch;
            baseBranch = fallbackBranch;
            creationNotices.push({
              level: "warning",
              message: localBranchProbe.ok
                ? `Could not refresh \`${fromBranch}\`; created the workspace from local \`${remoteTarget.localBranch}\` instead. ${summarizeTerminalCommandDetail(
                    {
                      stderr: fetchResult.stderr,
                      stdout: fetchResult.stdout,
                      fallback: "git fetch failed.",
                    },
                  )}`
                : `Could not refresh \`${fromBranch}\`; created the workspace from the cached remote-tracking ref instead. ${summarizeTerminalCommandDetail(
                    {
                      stderr: fetchResult.stderr,
                      stdout: fetchResult.stdout,
                      fallback: "git fetch failed.",
                    },
                  )}`,
            });
          }
        }
        await runner({
          cwd: current.projectPath,
          command: "mkdir -p .stave/workspaces",
        });
        const addResult = await runner({
          cwd: current.projectPath,
          command:
            mode === "clean"
              ? `git worktree add -b ${JSON.stringify(branchName)} ${JSON.stringify(workspacePath)}`
              : `git worktree add -b ${JSON.stringify(branchName)} ${JSON.stringify(workspacePath)} ${JSON.stringify(baseBranch)}`,
        });
        if (!addResult.ok) {
          const fallbackResult = await runner({
            cwd: current.projectPath,
            command: `git worktree add ${JSON.stringify(workspacePath)} ${JSON.stringify(branchName)}`,
          });
          if (!fallbackResult.ok) {
            return {
              ok: false,
              message: (
                fallbackResult.stderr ||
                addResult.stderr ||
                "Failed to create git worktree."
              ).trim(),
            };
          }
        }
      }

      const empty = createEmptyWorkspaceState();
      const seededTask: Task = {
        id: crypto.randomUUID(),
        title: (initialTaskTitle ?? "").trim() || "New Task",
        provider: current.draftProvider,
        updatedAt: buildRecentTimestamp(),
        unread: false,
        archivedAt: null,
        controlMode: "interactive",
        controlOwner: "stave",
      };
      const snapshot = createWorkspaceSnapshot({
        activeTaskId: seededTask.id,
        tasks: [seededTask],
        messagesByTask: {
          [seededTask.id]: [],
        },
        promptDraftByTask: empty.promptDraftByTask,
        workspaceInformation,
        editorTabs: empty.editorTabs,
        activeEditorTabId: empty.activeEditorTabId,
        terminalTabs: empty.terminalTabs,
        activeTerminalTabId: empty.activeTerminalTabId,
        terminalDocked: empty.terminalDocked,
        cliSessionTabs: empty.cliSessionTabs,
        activeCliSessionTabId: empty.activeCliSessionTabId,
        activeSurface: { kind: "task", taskId: seededTask.id },
        providerSessionByTask: {
          [seededTask.id]: {},
        },
      });
      await persistWorkspaceSnapshot({
        workspaceId,
        workspaceName: workspaceDisplayName,
        activeTaskId: snapshot.activeTaskId,
        tasks: snapshot.tasks,
        messagesByTask: snapshot.messagesByTask,
        promptDraftByTask: snapshot.promptDraftByTask ?? {},
        workspaceInformation: snapshot.workspaceInformation,
        editorTabs: snapshot.editorTabs ?? [],
        activeEditorTabId: snapshot.activeEditorTabId ?? null,
        terminalTabs: snapshot.terminalTabs ?? [],
        activeTerminalTabId: snapshot.activeTerminalTabId ?? null,
        terminalDocked: snapshot.terminalDocked ?? false,
        cliSessionTabs: snapshot.cliSessionTabs ?? [],
        activeCliSessionTabId: snapshot.activeCliSessionTabId ?? null,
        activeSurface: snapshot.activeSurface ?? {
          kind: "task",
          taskId: snapshot.activeTaskId,
        },
        providerSessionByTask: snapshot.providerSessionByTask ?? {},
      });
      const workspaceState = buildWorkspaceSessionState({ snapshot });

      let files = current.projectFiles;
      try {
        await workspaceFsAdapter.setRoot?.({
          rootPath: workspacePath,
          rootName: workspaceDisplayName,
        });
      } catch {
        // Worktree may be created successfully before filesystem bridge catches up.
        // Keep workspace registration and use the existing file list as fallback.
      }

      if (useRootNodeModulesSymlink) {
        if (!runner) {
          creationNotices.push({
            level: "warning",
            message:
              "The shared root `node_modules` symlink could not be created because the terminal bridge is unavailable.",
          });
        } else {
          const linkResult = await runner({
            cwd: workspacePath,
            command: buildWorkspaceRootNodeModulesSymlinkCommand({
              projectPath: current.projectPath,
            }),
          });
          if (linkResult.ok) {
            creationNotices.push({
              level: "success",
              message:
                "Linked `node_modules` from the repository root into the new workspace.",
            });
          } else {
            creationNotices.push({
              level: "warning",
              message: `Linking the shared root \`node_modules\` failed. ${summarizeTerminalCommandDetail(
                {
                  stderr: linkResult.stderr,
                  stdout: linkResult.stdout,
                  fallback: "Command failed.",
                },
              )}`,
            });
          }
        }
      }

      if (workspaceInitCommand) {
        const summarizedCommand = summarizeWorkspaceInitCommand({
          command: workspaceInitCommand,
        });
        if (!runner) {
          creationNotices.push({
            level: "warning",
            message: `The post-create command could not run because the terminal bridge is unavailable: ${summarizedCommand}`,
          });
        } else {
          const initResult = await runner({
            cwd: workspacePath,
            command: workspaceInitCommand,
          });
          if (initResult.ok) {
            creationNotices.push({
              level: "success",
              message: `Ran the post-create command: ${summarizedCommand}`,
            });
          } else {
            creationNotices.push({
              level: "warning",
              message: `The post-create command failed: ${summarizedCommand}. ${summarizeTerminalCommandDetail(
                {
                  stderr: initResult.stderr,
                  stdout: initResult.stdout,
                  fallback: "Command failed.",
                },
              )}`,
            });
          }
        }
      }

      try {
        files = await workspaceFsAdapter.listFiles();
      } catch {
        // Keep workspace registration and use the existing file list as fallback.
      }

      set((state) => {
        const nextWorkspaces = state.workspaces.some(
          (workspace) => workspace.id === workspaceId,
        )
          ? state.workspaces
          : [
              ...state.workspaces,
              {
                id: workspaceId,
                name: workspaceDisplayName,
                updatedAt: new Date().toISOString(),
              },
            ];
        const nextBranchById = {
          ...state.workspaceBranchById,
          [workspaceId]: branchName,
        };
        const nextPathById = {
          ...state.workspacePathById,
          [workspaceId]: workspacePath,
        };
        const nextDefaultById = {
          ...state.workspaceDefaultById,
          [workspaceId]: false,
        };
        const nextWorkspaceLastActiveAtById = stampWorkspaceActive({
          current: state.workspaceLastActiveAtById,
          workspaceId,
        });
        return {
          workspaceSnapshotVersion: 0,
          workspaces: nextWorkspaces,
          activeWorkspaceId: workspaceId,
          // Creating a workspace is deliberate work in it, and it becomes
          // active here without routing through switchWorkspace.
          workspaceLastActiveAtById: nextWorkspaceLastActiveAtById,
          workspaceBranchById: nextBranchById,
          workspacePathById: nextPathById,
          workspaceDefaultById: nextDefaultById,
          recentProjects: captureCurrentProjectState({
            recentProjects: state.recentProjects,
            projectPath: state.projectPath,
            projectName: state.projectName,
            defaultBranch: state.defaultBranch,
            workspaces: nextWorkspaces,
            activeWorkspaceId: workspaceId,
            workspaceBranchById: nextBranchById,
            workspacePathById: nextPathById,
            workspaceDefaultById: nextDefaultById,
            workspaceLastActiveAtById: nextWorkspaceLastActiveAtById,
            archivedWorkspacePathsToRemove: [workspacePath],
          }),
          workspaceFileCacheByPath: rememberCachedWorkspaceFiles({
            workspaceFileCacheByPath: state.workspaceFileCacheByPath,
            workspacePath,
            files,
          }),
          workspaceRuntimeCacheById: nextRuntimeCacheById,
          activeAppSurface: WORKSPACE_APP_SURFACE,
          taskWorkspaceIdById: registerTaskWorkspaceOwnership({
            taskWorkspaceIdById: state.taskWorkspaceIdById,
            workspaceId,
            tasks: workspaceState.tasks,
          }),
          ...workspaceState,
          projectFiles: files,
        };
      });
      runScriptHookInBackground({
        workspaceId,
        trigger: "task.created",
        taskId: seededTask.id,
        taskTitle: seededTask.title,
      });
      const creationNotice = buildWorkspaceCreationNotice({
        notices: creationNotices,
      });
      return creationNotice ? { ok: true, ...creationNotice } : { ok: true };
    },
    kickoffWorkspace: (input) => runWorkspaceKickoff({ input, getState: get }),
    importWorkspaceFromWorktree: async ({ worktreePath, label }) => {
      const trimmedInput = worktreePath.trim();
      if (!trimmedInput) {
        return { ok: false, message: "Worktree path is required." };
      }

      const current = get();
      const projectPath = current.projectPath;
      if (!projectPath) {
        return {
          ok: false,
          message: "Open a project before linking a worktree.",
        };
      }
      const runner = window.api?.terminal?.runCommand;
      if (!runner) {
        return {
          ok: false,
          message:
            "Linking a worktree requires the terminal bridge, which is unavailable.",
        };
      }

      const toplevelResult = await runner({
        cwd: projectPath,
        command: `git -C ${toShellPathArgument({ path: trimmedInput })} rev-parse --show-toplevel`,
      });
      if (!toplevelResult.ok) {
        return {
          ok: false,
          message: summarizeTerminalCommandDetail({
            stderr: toplevelResult.stderr,
            stdout: toplevelResult.stdout,
            fallback: "The path is not inside a git worktree.",
          }),
        };
      }
      const worktreeRoot = toplevelResult.stdout.trim();
      if (!worktreeRoot) {
        return {
          ok: false,
          message: "Could not resolve the worktree root for that path.",
        };
      }
      const comparableWorktreeRoot = normalizeComparablePath(worktreeRoot);
      if (comparableWorktreeRoot === normalizeComparablePath(projectPath)) {
        return {
          ok: false,
          message:
            "That path is the project root, which is already available as the default workspace.",
        };
      }
      const existingWorkspaceId = Object.entries(
        current.workspacePathById,
      ).find(
        ([workspaceId, registeredPath]) =>
          normalizeComparablePath(registeredPath) === comparableWorktreeRoot &&
          current.workspaces.some((workspace) => workspace.id === workspaceId),
      )?.[0];
      if (existingWorkspaceId) {
        await get().switchWorkspace({ workspaceId: existingWorkspaceId });
        return {
          ok: true,
          noticeLevel: "success",
          message:
            "That worktree is already registered as a workspace. Switched to it.",
        };
      }

      const branchResult = await runner({
        cwd: projectPath,
        command: `git -C ${JSON.stringify(worktreeRoot)} rev-parse --abbrev-ref HEAD`,
      });
      const branchName = branchResult.ok ? branchResult.stdout.trim() : "";
      if (!branchName || branchName === "HEAD") {
        return {
          ok: false,
          message:
            "The worktree has no checked-out branch (detached HEAD), so it cannot be linked.",
        };
      }

      const nextRuntimeCacheById = saveActiveWorkspaceRuntimeCache({
        state: current,
      });
      const workspaceDisplayName =
        label?.trim() ||
        resolveImportedWorktreeName({
          branch: branchName,
          worktreePath: worktreeRoot,
        });
      const workspaceId = buildImportedWorktreeWorkspaceId({
        projectPath,
        worktreePath: worktreeRoot,
      });
      const creationNotices: Array<{
        level: "success" | "warning";
        message: string;
      }> = [];

      // Worktrees registered in this checkout survive stale cleanup via
      // `git worktree list`; external ones need the linked-path exemption.
      let isExternalWorktree = true;
      const listResult = await runner({
        cwd: projectPath,
        command: "git worktree list --porcelain",
      });
      if (listResult.ok) {
        isExternalWorktree = !parseGitWorktrees({
          stdout: listResult.stdout,
        }).some(
          (worktree) =>
            normalizeComparablePath(worktree.path) === comparableWorktreeRoot,
        );
      }

      const comparableWorkspacesDir = normalizeComparablePath(
        `${projectPath}/.stave/workspaces`,
      );
      if (
        comparableWorkspacesDir &&
        !comparableWorktreeRoot.startsWith(`${comparableWorkspacesDir}/`)
      ) {
        await runner({
          cwd: projectPath,
          command: "mkdir -p .stave/workspaces",
        });
        const symlinkPath = buildLinkedWorktreeSymlinkPath({
          projectPath,
          worktreePath: worktreeRoot,
        });
        const linkResult = await runner({
          cwd: projectPath,
          command: `ln -sfn ${JSON.stringify(worktreeRoot)} ${JSON.stringify(symlinkPath)}`,
        });
        if (linkResult.ok) {
          creationNotices.push({
            level: "success",
            message: `Linked the worktree into \`.stave/workspaces/\` via symlink.`,
          });
        } else {
          creationNotices.push({
            level: "warning",
            message: `The workspace was registered, but creating the \`.stave/workspaces/\` symlink failed. ${summarizeTerminalCommandDetail(
              {
                stderr: linkResult.stderr,
                stdout: linkResult.stdout,
                fallback: "Command failed.",
              },
            )}`,
          });
        }
      }

      // The user explicitly re-linked this worktree; drop any archive
      // tombstone so discovery and registration stop skipping it.
      if (comparableWorktreeRoot) {
        archivedWorktreePaths.delete(comparableWorktreeRoot);
      }

      const empty = createEmptyWorkspaceState();
      const seededTask: Task = {
        id: crypto.randomUUID(),
        title: "New Task",
        provider: current.draftProvider,
        updatedAt: buildRecentTimestamp(),
        unread: false,
        archivedAt: null,
        controlMode: "interactive",
        controlOwner: "stave",
      };
      const snapshot = createWorkspaceSnapshot({
        activeTaskId: seededTask.id,
        tasks: [seededTask],
        messagesByTask: {
          [seededTask.id]: [],
        },
        promptDraftByTask: empty.promptDraftByTask,
        editorTabs: empty.editorTabs,
        activeEditorTabId: empty.activeEditorTabId,
        terminalTabs: empty.terminalTabs,
        activeTerminalTabId: empty.activeTerminalTabId,
        terminalDocked: empty.terminalDocked,
        cliSessionTabs: empty.cliSessionTabs,
        activeCliSessionTabId: empty.activeCliSessionTabId,
        activeSurface: { kind: "task", taskId: seededTask.id },
        providerSessionByTask: {
          [seededTask.id]: {},
        },
      });
      await persistWorkspaceSnapshot({
        workspaceId,
        workspaceName: workspaceDisplayName,
        activeTaskId: snapshot.activeTaskId,
        tasks: snapshot.tasks,
        messagesByTask: snapshot.messagesByTask,
        promptDraftByTask: snapshot.promptDraftByTask ?? {},
        editorTabs: snapshot.editorTabs ?? [],
        activeEditorTabId: snapshot.activeEditorTabId ?? null,
        terminalTabs: snapshot.terminalTabs ?? [],
        activeTerminalTabId: snapshot.activeTerminalTabId ?? null,
        terminalDocked: snapshot.terminalDocked ?? false,
        cliSessionTabs: snapshot.cliSessionTabs ?? [],
        activeCliSessionTabId: snapshot.activeCliSessionTabId ?? null,
        activeSurface: snapshot.activeSurface ?? {
          kind: "task",
          taskId: snapshot.activeTaskId,
        },
        providerSessionByTask: snapshot.providerSessionByTask ?? {},
      });
      const workspaceState = buildWorkspaceSessionState({ snapshot });

      let files = current.projectFiles;
      try {
        await workspaceFsAdapter.setRoot?.({
          rootPath: worktreeRoot,
          rootName: workspaceDisplayName,
        });
        files = await workspaceFsAdapter.listFiles();
      } catch {
        // Keep workspace registration and use the existing file list as fallback.
      }

      set((state) => {
        const nextWorkspaces = state.workspaces.some(
          (workspace) => workspace.id === workspaceId,
        )
          ? state.workspaces
          : [
              ...state.workspaces,
              {
                id: workspaceId,
                name: workspaceDisplayName,
                updatedAt: new Date().toISOString(),
              },
            ];
        const nextBranchById = {
          ...state.workspaceBranchById,
          [workspaceId]: branchName,
        };
        const nextPathById = {
          ...state.workspacePathById,
          [workspaceId]: worktreeRoot,
        };
        const nextDefaultById = {
          ...state.workspaceDefaultById,
          [workspaceId]: false,
        };
        const nextWorkspaceLastActiveAtById = stampWorkspaceActive({
          current: state.workspaceLastActiveAtById,
          workspaceId,
        });
        return {
          workspaceSnapshotVersion: 0,
          workspaces: nextWorkspaces,
          activeWorkspaceId: workspaceId,
          // Creating a workspace is deliberate work in it, and it becomes
          // active here without routing through switchWorkspace.
          workspaceLastActiveAtById: nextWorkspaceLastActiveAtById,
          workspaceBranchById: nextBranchById,
          workspacePathById: nextPathById,
          workspaceDefaultById: nextDefaultById,
          recentProjects: captureCurrentProjectState({
            recentProjects: state.recentProjects,
            projectPath: state.projectPath,
            projectName: state.projectName,
            defaultBranch: state.defaultBranch,
            workspaces: nextWorkspaces,
            activeWorkspaceId: workspaceId,
            workspaceBranchById: nextBranchById,
            workspacePathById: nextPathById,
            workspaceDefaultById: nextDefaultById,
            workspaceLastActiveAtById: nextWorkspaceLastActiveAtById,
            archivedWorkspacePathsToRemove: [worktreeRoot],
            ...(isExternalWorktree
              ? { linkedWorkspacePathsToAdd: [worktreeRoot] }
              : {}),
          }),
          workspaceFileCacheByPath: rememberCachedWorkspaceFiles({
            workspaceFileCacheByPath: state.workspaceFileCacheByPath,
            workspacePath: worktreeRoot,
            files,
          }),
          workspaceRuntimeCacheById: nextRuntimeCacheById,
          activeAppSurface: WORKSPACE_APP_SURFACE,
          taskWorkspaceIdById: registerTaskWorkspaceOwnership({
            taskWorkspaceIdById: state.taskWorkspaceIdById,
            workspaceId,
            tasks: workspaceState.tasks,
          }),
          ...workspaceState,
          projectFiles: files,
        };
      });
      runScriptHookInBackground({
        workspaceId,
        trigger: "task.created",
        taskId: seededTask.id,
        taskTitle: seededTask.title,
      });
      const creationNotice = buildWorkspaceCreationNotice({
        notices: creationNotices,
      });
      return creationNotice
        ? { ok: true, ...creationNotice }
        : {
            ok: true,
            noticeLevel: "success",
            message: `Linked worktree \`${worktreeRoot}\` on branch \`${branchName}\`.`,
          };
    },
    continueWorkspaceFromSummary: async ({
      name,
      baseBranch: requestedBaseBranch,
    }) => {
      const current = get();
      const sourceWorkspaceId = current.activeWorkspaceId;
      if (!sourceWorkspaceId) {
        return {
          ok: false,
          message: "Select a workspace before continuing.",
        };
      }
      if (current.workspaceDefaultById[sourceWorkspaceId]) {
        return {
          ok: false,
          message:
            "The default workspace cannot be continued into a new workspace.",
        };
      }

      const sourceWorkspace =
        current.workspaces.find(
          (workspace) => workspace.id === sourceWorkspaceId,
        ) ?? null;
      const sourceWorkspaceName =
        sourceWorkspace?.name ??
        current.workspaceBranchById[sourceWorkspaceId] ??
        "workspace";
      const sourceWorkspacePath =
        current.workspacePathById[sourceWorkspaceId] ??
        current.projectPath ??
        "";
      const sourceBranch =
        current.workspaceBranchById[sourceWorkspaceId] ?? sourceWorkspaceName;
      const sourcePrInfo =
        current.workspacePrInfoById[sourceWorkspaceId] ?? null;
      const defaultBaseBranch = current.defaultBranch.trim() || "main";
      const remoteBaseBranch =
        requestedBaseBranch?.trim() || `origin/${defaultBaseBranch}`;
      const remoteSeparatorIndex = remoteBaseBranch.indexOf("/");
      const remoteTarget =
        remoteSeparatorIndex > 0
          ? {
              remoteName: remoteBaseBranch.slice(0, remoteSeparatorIndex),
              localBranch: remoteBaseBranch.slice(remoteSeparatorIndex + 1),
            }
          : null;
      let baseBranch = remoteBaseBranch;
      const activeTask =
        current.tasks.find((task) => task.id === current.activeTaskId) ??
        current.tasks[0] ??
        null;
      const notes = current.workspaceInformation.notes.trim();
      const openTodos = current.workspaceInformation.todos
        .filter((todo) => !todo.completed && todo.text.trim().length > 0)
        .map((todo) => todo.text.trim());

      const runCommand = window.api?.terminal?.runCommand;
      const getHistory = window.api?.sourceControl?.getHistory;
      const setupWarnings: string[] = [];
      let diffStat = "";
      let changedFiles: string[] = [];
      let recentCommitSubjects: string[] = [];

      if (runCommand && sourceWorkspacePath) {
        if (remoteTarget) {
          const fetchBaseResult = await runCommand({
            cwd: sourceWorkspacePath,
            command: `git fetch ${remoteTarget.remoteName} --prune`,
          });
          if (!fetchBaseResult.ok) {
            baseBranch = remoteTarget.localBranch;
            setupWarnings.push(
              `Could not refresh \`${remoteBaseBranch}\`; continued from local \`${remoteTarget.localBranch}\` instead.`,
            );
          }
        }

        const diffStatResult = await runCommand({
          cwd: sourceWorkspacePath,
          command: `git diff --stat ${JSON.stringify(baseBranch)}...HEAD`,
        });
        if (diffStatResult.ok) {
          diffStat = (diffStatResult.stdout || "").trim();
        }

        const changedFilesResult = await runCommand({
          cwd: sourceWorkspacePath,
          command: `git diff --name-only ${JSON.stringify(baseBranch)}...HEAD`,
        });
        if (changedFilesResult.ok) {
          changedFiles = (changedFilesResult.stdout || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        }
      }

      if (getHistory && sourceWorkspacePath) {
        try {
          const historyResult = await getHistory({
            cwd: sourceWorkspacePath,
            limit: 8,
          });
          if (historyResult.ok) {
            recentCommitSubjects = historyResult.items
              .map((item) => item.subject.trim())
              .filter(Boolean);
          }
        } catch {
          // Keep the continuation brief deterministic even when git history is unavailable.
        }
      }

      const summaryFilePath = buildWorkspaceContinueSummaryFilePath({
        sourceBranch,
      });
      const summaryMarkdown = buildWorkspaceContinueSummaryMarkdown({
        generatedAt: new Date().toISOString(),
        sourceWorkspaceName,
        sourceBranch,
        baseBranch,
        pr: sourcePrInfo?.pr
          ? {
              number: sourcePrInfo.pr.number,
              title: sourcePrInfo.pr.title,
              url: sourcePrInfo.pr.url,
              status: sourcePrInfo.derived,
            }
          : undefined,
        activeTaskTitle: activeTask?.title,
        notes,
        openTodos,
        changedFiles,
        recentCommitSubjects,
        diffStat,
      });

      const creationResult = await get().createWorkspace({
        name,
        mode: "branch",
        fromBranch: baseBranch,
        initialTaskTitle: `Continue from ${sourceWorkspaceName}`,
      });
      if (!creationResult.ok) {
        return creationResult;
      }

      const next = get();
      const targetWorkspaceId = next.activeWorkspaceId;
      const targetWorkspacePath =
        next.workspacePathById[targetWorkspaceId] ?? next.projectPath ?? "";
      const warnings: string[] = [...setupWarnings];
      let attachedSummary = false;

      if (targetWorkspacePath) {
        try {
          await workspaceFsAdapter.setRoot?.({
            rootPath: targetWorkspacePath,
            rootName: next.projectName ?? sourceWorkspaceName,
            files: next.projectFiles,
          });

          const createDirectoryResult =
            await workspaceFsAdapter.createDirectory({
              directoryPath: ".stave/context",
            });
          if (
            !createDirectoryResult.ok &&
            !createDirectoryResult.alreadyExists
          ) {
            warnings.push(
              createDirectoryResult.stderr ||
                "Could not create the continuation brief directory.",
            );
          } else {
            const createFileResult = await workspaceFsAdapter.createFile({
              filePath: summaryFilePath,
            });
            if (!createFileResult.ok && !createFileResult.alreadyExists) {
              warnings.push(
                createFileResult.stderr ||
                  "Could not create the continuation brief file.",
              );
            } else {
              const writeSummaryResult = await workspaceFsAdapter.writeFile({
                filePath: summaryFilePath,
                content: summaryMarkdown,
              });
              if (!writeSummaryResult.ok) {
                warnings.push("Could not write the continuation brief file.");
              } else {
                attachedSummary = true;
                set((state) => ({
                  projectFiles:
                    workspaceFsAdapter.getKnownFiles().length > 0
                      ? workspaceFsAdapter.getKnownFiles()
                      : state.projectFiles,
                }));
              }
            }
          }
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? error.message
              : "Could not prepare the continuation brief file.",
          );
        }
      } else {
        warnings.push(
          "The new workspace path is unavailable, so the continuation brief could not be created.",
        );
      }

      const continuedTaskId = get().activeTaskId;
      if (continuedTaskId && attachedSummary) {
        get().updatePromptDraft({
          taskId: continuedTaskId,
          patch: {
            attachedFilePaths: [summaryFilePath],
          },
        });
      }

      const resultMessages = [
        creationResult.message?.trim() ?? "",
        attachedSummary
          ? `Attached \`${summaryFilePath}\` to the new task draft.`
          : "",
        warnings.length > 0 ? warnings.join(" ") : "",
      ].filter(Boolean);

      return {
        ok: true,
        noticeLevel:
          warnings.length > 0 || creationResult.noticeLevel === "warning"
            ? "warning"
            : "success",
        message: resultMessages.join(" "),
      };
    },
  };
}
