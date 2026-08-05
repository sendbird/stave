import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppState, SendUserMessageResult } from "@/store/app-store.types";
import { type PersistedTurnSummary } from "@/lib/db/turns.db";
import { workspaceFsAdapter } from "@/lib/fs";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import type {
  CanonicalRetrievedContextPart,
  NormalizedProviderEvent,
} from "@/lib/providers/provider.types";
import { getRepoMapContextCache } from "@/lib/fs/repo-map-context-cache";
import { buildCurrentTaskAwarenessRetrievedContext } from "@/lib/task-context/current-task-awareness";
import { buildReferencedTaskRetrievedContext } from "@/lib/task-context/referenced-task-context";
import {
  extractWorkspaceInformationReferencesFromText,
  formatWorkspaceInformationReferencesContext,
  type LensReferenceState,
  type WorkspaceInformationReference,
} from "@/lib/workspace-information-references";
import {
  type ScriptTrigger,
  buildTurnVerificationResult,
} from "@/lib/workspace-scripts";
import { createEditorActions } from "@/store/app-store-editor-actions";
import { createPaneActions } from "@/store/app-store-pane-actions";
import { createTerminalActions } from "@/store/app-store-terminal-actions";
import { createSettingsActions } from "@/store/app-store-settings-actions";
import { createCompareActions } from "@/store/app-store-compare-actions";
import { createTaskCoreActions } from "@/store/app-store-task-core-actions";
import { createConversationThreadActions } from "@/store/app-store-conversation-thread-actions";
import { createTaskLifecycleActions } from "@/store/app-store-task-lifecycle-actions";
import { createSupportActions } from "@/store/app-store-support-actions";
import { createProviderInteractionActions } from "@/store/app-store-provider-interaction-actions";
import {
  createAppStorePersistenceOptions,
  normalizeSharedSkillsHomeSetting,
} from "@/store/app-store-persistence";
import { createAppStoreNotificationRuntime } from "@/store/app-store-notification-runtime";
import {
  createRefreshWorkspaceFilesInBackground,
  createWorkspaceManagementActions,
  logWorkspaceSwitchMetric,
} from "@/store/app-store-workspace-management-actions";
import { createWorkspaceCreateActions } from "@/store/app-store-workspace-create-actions";
import { createProjectActions } from "@/store/app-store-project-actions";
import {
  createWorkspaceHydrationActions,
  loadWorkspaceSessionFromPersistence,
  loadWorkspaceShellStateFromPersistence,
} from "@/store/app-store-workspace-hydration-actions";
import {
  createAppSurfaceActions,
  WORKSPACE_APP_SURFACE,
} from "@/store/app-surface";
import { buildCanonicalConversationRequest } from "@/lib/providers/canonical-request";
import { getProviderSessionCursor } from "@/lib/providers/provider-sessions";
import {
  inferProviderIdFromModel,
  normalizeModelSelection,
} from "@/lib/providers/model-catalog";
import { applyModelRuntimePreference } from "@/lib/providers/model-runtime-preferences";
import { resolveTurnModelInfo } from "@/lib/providers/turn-model-info";
import { resolveAutoRoutingDecision } from "@/store/auto-routing";
import {
  collectIntentContext,
  deriveIntentComplianceStatus,
  normalizePrePrReviewProvider,
  type TurnIntentComplianceResult,
} from "@/lib/source-control-review";
import { isTaskManaged } from "@/lib/tasks";
import { resolveWorkspacePathForId } from "@/store/workspace-file-cache";
import { resolveSkillSelections } from "@/lib/skills/catalog";
import {
  buildAdvisorExchangePatch,
  clearAdvisorExchange,
} from "@/lib/providers/advisor-activity";
import {
  applyProviderTurnActivityEvents,
  markProviderTurnStalled,
  resolveProviderTurnDisplayState,
  resolveProviderTurnStallThresholdMs,
  startProviderTurnActivity,
} from "@/lib/providers/turn-status";
import {
  applyDetectedWorkspaceResources,
  buildIntentGuardContextInput,
  createEmptyWorkspaceInformation,
  detectWorkspaceResourcesInText,
  type WorkspaceInformationState,
} from "@/lib/workspace-information";
import {
  buildWorkspaceTurnSummaryPrompt,
  createWorkspaceTurnSummary,
  parseWorkspaceTurnSummaryResponse,
} from "@/lib/workspace-turn-summary";
import {
  findLatestPendingApproval,
  findLatestPendingUserInput,
} from "@/store/provider-message.utils";
import {
  finishCompareRunsForTask,
  resolveCompareTurnOutcome,
} from "@/lib/compare-runs";
import { launchReadyCompareJudgesFromStore } from "@/store/compare-run-judge";
import {
  applyProjectBasePromptToRuntimeOptions,
  buildProviderRuntimeOptions,
  buildUtilityInferenceContext,
} from "@/store/provider-runtime-options";
import {
  createUtilityRouteClassifier,
  maybeSuggestUtilityTaskName,
} from "@/store/utility-inference-runtime";
import {
  buildPendingProviderTurnState,
  buildSteeredUserMessageState,
  buildRecentTimestamp,
  resolveMidTurnSteeringContext,
} from "@/store/chat-state-helpers";
import {
  createProviderTurnEventController,
  runProviderTurn,
} from "@/store/provider-turn-runtime";
import {
  applyHostTaskTurnSync,
  loadHostTaskTurn,
} from "@/store/host-task-turn-sync";
import { createQueuedTaskTurnDispatcher } from "@/store/queued-task-turn-dispatch";
import {
  createStalledProviderTurnAborter,
  scheduleStalledTurnAutoAbort,
} from "@/store/provider-turn-stall-abort";
import { submitSteerWithDeadline } from "@/store/steer-submit";
import {
  applyPendingProviderEventsToStoreState,
  createWorkspaceSessionStateFromAppState,
  getWorkspaceSessionForState,
} from "@/store/workspace-runtime-state";
import { createWorkspaceKickoffResolver } from "@/store/workspace-kickoff-actions";
import type { Attachment, ChatMessage, PromptDraft, Task } from "@/types/chat";
import {
  buildCodexGoalQueuedTurns,
  buildQueuedTurnFromDraft,
  getDraftFileContexts,
  getDraftImageContexts,
  getPromptDraftAttachments,
  promptDraftReferencesLens,
} from "@/store/prompt-draft-context";
import {
  buildPromptDraftContentForSend,
  buildPromptDraftDisplayContentForSend,
  buildPromptDraftDisplayPartsForSend,
} from "@/store/prompt-draft-message-content";
import {
  resolvePromptDraftRuntimeState,
  resolveTurnModelForSend,
} from "@/store/prompt-draft-runtime";
import {
  buildPreservedQueuedDraft,
  resolvePromptDraftAfterSend,
  resolvePromptDraftSendState,
} from "@/store/prompt-draft-send";
import {
  buildClearedPromptDraft,
  buildClearedPromptDraftWithQueuedNextTurn,
  hasPromptDraftPayload,
  normalizePromptDraftForStorage,
} from "@/store/prompt-draft-state";
import {
  resolveWorkspacePlanPersistenceText,
  persistWorkspacePlanFile,
} from "@/lib/plans";
import {
  appendInterruptedTurnNotices,
  scheduleWorkspaceSnapshotPersist,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import {
  TASK_MESSAGES_PAGE_SIZE,
  resolveInitialLatestTaskMessagesPageSize,
} from "@/store/task-message-loading";
import {
  DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
  WORKSPACE_SIDEBAR_MIN_WIDTH,
} from "@/store/layout.utils";
import {
  resolveProjectBasePrompt,
  registerTaskWorkspaceOwnership,
  resolveWorkspaceName,
  resolveTaskWorkspaceContext,
} from "@/store/project.utils";
import {
  buildApprovalNotificationInputs,
  buildTaskTurnCompletedNotificationInput,
  buildTaskTurnFailedNotificationInput,
  buildUserInputNotificationInputs,
  findTrustedApprovalResponses,
} from "@/store/app-notification-builders";
import {
  createDefaultProviderAvailability,
  defaultSettings,
} from "@/store/app-settings";
import { createDefaultProviderRuntimeCapabilities } from "@/lib/providers/runtime-capabilities";

const LOCAL_ABORT_SYSTEM_EVENT_CONTENT =
  "Generation was stopped locally before completion.";
export { WORKSPACE_SIDEBAR_MIN_WIDTH } from "@/store/layout.utils";
export type { LayoutState } from "@/store/layout.utils";
export {
  THEME_TOKEN_NAMES,
  PRESET_THEME_TOKENS,
  BUILTIN_CUSTOM_THEMES,
  MAX_USER_THEMES,
} from "@/lib/themes";
export {
  parseCustomThemeFile,
  exportCustomThemeJson,
  listAllCustomThemes,
} from "@/lib/themes";
export type {
  ThemeTokenName,
  ThemeModeName,
  ThemeTokenValues,
  ThemeOverrideValues,
  CustomThemeDefinition,
  ThemeValidationResult,
} from "@/lib/themes";
export type { RecentProjectState } from "@/store/project.utils";
// This module stays the public entry point for the app store, so settings and
// archive-cleanup names that moved into sibling modules are re-exported here.
export type { AppSettings } from "@/store/app-settings";
export {
  DEFAULT_SIDEBAR_ACTIVE_WORKSPACE_LIMIT,
  SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MAX,
  SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MIN,
} from "@/store/app-settings";
export { waitForPendingWorkspaceArchiveCleanups } from "@/store/workspace-archive-cleanup";

const EMPTY_PROMPT_DRAFT: PromptDraft = {
  text: "",
  attachedFilePaths: [],
  attachments: [],
};
export {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";

function buildWorkspaceInformationReferencesRetrievedContext(args: {
  promptDraft: PromptDraft;
  workspaceInformation: WorkspaceInformationState;
  lensState?: LensReferenceState | null;
}): CanonicalRetrievedContextPart | null {
  const referencesByKey = new Map<string, WorkspaceInformationReference>();
  const addReference = (reference: WorkspaceInformationReference) => {
    const key =
      reference.scope === "section"
        ? `${reference.section}:section`
        : `${reference.section}:item:${reference.itemId ?? ""}`;
    referencesByKey.set(key, reference);
  };

  getPromptDraftAttachments(args.promptDraft)
    .filter(
      (
        attachment,
      ): attachment is Extract<Attachment, { kind: "workspace-information" }> =>
        attachment.kind === "workspace-information",
    )
    .forEach((attachment) => addReference(attachment.reference));

  [
    args.promptDraft.text,
    ...(args.promptDraft.promptBatch ?? []).map((item) => item.content),
    ...(args.promptDraft.queuedTurns ?? []).map((item) => item.content),
  ].forEach((text) => {
    extractWorkspaceInformationReferencesFromText(text).forEach(addReference);
  });

  const references = [...referencesByKey.values()];
  if (references.length === 0) {
    return null;
  }

  const content = formatWorkspaceInformationReferencesContext({
    info: args.workspaceInformation,
    references,
    lens: args.lensState ?? null,
  });
  if (!content.trim()) {
    return null;
  }

  return {
    type: "retrieved_context",
    sourceId: "stave:workspace-information-references",
    title: "Explicit Information Panel References",
    content: [
      "The user explicitly referenced these Information panel entries from the prompt composer.",
      "Treat section references as the full current section and item references as the specific item.",
      ...(references.some((reference) => reference.section === "lens")
        ? [
            "`@lens` refers to the built-in Lens browser panel and its currently loaded page.",
          ]
        : []),
      "",
      content,
    ].join("\n"),
  };
}

function resolveTaskRuntimeTarget(args: {
  state: Pick<
    AppState,
    | "activeTaskId"
    | "activeWorkspaceId"
    | "taskWorkspaceIdById"
    | "tasks"
    | "workspaceRuntimeCacheById"
    | "messagesByTask"
    | "messageCountByTask"
    | "promptDraftByTask"
    | "reviewCommentsByTask"
    | "workspaceInformation"
    | "editorTabs"
    | "activeEditorTabId"
    | "terminalTabs"
    | "activeTerminalTabId"
    | "layout"
    | "cliSessionTabs"
    | "activeCliSessionTabId"
    | "activeSurface"
    | "openTaskTabIds"
    | "lensTabs"
    | "paneTabMeta"
    | "dockLayout"
    | "activeTurnIdsByTask"
    | "providerSessionByTask"
    | "providerGoalByTask"
    | "nativeSessionReadyByTask"
  >;
  taskId: string;
}) {
  const activeTask =
    args.state.tasks.find((task) => task.id === args.taskId) ?? null;
  if (activeTask) {
    return {
      workspaceId: args.state.activeWorkspaceId,
      isActiveWorkspace: true,
      session: createWorkspaceSessionStateFromAppState(args.state),
      task: activeTask,
    };
  }

  const mappedWorkspaceId = args.state.taskWorkspaceIdById[args.taskId];
  if (mappedWorkspaceId && mappedWorkspaceId !== args.state.activeWorkspaceId) {
    const mappedSession =
      args.state.workspaceRuntimeCacheById[mappedWorkspaceId];
    const mappedTask =
      mappedSession?.tasks.find((task) => task.id === args.taskId) ?? null;
    if (mappedSession && mappedTask) {
      return {
        workspaceId: mappedWorkspaceId,
        isActiveWorkspace: false,
        session: mappedSession,
        task: mappedTask,
      };
    }
  }

  for (const [workspaceId, session] of Object.entries(
    args.state.workspaceRuntimeCacheById,
  )) {
    const task =
      session.tasks.find((candidate) => candidate.id === args.taskId) ?? null;
    if (task) {
      return {
        workspaceId,
        isActiveWorkspace: false,
        session,
        task,
      };
    }
  }

  return null;
}

function clearRestoredTaskProviderSession(args: {
  state: AppState;
  taskId: string;
}) {
  const taskWorkspaceId =
    args.state.taskWorkspaceIdById[args.taskId] ?? args.state.activeWorkspaceId;
  if (taskWorkspaceId && taskWorkspaceId !== args.state.activeWorkspaceId) {
    const cachedSession = args.state.workspaceRuntimeCacheById[taskWorkspaceId];
    if (!cachedSession) {
      return {};
    }
    const { [args.taskId]: _dropped, ...providerSessionByTask } =
      cachedSession.providerSessionByTask;
    const { [args.taskId]: _droppedGoal, ...providerGoalByTask } =
      cachedSession.providerGoalByTask ?? {};
    return {
      workspaceRuntimeCacheById: {
        ...args.state.workspaceRuntimeCacheById,
        [taskWorkspaceId]: {
          ...cachedSession,
          providerSessionByTask,
          providerGoalByTask,
          nativeSessionReadyByTask: {
            ...cachedSession.nativeSessionReadyByTask,
            [args.taskId]: false,
          },
        },
      },
    };
  }

  const { [args.taskId]: _dropped, ...providerSessionByTask } =
    args.state.providerSessionByTask;
  const { [args.taskId]: _droppedGoal, ...providerGoalByTask } =
    args.state.providerGoalByTask;
  return {
    providerSessionByTask,
    providerGoalByTask,
    nativeSessionReadyByTask: {
      ...args.state.nativeSessionReadyByTask,
      [args.taskId]: false,
    },
  };
}

function cleanupRestoredTaskProviderRuntime(args: { taskId: string }) {
  const cleanupTask = window.api?.provider?.cleanupTask;
  if (!cleanupTask) {
    return;
  }
  void cleanupTask({ taskId: args.taskId }).catch((error) => {
    console.warn("[checkpoint-restore] provider cleanup failed", {
      taskId: args.taskId,
      error,
    });
  });
}

const ARCHIVED_TASK_TURN_NOTICE =
  "Generation stopped because the task was archived before this turn completed.";
export const STAVE_OPEN_SETTINGS_EVENT = "stave:open-settings";
const WORKSPACE_PR_STATUS_FRESH_MS = 4 * 60 * 1000;
const WORKSPACE_PR_STATUS_POLL_CONCURRENCY = 3;

function incrementWorkspaceSnapshotVersion(
  state: Pick<AppState, "workspaceSnapshotVersion">,
) {
  return state.workspaceSnapshotVersion + 1;
}

function incrementPromptDraftPersistenceVersion(
  state: Pick<AppState, "promptDraftPersistenceVersion">,
) {
  return state.promptDraftPersistenceVersion + 1;
}

function shouldLoadLatestTaskMessages(args: {
  taskId: string;
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
}) {
  return (
    (args.messagesByTask[args.taskId]?.length ?? 0) === 0 &&
    (args.messageCountByTask[args.taskId] ?? 0) > 0
  );
}

function mergeTaskMessagePage(args: {
  currentMessages: ChatMessage[];
  pageMessages: ChatMessage[];
  mode: "latest" | "older";
}) {
  if (args.mode === "latest") {
    const currentById = new Map(
      args.currentMessages.map((message) => [message.id, message] as const),
    );
    const merged = args.pageMessages.map(
      (message) => currentById.get(message.id) ?? message,
    );
    const seen = new Set(merged.map((message) => message.id));
    for (const message of args.currentMessages) {
      if (!seen.has(message.id)) {
        merged.push(message);
      }
    }
    return merged;
  }

  const seen = new Set(args.currentMessages.map((message) => message.id));
  const olderMessages = args.pageMessages.filter(
    (message) => !seen.has(message.id),
  );
  if (olderMessages.length === 0) {
    return args.currentMessages;
  }
  return [...olderMessages, ...args.currentMessages];
}

function findTaskById(state: Pick<AppState, "tasks">, taskId: string) {
  return state.tasks.find((task) => task.id === taskId) ?? null;
}

export const useAppStore = create<AppState>()(
  persist((set, get) => {
    const resolveScriptHookWorkspaceContext = (workspaceId: string) => {
      const state = get();
      const projectPath = state.projectPath;
      const workspacePath = state.workspacePathById[workspaceId];
      const branch = state.workspaceBranchById[workspaceId];
      if (!projectPath || !workspacePath || !branch) {
        return null;
      }
      const workspaceName =
        state.workspaces.find((workspace) => workspace.id === workspaceId)
          ?.name ?? branch;
      return {
        workspaceId,
        projectPath,
        workspacePath,
        workspaceName,
        branch,
      };
    };

    // C2 intent guard: after a turn completes, if the workspace has pinned
    // intent anchors, run a single-turn provider check comparing the diff
    // against that pinned intent and surface it as a Changes-panel badge.
    // No-op when nothing is pinned, so it stays disarmed by default.
    const runIntentGuardForTurn = (args: {
      workspaceId: string;
      taskId?: string;
      turnId?: string;
      workspacePath: string;
    }) => {
      const reviewDiff = window.api?.provider?.reviewDiff;
      if (!reviewDiff) {
        return;
      }
      const state = get();
      const info =
        state.activeWorkspaceId === args.workspaceId
          ? state.workspaceInformation
          : state.workspaceRuntimeCacheById[args.workspaceId]
              ?.workspaceInformation;
      if (!info) {
        return;
      }
      const intentContext = collectIntentContext(
        buildIntentGuardContextInput(info),
      );
      if (!intentContext) {
        return;
      }
      const providerId = normalizePrePrReviewProvider(
        state.settings.prePrReviewProvider,
      );
      void reviewDiff({
        cwd: args.workspacePath,
        providerId,
        mode: "intent",
        intentContext,
      })
        .then((result) => {
          if (!result.ok) {
            return;
          }
          const compliance: TurnIntentComplianceResult = {
            workspaceId: args.workspaceId,
            taskId: args.taskId,
            turnId: args.turnId,
            status: deriveIntentComplianceStatus(result.findings),
            findings: result.findings,
            completedAt: Date.now(),
          };
          set((current) => ({
            turnIntentComplianceByWorkspace: {
              ...current.turnIntentComplianceByWorkspace,
              [args.workspaceId]: compliance,
            },
          }));
        })
        .catch((error) => {
          console.warn("[intent-guard] turn.completed check failed", {
            workspaceId: args.workspaceId,
            error: String(error),
          });
        });
    };

    const runScriptHookInBackground = (args: {
      workspaceId: string;
      trigger: ScriptTrigger;
      taskId?: string;
      taskTitle?: string;
      turnId?: string;
    }) => {
      // A new turn invalidates the previous turn's verification badge so it
      // never lingers as a stale ✅ while fresh work is in flight.
      if (args.trigger === "turn.started") {
        set((state) => {
          if (
            state.turnVerificationByWorkspace[args.workspaceId] === undefined
          ) {
            return state;
          }
          const next = { ...state.turnVerificationByWorkspace };
          delete next[args.workspaceId];
          return { turnVerificationByWorkspace: next };
        });
        set((state) => {
          if (
            state.turnIntentComplianceByWorkspace[args.workspaceId] ===
            undefined
          ) {
            return state;
          }
          const next = { ...state.turnIntentComplianceByWorkspace };
          delete next[args.workspaceId];
          return { turnIntentComplianceByWorkspace: next };
        });
      }

      const runScriptHook = window.api?.scripts?.runHook;
      const context = resolveScriptHookWorkspaceContext(args.workspaceId);

      // Intent guard runs independently of verify hooks; it only needs the
      // resolved workspace context (path) to diff against.
      if (args.trigger === "turn.completed" && context) {
        runIntentGuardForTurn({
          workspaceId: args.workspaceId,
          taskId: args.taskId,
          turnId: args.turnId,
          workspacePath: context.workspacePath,
        });
      }

      if (!runScriptHook || !context) {
        return;
      }

      void runScriptHook({
        ...context,
        trigger: args.trigger,
        ...(args.taskId ? { taskId: args.taskId } : {}),
        ...(args.taskTitle ? { taskTitle: args.taskTitle } : {}),
        ...(args.turnId ? { turnId: args.turnId } : {}),
      })
        .then((result) => {
          // Surface turn.completed verify hooks as a Changes-panel badge.
          // Only record when at least one hook entry was configured, so a
          // project without verify hooks shows nothing rather than a
          // misleading green check.
          if (
            args.trigger === "turn.completed" &&
            result.summary &&
            result.summary.totalEntries > 0
          ) {
            const verification = buildTurnVerificationResult({
              workspaceId: args.workspaceId,
              taskId: args.taskId,
              turnId: args.turnId,
              summary: result.summary,
              completedAt: Date.now(),
            });
            set((state) => ({
              turnVerificationByWorkspace: {
                ...state.turnVerificationByWorkspace,
                [args.workspaceId]: verification,
              },
            }));
          }
          if (!result.ok && result.summary?.failures.length) {
            console.warn("[workspace-scripts] hook failures", {
              trigger: args.trigger,
              failures: result.summary.failures,
            });
          }
        })
        .catch((error) => {
          console.warn("[workspace-scripts] hook failed", {
            trigger: args.trigger,
            error: String(error),
          });
        });
    };

    const workspaceTurnSummaryRequestIdByWorkspaceId = new Map<
      string,
      string
    >();
    const kickoffResolver = createWorkspaceKickoffResolver({
      getState: get,
    });
    const providerTurnStallTimerByTask = new Map<
      string,
      ReturnType<typeof globalThis.setTimeout>
    >();

    const clearProviderTurnStallTimer = (taskId: string) => {
      const handle = providerTurnStallTimerByTask.get(taskId);
      if (handle == null) {
        return;
      }
      globalThis.clearTimeout(handle);
      providerTurnStallTimerByTask.delete(taskId);
    };

    const scheduleProviderTurnStallTimer = (args: {
      taskId: string;
      turnId: string;
      lastEventAt: number;
    }) => {
      clearProviderTurnStallTimer(args.taskId);
      const providerId =
        get().providerTurnActivityByTask[args.taskId]?.providerId;
      const delayMs = Math.max(
        0,
        resolveProviderTurnStallThresholdMs({ providerId }) -
          (Date.now() - args.lastEventAt),
      );
      const handle = globalThis.setTimeout(() => {
        providerTurnStallTimerByTask.delete(args.taskId);
        let markedStalled = false;
        set((state) => {
          // `state.activeTurnIdsByTask` only covers the active workspace;
          // resolve the owning workspace session so turns running in a
          // backgrounded workspace can still be marked stalled.
          const owningWorkspaceId =
            state.taskWorkspaceIdById[args.taskId] ?? state.activeWorkspaceId;
          const owningSession = owningWorkspaceId
            ? getWorkspaceSessionForState({
                state,
                workspaceId: owningWorkspaceId,
              })
            : null;
          if (owningSession?.activeTurnIdsByTask[args.taskId] !== args.turnId) {
            return state;
          }
          const nextActivityByTask = markProviderTurnStalled({
            activityByTask: state.providerTurnActivityByTask,
            taskId: args.taskId,
            turnId: args.turnId,
          });
          if (nextActivityByTask === state.providerTurnActivityByTask) {
            return state;
          }
          markedStalled = true;
          return {
            providerTurnActivityByTask: nextActivityByTask,
          };
        });

        if (!markedStalled) {
          // Turn already ended, moved on, or is waiting on an approval /
          // user-input prompt (`markProviderTurnStalled` excludes those) —
          // no follow-up needed.
          return;
        }

        scheduleStalledTurnAutoAbort({
          taskId: args.taskId,
          turnId: args.turnId,
          timerByTask: providerTurnStallTimerByTask,
          autoAbort: autoAbortStalledTaskTurn,
        });
      }, delayMs);
      providerTurnStallTimerByTask.set(args.taskId, handle);
    };

    const autoAbortStalledTaskTurn = createStalledProviderTurnAborter({
      getState: get,
      applyPatch: (updater) => set(updater),
      getWorkspaceSession: getWorkspaceSessionForState,
      clearStallTimer: clearProviderTurnStallTimer,
      abortTurn: (target) => void window.api?.provider?.abortTurn?.(target),
      cleanupTask: (target) => void window.api?.provider?.cleanupTask?.(target),
      onTurnAborted: (aborted) =>
        attentionSync.syncTaskInteractions({
          taskId: aborted.taskId,
          messages: aborted.messages,
          endedTurnId: aborted.turnId,
        }),
    });

    const dispatchNextQueuedTaskTurn = createQueuedTaskTurnDispatcher({
      getSession: (workspaceId) =>
        getWorkspaceSessionForState({ state: get(), workspaceId }),
      getActions: get,
    });

    const hasAsyncIterable = (
      value: unknown,
    ): value is AsyncIterable<unknown> => {
      if (!value || typeof value !== "object") {
        return false;
      }
      return Symbol.asyncIterator in value;
    };

    const collectProviderEvents = async (
      value: unknown,
    ): Promise<NormalizedProviderEvent[]> => {
      const resolved = await value;
      if (Array.isArray(resolved)) {
        return resolved as NormalizedProviderEvent[];
      }
      if (!hasAsyncIterable(resolved)) {
        return [];
      }
      const events: NormalizedProviderEvent[] = [];
      for await (const item of resolved) {
        events.push(item as NormalizedProviderEvent);
      }
      return events;
    };

    const persistWorkspaceSessionInBackground = (args: {
      workspaceId: string;
      session: WorkspaceSessionState;
    }) => {
      const latestState = get();
      scheduleWorkspaceSnapshotPersist({
        workspaceId: args.workspaceId,
        workspaceName: resolveWorkspaceName({
          state: latestState,
          workspaceId: args.workspaceId,
        }),
        activeTaskId: args.session.activeTaskId,
        tasks: args.session.tasks,
        messagesByTask: args.session.messagesByTask,
        promptDraftByTask: args.session.promptDraftByTask,
        reviewCommentsByTask: args.session.reviewCommentsByTask,
        workspaceInformation: args.session.workspaceInformation,
        editorTabs: args.session.editorTabs,
        activeEditorTabId: args.session.activeEditorTabId,
        terminalTabs: args.session.terminalTabs,
        activeTerminalTabId: args.session.activeTerminalTabId,
        terminalDocked: args.session.terminalDocked,
        cliSessionTabs: args.session.cliSessionTabs,
        activeCliSessionTabId: args.session.activeCliSessionTabId,
        activeSurface: args.session.activeSurface,
        openTaskTabIds: args.session.openTaskTabIds,
        lensTabs: args.session.lensTabs,
        paneTabMeta: args.session.paneTabMeta,
        dockLayout: args.session.dockLayout,
        providerSessionByTask: args.session.providerSessionByTask,
      });
    };

    const applyWorkspaceTurnSummaryToState = (args: {
      workspaceId: string;
      summary: ReturnType<typeof createWorkspaceTurnSummary>;
    }) => {
      let didUpdate = false;

      set((state) => {
        const cachedSession = state.workspaceRuntimeCacheById[args.workspaceId];
        const currentWorkspaceInformation =
          args.workspaceId === state.activeWorkspaceId
            ? state.workspaceInformation
            : cachedSession?.workspaceInformation;
        if (!currentWorkspaceInformation) {
          return state;
        }

        const currentSummary = currentWorkspaceInformation.turnSummary ?? null;
        if (
          currentSummary?.turnId === args.summary.turnId &&
          currentSummary.requestSummary === args.summary.requestSummary &&
          currentSummary.workSummary === args.summary.workSummary &&
          currentSummary.model === args.summary.model
        ) {
          return state;
        }

        didUpdate = true;
        const nextWorkspaceInformation = {
          ...currentWorkspaceInformation,
          turnSummary: args.summary,
        };

        if (args.workspaceId === state.activeWorkspaceId) {
          return {
            workspaceInformation: nextWorkspaceInformation,
            workspaceRuntimeCacheById: cachedSession
              ? {
                  ...state.workspaceRuntimeCacheById,
                  [args.workspaceId]: {
                    ...cachedSession,
                    workspaceInformation: nextWorkspaceInformation,
                  },
                }
              : state.workspaceRuntimeCacheById,
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        }

        if (!cachedSession) {
          return state;
        }

        return {
          workspaceRuntimeCacheById: {
            ...state.workspaceRuntimeCacheById,
            [args.workspaceId]: {
              ...cachedSession,
              workspaceInformation: nextWorkspaceInformation,
            },
          },
        };
      });

      if (!didUpdate) {
        return;
      }

      const latestSession = getWorkspaceSessionForState({
        state: get(),
        workspaceId: args.workspaceId,
      });
      if (latestSession) {
        persistWorkspaceSessionInBackground({
          workspaceId: args.workspaceId,
          session: latestSession,
        });
      }
    };

    const generateWorkspaceTurnSummaryInBackground = (args: {
      workspaceId: string;
      taskId: string;
      turnId: string;
    }) => {
      const state = get();
      const session = getWorkspaceSessionForState({
        state,
        workspaceId: args.workspaceId,
      });
      if (!session) {
        return;
      }

      const currentSummary = session.workspaceInformation.turnSummary ?? null;
      if (currentSummary?.turnId === args.turnId) {
        return;
      }

      const task =
        session.tasks.find((item) => item.id === args.taskId) ?? null;
      const messages = session.messagesByTask[args.taskId] ?? [];
      const latestUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === "user" && message.content.trim());
      const latestAssistantMessage = [...messages]
        .reverse()
        .find(
          (message) => message.role === "assistant" && message.content.trim(),
        );
      const summaryPrompt = state.settings.workspaceTurnSummaryPrompt.trim();
      if (!summaryPrompt) {
        return;
      }
      if (
        !latestUserMessage?.content.trim() &&
        !latestAssistantMessage?.content.trim()
      ) {
        return;
      }

      const workspacePath = resolveWorkspacePathForId({
        activeWorkspaceId: state.activeWorkspaceId,
        workspaceId: args.workspaceId,
        workspacePathById: state.workspacePathById,
        workspaceDefaultById: state.workspaceDefaultById,
        projectPath: state.projectPath,
      });
      const settingsSnapshot = state.settings;
      const primaryModel = normalizeModelSelection({
        value: settingsSnapshot.workspaceTurnSummaryPrimaryModel,
        fallback: defaultSettings.workspaceTurnSummaryPrimaryModel,
      });
      const fallbackModel = normalizeModelSelection({
        value: settingsSnapshot.workspaceTurnSummaryFallbackModel,
        fallback: defaultSettings.workspaceTurnSummaryFallbackModel,
      });
      const candidateModels = [
        ...new Set([primaryModel.trim(), fallbackModel.trim()].filter(Boolean)),
      ];
      if (candidateModels.length === 0) {
        return;
      }

      const prompt = buildWorkspaceTurnSummaryPrompt({
        instructionPrompt: summaryPrompt,
        taskTitle: task?.title ?? null,
        userRequest:
          latestUserMessage?.content.trim() ||
          task?.title ||
          "No user request was captured for this turn.",
        assistantResponse:
          latestAssistantMessage?.content.trim() ||
          "The assistant completed the turn without a plain-text reply.",
      });
      const requestId = `${args.turnId}:${Date.now()}`;
      workspaceTurnSummaryRequestIdByWorkspaceId.set(
        args.workspaceId,
        requestId,
      );

      void (async () => {
        for (const model of candidateModels) {
          if (
            workspaceTurnSummaryRequestIdByWorkspaceId.get(args.workspaceId) !==
            requestId
          ) {
            return;
          }

          const providerId = inferProviderIdFromModel({ model });
          const runtimeOptions = {
            ...buildProviderRuntimeOptions({
              provider: providerId,
              model,
              settings: settingsSnapshot,
            }),
            chatStreamingEnabled: false,
            responseStylePrompt: undefined,
            promptPrDescription: undefined,
            promptInlineCompletion: undefined,
            ...(providerId === "claude-code"
              ? {
                  claudeAllowedTools: [],
                  claudeMaxTurns: 1,
                  claudePermissionMode: "dontAsk" as const,
                  claudeAgentProgressSummaries: false,
                  claudeFastMode: true,
                }
              : providerId === "codex"
                ? {
                    codexApprovalPolicy: "never" as const,
                    codexFileAccess: "read-only" as const,
                    codexNetworkAccess: false,
                    codexWebSearch: "disabled" as const,
                    codexReasoningSummary: "none" as const,
                    codexShowRawReasoning: false,
                    codexPlanMode: false,
                    codexFastMode: true,
                  }
                : {}),
          };

          if (window.api?.provider?.checkAvailability) {
            try {
              const availability = await window.api.provider.checkAvailability({
                providerId,
                runtimeOptions,
              });
              if (!availability.ok || !availability.available) {
                continue;
              }
            } catch {
              continue;
            }
          }

          try {
            const streamTurn = window.api?.provider?.streamTurn;
            if (!streamTurn) {
              return;
            }
            const events = await collectProviderEvents(
              streamTurn({
                providerId,
                prompt,
                cwd: workspacePath ?? undefined,
                runtimeOptions,
              }),
            );
            const responseText = events
              .filter(
                (
                  event,
                ): event is Extract<
                  NormalizedProviderEvent,
                  { type: "text" }
                > => event.type === "text",
              )
              .map((event) => event.text)
              .join("")
              .trim();
            const parsedSummary = responseText
              ? parseWorkspaceTurnSummaryResponse(responseText)
              : null;
            if (!parsedSummary) {
              continue;
            }

            if (
              workspaceTurnSummaryRequestIdByWorkspaceId.get(
                args.workspaceId,
              ) !== requestId
            ) {
              return;
            }

            applyWorkspaceTurnSummaryToState({
              workspaceId: args.workspaceId,
              summary: createWorkspaceTurnSummary({
                turnId: args.turnId,
                taskId: args.taskId,
                taskTitle: task?.title ?? "Untitled Task",
                model,
                generatedAt: new Date().toISOString(),
                draft: parsedSummary,
              }),
            });
            return;
          } catch {
            continue;
          }
        }
      })().finally(() => {
        if (
          workspaceTurnSummaryRequestIdByWorkspaceId.get(args.workspaceId) ===
          requestId
        ) {
          workspaceTurnSummaryRequestIdByWorkspaceId.delete(args.workspaceId);
        }
      });
    };

    const { attentionSync, persistNotifications } =
      createAppStoreNotificationRuntime({ set, get });

    const loadTaskMessagesIntoSession = async (args: {
      workspaceId: string;
      taskId: string;
      mode: "latest" | "older";
    }) => {
      const stateBefore = get();
      const ownerWorkspaceId =
        stateBefore.taskWorkspaceIdById[args.taskId] ??
        stateBefore.activeWorkspaceId;
      if (
        !args.taskId ||
        !ownerWorkspaceId ||
        ownerWorkspaceId !== args.workspaceId
      ) {
        return;
      }
      if (stateBefore.taskMessagesLoadingByTask[args.taskId]) {
        return;
      }
      const currentSession =
        args.workspaceId === stateBefore.activeWorkspaceId
          ? stateBefore
          : stateBefore.workspaceRuntimeCacheById[args.workspaceId];
      if (!currentSession) {
        return;
      }
      const currentMessages = currentSession.messagesByTask[args.taskId] ?? [];
      const totalCount =
        currentSession.messageCountByTask[args.taskId] ??
        currentMessages.length;
      if (args.mode === "latest" && currentMessages.length > 0) {
        return;
      }
      if (args.mode === "older" && currentMessages.length >= totalCount) {
        return;
      }

      set((state) => ({
        taskMessagesLoadingByTask: {
          ...state.taskMessagesLoadingByTask,
          [args.taskId]: true,
        },
      }));

      try {
        const page = await loadTaskMessagesPage({
          workspaceId: args.workspaceId,
          taskId: args.taskId,
          limit:
            args.mode === "latest"
              ? resolveInitialLatestTaskMessagesPageSize()
              : TASK_MESSAGES_PAGE_SIZE,
          offset: args.mode === "older" ? currentMessages.length : 0,
        });
        set((state) => {
          const targetSession = getWorkspaceSessionForState({
            state,
            workspaceId: args.workspaceId,
          });
          if (!targetSession) {
            return {
              taskMessagesLoadingByTask: {
                ...state.taskMessagesLoadingByTask,
                [args.taskId]: false,
              },
            };
          }
          const sessionMessages =
            targetSession.messagesByTask[args.taskId] ?? [];
          const nextMessages = mergeTaskMessagePage({
            currentMessages: sessionMessages,
            pageMessages: page.messages,
            mode: args.mode,
          });
          const nextLoadingState = {
            ...state.taskMessagesLoadingByTask,
            [args.taskId]: false,
          };
          if (args.workspaceId === state.activeWorkspaceId) {
            return {
              messagesByTask: {
                ...state.messagesByTask,
                [args.taskId]: nextMessages,
              },
              messageCountByTask: {
                ...state.messageCountByTask,
                [args.taskId]: Math.max(page.totalCount, nextMessages.length),
              },
              taskMessagesLoadingByTask: nextLoadingState,
            };
          }
          return {
            workspaceRuntimeCacheById: {
              ...state.workspaceRuntimeCacheById,
              [args.workspaceId]: {
                ...targetSession,
                messagesByTask: {
                  ...targetSession.messagesByTask,
                  [args.taskId]: nextMessages,
                },
                messageCountByTask: {
                  ...targetSession.messageCountByTask,
                  [args.taskId]: Math.max(page.totalCount, nextMessages.length),
                },
              },
            },
            taskMessagesLoadingByTask: nextLoadingState,
          };
        });
        attentionSync.syncTaskInteractions({
          taskId: args.taskId,
          messages:
            getWorkspaceSessionForState({
              state: get(),
              workspaceId: args.workspaceId,
            })?.messagesByTask[args.taskId] ?? [],
        });
      } catch (error) {
        console.error("[workspace] failed to load task messages", error);
        set((state) => ({
          taskMessagesLoadingByTask: {
            ...state.taskMessagesLoadingByTask,
            [args.taskId]: false,
          },
        }));
      }
    };

    const hydrateWorkspaceMessagesInBackground = (args: {
      workspaceId: string;
      taskIds: string[];
      latestTurns: PersistedTurnSummary[];
      switchMetricToken?: number;
    }) => {
      const taskIds = [...new Set(args.taskIds.filter(Boolean))];
      if (taskIds.length === 0) {
        return;
      }

      const interruptedTurnByTaskId = new Map(
        args.latestTurns
          .filter((turn) => !turn.completedAt)
          .map((turn) => [turn.taskId, turn] as const),
      );

      set((state) => {
        let changed = false;
        const nextTaskMessagesLoadingByTask = {
          ...state.taskMessagesLoadingByTask,
        };
        for (const taskId of taskIds) {
          if (nextTaskMessagesLoadingByTask[taskId] === true) {
            continue;
          }
          nextTaskMessagesLoadingByTask[taskId] = true;
          changed = true;
        }
        return changed
          ? { taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask }
          : state;
      });

      void Promise.allSettled(
        taskIds.map(async (taskId) => ({
          taskId,
          page: await loadTaskMessagesPage({
            workspaceId: args.workspaceId,
            taskId,
            limit: TASK_MESSAGES_PAGE_SIZE,
            offset: 0,
          }),
        })),
      )
        .then((results) => {
          set((state) => {
            const nextTaskMessagesLoadingByTask = {
              ...state.taskMessagesLoadingByTask,
            };
            for (const taskId of taskIds) {
              nextTaskMessagesLoadingByTask[taskId] = false;
            }

            const targetSession = getWorkspaceSessionForState({
              state,
              workspaceId: args.workspaceId,
            });
            if (!targetSession) {
              return {
                taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
              };
            }

            const messagesPatch: Record<string, ChatMessage[]> = {};
            const messageCountPatch: Record<string, number> = {};

            for (const result of results) {
              if (result.status !== "fulfilled") {
                continue;
              }
              const sessionMessages =
                targetSession.messagesByTask[result.value.taskId] ?? [];
              const mergedMessages = mergeTaskMessagePage({
                currentMessages: sessionMessages,
                pageMessages: result.value.page.messages,
                mode: "latest",
              });
              const interruptedTurn = interruptedTurnByTaskId.get(
                result.value.taskId,
              );
              const nextMessages = interruptedTurn
                ? (appendInterruptedTurnNotices({
                    messagesByTask: { [result.value.taskId]: mergedMessages },
                    latestTurns: [interruptedTurn],
                    messageCountByTask: {
                      [result.value.taskId]: result.value.page.totalCount,
                    },
                  })[result.value.taskId] ?? mergedMessages)
                : mergedMessages;
              messagesPatch[result.value.taskId] = nextMessages;
              messageCountPatch[result.value.taskId] = Math.max(
                result.value.page.totalCount,
                nextMessages.length,
              );
            }

            if (Object.keys(messagesPatch).length === 0) {
              return {
                taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
              };
            }

            if (args.workspaceId === state.activeWorkspaceId) {
              return {
                messagesByTask: {
                  ...state.messagesByTask,
                  ...messagesPatch,
                },
                messageCountByTask: {
                  ...state.messageCountByTask,
                  ...messageCountPatch,
                },
                taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
              };
            }

            return {
              workspaceRuntimeCacheById: {
                ...state.workspaceRuntimeCacheById,
                [args.workspaceId]: {
                  ...targetSession,
                  messagesByTask: {
                    ...targetSession.messagesByTask,
                    ...messagesPatch,
                  },
                  messageCountByTask: {
                    ...targetSession.messageCountByTask,
                    ...messageCountPatch,
                  },
                },
              },
              taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
            };
          });
          // Turns that died with the previous app session get their pending
          // requests interrupted during hydration, so their durable needs must
          // be settled too instead of waiting in Fleet forever.
          const hydrated = getWorkspaceSessionForState({
            state: get(),
            workspaceId: args.workspaceId,
          });
          for (const taskId of taskIds) {
            attentionSync.syncTaskInteractions({
              taskId,
              messages: hydrated?.messagesByTask[taskId] ?? [],
            });
          }
          logWorkspaceSwitchMetric({
            workspaceId: args.workspaceId,
            token: args.switchMetricToken,
            phase: "messages",
            extra: {
              taskCount: taskIds.length,
            },
          });
        })
        .catch((error) => {
          console.error(
            "[workspace] failed to hydrate initial task messages",
            error,
          );
          set((state) => ({
            taskMessagesLoadingByTask: {
              ...state.taskMessagesLoadingByTask,
              ...Object.fromEntries(
                taskIds.map((taskId) => [taskId, false] as const),
              ),
            },
          }));
        });
    };

    const refreshWorkspaceFilesInBackground =
      createRefreshWorkspaceFilesInBackground({ set, get });

    const editorActions = createEditorActions({
      set,
      get,
    });
    const terminalActions = createTerminalActions({ set, get });
    const paneActions = createPaneActions({
      set,
      get,
      loadTaskMessagesIntoSession,
    });
    const settingsActions = createSettingsActions({
      set,
      get,
      normalizeSharedSkillsHomeSetting,
    });
    const compareActions = createCompareActions({
      set,
      get,
      emptyPromptDraft: EMPTY_PROMPT_DRAFT,
      incrementWorkspaceSnapshotVersion,
    });
    const taskCoreActions = createTaskCoreActions({
      set,
      get,
      runScriptHookInBackground,
      attentionSync,
      loadTaskMessagesIntoSession,
      emptyPromptDraft: EMPTY_PROMPT_DRAFT,
      incrementWorkspaceSnapshotVersion,
      incrementPromptDraftPersistenceVersion,
      shouldLoadLatestTaskMessages,
      findTaskById,
    });
    const conversationThreadActions = createConversationThreadActions({
      set,
      get,
      runScriptHookInBackground,
      incrementWorkspaceSnapshotVersion,
    });
    const taskLifecycleActions = createTaskLifecycleActions({
      set,
      get,
      runScriptHookInBackground,
      attentionSync,
      clearRestoredTaskProviderSession,
      cleanupRestoredTaskProviderRuntime,
      archivedTaskTurnNotice: ARCHIVED_TASK_TURN_NOTICE,
      incrementWorkspaceSnapshotVersion,
      findTaskById,
    });
    const supportActions = createSupportActions({
      set,
      get,
      clearProviderTurnStallTimer,
      persistWorkspaceSessionInBackground,
      attentionSync,
      workspacePrStatusFreshMs: WORKSPACE_PR_STATUS_FRESH_MS,
      workspacePrStatusPollConcurrency: WORKSPACE_PR_STATUS_POLL_CONCURRENCY,
      incrementWorkspaceSnapshotVersion,
      normalizeSharedSkillsHomeSetting,
    });
    const providerInteractionActions = createProviderInteractionActions({
      set,
      get,
      clearProviderTurnStallTimer,
      scheduleProviderTurnStallTimer,
      attentionSync,
      localAbortSystemEventContent: LOCAL_ABORT_SYSTEM_EVENT_CONTENT,
      resolveTaskRuntimeTarget,
      incrementWorkspaceSnapshotVersion,
      findTaskById,
    });
    const workspaceManagementActions = createWorkspaceManagementActions({
      set,
      get,
      loadWorkspaceShellStateFromPersistence,
      loadTaskMessagesIntoSession,
      hydrateWorkspaceMessagesInBackground,
      refreshWorkspaceFilesInBackground,
    });
    const workspaceCreateActions = createWorkspaceCreateActions({
      set,
      get,
      runScriptHookInBackground,
      kickoffResolver,
    });
    const projectActions = createProjectActions({
      set,
      get,
      loadWorkspaceShellStateFromPersistence,
      loadTaskMessagesIntoSession,
      hydrateWorkspaceMessagesInBackground,
      refreshWorkspaceFilesInBackground,
    });
    const workspaceHydrationActions = createWorkspaceHydrationActions({
      set,
      get,
      loadTaskMessagesIntoSession,
      hydrateWorkspaceMessagesInBackground,
      refreshWorkspaceFilesInBackground,
    });

    return {
      hasHydratedWorkspaces: false,
      workspaceSnapshotVersion: 0,
      promptDraftPersistenceVersion: 0,
      workspaces: [],
      activeWorkspaceId: "",
      projectPath: null,
      recentProjects: [],
      defaultBranch: "main",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      workspaceLastActiveAtById: {},
      sidebarActiveWorkspaceDismissedAtById: {},
      workspacePrInfoById: {},
      rateLimitsSnapshot: null,
      rateLimitsLoading: false,
      rateLimitsError: null,
      isDarkMode: true,
      activeTaskId: "",
      draftProvider: "claude-code",
      promptDraftByTask: {},
      workspaceInformation: createEmptyWorkspaceInformation(),
      promptFocusNonce: 0,
      providerCommandCatalogRefreshNonce: 0,
      workspacePlansRefreshNonce: 0,
      tasks: [],
      messagesByTask: {},
      messageCountByTask: {},
      taskMessagesLoadingByTask: {},
      layout: {
        workspaceSidebarWidth: WORKSPACE_SIDEBAR_MIN_WIDTH,
        workspaceSidebarCollapsed: false,
        workspaceSidebarItemDisplayMode:
          DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
        explorerPanelWidth: 300,
        sidebarOverlayVisible: false,
        sidebarOverlayTab: "explorer",
        terminalDocked: false,
        editorDiffMode: false,
        editorMarkdownPreviewMode: false,
      },
      settings: defaultSettings,
      editorTabs: [],
      activeEditorTabId: null,
      terminalTabs: [],
      activeTerminalTabId: null,
      cliSessionTabs: [],
      activeCliSessionTabId: null,
      activeAppSurface: WORKSPACE_APP_SURFACE,
      activeSurface: { kind: "task", taskId: "" },
      openTaskTabIds: [],
      lensTabs: [],
      paneTabMeta: {},
      dockLayout: null,
      focusPendingInteractionRequest: null,
      scrollToLatestMessageRequest: null,
      pendingCloseEditorTabId: null,
      pendingEditorSelection: null,
      projectName: null,
      projectFiles: workspaceFsAdapter.getKnownFiles(),
      workspaceFileCacheByPath: {},
      taskCheckpointById: {},
      providerAvailability: createDefaultProviderAvailability(),
      providerRuntimeCapabilities: createDefaultProviderRuntimeCapabilities(),
      skillCatalog: {
        status: "idle",
        workspacePath: null,
        sharedSkillsHome: null,
        fetchedAt: null,
        skills: [],
        roots: [],
        detail: "Skill catalog has not been loaded yet.",
      },
      notifications: [],
      reviewCommentsByTask: {},
      compareRunsById: {},
      activeCompareRunId: null,
      activeTurnIdsByTask: {},
      hostOwnedTurnIdsByTask: {},
      providerTurnActivityByTask: {},
      advisorExchangeByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      providerGoalByTask: {},
      turnVerificationByWorkspace: {},
      turnIntentComplianceByWorkspace: {},
      workspaceRuntimeCacheById: {},
      taskWorkspaceIdById: {},
      persistenceBootstrapPhase: "idle",
      persistenceBootstrapMessage: "",
      ...workspaceHydrationActions,
      refreshActiveManagedTask: async () => {
        const stateBefore = get();
        const workspaceId = stateBefore.activeWorkspaceId;
        const activeTask = findTaskById(stateBefore, stateBefore.activeTaskId);
        if (!workspaceId || !activeTask || !isTaskManaged(activeTask)) {
          return;
        }

        const loadedWorkspaceSession =
          await loadWorkspaceSessionFromPersistence({
            workspaceId,
          });
        if (!loadedWorkspaceSession.shell) {
          return;
        }

        const nextSession = loadedWorkspaceSession.workspaceState;
        const preferredActiveTaskId = nextSession.tasks.some(
          (task) => task.id === stateBefore.activeTaskId,
        )
          ? stateBefore.activeTaskId
          : nextSession.activeTaskId;
        const refreshedSession: WorkspaceSessionState = {
          ...nextSession,
          activeTaskId: preferredActiveTaskId,
        };

        set((state) => {
          if (state.activeWorkspaceId !== workspaceId) {
            return state;
          }
          return {
            tasks: refreshedSession.tasks,
            messagesByTask: refreshedSession.messagesByTask,
            messageCountByTask: refreshedSession.messageCountByTask,
            activeTaskId: refreshedSession.activeTaskId,
            workspaceInformation: refreshedSession.workspaceInformation,
            activeTurnIdsByTask: refreshedSession.activeTurnIdsByTask,
            providerSessionByTask: refreshedSession.providerSessionByTask,
            providerGoalByTask: refreshedSession.providerGoalByTask,
            nativeSessionReadyByTask: refreshedSession.nativeSessionReadyByTask,
            workspaceRuntimeCacheById: {
              ...state.workspaceRuntimeCacheById,
              [workspaceId]: refreshedSession,
            },
            taskWorkspaceIdById: registerTaskWorkspaceOwnership({
              taskWorkspaceIdById: state.taskWorkspaceIdById,
              workspaceId,
              tasks: refreshedSession.tasks,
            }),
          };
        });
        // A managed host can answer requests on its own (agent-driven MCP
        // responses), so re-align the durable needs with the refreshed session.
        for (const task of refreshedSession.tasks) {
          attentionSync.syncTaskInteractions({
            taskId: task.id,
            messages: refreshedSession.messagesByTask[task.id] ?? [],
          });
        }
      },
      syncHostTaskTurn: async (update) => {
        const loaded = await loadHostTaskTurn(update);
        if (!loaded) {
          return;
        }
        const syncResult = applyHostTaskTurnSync({
          state: get(),
          loaded,
          update,
        });
        set(syncResult.statePatch);
        if (syncResult.active) {
          scheduleProviderTurnStallTimer({
            taskId: update.taskId,
            turnId: update.turnId,
            lastEventAt: Date.now(),
          });
        } else {
          clearProviderTurnStallTimer(update.taskId);
        }
        attentionSync.syncTaskInteractions({
          taskId: update.taskId,
          messages:
            syncResult.syncedSession.messagesByTask[update.taskId] ?? [],
          endedTurnId: syncResult.turnSettled ? update.turnId : undefined,
        });

        if (
          update.eventType === "approval" ||
          update.eventType === "user_input" ||
          update.eventType === "error" ||
          update.done
        ) {
          void get().hydrateNotifications();
        }
        if (syncResult.turnSettled) {
          dispatchNextQueuedTaskTurn({
            workspaceId: update.workspaceId,
            taskId: update.taskId,
          });
        }
      },
      ...projectActions,
      ...workspaceCreateActions,
      ...workspaceManagementActions,
      ...settingsActions,
      ...createAppSurfaceActions<AppState>(set),
      ...compareActions,
      ...taskCoreActions,
      ...conversationThreadActions,
      ...terminalActions,
      ...taskLifecycleActions,
      ...paneActions,
      ...supportActions,
      sendUserMessage: async ({
        taskId,
        content,
        providerOverride,
        runtimeOverrides,
        preservePromptDraft,
        fileContexts,
        imageContexts,
        submitIntent,
        turnOrigin,
        queuedTurnId,
      }) => {
        const turnId = crypto.randomUUID();
        let state = get();
        let resolvedTaskId = taskId;
        const sourcePromptDraftTaskId = taskId || "draft:session";
        let sourcePromptDraft =
          state.promptDraftByTask[sourcePromptDraftTaskId] ??
          EMPTY_PROMPT_DRAFT;
        let runtimeTarget = resolvedTaskId
          ? resolveTaskRuntimeTarget({
              state,
              taskId: resolvedTaskId,
            })
          : null;
        let task = runtimeTarget?.task ?? null;

        if (!task) {
          const seededTaskId = crypto.randomUUID();
          const seededProvider =
            providerOverride ?? state.draftProvider ?? "claude-code";
          const seededTitleText = resolveSkillSelections({
            text: content,
            skills: state.skillCatalog.skills,
            providerId: seededProvider,
          }).normalizedText;
          const seededTitle =
            seededTitleText.split("\n")[0]?.trim().slice(0, 48) || "New Task";
          const seededTask: Task = {
            id: seededTaskId,
            title: seededTitle,
            provider: seededProvider,
            updatedAt: buildRecentTimestamp(),
            unread: false,
            archivedAt: null,
            controlMode: "interactive",
            controlOwner: "stave",
          };
          set((nextState) => ({
            tasks: [seededTask, ...nextState.tasks],
            activeTaskId: seededTaskId,
            messagesByTask: {
              ...nextState.messagesByTask,
              [seededTaskId]: nextState.messagesByTask[seededTaskId] ?? [],
            },
            messageCountByTask: {
              ...nextState.messageCountByTask,
              [seededTaskId]: nextState.messageCountByTask[seededTaskId] ?? 0,
            },
            nativeSessionReadyByTask: {
              ...nextState.nativeSessionReadyByTask,
              [seededTaskId]: false,
            },
            providerSessionByTask: {
              ...nextState.providerSessionByTask,
              [seededTaskId]: {},
            },
            taskWorkspaceIdById: {
              ...nextState.taskWorkspaceIdById,
              [seededTaskId]: nextState.activeWorkspaceId,
            },
            promptDraftByTask: {
              ...nextState.promptDraftByTask,
              [seededTaskId]: {
                text: "",
                attachedFilePaths: [],
                attachments: [],
                ...(sourcePromptDraft.runtimeOverrides
                  ? { runtimeOverrides: sourcePromptDraft.runtimeOverrides }
                  : {}),
              },
            },
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(nextState),
          }));
          state = get();
          resolvedTaskId = seededTaskId;
          sourcePromptDraft =
            state.promptDraftByTask[sourcePromptDraftTaskId] ??
            EMPTY_PROMPT_DRAFT;
          runtimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: resolvedTaskId,
          });
          task = seededTask;
        }
        if (!task || !runtimeTarget) {
          return { status: "blocked" } satisfies SendUserMessageResult;
        }
        if (isTaskManaged(findTaskById(state, resolvedTaskId))) {
          return { status: "blocked" } satisfies SendUserMessageResult;
        }
        let provider =
          providerOverride ??
          task?.provider ??
          state.draftProvider ??
          "claude-code";
        const { workspaceId: taskWorkspaceId, cwd: workspaceCwd } =
          resolveTaskWorkspaceContext({
            taskId: resolvedTaskId,
            activeWorkspaceId: state.activeWorkspaceId,
            taskWorkspaceIdById: state.taskWorkspaceIdById,
            workspacePathById: state.workspacePathById,
            workspaceDefaultById: state.workspaceDefaultById,
            projectPath: state.projectPath,
          });
        if (!taskWorkspaceId) {
          return { status: "blocked" } satisfies SendUserMessageResult;
        }
        const taskWorkspaceSession =
          getWorkspaceSessionForState({
            state,
            workspaceId: taskWorkspaceId,
          }) ?? runtimeTarget.session;
        const runCommand = window.api?.terminal?.runCommand;

        if (!state.taskCheckpointById[resolvedTaskId] && runCommand) {
          void runCommand({
            cwd: workspaceCwd,
            command: "git rev-parse HEAD",
          }).then((result) => {
            if (!result.ok) {
              return;
            }
            const checkpoint = result.stdout.trim().split("\n")[0]?.trim();
            if (!checkpoint) {
              return;
            }
            set((nextState) => ({
              taskCheckpointById: {
                ...nextState.taskCheckpointById,
                [resolvedTaskId]: checkpoint,
              },
            }));
          });
        }

        const existingHistory =
          taskWorkspaceSession.messagesByTask[resolvedTaskId] ?? [];
        if (findLatestPendingApproval({ messages: existingHistory })) {
          return { status: "blocked" } satisfies SendUserMessageResult;
        }
        if (findLatestPendingUserInput({ messages: existingHistory })) {
          return { status: "blocked" } satisfies SendUserMessageResult;
        }
        const storedPromptDraftForTask =
          taskWorkspaceSession.promptDraftByTask[resolvedTaskId];
        const promptDraftSendState = resolvePromptDraftSendState({
          content,
          preservePromptDraft,
          runtimeOverrides,
          sourceDraft: sourcePromptDraft,
          storedDraft: storedPromptDraftForTask,
          queuedTurnId,
        });
        if (!promptDraftSendState) {
          return { status: "blocked" } satisfies SendUserMessageResult;
        }
        const { promptDraft, queuedTurnToSend, remainingQueuedTurns } =
          promptDraftSendState;
        // A queued turn dispatches on the provider captured when it was
        // queued (auto and manual dispatch alike); the composer's current
        // selection only applies to new sends. Legacy queue items without a
        // stored provider keep following the task's current provider.
        if (queuedTurnToSend?.providerId) {
          provider = queuedTurnToSend.providerId;
        }
        const codexGoalQueuedTurns = buildCodexGoalQueuedTurns({
          provider,
          content,
          turnId,
        });
        const promptContent = buildPromptDraftContentForSend(promptDraft);
        const promptDisplayContent =
          buildPromptDraftDisplayContentForSend(promptDraft);
        const promptDisplayParts =
          buildPromptDraftDisplayPartsForSend(promptDraft);
        const activeTurnId =
          taskWorkspaceSession.activeTurnIdsByTask[resolvedTaskId];
        // A "stalled" turn is one whose provider stream has gone silent past the
        // stall threshold with no pending approval/user_input interaction — e.g. a
        // background task that never emitted `done`, or one whose runtime died. In
        // that state, queuing would strand the user in a spinner forever, so instead
        // interrupt the dead turn and send this message as a fresh turn. This mirrors
        // the manual "Stop, then send" flow (and, like it, does not resume the
        // aborted provider session). Live/streaming turns and turns waiting on an
        // approval or AskUserQuestion prompt are NOT stalled and still queue.
        const activeTurnStalled =
          !!activeTurnId &&
          resolveProviderTurnDisplayState({
            activeTurnId,
            activity: get().providerTurnActivityByTask[resolvedTaskId],
          }) === "stalled";
        if (activeTurnId && activeTurnStalled) {
          get().abortTaskTurn({ taskId: resolvedTaskId });
        }
        if (queuedTurnToSend && activeTurnId && !activeTurnStalled) {
          // Manual dispatch of a queued item only makes sense while no live
          // turn is running — during an active turn the item is already in
          // line to auto-dispatch, and falling through here would re-queue
          // it as a duplicate.
          return { status: "blocked" } satisfies SendUserMessageResult;
        }
        if (activeTurnId && !activeTurnStalled && submitIntent === "steer") {
          // Mid-turn steering: an explicit user choice (Enter, mirroring
          // Codex CLI), not a priority/fallback pair with queueing (Tab).
          // Every eligibility gate below is a hard requirement — if any
          // fails, this returns `steer-unavailable` immediately and does
          // NOT fall through to the queue path. The caller decides what to
          // do with that (e.g. tell the user to press Tab to queue).
          const steerTurn = window.api?.provider?.steerTurn;
          if (!steerTurn) {
            return {
              status: "steer-unavailable",
              taskId: resolvedTaskId,
              workspaceId: taskWorkspaceId,
              message: "Mid-turn steering is not available in this build.",
            } satisfies SendUserMessageResult;
          }
          const steeringContext = resolveMidTurnSteeringContext({
            activeTurnId,
            activity: state.providerTurnActivityByTask[resolvedTaskId],
            fallbackProviderId: provider,
            messages: existingHistory,
            hasAttachments:
              (promptDraft.attachments?.length ?? 0) > 0 ||
              (promptDraft.attachedFilePaths?.length ?? 0) > 0,
          });
          if (steeringContext.unavailableMessage) {
            return {
              status: "steer-unavailable",
              taskId: resolvedTaskId,
              workspaceId: taskWorkspaceId,
              message: steeringContext.unavailableMessage,
            } satisfies SendUserMessageResult;
          }
          const activeTurnProvider = steeringContext.providerId;
          const clientMessageId = crypto.randomUUID();
          const steerResult = await submitSteerWithDeadline({
            send: steerTurn,
            request: {
              turnId: activeTurnId,
              text: promptContent,
              enabled: get().settings.midTurnSteeringEnabled,
              clientMessageId,
            },
          });
          if (!steerResult.ok) {
            if (steerResult.delivery === "unknown") {
              return {
                status: "steer-delivery-unknown",
                taskId: resolvedTaskId,
                workspaceId: taskWorkspaceId,
                message:
                  steerResult.message ||
                  "Steer delivery could not be confirmed. Wait for the current response before retrying or queueing.",
              } satisfies SendUserMessageResult;
            }
            return {
              status: "steer-unavailable",
              taskId: resolvedTaskId,
              workspaceId: taskWorkspaceId,
              message:
                steerResult.message ||
                "The active turn rejected the steer request — press Tab to queue instead.",
            } satisfies SendUserMessageResult;
          }
          set((nextState) => {
            const isActiveWorkspace =
              taskWorkspaceId === nextState.activeWorkspaceId;
            const cachedSession = isActiveWorkspace
              ? null
              : nextState.workspaceRuntimeCacheById[taskWorkspaceId];
            if (!isActiveWorkspace && !cachedSession) {
              return nextState;
            }
            const messagesByTask =
              cachedSession?.messagesByTask ?? nextState.messagesByTask;
            const messageCountByTask =
              cachedSession?.messageCountByTask ?? nextState.messageCountByTask;
            const activeTurnIdsByTask =
              cachedSession?.activeTurnIdsByTask ??
              nextState.activeTurnIdsByTask;
            const turnStillActive =
              activeTurnIdsByTask[resolvedTaskId] === activeTurnId;
            const activeModel =
              activeTurnProvider === "claude-code"
                ? nextState.settings.modelClaude
                : nextState.settings.modelCodex;
            const steeredState = buildSteeredUserMessageState({
              messagesByTask,
              messageCountByTask,
              taskId: resolvedTaskId,
              content: promptContent,
              steeredIntoTurnId: activeTurnId,
              clientMessageId,
              provider: activeTurnProvider,
              activeModel,
              turnStillActive,
            });
            const promptDraftByTask =
              cachedSession?.promptDraftByTask ?? nextState.promptDraftByTask;
            const currentDraft = promptDraftByTask[resolvedTaskId];
            const shouldClearSubmittedDraft =
              !preservePromptDraft && currentDraft?.text === promptDraft.text;
            const nextPromptDraftByTask = shouldClearSubmittedDraft
              ? {
                  ...promptDraftByTask,
                  [resolvedTaskId]: normalizePromptDraftForStorage({
                    ...(currentDraft ?? sourcePromptDraft),
                    text: "",
                    attachedFilePaths: [],
                    attachments: [],
                    promptBatch: undefined,
                  }),
                }
              : promptDraftByTask;
            const activityByTask = turnStillActive
              ? startProviderTurnActivity({
                  activityByTask: nextState.providerTurnActivityByTask,
                  taskId: resolvedTaskId,
                  turnId: activeTurnId,
                  providerId: activeTurnProvider,
                })
              : nextState.providerTurnActivityByTask;
            if (cachedSession) {
              return {
                workspaceRuntimeCacheById: {
                  ...nextState.workspaceRuntimeCacheById,
                  [taskWorkspaceId]: {
                    ...cachedSession,
                    ...steeredState,
                    promptDraftByTask: nextPromptDraftByTask,
                  },
                },
                providerTurnActivityByTask: activityByTask,
              };
            }
            return {
              ...steeredState,
              promptDraftByTask: nextPromptDraftByTask,
              providerTurnActivityByTask: activityByTask,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(nextState),
            };
          });
          return {
            status: "steered",
            taskId: resolvedTaskId,
            workspaceId: taskWorkspaceId,
            turnId: activeTurnId,
          } satisfies SendUserMessageResult;
        }
        if (activeTurnId && !activeTurnStalled) {
          // submitIntent is "queue" or omitted: queue unconditionally, with
          // no steer attempt at all — this is byte-for-byte the pre-steering
          // behavior for every caller that doesn't explicitly opt into
          // "steer" (suggestion clicks, PlanViewer, etc.).
          const queuedTurn = buildQueuedTurnFromDraft({
            draft: promptDraft,
            sourceTurnId: activeTurnId,
            content: promptContent,
            // Pin the selection at queue time so switching provider/model
            // while the current turn streams never retargets queued turns.
            providerId: provider,
            model: resolveTurnModelForSend({
              providerId: provider,
              runtimeOverrides: promptDraft.runtimeOverrides,
              settings: state.settings,
            }),
          });
          const storedDraft =
            taskWorkspaceSession.promptDraftByTask[resolvedTaskId] ??
            sourcePromptDraft;
          const queuedPromptDraft = normalizePromptDraftForStorage({
            ...storedDraft,
            ...(preservePromptDraft
              ? {}
              : {
                  text: "",
                  attachedFilePaths: [],
                  attachments: [],
                  promptBatch: undefined,
                }),
            queuedTurns: [...(storedDraft.queuedTurns ?? []), queuedTurn],
            queuedNextTurn: undefined,
          });
          set((nextState) => {
            if (taskWorkspaceId === nextState.activeWorkspaceId) {
              return {
                promptDraftByTask: {
                  ...nextState.promptDraftByTask,
                  [resolvedTaskId]: queuedPromptDraft,
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              };
            }

            const cachedSession =
              nextState.workspaceRuntimeCacheById[taskWorkspaceId];
            if (!cachedSession) {
              return nextState;
            }

            return {
              workspaceRuntimeCacheById: {
                ...nextState.workspaceRuntimeCacheById,
                [taskWorkspaceId]: {
                  ...cachedSession,
                  promptDraftByTask: {
                    ...cachedSession.promptDraftByTask,
                    [resolvedTaskId]: queuedPromptDraft,
                  },
                },
              },
            };
          });
          return {
            status: "queued",
            taskId: resolvedTaskId,
            workspaceId: taskWorkspaceId,
          } satisfies SendUserMessageResult;
        }
        if (!hasPromptDraftPayload(promptDraft)) {
          return { status: "blocked" } satisfies SendUserMessageResult;
        }

        const updatePromptDraftsForWorkspace = (
          draftsByTaskId: Record<string, PromptDraft>,
        ) => {
          set((nextState) => {
            if (taskWorkspaceId === nextState.activeWorkspaceId) {
              return {
                promptDraftByTask: {
                  ...nextState.promptDraftByTask,
                  ...draftsByTaskId,
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              };
            }

            const cachedSession =
              nextState.workspaceRuntimeCacheById[taskWorkspaceId];
            if (!cachedSession) {
              return nextState;
            }

            return {
              workspaceRuntimeCacheById: {
                ...nextState.workspaceRuntimeCacheById,
                [taskWorkspaceId]: {
                  ...cachedSession,
                  promptDraftByTask: {
                    ...cachedSession.promptDraftByTask,
                    ...draftsByTaskId,
                  },
                },
              },
            };
          });
        };

        // Manual queued-turn dispatch keeps the composer draft intact and
        // only removes the dispatched item from the queue; a normal send
        // clears the submitted draft.
        const preservedQueuedDispatchDraft = buildPreservedQueuedDraft({
          sourceDraft: storedPromptDraftForTask ?? sourcePromptDraft,
          queuedTurn: queuedTurnToSend,
          queuedTurns: codexGoalQueuedTurns,
          remainingQueuedTurns,
        });
        const draftAfterSend = (currentDraft?: PromptDraft) =>
          resolvePromptDraftAfterSend({
            currentDraft,
            storedDraft: storedPromptDraftForTask,
            sourceDraft: sourcePromptDraft,
            sentDraft: promptDraft,
            preservePromptDraft,
            preservedQueuedDraft: preservedQueuedDispatchDraft,
            queuedTurns: codexGoalQueuedTurns,
          });

        let promptDraftClearedOptimistically = false;
        const clearSubmittedPromptDraft = () => {
          if (preservePromptDraft) {
            return;
          }
          if (promptDraftClearedOptimistically) {
            return;
          }
          promptDraftClearedOptimistically = true;
          updatePromptDraftsForWorkspace({
            [resolvedTaskId]:
              preservedQueuedDispatchDraft ??
              buildClearedPromptDraftWithQueuedNextTurn({
                draft: promptDraft,
                queuedTurns: codexGoalQueuedTurns,
              }),
            ...(sourcePromptDraftTaskId !== resolvedTaskId
              ? {
                  [sourcePromptDraftTaskId]:
                    buildClearedPromptDraft(sourcePromptDraft),
                }
              : {}),
          });
        };
        const restoreSubmittedPromptDraft = () => {
          if (!promptDraftClearedOptimistically) {
            return;
          }
          promptDraftClearedOptimistically = false;
          updatePromptDraftsForWorkspace({
            // For a failed queued-turn dispatch, put the original stored
            // draft back (the item returns to the queue untouched).
            [resolvedTaskId]: queuedTurnToSend
              ? (storedPromptDraftForTask ?? sourcePromptDraft)
              : promptDraft,
            ...(sourcePromptDraftTaskId !== resolvedTaskId
              ? {
                  [sourcePromptDraftTaskId]: sourcePromptDraft,
                }
              : {}),
          });
        };

        clearSubmittedPromptDraft();

        try {
          // A queued turn's stored model (queue-time selection) wins over the
          // composer's current override; see resolveTurnModelForSend.
          let activeModel = resolveTurnModelForSend({
            providerId: provider,
            queuedTurnModel: queuedTurnToSend?.model,
            runtimeOverrides: promptDraft.runtimeOverrides,
            settings: state.settings,
          });

          const resolvedFileContexts = await getDraftFileContexts({
            promptDraft,
            session: taskWorkspaceSession,
            workspaceRootPath: workspaceCwd,
            fileContexts,
          });
          const resolvedImageContexts = getDraftImageContexts({
            promptDraft,
            imageContexts,
            includeLensCommentImages:
              state.settings.lensVisualCommentScreenshotsAsImageContext,
          });
          state = get();
          const latestWorkspaceSession = getWorkspaceSessionForState({
            state,
            workspaceId: taskWorkspaceId,
          });
          if (!latestWorkspaceSession) {
            restoreSubmittedPromptDraft();
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          const latestHistory =
            latestWorkspaceSession.messagesByTask[resolvedTaskId] ??
            existingHistory;
          if (latestWorkspaceSession.activeTurnIdsByTask[resolvedTaskId]) {
            restoreSubmittedPromptDraft();
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          if (
            findLatestPendingApproval({ messages: latestHistory }) ||
            findLatestPendingUserInput({ messages: latestHistory })
          ) {
            restoreSubmittedPromptDraft();
            return { status: "blocked" } satisfies SendUserMessageResult;
          }

          let autoRoutingDecision: Awaited<
            ReturnType<typeof resolveAutoRoutingDecision>
          > | null = null;
          if (
            state.settings.autoRoutingEnabled &&
            promptDraft.runtimeOverrides?.autoRouting === true
          ) {
            const classifyRoute = state.settings.autoRoutingUseClassifier
              ? createUtilityRouteClassifier({
                  context: buildUtilityInferenceContext({
                    cwd: workspaceCwd,
                    provider,
                    model: activeModel,
                    settings: state.settings,
                  }),
                })
              : undefined;
            autoRoutingDecision = await resolveAutoRoutingDecision({
              settings: {
                autoRoutingEnabled: state.settings.autoRoutingEnabled,
                autoRoutingUseClassifier:
                  state.settings.autoRoutingUseClassifier,
                autoRoutingObjective: state.settings.autoRoutingObjective,
                autoRoutingSafetyEscalation:
                  state.settings.autoRoutingSafetyEscalation,
                autoRoutingAllowProviderSwitch:
                  state.settings.autoRoutingAllowProviderSwitch,
                autoRoutingEligibleClaudeModels:
                  state.settings.autoRoutingEligibleClaudeModels,
                autoRoutingEligibleCodexModels:
                  state.settings.autoRoutingEligibleCodexModels,
              },
              runtimeOverrides: promptDraft.runtimeOverrides,
              currentProviderId: provider,
              currentModel: activeModel,
              prompt: promptContent,
              history: latestHistory.map((message) => ({
                role: message.role,
                content: message.content,
                providerId:
                  message.providerId === "claude-code" ||
                  message.providerId === "codex"
                    ? message.providerId
                    : undefined,
                model: message.model,
              })),
              fileContextCount: resolvedFileContexts.length,
              classifyRoute,
            });
            provider = autoRoutingDecision.providerId;
            activeModel = autoRoutingDecision.model;
          }

          const skillSelection = resolveSkillSelections({
            text: promptContent,
            skills: state.skillCatalog.skills,
            providerId: provider,
          });
          const normalizedPrompt = skillSelection.normalizedText;

          maybeSuggestUtilityTaskName({
            task: latestWorkspaceSession.tasks.find(
              (candidate) => candidate.id === resolvedTaskId,
            ),
            priorUserTurnCount: latestHistory.filter(
              (message) => message.role === "user",
            ).length,
            prompt: normalizedPrompt || promptContent,
            history: latestHistory,
            context: buildUtilityInferenceContext({
              cwd: workspaceCwd,
              provider,
              model: activeModel,
              settings: state.settings,
            }),
            onTitle: (title) =>
              get().renameTask({
                taskId: resolvedTaskId,
                title,
                source: "auto",
              }),
          });

          const providerSession =
            latestWorkspaceSession.providerSessionByTask[resolvedTaskId];
          const providerSessionCursor = getProviderSessionCursor({
            sessions: providerSession,
            providerId: provider,
          });
          const taskWorkspaceSummary =
            state.workspaces.find(
              (workspace) => workspace.id === taskWorkspaceId,
            ) ?? null;
          const taskWorkspaceTasks = latestWorkspaceSession.tasks;
          let taskWorkspaceInformation =
            latestWorkspaceSession.workspaceInformation;

          // ── Information panel auto-fill ───────────────────────────────────────
          // Detect registerable resources (Jira/PR/Confluence/Figma/Slack/
          // Storybook/Amplify URLs) in the submitted prompt and register them
          // before the turn context is built, so this turn's injected context
          // already includes them. Dedup is keyed on canonical identity (e.g.
          // Jira issue key), not the raw URL, so re-sent links are no-ops.
          if (!state.workspaceDefaultById[taskWorkspaceId]) {
            const detectedPromptResources =
              detectWorkspaceResourcesInText(promptContent);
            if (detectedPromptResources.length > 0) {
              const autofill = applyDetectedWorkspaceResources({
                current: taskWorkspaceInformation,
                detected: detectedPromptResources,
              });
              if (autofill.state !== taskWorkspaceInformation) {
                taskWorkspaceInformation = autofill.state;
                get().applyExternalWorkspaceInformationUpdate({
                  workspaceId: taskWorkspaceId,
                  workspaceInformation: autofill.state,
                });
                const sessionForPersist = getWorkspaceSessionForState({
                  state: get(),
                  workspaceId: taskWorkspaceId,
                });
                if (sessionForPersist) {
                  persistWorkspaceSessionInBackground({
                    workspaceId: taskWorkspaceId,
                    session: sessionForPersist,
                  });
                }
              }
            }
          }

          // ── Repo-map context injection ─────────────────────────────────────────
          // On the first turn of a task, inject the pre-generated repo-map summary
          // as retrieved context so the AI immediately knows the codebase structure
          // (hotspots, entrypoints, read-first docs) without having to explore first.
          // TopBar pre-warms this module-level Map cache asynchronously; the read
          // here is a plain Map.get — no IPC, no blocking, effectively free.
          const retrievedContextParts: CanonicalRetrievedContextPart[] = [
            buildCurrentTaskAwarenessRetrievedContext({
              workspaceId: taskWorkspaceId,
              workspaceName: taskWorkspaceSummary?.name ?? null,
              workspacePath: workspaceCwd ?? null,
              workspaceBranch:
                state.workspaceBranchById[taskWorkspaceId] ?? null,
              projectName: state.projectName,
              projectPath: state.projectPath,
              taskId: resolvedTaskId,
              tasks: taskWorkspaceTasks,
              workspaceInformation: taskWorkspaceInformation,
              // Static procedural guidance is identical every turn; inject it
              // only on the task's first turn and rely on the terse pointer
              // afterwards to keep the recurring prompt small.
              includeStaticGuidance: existingHistory.length === 0,
            }),
            ...(task.sourceContexts ?? []),
          ];
          // `@lens` references resolve against the live Lens browser state.
          let lensReferenceState: LensReferenceState | null = null;
          if (promptDraftReferencesLens(promptDraft)) {
            try {
              const lensStateResult = await window.api?.lens?.getState?.({
                workspaceId: taskWorkspaceId,
              });
              lensReferenceState =
                lensStateResult?.ok && lensStateResult.state
                  ? lensStateResult.state
                  : null;
            } catch {
              lensReferenceState = null;
            }
          }
          const workspaceInformationReferencesContext =
            buildWorkspaceInformationReferencesRetrievedContext({
              promptDraft,
              workspaceInformation: taskWorkspaceInformation,
              lensState: lensReferenceState,
            });
          if (workspaceInformationReferencesContext) {
            retrievedContextParts.push(workspaceInformationReferencesContext);
          }
          if (existingHistory.length === 0 && workspaceCwd) {
            const repoMapText = getRepoMapContextCache(workspaceCwd);
            if (repoMapText) {
              retrievedContextParts.push({
                type: "retrieved_context",
                sourceId: "stave:repo-map",
                title: "Codebase Map",
                content: repoMapText,
              });
            }
          }
          const referencedTaskContext = buildReferencedTaskRetrievedContext({
            prompt: normalizedPrompt || promptContent,
            currentTaskId: resolvedTaskId,
            tasks: taskWorkspaceTasks,
            messagesByTask: latestWorkspaceSession.messagesByTask,
          });
          if (referencedTaskContext) {
            retrievedContextParts.push(referencedTaskContext);
          }
          // ──────────────────────────────────────────────────────────────────────

          const modelRuntimeSettings = applyModelRuntimePreference({
            settings: get().settings,
            providerId: provider,
            model: activeModel,
          });
          const resolvedPromptDraftRuntimeState =
            resolvePromptDraftRuntimeState({
              promptDraft,
              fallback: {
                claudePermissionMode: modelRuntimeSettings.claudePermissionMode,
                claudePermissionModeBeforePlan:
                  modelRuntimeSettings.claudePermissionModeBeforePlan,
                claudeEffort: modelRuntimeSettings.claudeEffort,
                codexPlanMode: modelRuntimeSettings.codexPlanMode,
                codexReasoningEffort: modelRuntimeSettings.codexReasoningEffort,
              },
            });
          const providerRuntimeOptions = buildProviderRuntimeOptions({
            provider,
            model: activeModel,
            includeAdvisor: turnOrigin === "conversation",
            advisorRuntimeOverrides: promptDraft.runtimeOverrides,
            workerRuntimeOverrides: promptDraft.runtimeOverrides,
            settings: {
              ...modelRuntimeSettings,
              ...resolvedPromptDraftRuntimeState,
              ...(autoRoutingDecision?.claudeEffort
                ? { claudeEffort: autoRoutingDecision.claudeEffort }
                : {}),
              ...(autoRoutingDecision?.codexReasoningEffort
                ? {
                    codexReasoningEffort:
                      autoRoutingDecision.codexReasoningEffort,
                  }
                : {}),
            },
            boundSecretIds: resolvedPromptDraftRuntimeState.boundSecretIds,
            providerSession,
          });
          const modelInfo = resolveTurnModelInfo({
            providerId: provider,
            runtimeOptions: providerRuntimeOptions,
          });
          const conversation = buildCanonicalConversationRequest({
            turnId,
            taskId: resolvedTaskId,
            workspaceId: taskWorkspaceId,
            providerId: provider,
            model: activeModel,
            history: latestHistory,
            userInput: normalizedPrompt,
            mode: "chat",
            fileContexts:
              resolvedFileContexts.length > 0
                ? resolvedFileContexts
                : undefined,
            imageContexts:
              resolvedImageContexts.length > 0
                ? resolvedImageContexts
                : undefined,
            skillContexts: skillSelection.selectedSkills,
            nativeSessionId: providerSessionCursor?.nativeSessionId ?? null,
            syncedThroughMessageId:
              providerSessionCursor?.syncedThroughMessageId ?? null,
            retrievedContextParts,
          });
          const prompt = normalizedPrompt;
          promptDraftClearedOptimistically = false;

          if (taskWorkspaceId === get().activeWorkspaceId) {
            set((nextState) => {
              const pendingTurnState = buildPendingProviderTurnState({
                tasks: nextState.tasks,
                messagesByTask: nextState.messagesByTask,
                messageCountByTask: nextState.messageCountByTask,
                activeTurnIdsByTask: nextState.activeTurnIdsByTask,
                taskWorkspaceIdById: nextState.taskWorkspaceIdById,
                workspaceSnapshotVersion: nextState.workspaceSnapshotVersion,
                taskId: resolvedTaskId,
                taskWorkspaceId,
                turnId,
                provider,
                activeModel,
                modelInfo,
                content: promptContent,
                displayContent: promptDisplayContent,
                displayParts: promptDisplayParts,
                fileContexts:
                  resolvedFileContexts.length > 0
                    ? resolvedFileContexts
                    : undefined,
                imageContexts:
                  resolvedImageContexts.length > 0
                    ? resolvedImageContexts
                    : undefined,
              });

              return {
                ...pendingTurnState,
                promptDraftByTask: {
                  ...nextState.promptDraftByTask,
                  // Queued-turn dispatch: the composer draft was already
                  // preserved (queue trimmed) by the optimistic clear — keep
                  // whatever is current instead of clearing it.
                  [resolvedTaskId]: draftAfterSend(
                    nextState.promptDraftByTask[resolvedTaskId],
                  ),
                  ...(!preservePromptDraft &&
                  sourcePromptDraftTaskId !== resolvedTaskId
                    ? {
                        [sourcePromptDraftTaskId]: buildClearedPromptDraft(
                          nextState.promptDraftByTask[
                            sourcePromptDraftTaskId
                          ] ?? sourcePromptDraft,
                        ),
                      }
                    : {}),
                },
              };
            });
          } else {
            set((nextState) => {
              const cachedSession =
                nextState.workspaceRuntimeCacheById[taskWorkspaceId];
              if (!cachedSession) {
                return nextState;
              }

              const pendingTurnState = buildPendingProviderTurnState({
                tasks: cachedSession.tasks,
                messagesByTask: cachedSession.messagesByTask,
                messageCountByTask: cachedSession.messageCountByTask,
                activeTurnIdsByTask: cachedSession.activeTurnIdsByTask,
                taskWorkspaceIdById: nextState.taskWorkspaceIdById,
                workspaceSnapshotVersion: nextState.workspaceSnapshotVersion,
                taskId: resolvedTaskId,
                taskWorkspaceId,
                turnId,
                provider,
                activeModel,
                modelInfo,
                content: promptContent,
                displayContent: promptDisplayContent,
                displayParts: promptDisplayParts,
                fileContexts:
                  resolvedFileContexts.length > 0
                    ? resolvedFileContexts
                    : undefined,
                imageContexts:
                  resolvedImageContexts.length > 0
                    ? resolvedImageContexts
                    : undefined,
              });

              return {
                workspaceRuntimeCacheById: {
                  ...nextState.workspaceRuntimeCacheById,
                  [taskWorkspaceId]: {
                    ...cachedSession,
                    tasks: pendingTurnState.tasks,
                    messagesByTask: pendingTurnState.messagesByTask,
                    messageCountByTask: pendingTurnState.messageCountByTask,
                    activeTurnIdsByTask: pendingTurnState.activeTurnIdsByTask,
                    promptDraftByTask: {
                      ...cachedSession.promptDraftByTask,
                      [resolvedTaskId]: draftAfterSend(
                        cachedSession.promptDraftByTask[resolvedTaskId],
                      ),
                    },
                  },
                },
              };
            });

            const inactiveWorkspaceSession =
              get().workspaceRuntimeCacheById[taskWorkspaceId];
            if (inactiveWorkspaceSession) {
              scheduleWorkspaceSnapshotPersist({
                workspaceId: taskWorkspaceId,
                workspaceName: resolveWorkspaceName({
                  state: get(),
                  workspaceId: taskWorkspaceId,
                }),
                activeTaskId: inactiveWorkspaceSession.activeTaskId,
                tasks: inactiveWorkspaceSession.tasks,
                messagesByTask: inactiveWorkspaceSession.messagesByTask,
                promptDraftByTask: inactiveWorkspaceSession.promptDraftByTask,
                reviewCommentsByTask:
                  inactiveWorkspaceSession.reviewCommentsByTask,
                workspaceInformation:
                  inactiveWorkspaceSession.workspaceInformation,
                editorTabs: inactiveWorkspaceSession.editorTabs,
                activeEditorTabId: inactiveWorkspaceSession.activeEditorTabId,
                terminalTabs: inactiveWorkspaceSession.terminalTabs,
                activeTerminalTabId:
                  inactiveWorkspaceSession.activeTerminalTabId,
                terminalDocked: inactiveWorkspaceSession.terminalDocked,
                cliSessionTabs: inactiveWorkspaceSession.cliSessionTabs,
                activeCliSessionTabId:
                  inactiveWorkspaceSession.activeCliSessionTabId,
                activeSurface: inactiveWorkspaceSession.activeSurface,
                openTaskTabIds: inactiveWorkspaceSession.openTaskTabIds,
                lensTabs: inactiveWorkspaceSession.lensTabs,
                paneTabMeta: inactiveWorkspaceSession.paneTabMeta,
                dockLayout: inactiveWorkspaceSession.dockLayout,
                providerSessionByTask:
                  inactiveWorkspaceSession.providerSessionByTask,
              });
            }
          }

          const turnActivityStartedAt = Date.now();
          set((nextState) => ({
            providerTurnActivityByTask: startProviderTurnActivity({
              activityByTask: nextState.providerTurnActivityByTask,
              taskId: resolvedTaskId,
              turnId,
              providerId: provider,
              now: turnActivityStartedAt,
            }),
          }));
          scheduleProviderTurnStallTimer({
            taskId: resolvedTaskId,
            turnId,
            lastEventAt: turnActivityStartedAt,
          });

          let lastPersistedPlanTextForTurn: string | null = null;
          const providerTurnEventController = createProviderTurnEventController(
            {
              flushEvents: (pendingEvents) => {
                let persistInactiveWorkspaceSession: {
                  workspaceId: string;
                  session: WorkspaceSessionState;
                } | null = null;
                let updatedSession: WorkspaceSessionState | null = null;
                const currentState = get();
                const applied = applyPendingProviderEventsToStoreState({
                  state: currentState,
                  taskWorkspaceId,
                  taskId: resolvedTaskId,
                  events: pendingEvents,
                  provider,
                  model: activeModel,
                  turnId,
                });
                // Resolve the turn against the task's owning workspace
                // session (runtime cache when inactive) — `state.activeTurnIdsByTask`
                // only reflects the active workspace, so checking it directly
                // froze activity updates and disarmed stall detection for
                // turns running in a backgrounded workspace.
                const owningTurnSession = getWorkspaceSessionForState({
                  state: currentState,
                  workspaceId: taskWorkspaceId,
                });
                const turnStillActive =
                  owningTurnSession?.activeTurnIdsByTask[resolvedTaskId] ===
                  turnId;
                const nextTurnActivityByTask = turnStillActive
                  ? applyProviderTurnActivityEvents({
                      activityByTask: currentState.providerTurnActivityByTask,
                      taskId: resolvedTaskId,
                      turnId,
                      providerId: provider,
                      events: pendingEvents,
                    })
                  : currentState.providerTurnActivityByTask;
                // Advisor phases are folded even for a turn that is no longer
                // the active one: the terminal phase is what explains why the
                // turn ended, and dropping it would hide advisor aborts.
                const advisorPatch = buildAdvisorExchangePatch({
                  exchangeByTask: currentState.advisorExchangeByTask,
                  taskId: resolvedTaskId,
                  turnId,
                  events: pendingEvents,
                });
                persistInactiveWorkspaceSession =
                  applied.persistInactiveWorkspaceSession;
                updatedSession = applied.updatedSession;
                const activityChanged =
                  nextTurnActivityByTask !==
                  currentState.providerTurnActivityByTask;
                if (applied.stateChanged || activityChanged || advisorPatch) {
                  set({
                    ...applied.statePatch,
                    ...(activityChanged
                      ? {
                          providerTurnActivityByTask: nextTurnActivityByTask,
                        }
                      : {}),
                    ...advisorPatch,
                  });
                }
                if (
                  !turnStillActive ||
                  pendingEvents.some((event) => event.type === "done")
                ) {
                  clearProviderTurnStallTimer(resolvedTaskId);
                } else {
                  const nextActivity = nextTurnActivityByTask[resolvedTaskId];
                  if (nextActivity) {
                    scheduleProviderTurnStallTimer({
                      taskId: resolvedTaskId,
                      turnId,
                      lastEventAt: nextActivity.lastEventAt,
                    });
                  }
                }
                const persistedInactiveWorkspaceSession =
                  persistInactiveWorkspaceSession as {
                    workspaceId: string;
                    session: WorkspaceSessionState;
                  } | null;
                const latestState = get();
                if (persistedInactiveWorkspaceSession !== null) {
                  scheduleWorkspaceSnapshotPersist({
                    workspaceId: persistedInactiveWorkspaceSession.workspaceId,
                    workspaceName: resolveWorkspaceName({
                      state: latestState,
                      workspaceId:
                        persistedInactiveWorkspaceSession.workspaceId,
                    }),
                    activeTaskId:
                      persistedInactiveWorkspaceSession.session.activeTaskId,
                    tasks: persistedInactiveWorkspaceSession.session.tasks,
                    messagesByTask:
                      persistedInactiveWorkspaceSession.session.messagesByTask,
                    promptDraftByTask:
                      persistedInactiveWorkspaceSession.session
                        .promptDraftByTask,
                    reviewCommentsByTask:
                      persistedInactiveWorkspaceSession.session
                        .reviewCommentsByTask,
                    workspaceInformation:
                      persistedInactiveWorkspaceSession.session
                        .workspaceInformation,
                    editorTabs:
                      persistedInactiveWorkspaceSession.session.editorTabs,
                    activeEditorTabId:
                      persistedInactiveWorkspaceSession.session
                        .activeEditorTabId,
                    terminalTabs:
                      persistedInactiveWorkspaceSession.session.terminalTabs,
                    activeTerminalTabId:
                      persistedInactiveWorkspaceSession.session
                        .activeTerminalTabId,
                    terminalDocked:
                      persistedInactiveWorkspaceSession.session.terminalDocked,
                    cliSessionTabs:
                      persistedInactiveWorkspaceSession.session.cliSessionTabs,
                    activeCliSessionTabId:
                      persistedInactiveWorkspaceSession.session
                        .activeCliSessionTabId,
                    activeSurface:
                      persistedInactiveWorkspaceSession.session.activeSurface,
                    openTaskTabIds:
                      persistedInactiveWorkspaceSession.session.openTaskTabIds,
                    lensTabs:
                      persistedInactiveWorkspaceSession.session.lensTabs,
                    paneTabMeta:
                      persistedInactiveWorkspaceSession.session.paneTabMeta,
                    dockLayout:
                      persistedInactiveWorkspaceSession.session.dockLayout,
                    providerSessionByTask:
                      persistedInactiveWorkspaceSession.session
                        .providerSessionByTask,
                  });
                }
                const nextPlanReady = pendingEvents
                  .filter(
                    (
                      event,
                    ): event is Extract<
                      NormalizedProviderEvent,
                      { type: "plan_ready" }
                    > => event.type === "plan_ready",
                  )
                  .at(-1);
                const planTextToPersist = resolveWorkspacePlanPersistenceText({
                  planText: nextPlanReady?.planText,
                  lastPersistedPlanText: lastPersistedPlanTextForTurn,
                });
                if (planTextToPersist && workspaceCwd) {
                  lastPersistedPlanTextForTurn = planTextToPersist;
                  void persistWorkspacePlanFile({
                    rootPath: workspaceCwd,
                    taskId: resolvedTaskId,
                    planText: planTextToPersist,
                  }).then((filePath) => {
                    if (filePath) {
                      latestState.notifyWorkspacePlansChanged();
                    }
                  });
                }
                const notificationSession =
                  updatedSession as WorkspaceSessionState | null;
                let notificationWrites: Promise<unknown> = Promise.resolve();
                if (notificationSession) {
                  const notificationsToPersist =
                    buildApprovalNotificationInputs({
                      state: latestState,
                      session: notificationSession,
                      workspaceId: taskWorkspaceId,
                      taskId: resolvedTaskId,
                      turnId,
                      provider,
                      events: pendingEvents,
                      trustedTools: latestState.settings.trustedTools,
                    });
                  notificationsToPersist.push(
                    ...buildUserInputNotificationInputs({
                      state: latestState,
                      session: notificationSession,
                      workspaceId: taskWorkspaceId,
                      taskId: resolvedTaskId,
                      turnId,
                      provider,
                      events: pendingEvents,
                    }),
                  );
                  const failureNotification =
                    buildTaskTurnFailedNotificationInput({
                      state: latestState,
                      session: notificationSession,
                      workspaceId: taskWorkspaceId,
                      taskId: resolvedTaskId,
                      turnId,
                      provider,
                      events: pendingEvents,
                    });
                  if (failureNotification) {
                    notificationsToPersist.push(failureNotification);
                  } else {
                    const completionNotification =
                      buildTaskTurnCompletedNotificationInput({
                        state: latestState,
                        session: notificationSession,
                        workspaceId: taskWorkspaceId,
                        taskId: resolvedTaskId,
                        turnId,
                        provider,
                        events: pendingEvents,
                      });
                    if (completionNotification) {
                      notificationsToPersist.push(completionNotification);
                    }
                  }
                  if (notificationsToPersist.length > 0) {
                    notificationWrites = persistNotifications(
                      notificationsToPersist,
                    );
                  }
                  const trustedApprovalResponses = findTrustedApprovalResponses(
                    {
                      session: notificationSession,
                      taskId: resolvedTaskId,
                      events: pendingEvents,
                      trustedTools: latestState.settings.trustedTools,
                    },
                  );
                  for (const response of trustedApprovalResponses) {
                    void latestState.resolveApproval({
                      taskId: resolvedTaskId,
                      messageId: response.messageId,
                      approved: true,
                    });
                  }
                }
                // Keep durable interaction needs aligned with the task
                // window: requests answered elsewhere (managed host, trusted
                // auto-approval) stop being actionable right away, and a turn
                // that ended can no longer accept an answer at all.
                void notificationWrites.then(() => {
                  // Read the session again: a trusted auto-approval may have
                  // answered the request while the notification was still
                  // being written.
                  const settled =
                    getWorkspaceSessionForState({
                      state: get(),
                      workspaceId: taskWorkspaceId,
                    }) ?? notificationSession;
                  attentionSync.syncTaskInteractions({
                    taskId: resolvedTaskId,
                    messages: settled?.messagesByTask[resolvedTaskId] ?? [],
                    endedTurnId: applied.turnCompleted ? turnId : undefined,
                  });
                });
                if (applied.turnCompleted) {
                  const compareOutcome =
                    resolveCompareTurnOutcome(pendingEvents);
                  set((state) => {
                    const compareRunsById = finishCompareRunsForTask({
                      runsById: state.compareRunsById,
                      taskId: resolvedTaskId,
                      outcome: compareOutcome.status,
                      error:
                        compareOutcome.status === "completed"
                          ? undefined
                          : compareOutcome.error,
                      now: buildRecentTimestamp(),
                    });
                    return compareRunsById === state.compareRunsById
                      ? state
                      : { compareRunsById };
                  });
                  void launchReadyCompareJudgesFromStore(get, set);
                  const latestWorkspaceSession = getWorkspaceSessionForState({
                    state: latestState,
                    workspaceId: taskWorkspaceId,
                  });
                  dispatchNextQueuedTaskTurn({
                    workspaceId: taskWorkspaceId,
                    taskId: resolvedTaskId,
                  });
                  const completedTask =
                    latestWorkspaceSession?.tasks.find(
                      (task) => task.id === resolvedTaskId,
                    ) ??
                    latestState.tasks.find(
                      (task) => task.id === resolvedTaskId,
                    ) ??
                    null;
                  runScriptHookInBackground({
                    workspaceId: taskWorkspaceId,
                    trigger: "turn.completed",
                    taskId: resolvedTaskId,
                    taskTitle: completedTask?.title,
                    turnId,
                  });
                  generateWorkspaceTurnSummaryInBackground({
                    workspaceId: taskWorkspaceId,
                    taskId: resolvedTaskId,
                    turnId,
                  });
                }
              },
            },
          );

          runScriptHookInBackground({
            workspaceId: taskWorkspaceId,
            trigger: "turn.started",
            taskId: resolvedTaskId,
            taskTitle: task?.title,
            turnId,
          });

          if (
            autoRoutingDecision &&
            autoRoutingDecision.source !== "disabled"
          ) {
            providerTurnEventController.handleEvent({
              type: "model_resolved",
              resolvedProviderId: provider,
              resolvedModel: activeModel,
            });
          }

          runProviderTurn({
            turnId,
            provider,
            prompt,
            conversation,
            taskId: resolvedTaskId,
            workspaceId: taskWorkspaceId,
            cwd: workspaceCwd,
            runtimeOptions: applyProjectBasePromptToRuntimeOptions({
              runtimeOptions: providerRuntimeOptions,
              projectBasePrompt: resolveProjectBasePrompt({
                projectPath: get().projectPath,
                recentProjects: get().recentProjects,
              }),
            }),
            onEvent: ({ event }) =>
              providerTurnEventController.handleEvent(event),
          });
          return {
            status: "started",
            taskId: resolvedTaskId,
            workspaceId: taskWorkspaceId,
            turnId,
          } satisfies SendUserMessageResult;
        } catch (error) {
          restoreSubmittedPromptDraft();
          throw error;
        }
      },
      ...providerInteractionActions,
      ...editorActions,
    };
  }, createAppStorePersistenceOptions()),
);
