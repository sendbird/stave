import type { StoreApi } from "zustand";
import { loadWorkspaceSnapshot } from "@/lib/db/workspaces.db";
import { workspaceFsAdapter } from "@/lib/fs";
import { buildPanePanelId } from "@/lib/panes/types";
import {
  resolveDefaultClaudeEffortForModel,
  resolveDefaultCodexEffortForModel,
} from "@/lib/providers/model-catalog";
import { mergeModelRuntimePreference } from "@/lib/providers/model-runtime-preferences";
import { getProviderSessionId } from "@/lib/providers/provider-sessions";
import { cloneDefaultTaskPresets } from "@/lib/task-presets";
import {
  getArchiveFallbackTaskId,
  isTaskArchived,
  isTaskManaged,
} from "@/lib/tasks";
import type { ScriptTrigger } from "@/lib/workspace-scripts";
import type { AppSettings } from "@/store/app-settings";
import type { AppState } from "@/store/app-store.types";
import {
  buildMessageId,
  buildRecentTimestamp,
} from "@/store/chat-state-helpers";
import type { NotificationAttentionSync } from "@/store/notification-attention-sync";
import { resolveTaskWorkspaceContext } from "@/store/project.utils";
import { trimLoadedTaskMessages } from "@/store/task-message-loading";
import { removePaneTabMetaEntry } from "@/store/workspace-pane-state";
import { interruptActiveTaskTurns } from "@/store/workspace-session-state";
import type { ChatMessage, Task } from "@/types/chat";

type TaskLifecycleActionKey =
  | "exportTask"
  | "viewTaskChanges"
  | "rollbackTask"
  | "rollbackToCompactBoundary"
  | "archiveTask"
  | "setTaskProvider"
  | "applyTaskPreset"
  | "upsertTaskPreset"
  | "removeTaskPreset"
  | "reorderTaskPresets"
  | "resetTaskPresetsToDefault";

type TaskLifecycleActions = Pick<AppState, TaskLifecycleActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createTaskLifecycleActions(args: {
  set: StoreSet;
  get: StoreGet;
  runScriptHookInBackground: (args: {
    workspaceId: string;
    trigger: ScriptTrigger;
    taskId?: string;
    taskTitle?: string;
    turnId?: string;
  }) => void;
  attentionSync: NotificationAttentionSync;
  clearRestoredTaskProviderSession: (args: {
    state: AppState;
    taskId: string;
  }) => Partial<AppState>;
  cleanupRestoredTaskProviderRuntime: (args: { taskId: string }) => void;
  archivedTaskTurnNotice: string;
  incrementWorkspaceSnapshotVersion: (
    state: Pick<AppState, "workspaceSnapshotVersion">,
  ) => number;
  findTaskById: (state: Pick<AppState, "tasks">, taskId: string) => Task | null;
}): TaskLifecycleActions {
  const {
    set,
    get,
    runScriptHookInBackground,
    attentionSync,
    clearRestoredTaskProviderSession,
    cleanupRestoredTaskProviderRuntime,
    archivedTaskTurnNotice: ARCHIVED_TASK_TURN_NOTICE,
    incrementWorkspaceSnapshotVersion,
    findTaskById,
  } = args;

  return {
    exportTask: async ({ taskId }) => {
      if (typeof document === "undefined") {
        return;
      }
      const state = get();
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) {
        return;
      }
      const workspaceId =
        state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
      const loadedMessages = state.messagesByTask[taskId];
      const totalCount =
        state.messageCountByTask[taskId] ?? loadedMessages?.length ?? 0;
      const messages =
        loadedMessages && loadedMessages.length >= totalCount
          ? loadedMessages
          : ((await loadWorkspaceSnapshot({ workspaceId }))?.messagesByTask[
              taskId
            ] ?? []);
      const payload = {
        exportedAt: new Date().toISOString(),
        task,
        messages,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeTitle = task.title
        .replaceAll(/[^a-z0-9-_]+/gi, "-")
        .toLowerCase();
      anchor.href = url;
      anchor.download = `${safeTitle || "task"}-${taskId}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    viewTaskChanges: async ({ taskId }) => {
      const state = get();
      const checkpoint = state.taskCheckpointById[taskId];
      const workspaceCwd = resolveTaskWorkspaceContext({
        taskId,
        activeWorkspaceId: state.activeWorkspaceId,
        taskWorkspaceIdById: state.taskWorkspaceIdById,
        workspacePathById: state.workspacePathById,
        workspaceDefaultById: state.workspaceDefaultById,
        projectPath: state.projectPath,
      }).cwd;
      const runCommand = window.api?.terminal?.runCommand;
      if (!runCommand || !workspaceCwd) {
        return;
      }

      const command = checkpoint
        ? `git diff --name-status ${JSON.stringify(checkpoint)} --`
        : "git status --porcelain";
      const result = await runCommand({ cwd: workspaceCwd, command });
      const rawOutput = result.ok
        ? result.stdout.trim() || "No file changes for this task checkpoint."
        : result.stderr.trim() || "Failed to load task changes.";
      const output =
        result.ok && rawOutput !== "No file changes for this task checkpoint."
          ? `### Task Changes\n\n\`\`\`diff\n${rawOutput}\n\`\`\``
          : result.ok
            ? rawOutput
            : `> **Failed to load task changes.** ${rawOutput}`;

      set((nextState) => {
        const current = nextState.messagesByTask[taskId] ?? [];
        const message: ChatMessage = {
          id: buildMessageId({
            taskId,
            count: Math.max(
              current.length,
              nextState.messageCountByTask[taskId] ?? 0,
            ),
          }),
          role: "assistant",
          model: "system",
          providerId: "user",
          content: rawOutput,
          parts: [
            {
              type: "text",
              text: output,
            },
          ],
        };
        return {
          messagesByTask: {
            ...nextState.messagesByTask,
            [taskId]: trimLoadedTaskMessages({
              messages: [...current, message],
            }),
          },
          messageCountByTask: {
            ...nextState.messageCountByTask,
            [taskId]: Math.max(
              (nextState.messageCountByTask[taskId] ?? current.length) + 1,
              current.length + 1,
            ),
          },
          workspaceSnapshotVersion:
            incrementWorkspaceSnapshotVersion(nextState),
        };
      });
    },
    rollbackTask: async ({ taskId }) => {
      const state = get();
      const checkpoint = state.taskCheckpointById[taskId];
      const workspaceCwd = resolveTaskWorkspaceContext({
        taskId,
        activeWorkspaceId: state.activeWorkspaceId,
        taskWorkspaceIdById: state.taskWorkspaceIdById,
        workspacePathById: state.workspacePathById,
        workspaceDefaultById: state.workspaceDefaultById,
        projectPath: state.projectPath,
      }).cwd;
      const runCommand = window.api?.terminal?.runCommand;
      if (!runCommand || !checkpoint || !workspaceCwd) {
        return;
      }

      const rollbackResult = await runCommand({
        cwd: workspaceCwd,
        command: `git restore --source=${JSON.stringify(checkpoint)} --staged --worktree .`,
      });
      if (rollbackResult.ok) {
        cleanupRestoredTaskProviderRuntime({ taskId });
      }

      const rawOutput = rollbackResult.ok
        ? `Rollback complete to checkpoint ${checkpoint}. Provider session reset for the next turn.`
        : rollbackResult.stderr.trim() || "Rollback failed.";
      const output = rollbackResult.ok
        ? `Rollback complete to checkpoint \`${checkpoint}\`. Provider session reset for the next turn.`
        : `> **Rollback failed.** ${rollbackResult.stderr.trim() || "Unknown error."}`;

      const files = await workspaceFsAdapter.listFiles();
      set((nextState) => {
        const current = nextState.messagesByTask[taskId] ?? [];
        const message: ChatMessage = {
          id: buildMessageId({
            taskId,
            count: Math.max(
              current.length,
              nextState.messageCountByTask[taskId] ?? 0,
            ),
          }),
          role: "assistant",
          model: "system",
          providerId: "user",
          content: rawOutput,
          parts: [
            {
              type: "text",
              text: output,
            },
          ],
        };
        return {
          projectFiles: files,
          ...(rollbackResult.ok
            ? clearRestoredTaskProviderSession({
                state: nextState,
                taskId,
              })
            : {}),
          messagesByTask: {
            ...nextState.messagesByTask,
            [taskId]: trimLoadedTaskMessages({
              messages: [...current, message],
            }),
          },
          messageCountByTask: {
            ...nextState.messageCountByTask,
            [taskId]: Math.max(
              (nextState.messageCountByTask[taskId] ?? current.length) + 1,
              current.length + 1,
            ),
          },
          workspaceSnapshotVersion:
            incrementWorkspaceSnapshotVersion(nextState),
        };
      });
    },
    rollbackToCompactBoundary: async ({ taskId, gitRef, trigger }) => {
      const state = get();
      const resolvedGitRef = gitRef.trim();
      if (!resolvedGitRef) {
        return;
      }
      const taskWorkspaceId =
        state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
      const workspaceCwd =
        state.workspacePathById[taskWorkspaceId] ||
        state.projectPath ||
        undefined;
      const runCommand = window.api?.terminal?.runCommand;
      if (!runCommand) {
        return;
      }

      const compactBoundaryLabel = trigger?.trim()
        ? `context compacted (${trigger.trim()})`
        : "context compacted";

      const appendResultMessage = (args: {
        rawOutput: string;
        output: string;
        files?: string[];
        resetProviderSession?: boolean;
      }) => {
        set((nextState) => {
          const current = nextState.messagesByTask[taskId] ?? [];
          const message: ChatMessage = {
            id: buildMessageId({
              taskId,
              count: Math.max(
                current.length,
                nextState.messageCountByTask[taskId] ?? 0,
              ),
            }),
            role: "assistant",
            model: "system",
            providerId: "user",
            content: args.rawOutput,
            parts: [
              {
                type: "text",
                text: args.output,
              },
            ],
          };
          return {
            ...(args.files ? { projectFiles: args.files } : {}),
            ...(args.resetProviderSession
              ? clearRestoredTaskProviderSession({
                  state: nextState,
                  taskId,
                })
              : {}),
            messagesByTask: {
              ...nextState.messagesByTask,
              [taskId]: trimLoadedTaskMessages({
                messages: [...current, message],
              }),
            },
            messageCountByTask: {
              ...nextState.messageCountByTask,
              [taskId]: Math.max(
                (nextState.messageCountByTask[taskId] ?? current.length) + 1,
                current.length + 1,
              ),
            },
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(nextState),
          };
        });
      };

      if (state.activeTurnIdsByTask[taskId]) {
        appendResultMessage({
          rawOutput: "Restore is blocked while a turn is still running.",
          output:
            "> **Restore blocked.** Wait for the active turn to complete, then retry.",
        });
        return;
      }

      const restoreResult = await runCommand({
        cwd: workspaceCwd,
        command: `git restore --source=${JSON.stringify(resolvedGitRef)} --staged --worktree .`,
      });
      if (restoreResult.ok) {
        cleanupRestoredTaskProviderRuntime({ taskId });
      }
      const rawOutput = restoreResult.ok
        ? `Restore complete to ${compactBoundaryLabel} checkpoint ${resolvedGitRef}. Provider session reset for the next turn.`
        : restoreResult.stderr.trim() || "Restore failed.";
      const output = restoreResult.ok
        ? `Restore complete to ${compactBoundaryLabel} checkpoint \`${resolvedGitRef}\`. Provider session reset for the next turn.`
        : `> **Restore failed.** ${restoreResult.stderr.trim() || "Unknown error."}`;
      const files = await workspaceFsAdapter.listFiles();
      appendResultMessage({
        rawOutput,
        output,
        files,
        resetProviderSession: restoreResult.ok,
      });
    },
    archiveTask: ({ taskId }) => {
      const stateBefore = get();
      const activeTurnId = stateBefore.activeTurnIdsByTask[taskId];
      const targetTask =
        stateBefore.tasks.find((task) => task.id === taskId) ?? null;
      const workspaceId =
        stateBefore.taskWorkspaceIdById[taskId] ??
        stateBefore.activeWorkspaceId;
      if (
        !targetTask ||
        isTaskArchived(targetTask) ||
        isTaskManaged(findTaskById(stateBefore, taskId))
      ) {
        return;
      }
      set((state) => {
        const interrupted = state.activeTurnIdsByTask[taskId]
          ? interruptActiveTaskTurns({
              tasks: [targetTask],
              messagesByTask: state.messagesByTask,
              activeTurnIdsByTask: state.activeTurnIdsByTask,
              notice: ARCHIVED_TASK_TURN_NOTICE,
              messageCountByTask: state.messageCountByTask,
            })
          : {
              messagesByTask: state.messagesByTask,
              activeTurnIdsByTask: state.activeTurnIdsByTask,
            };
        const nextTasks = state.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                archivedAt: new Date().toISOString(),
                updatedAt: buildRecentTimestamp(),
                unread: false,
              }
            : task,
        );
        const shouldSwitch = state.activeTaskId === taskId;
        const fallbackTaskId = getArchiveFallbackTaskId({
          tasks: state.tasks,
          archivedTaskId: taskId,
        });
        const nextTerminalTabs = state.terminalTabs.map((tab) =>
          tab.linkedTaskId === taskId ? { ...tab, linkedTaskId: null } : tab,
        );
        const nextCliSessionTabs = state.cliSessionTabs.map((tab) =>
          tab.linkedTaskId === taskId ? { ...tab, linkedTaskId: null } : tab,
        );
        const nextActiveTaskId = shouldSwitch
          ? fallbackTaskId
          : state.activeTaskId;
        const nextOpenTaskTabIds = state.openTaskTabIds.filter(
          (openTaskId) => openTaskId !== taskId,
        );
        return {
          tasks: nextTasks,
          activeTaskId: nextActiveTaskId,
          activeSurface:
            state.activeSurface.kind === "task" &&
            state.activeSurface.taskId === taskId
              ? { kind: "task", taskId: nextActiveTaskId }
              : state.activeSurface,
          openTaskTabIds:
            nextActiveTaskId && !nextOpenTaskTabIds.includes(nextActiveTaskId)
              ? [...nextOpenTaskTabIds, nextActiveTaskId]
              : nextOpenTaskTabIds,
          paneTabMeta: removePaneTabMetaEntry({
            paneTabMeta: state.paneTabMeta,
            panelId: buildPanePanelId({ kind: "task", taskId }),
          }),
          terminalTabs: nextTerminalTabs,
          cliSessionTabs: nextCliSessionTabs,
          messagesByTask: interrupted.messagesByTask,
          messageCountByTask: {
            ...state.messageCountByTask,
            [taskId]: Math.max(
              state.messageCountByTask[taskId] ??
                (state.messagesByTask[taskId] ?? []).length,
              (interrupted.messagesByTask[taskId] ?? []).length,
            ),
          },
          activeTurnIdsByTask: interrupted.activeTurnIdsByTask,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
      if (activeTurnId) {
        const abortTurn = window.api?.provider?.abortTurn;
        if (abortTurn) {
          void abortTurn({ turnId: activeTurnId });
        }
      }
      void window.api?.provider?.cleanupTask?.({ taskId });
      // An archived task is settled by definition: it must not keep asking
      // for an answer or a review from Fleet.
      attentionSync.markTaskReviewed(taskId);
      attentionSync.syncTaskInteractions({
        taskId,
        messages: get().messagesByTask[taskId] ?? [],
        endedTurnId: activeTurnId,
      });
      if (workspaceId) {
        runScriptHookInBackground({
          workspaceId,
          trigger: "task.archiving",
          taskId,
          taskTitle: targetTask.title,
        });
      }
    },
    setTaskProvider: ({ taskId, provider }) => {
      set((state) => {
        const hasTask = state.tasks.some((task) => task.id === taskId);
        if (!hasTask) {
          return { draftProvider: provider };
        }
        if (isTaskManaged(findTaskById(state, taskId))) {
          return { draftProvider: provider };
        }
        return {
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  provider,
                }
              : task,
          ),
          draftProvider: provider,
          nativeSessionReadyByTask: {
            ...state.nativeSessionReadyByTask,
            [taskId]: Boolean(
              getProviderSessionId({
                sessions: state.providerSessionByTask[taskId],
                providerId: provider,
              }),
            ),
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
      void window.api?.provider?.cleanupTask?.({ taskId });
    },
    applyTaskPreset: ({ presetId }) => {
      const stateBefore = get();
      const preset = stateBefore.settings.taskPresets.find(
        (candidate) => candidate.id === presetId,
      );
      if (!preset) {
        return;
      }
      if (preset.kind === "cli-session") {
        get().createCliSessionTab({
          provider: preset.provider,
          contextMode: preset.contextMode ?? "workspace",
        });
        return;
      }

      // `task` preset: align the per-provider model setting + draft
      // provider so the fresh task picks up the preset's model at turn
      // request time (models are resolved from settings, not persisted
      // per-task today).
      const settingsPatch: Partial<AppSettings> = {};
      if (preset.model) {
        if (preset.provider === "claude-code") {
          settingsPatch.modelClaude = preset.model;
          settingsPatch.claudeEffort =
            (preset.effort as AppSettings["claudeEffort"] | undefined) ??
            resolveDefaultClaudeEffortForModel({ model: preset.model });
        } else if (preset.provider === "codex") {
          settingsPatch.modelCodex = preset.model;
          settingsPatch.codexReasoningEffort =
            (preset.effort as
              AppSettings["codexReasoningEffort"] | undefined) ??
            resolveDefaultCodexEffortForModel({ model: preset.model });
        }
        const effort =
          preset.provider === "claude-code"
            ? settingsPatch.claudeEffort
            : settingsPatch.codexReasoningEffort;
        if (effort) {
          settingsPatch.modelRuntimePreferences = mergeModelRuntimePreference({
            preferences: stateBefore.settings.modelRuntimePreferences,
            providerId: preset.provider,
            model: preset.model,
            patch: { effort },
          });
        }
      }
      if (Object.keys(settingsPatch).length > 0) {
        get().updateSettings({ patch: settingsPatch });
      }
      set((state) =>
        state.draftProvider === preset.provider
          ? state
          : { draftProvider: preset.provider },
      );
      get().createTask({ title: "" });
    },
    upsertTaskPreset: ({ preset }) => {
      set((state) => {
        const presets = state.settings.taskPresets;
        const existingIndex = presets.findIndex(
          (candidate) => candidate.id === preset.id,
        );
        const nextPresets =
          existingIndex >= 0
            ? presets.map((candidate, index) =>
                index === existingIndex ? preset : candidate,
              )
            : [...presets, preset];
        return {
          settings: {
            ...state.settings,
            taskPresets: nextPresets,
          },
        };
      });
    },
    removeTaskPreset: ({ presetId }) => {
      set((state) => {
        const nextPresets = state.settings.taskPresets.filter(
          (candidate) => candidate.id !== presetId,
        );
        if (nextPresets.length === state.settings.taskPresets.length) {
          return state;
        }
        return {
          settings: {
            ...state.settings,
            taskPresets: nextPresets,
          },
        };
      });
    },
    reorderTaskPresets: ({ fromPresetId, toPresetId }) => {
      if (fromPresetId === toPresetId) {
        return;
      }
      set((state) => {
        const presets = state.settings.taskPresets;
        const fromIndex = presets.findIndex(
          (candidate) => candidate.id === fromPresetId,
        );
        const toIndex = presets.findIndex(
          (candidate) => candidate.id === toPresetId,
        );
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
          return state;
        }
        const nextPresets = [...presets];
        const [moved] = nextPresets.splice(fromIndex, 1);
        if (!moved) {
          return state;
        }
        nextPresets.splice(toIndex, 0, moved);
        return {
          settings: {
            ...state.settings,
            taskPresets: nextPresets,
          },
        };
      });
    },
    resetTaskPresetsToDefault: () => {
      set((state) => ({
        settings: {
          ...state.settings,
          taskPresets: cloneDefaultTaskPresets(),
        },
      }));
    },
  };
}
