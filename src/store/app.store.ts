import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import {
  listActiveWorkspaceTurns,
  listLatestWorkspaceTurns,
  type PersistedTurnSummary,
} from "@/lib/db/turns.db";
import {
  createNotification as createPersistedNotification,
  listNotifications as listPersistedNotifications,
  markAllNotificationsRead as markAllPersistedNotificationsRead,
  markNotificationRead as markPersistedNotificationRead,
} from "@/lib/db/notifications.db";
import { workspaceFsAdapter } from "@/lib/fs";
import { formatWithEslint } from "@/components/layout/editor-language-intelligence";
import {
  listWorkspaceSummaries,
  loadWorkspaceEditorTabBodies,
  loadTaskMessagesPage,
  loadWorkspaceShell,
  loadWorkspaceShellForRestore,
  loadWorkspaceShellSummary,
  loadWorkspaceSnapshot,
  closeWorkspacePersistence,
  loadProjectRegistrySnapshot,
  saveProjectRegistrySnapshot,
  type TaskProviderSessionState,
  type WorkspaceShell,
  type WorkspaceSummary,
} from "@/lib/db/workspaces.db";
import type { PersistenceBootstrapPhase } from "@/lib/persistence/bootstrap-status";
import type {
  CanonicalRetrievedContextPart,
  ClaudeSettingSource,
  NormalizedProviderEvent,
  ProviderId,
  ProviderTurnRequest,
  StaveAutoRoleRuntimeOverridesMap,
} from "@/lib/providers/provider.types";
import type { ConnectedToolStatusEntry } from "@/lib/providers/connected-tool-status";
import { getRepoMapContextCache } from "@/lib/fs/repo-map-context-cache";
import { buildCurrentTaskAwarenessRetrievedContext } from "@/lib/task-context/current-task-awareness";
import { buildReferencedTaskRetrievedContext } from "@/lib/task-context/referenced-task-context";
import {
  buildWorkspaceContinueSummaryFilePath,
  buildWorkspaceContinueSummaryMarkdown,
} from "@/lib/workspace-continue";
import type { ScriptTrigger } from "@/lib/workspace-scripts";
import type {
  AppNotification,
  AppNotificationCreateInput,
} from "@/lib/notifications/notification.types";
import {
  isNotificationUnread,
  sortNotificationsNewestFirst,
  workspaceHasActiveTurns,
} from "@/lib/notifications/notification.types";
import { buildNotificationToastOptions } from "@/lib/notifications/notification.utils";
import {
  DEFAULT_NOTIFICATION_SOUND_PRESET,
  DEFAULT_NOTIFICATION_SOUND_MODE,
  DEFAULT_NOTIFICATION_SOUND_VOLUME,
  normalizeNotificationSoundMode,
  normalizeNotificationSoundPreset,
  normalizeNotificationSoundVolume,
  playCustomNotificationSound,
  playNotificationSound,
  type NotificationSoundMode,
  type NotificationSoundPreset,
} from "@/lib/notifications/notification-sound";
import { buildCanonicalConversationRequest } from "@/lib/providers/canonical-request";
import {
  getDefaultModelForProvider,
  inferProviderIdFromModel,
  listProviderIds,
  normalizeModelSelection,
  upgradeSettingsScopedClaudeOpusModel,
} from "@/lib/providers/model-catalog";
import { normalizeModelShortcutKeys } from "@/lib/providers/model-shortcuts";
import {
  DEFAULT_APP_SHORTCUT_KEYS,
  normalizeAppShortcutKeys,
  type AppShortcutKeys,
} from "@/lib/app-shortcuts";
import {
  DEFAULT_PROMPT_RESPONSE_STYLE,
  DEFAULT_PROMPT_PR_DESCRIPTION,
  DEFAULT_PROMPT_SUPERVISOR_BREAKDOWN,
  DEFAULT_PROMPT_SUPERVISOR_SYNTHESIS,
  DEFAULT_PROMPT_PREPROCESSOR_CLASSIFIER,
  DEFAULT_PROMPT_INLINE_COMPLETION,
  DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY,
  normalizeResponseStylePrompt,
} from "@/lib/providers/prompt-defaults";
import {
  normalizeThinkingPhraseAnimationStyle,
  type ThinkingPhraseAnimationStyle,
} from "@/lib/thinking-phrases";
import {
  buildStaveAutoModelSettingsPatch,
  createDefaultStaveAutoRoleRuntimeOverrides,
  DEFAULT_STAVE_AUTO_MODEL_PRESET_ID,
  normalizeStaveAutoRoleRuntimeOverrides,
} from "@/lib/providers/stave-auto-profile";
import {
  canTakeOverTask,
  getArchiveFallbackTaskId,
  isTaskArchived,
  isTaskManaged,
  normalizeSuggestedTaskTitle,
  reorderTasksWithinFilter,
  type TaskFilter,
} from "@/lib/tasks";
import {
  cloneDefaultTaskPresets,
  normalizePersistedTaskPresets,
  type TaskPreset,
} from "@/lib/task-presets";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  LEGACY_TERMINAL_FONT_FAMILY,
} from "@/lib/terminal/defaults";
import {
  getCliSessionTabDefaultTitle,
  getTerminalTabDefaultTitle,
  buildTerminalSessionSlotKey,
  type CliSessionContextMode,
  type WorkspaceActiveSurface,
  type WorkspaceCliSessionTab,
  type WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import { resolveSkillSelections } from "@/lib/skills/catalog";
import type { SkillCatalogEntry, SkillCatalogRoot } from "@/lib/skills/types";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import {
  applyProviderTurnActivityEvents,
  clearProviderTurnActivity,
  markProviderTurnInteractionResolved,
  markProviderTurnStalled,
  resolveProviderTurnStallThresholdMs,
  startProviderTurnActivity,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
import { resolveWorkspaceRelativeFilePath } from "@/lib/workspace-file-path";
import {
  createEmptyWorkspaceInformation,
  createWorkspaceConfluencePage,
  createWorkspaceFigmaResource,
  createWorkspaceInfoCustomField,
  createWorkspaceJiraIssue,
  createWorkspaceLinkedPullRequest,
  createWorkspaceSlackThread,
  createWorkspaceTodoItem,
  type WorkspaceInformationState,
} from "@/lib/workspace-information";
import {
  buildWorkspaceTurnSummaryPrompt,
  createWorkspaceTurnSummary,
  parseWorkspaceTurnSummaryResponse,
} from "@/lib/workspace-turn-summary";
import {
  buildStaveMuseContextSnapshot,
  buildStaveMuseLocalActionResponse,
  buildStaveMuseSummaryResponse,
  createEmptyStaveMuseState,
  findStaveMuseWorkspaceMention,
  getStaveMuseRuntimeCwd,
  formatStaveMuseTargetLabel,
  resolveStaveMuseLocalAction,
  STAVE_MUSE_SESSION_ID,
  type StaveMuseDefaultTarget,
  type StaveMuseLocalAction,
  type StaveMuseLocalActionContext,
  type StaveMuseProjectSummary,
  type StaveMuseState,
  type StaveMuseTaskSummary,
  type StaveMuseWorkspaceSummary,
} from "@/lib/stave-muse";
import {
  buildStaveMuseInstructionContextPart,
  buildStaveMuseRouterPrompt,
  DEFAULT_STAVE_MUSE_CHAT_PROMPT,
  DEFAULT_STAVE_MUSE_PLANNER_PROMPT,
  DEFAULT_STAVE_MUSE_ROUTER_PROMPT,
} from "@/lib/stave-muse-prompts";
import {
  buildStaveMuseConnectedToolPreflightMessage,
  buildStaveMuseProviderUnavailableMessage,
  resolveRequestedStaveMuseConnectedTools,
} from "@/lib/stave-muse-connected-tools";
import {
  DEFAULT_STAVE_MUSE_ROUTING_DECISION,
  isStaveMuseExplicitTaskRequest,
  parseStaveMuseRoutingDecision,
  resolveStaveMuseFastPathDecision,
  type StaveMuseRoutingDecision,
} from "@/lib/stave-muse-routing";
import {
  findLatestPendingApproval,
  findLatestPendingApprovalPart,
  findLatestPendingUserInput,
  findPendingApprovalMessageByRequestId,
  findLatestPendingUserInputPart,
  interruptPendingToolInteractionsInMessages,
  updateApprovalPartsByRequestId,
  updateUserInputPartsByRequestId,
} from "@/store/provider-message.utils";
import {
  applyProjectBasePromptToRuntimeOptions,
  buildProviderRuntimeOptions,
  normalizeClaudeSettingSources,
  normalizeClaudeTaskBudgetTokens,
  normalizeCodexApprovalPolicy,
} from "@/store/provider-runtime-options";
import {
  buildMessageId,
  buildPendingProviderTurnState,
  buildRecentTimestamp,
  createFileContextPart,
  createUserTextPart,
} from "@/store/chat-state-helpers";
import {
  createProviderTurnEventController,
  runProviderTurn,
} from "@/store/provider-turn-runtime";
import {
  buildColiseumMergedFollowUp,
  buildReviewerPrompt,
  clearReviewerFromGroup,
  collectActiveColiseumTaskIds,
  extractBranchSummary,
  planColiseumFanOut,
  planReviewerLaunch,
  promoteColiseumChampion,
  stripColiseumBranchesFromRecords,
  unpickColiseumChampion as unpickColiseumChampionUtil,
  validateColiseumBranches,
  type ColiseumBranchSpec,
} from "@/store/coliseum.utils";
import {
  applyPendingProviderEventsToStoreState,
  createWorkspaceSessionStateFromAppState,
  saveActiveWorkspaceRuntimeCache,
} from "@/store/workspace-runtime-state";
import type {
  Attachment,
  ChatMessage,
  ClaudePermissionMode,
  ClaudePermissionModeBeforePlan,
  ColiseumGroupState,
  ColiseumReviewerVerdict,
  EditorTab,
  PromptDraft,
  Task,
} from "@/types/chat";
import {
  arePromptDraftRuntimeOverridesEqual,
  resolvePromptDraftModelForProvider,
  resolvePromptDraftRuntimeState,
} from "@/store/prompt-draft-runtime";
import {
  resolveWorkspacePlanPersistenceText,
  persistWorkspacePlanFile,
} from "@/lib/plans";
import {
  appendInterruptedTurnNotices,
  buildWorkspaceSessionStateFromShell,
  buildWorkspaceSessionState,
  createEmptyWorkspaceState,
  createWorkspaceSnapshot,
  defaultWorkspaceName,
  interruptActiveTaskTurns,
  persistWorkspaceSnapshot,
  scheduleWorkspaceSnapshotPersist,
  starterWorkspaceId,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import {
  TASK_MESSAGES_PAGE_SIZE,
  resolveInitialLatestTaskMessagesPageSize,
} from "@/store/task-message-loading";
import {
  normalizeComparablePath,
  parseGitWorktrees,
} from "@/lib/source-control-worktrees";
import {
  type LayoutState,
  WORKSPACE_SIDEBAR_MIN_WIDTH,
  MIN_EDITOR_PANEL_WIDTH,
  DEFAULT_EDITOR_PANEL_WIDTH,
  mergeLayoutPatch,
  normalizeLayoutState,
  isDiffEditorTab,
  resolveEditorDiffMode,
} from "@/store/layout.utils";
import {
  type ThemeTokenName,
  type ThemeModeName,
  type ThemeTokenValues,
  type ThemeOverrideValues,
  type CustomThemeDefinition,
  type SidebarArtworkMode,
  THEME_TOKEN_NAMES,
  PRESET_THEME_TOKENS,
  BUILTIN_CUSTOM_THEMES,
  DEFAULT_SIDEBAR_ARTWORK_MODE,
  applyThemeClass,
  applyThemeOverrides,
  applyCustomTheme,
  applyFontOverrides,
  resolveDarkModeForTheme,
  findCustomThemeById,
  listAllCustomThemes,
  MAX_USER_THEMES,
  normalizeSidebarArtworkMode,
  SIDEBAR_ARTWORK_OPTIONS,
} from "@/lib/themes";
import {
  type RecentProjectState,
  normalizeProjectBasePrompt,
  normalizeWorkspaceInitCommand,
  normalizeProjectWorkspaceInitCommand,
  normalizeProjectWorkspaceRootNodeModulesSymlinkPreference,
  resolveProjectBasePrompt,
  resolveProjectWorkspaceInitCommand,
  resolveProjectWorkspaceRootNodeModulesSymlinkPreference,
  summarizeTerminalCommandDetail,
  summarizeWorkspaceInitCommand,
  buildWorkspaceRootNodeModulesSymlinkCommand,
  buildWorkspaceCreationNotice,
  isDefaultWorkspaceName,
  registerTaskWorkspaceOwnership,
  retainTaskWorkspaceOwnership,
  resolveWorkspaceName,
  removeWorkspaceRuntimeCacheEntries,
  areStringArraysEqual,
  moveArrayItem,
  sanitizeBranchName,
  toWorkspaceFolderName,
  resolveProjectNameFromPath,
  normalizeProjectDisplayName,
  hashProjectPath,
  buildProjectDefaultWorkspaceId,
  buildImportedWorktreeWorkspaceId,
  resolveImportedWorktreeName,
  resolveCurrentProjectDefaultWorkspaceId,
  normalizeCurrentProjectState,
  cloneRecentProjectState,
  normalizeRecentProjectStates,
  upsertRecentProjectState,
  captureCurrentProjectState,
  resolveProjectForWorkspaceId,
  resolveWorkspaceRemoteBaseBranchTarget,
  resolveTaskWorkspaceContext,
} from "@/store/project.utils";
import {
  type WorkspacePrInfo,
  type GitHubPrPayload,
  derivePrStatus,
} from "@/lib/pr-status";
import {
  resolveLanguage,
  normalizeProviderTimeoutMs,
  isImageFilePath,
  canSendEditorContextToTask,
  canSendWorkspaceFileToTask,
  updateMessageById,
  applyApprovalState,
  applyUserInputState,
} from "@/store/editor.utils";

const LOCAL_ABORT_SYSTEM_EVENT_CONTENT =
  "Generation was stopped locally before completion.";

export {
  WORKSPACE_SIDEBAR_MIN_WIDTH,
  MIN_EDITOR_PANEL_WIDTH,
  DEFAULT_EDITOR_PANEL_WIDTH,
} from "@/store/layout.utils";
export type { LayoutState } from "@/store/layout.utils";
export type AppShellMode = "stave" | "zen";
export {
  THEME_TOKEN_NAMES,
  PRESET_THEME_TOKENS,
  BUILTIN_CUSTOM_THEMES,
  MAX_USER_THEMES,
  SIDEBAR_ARTWORK_OPTIONS,
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
  SidebarArtworkMode,
  ThemeValidationResult,
} from "@/lib/themes";
export type { RecentProjectState } from "@/store/project.utils";

type NotificationContextOpenResult =
  | { status: "opened" }
  | { status: "archived-task"; taskId: string; taskTitle: string };

interface WorkspaceSwitchMetric {
  token: number;
  startedAt: number;
  cacheHit: boolean;
  shellResolvedAt?: number;
  setRootResolvedAt?: number;
}

interface SkillCatalogState {
  status: "idle" | "loading" | "ready" | "error";
  workspacePath: string | null;
  sharedSkillsHome: string | null;
  fetchedAt: string | null;
  skills: SkillCatalogEntry[];
  roots: SkillCatalogRoot[];
  detail: string;
}

type SendUserMessageResult =
  | { status: "blocked" }
  | { status: "queued"; taskId: string; workspaceId: string }
  | { status: "started"; taskId: string; workspaceId: string; turnId: string };

type StartColiseumResult =
  | { status: "blocked"; reason: string }
  | {
      status: "started";
      parentTaskId: string;
      workspaceId: string;
      branchTaskIds: string[];
    };

const APP_STORE_KEY = "stave-store";
const EMPTY_PROMPT_DRAFT: PromptDraft = {
  text: "",
  attachedFilePaths: [],
  attachments: [],
};
const workspaceSwitchMetricsByWorkspaceId = new Map<
  string,
  WorkspaceSwitchMetric
>();
let workspaceSwitchMetricTokenCounter = 0;
export {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";

function hasPromptDraftPayload(
  draft: Pick<PromptDraft, "text" | "attachedFilePaths" | "attachments">,
) {
  return (
    draft.text.trim().length > 0 ||
    draft.attachedFilePaths.length > 0 ||
    draft.attachments.length > 0
  );
}

function buildClearedPromptDraft(draft?: PromptDraft | null): PromptDraft {
  return {
    text: "",
    attachedFilePaths: [],
    attachments: [],
    ...(draft?.runtimeOverrides
      ? { runtimeOverrides: draft.runtimeOverrides }
      : {}),
  };
}

function normalizePromptDraftForStorage(draft: PromptDraft): PromptDraft {
  if (hasPromptDraftPayload(draft) || !draft.queuedNextTurn) {
    return draft;
  }
  if (draft.queuedNextTurn.content?.trim()) {
    return draft;
  }
  const { queuedNextTurn: _unused, ...nextDraft } = draft;
  return nextDraft;
}

function arePromptDraftQueuedNextTurnEqual(
  left?: PromptDraft["queuedNextTurn"],
  right?: PromptDraft["queuedNextTurn"],
) {
  return (
    left?.queuedAt === right?.queuedAt &&
    left?.sourceTurnId === right?.sourceTurnId &&
    left?.content === right?.content
  );
}

/**
 * Mirror the reviewer task's assistant message text into the group's
 * `reviewerVerdict.content` so the arena's ColiseumReviewerCard can subscribe
 * directly to `group.reviewerVerdict` — the reviewer task is hidden from the
 * task tree by `coliseumParentTaskId` and never rendered as a chat column, so
 * its messages record must be translated back onto the parent-scoped group
 * state. Also drives the `running` → `complete` / `error` transition.
 *
 * Called from the reviewer's flushEvents callback AFTER
 * `applyPendingProviderEventsToStoreState` so we read the already-applied
 * assistant text from `state.messagesByTask[reviewerTaskId]`.
 *
 * Keeping this in its own helper keeps the launch action readable and means
 * tests can exercise mirroring logic without the full dispatch path later.
 */
function mirrorReviewerVerdict(args: {
  set: (updater: (state: AppState) => Partial<AppState>) => void;
  get: () => AppState;
  parentTaskId: string;
  reviewerTaskId: string;
  workspaceId: string;
  pendingEvents: NormalizedProviderEvent[];
}) {
  const state = args.get();
  const sessionMessages =
    state.activeWorkspaceId === args.workspaceId
      ? state.messagesByTask
      : state.workspaceRuntimeCacheById[args.workspaceId]?.messagesByTask;
  if (!sessionMessages) return;
  const messages = sessionMessages[args.reviewerTaskId] ?? [];
  const assistant = [...messages].reverse().find((m) => m.role === "assistant");
  const accumulatedText =
    assistant?.parts
      .filter(
        (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
      )
      .map((p) => p.text)
      .join("") ?? "";

  const group =
    state.activeWorkspaceId === args.workspaceId
      ? state.activeColiseumsByTask[args.parentTaskId]
      : state.workspaceRuntimeCacheById[args.workspaceId]
          ?.activeColiseumsByTask[args.parentTaskId];
  if (!group || !group.reviewerVerdict) return;

  // Detect lifecycle transitions by inspecting the events we just applied.
  const sawError = args.pendingEvents.some((event) => event.type === "error");
  const sawDone = args.pendingEvents.some((event) => event.type === "done");

  const nextStatus: ColiseumReviewerVerdict["status"] = sawError
    ? "error"
    : sawDone
      ? "complete"
      : group.reviewerVerdict.status;
  const nextCompletedAt =
    (sawDone || sawError) && !group.reviewerVerdict.completedAt
      ? buildRecentTimestamp()
      : group.reviewerVerdict.completedAt;

  const errorEvent = args.pendingEvents.find(
    (event): event is Extract<NormalizedProviderEvent, { type: "error" }> =>
      event.type === "error",
  );
  const errorMessage = sawError
    ? (errorEvent?.message ??
      group.reviewerVerdict.errorMessage ??
      "Reviewer failed.")
    : group.reviewerVerdict.errorMessage;

  const nextVerdict: ColiseumReviewerVerdict = {
    ...group.reviewerVerdict,
    content: accumulatedText,
    status: nextStatus,
    ...(nextCompletedAt ? { completedAt: nextCompletedAt } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };

  // Skip the set if nothing actually changed to keep subscribers quiet.
  if (
    nextVerdict.content === group.reviewerVerdict.content &&
    nextVerdict.status === group.reviewerVerdict.status &&
    nextVerdict.completedAt === group.reviewerVerdict.completedAt &&
    nextVerdict.errorMessage === group.reviewerVerdict.errorMessage
  ) {
    return;
  }

  const nextGroup: ColiseumGroupState = {
    ...group,
    reviewerVerdict: nextVerdict,
  };
  args.set((current) => {
    if (args.workspaceId === current.activeWorkspaceId) {
      return {
        activeColiseumsByTask: {
          ...current.activeColiseumsByTask,
          [args.parentTaskId]: nextGroup,
        },
      } as Partial<AppState>;
    }
    const cached = current.workspaceRuntimeCacheById[args.workspaceId];
    if (!cached) return current;
    return {
      workspaceRuntimeCacheById: {
        ...current.workspaceRuntimeCacheById,
        [args.workspaceId]: {
          ...cached,
          activeColiseumsByTask: {
            ...cached.activeColiseumsByTask,
            [args.parentTaskId]: nextGroup,
          },
        },
      },
    } as Partial<AppState>;
  });
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
    | "workspaceInformation"
    | "editorTabs"
    | "activeEditorTabId"
    | "terminalTabs"
    | "activeTerminalTabId"
    | "layout"
    | "cliSessionTabs"
    | "activeCliSessionTabId"
    | "activeSurface"
    | "activeTurnIdsByTask"
    | "providerSessionByTask"
    | "nativeSessionReadyByTask"
    | "activeColiseumsByTask"
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

function getWorkspaceSessionForState(args: {
  state: Pick<
    AppState,
    | "activeTaskId"
    | "activeWorkspaceId"
    | "tasks"
    | "messagesByTask"
    | "messageCountByTask"
    | "promptDraftByTask"
    | "workspaceInformation"
    | "editorTabs"
    | "activeEditorTabId"
    | "terminalTabs"
    | "activeTerminalTabId"
    | "layout"
    | "cliSessionTabs"
    | "activeCliSessionTabId"
    | "activeSurface"
    | "activeTurnIdsByTask"
    | "providerSessionByTask"
    | "nativeSessionReadyByTask"
    | "activeColiseumsByTask"
    | "workspaceRuntimeCacheById"
  >;
  workspaceId: string;
}) {
  if (args.workspaceId === args.state.activeWorkspaceId) {
    return createWorkspaceSessionStateFromAppState(args.state);
  }
  return args.state.workspaceRuntimeCacheById[args.workspaceId] ?? null;
}

function getDraftImageContexts(args: {
  promptDraft: PromptDraft;
  imageContexts?: Array<{
    dataUrl: string;
    label: string;
    mimeType: string;
  }>;
}): Array<{
  dataUrl: string;
  label: string;
  mimeType: string;
}> {
  if ((args.imageContexts?.length ?? 0) > 0) {
    return args.imageContexts ?? [];
  }
  return args.promptDraft.attachments
    .filter(
      (attachment): attachment is Extract<Attachment, { kind: "image" }> =>
        attachment.kind === "image",
    )
    .map((attachment) => ({
      dataUrl: attachment.dataUrl,
      label: attachment.label,
      mimeType: "image/png",
    }));
}

async function getDraftFileContexts(args: {
  promptDraft: PromptDraft;
  session: Pick<WorkspaceSessionState, "editorTabs">;
  workspaceRootPath?: string | null;
  fileContexts?: Array<{
    filePath: string;
    content: string;
    language: string;
    instruction?: string;
  }>;
}): Promise<
  Array<{
    filePath: string;
    content: string;
    language: string;
    instruction?: string;
  }>
> {
  if ((args.fileContexts?.length ?? 0) > 0) {
    return args.fileContexts ?? [];
  }

  if (args.promptDraft.attachedFilePaths.length === 0) {
    return [];
  }

  const nextFileContexts: Array<{
    filePath: string;
    content: string;
    language: string;
    instruction?: string;
  }> = [];
  const seenFilePaths = new Set<string>();
  const readFile = window.api?.fs?.readFile;

  for (const filePath of args.promptDraft.attachedFilePaths) {
    if (!filePath || seenFilePaths.has(filePath)) {
      continue;
    }
    seenFilePaths.add(filePath);

    const openTab = args.session.editorTabs.find(
      (tab) => tab.filePath === filePath && tab.kind !== "image",
    );
    if (openTab) {
      nextFileContexts.push({
        filePath: openTab.filePath,
        content: openTab.content,
        language: openTab.language,
      });
      continue;
    }

    if (!args.workspaceRootPath || !readFile) {
      continue;
    }

    const result = await readFile({
      rootPath: args.workspaceRootPath,
      filePath,
    });
    if (!result.ok) {
      continue;
    }

    nextFileContexts.push({
      filePath,
      content: result.content,
      language: resolveLanguage({ filePath }),
    });
  }

  return nextFileContexts;
}

function isWorkspaceSwitchMetricLoggingEnabled() {
  return (
    typeof import.meta !== "undefined" &&
    Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
  );
}

function getWorkspaceSwitchMetricNow() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function roundWorkspaceSwitchDuration(value: number) {
  return Math.round(value * 100) / 100;
}

function registerWorkspaceSwitchMetric(args: {
  workspaceId: string;
  metric: WorkspaceSwitchMetric;
}) {
  if (!isWorkspaceSwitchMetricLoggingEnabled()) {
    return;
  }
  workspaceSwitchMetricsByWorkspaceId.set(args.workspaceId, args.metric);
}

function logWorkspaceSwitchMetric(args: {
  workspaceId: string;
  token?: number;
  phase: "active" | "files" | "messages";
  extra?: Record<string, unknown>;
}) {
  if (!isWorkspaceSwitchMetricLoggingEnabled()) {
    return;
  }
  const metric = workspaceSwitchMetricsByWorkspaceId.get(args.workspaceId);
  if (!metric || (args.token !== undefined && metric.token !== args.token)) {
    return;
  }
  const now = getWorkspaceSwitchMetricNow();
  console.info("[workspace-switch]", {
    workspaceId: args.workspaceId,
    phase: args.phase,
    cacheHit: metric.cacheHit,
    totalMs: roundWorkspaceSwitchDuration(now - metric.startedAt),
    ...(metric.shellResolvedAt !== undefined
      ? {
          shellMs: roundWorkspaceSwitchDuration(
            metric.shellResolvedAt - metric.startedAt,
          ),
        }
      : {}),
    ...(metric.setRootResolvedAt !== undefined
      ? {
          setRootMs: roundWorkspaceSwitchDuration(
            metric.setRootResolvedAt - metric.startedAt,
          ),
        }
      : {}),
    ...(args.extra ?? {}),
  });
}

export interface AppSettings {
  appShellMode: AppShellMode;
  showPresetBar: boolean;
  themeMode: "light" | "dark" | "system";
  /** ID of the active custom theme preset, or `null` for the default. */
  customThemeId: string | null;
  /** Ambient artwork rendered behind the left project sidebar glass. */
  sidebarArtworkMode: SidebarArtworkMode;
  /**
   * When `true`, an animated "border beam" highlight travels around the
   * prompt input and active-workspace rows while a task is streaming. Purely
   * decorative — honors `prefers-reduced-motion`.
   */
  borderBeamEnabled: boolean;
  /**
   * Size preset passed to the `border-beam` library. `md` is a full border
   * glow (default), `sm` is a compact button-sized glow, `line` traces a
   * bottom-only sweep with breathe/spike animations.
   */
  borderBeamSize: "sm" | "md" | "line";
  /**
   * Color palette preset passed to the `border-beam` library. These are the
   * library's own presets — do not remap onto our theme tokens.
   */
  borderBeamVariant: "colorful" | "mono" | "ocean" | "sunset";
  /** User-installed custom theme definitions (persisted in localStorage). */
  userCustomThemes: CustomThemeDefinition[];
  themeOverrides: Record<ThemeModeName, ThemeOverrideValues>;
  language: string;
  updateMode: "auto" | "manual";
  httpProxy: string;
  smartSuggestions: boolean;
  chatSendPreview: boolean;
  chatStreamingEnabled: boolean;
  messageFontSize: number;
  messageCodeFontSize: number;
  messageFontFamily: string;
  messageMonoFontFamily: string;
  messageKoreanFontFamily: string;
  /** Zoom scale for the workspace information panel (0.8 – 1.3, default 1). */
  infoPanelScale: number;
  reasoningExpansionMode: "auto" | "manual";
  showInterimMessages: boolean;
  thinkingPhraseAnimationStyle: ThinkingPhraseAnimationStyle;
  claudeFastModeVisible: boolean;
  codexFastModeVisible: boolean;
  modelClaude: string;
  modelCodex: string;
  modelStave: string;
  /**
   * User-configurable presets rendered in the preset bar between the task
   * tab strip and the chat panel. Each preset either seeds a new task with a
   * fixed provider + model, or launches a native CLI session.
   */
  taskPresets: TaskPreset[];
  /** Role-based defaults used by Stave Auto. */
  staveAutoClassifierModel: string;
  staveAutoSupervisorModel: string;
  staveAutoPlanModel: string;
  staveAutoAnalyzeModel: string;
  staveAutoImplementModel: string;
  staveAutoQuickEditModel: string;
  staveAutoGeneralModel: string;
  staveAutoVerifyModel: string;
  staveAutoOrchestrationMode: "off" | "auto" | "aggressive";
  staveAutoMaxSubtasks: number;
  staveAutoMaxParallelSubtasks: number;
  staveAutoAllowCrossProviderWorkers: boolean;
  staveAutoFastMode: boolean;
  staveAutoRoleRuntimeOverrides: StaveAutoRoleRuntimeOverridesMap;
  /** Control-plane defaults used by the global Stave Muse widget. */
  museDefaultTarget: StaveMuseDefaultTarget;
  museRouterModel: string;
  museChatModel: string;
  musePlannerModel: string;
  museRouterPrompt: string;
  museChatPrompt: string;
  musePlannerPrompt: string;
  museAutoHandoffToTask: boolean;
  museAllowDirectWorkspaceInfoEdits: boolean;
  rulesPresetPrimary: string;
  rulesPresetSecondary: string;
  permissionMode: "require-approval" | "auto-safe";
  subagentsEnabled: boolean;
  subagentsProfile: string;
  skillsEnabled: boolean;
  skillsAutoSuggest: boolean;
  sharedSkillsHome: string;
  commandPaletteShowRecent: boolean;
  commandPalettePinnedCommandIds: string[];
  commandPaletteHiddenCommandIds: string[];
  commandPaletteRecentCommandIds: string[];
  /** Cmd/Ctrl+K shell chord bindings for navigation and panel actions. */
  appShortcutKeys: AppShortcutKeys;
  /** Alt+1..0 prompt-model bindings, stored as `provider:model` keys. */
  modelShortcutKeys: string[];
  reviewStrictMode: boolean;
  reviewChecklistPreset: string;
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalCursorStyle: "block" | "bar" | "underline";
  terminalLineHeight: number;
  editorFontSize: number;
  editorFontFamily: string;
  editorWordWrap: boolean;
  editorMinimap: boolean;
  editorLineNumbers: "on" | "off" | "relative";
  editorTabSize: number;
  editorLspEnabled: boolean;
  editorAiCompletions: boolean;
  editorEslintEnabled: boolean;
  editorFormatOnSave: boolean;
  pythonLspCommand: string;
  typescriptLspCommand: string;
  diffViewMode: "unified" | "split";
  /** Auto-refresh interval (seconds) for the Source Control panel. 0 = disabled. */
  scmAutoRefreshSeconds: number;
  confirmBeforeClose: boolean;
  notificationSoundEnabled: boolean;
  notificationSoundVolume: number;
  notificationSoundPreset: NotificationSoundPreset;
  notificationSoundMode: NotificationSoundMode;
  /** Base64 data URL of the user-uploaded custom audio file. */
  notificationSoundCustomAudioData: string | null;
  /** Original file name of the uploaded custom audio, for display purposes. */
  notificationSoundCustomAudioName: string | null;
  providerDebugStream: boolean;
  providerTimeoutMs: number;
  claudeBinaryPath: string;
  claudePermissionMode: ClaudePermissionMode;
  /** Stores the permission mode that was active before entering plan mode, so it can be restored when plan mode is exited. */
  claudePermissionModeBeforePlan: ClaudePermissionModeBeforePlan;
  claudeAllowDangerouslySkipPermissions: boolean;
  claudeSandboxEnabled: boolean;
  claudeAllowUnsandboxedCommands: boolean;
  claudeTaskBudgetTokens: number;
  claudeAdvisorModel: string;
  claudeSettingSources: ClaudeSettingSource[];
  claudeEffort: "low" | "medium" | "high" | "xhigh" | "max";
  claudeThinkingMode: "adaptive" | "enabled" | "disabled";
  claudeAgentProgressSummaries: boolean;
  claudeFastMode: boolean;
  codexFileAccess: "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess: boolean;
  codexApprovalPolicy: "never" | "on-request" | "untrusted";
  codexBinaryPath: string;
  codexReasoningEffort: "minimal" | "low" | "medium" | "high" | "xhigh";
  codexWebSearch: "disabled" | "cached" | "live";
  codexShowRawReasoning: boolean;
  codexReasoningSummary: "auto" | "concise" | "detailed" | "none";
  codexReasoningSummarySupport: "auto" | "enabled" | "disabled";
  codexFastMode: boolean;
  codexPlanMode: boolean;
  /**
   * @deprecated No longer used. Kept temporarily so persisted settings
   * deserialise without errors; will be removed in a future cleanup pass.
   */
  planAutoApprove?: boolean;
  // ---------------------------------------------------------------------------
  // Customisable AI prompt templates (Settings → Prompts)
  // ---------------------------------------------------------------------------
  /** Response formatting guidance injected into both Claude and Codex turns. Empty = disabled. */
  promptResponseStyle: string;
  /** Prompt template for AI-generated PR descriptions. */
  promptPrDescription: string;
  /** System prompt for Stave Auto orchestration breakdown. */
  promptSupervisorBreakdown: string;
  /** Prompt for Stave Auto synthesis. */
  promptSupervisorSynthesis: string;
  /** System prompt for Stave Auto intent classifier. */
  promptPreprocessorClassifier: string;
  /** System prompt for inline code completion. */
  promptInlineCompletion: string;
  /** Preferred model for the Information panel's automatic latest-turn summary. */
  workspaceTurnSummaryPrimaryModel: string;
  /** Fallback model when the primary summary model is unavailable or fails. */
  workspaceTurnSummaryFallbackModel: string;
  /** Prompt template for the Information panel's automatic latest-turn summary. */
  workspaceTurnSummaryPrompt: string;

  // -- Lens (built-in browser) --
  /** Heuristic search: AI uses class names, text, ID to grep source files. */
  lensSourceMappingHeuristic: boolean;
  /** React _debugSource: extract file:line from React fiber (dev builds). */
  lensSourceMappingReactDebugSource: boolean;
}

interface AppState {
  hasHydratedWorkspaces: boolean;
  workspaceSnapshotVersion: number;
  promptDraftPersistenceVersion: number;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  projectPath: string | null;
  recentProjects: RecentProjectState[];
  defaultBranch: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  /** PR info cache per workspace – transient, not persisted across sessions. */
  workspacePrInfoById: Record<string, WorkspacePrInfo>;
  isDarkMode: boolean;
  activeTaskId: string;
  draftProvider: ProviderId;
  promptDraftByTask: Record<string, PromptDraft>;
  workspaceInformation: WorkspaceInformationState;
  promptFocusNonce: number;
  providerCommandCatalogRefreshNonce: number;
  workspacePlansRefreshNonce: number;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
  taskMessagesLoadingByTask: Record<string, boolean>;
  layout: LayoutState;
  settings: AppSettings;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  terminalTabs: WorkspaceTerminalTab[];
  activeTerminalTabId: string | null;
  cliSessionTabs: WorkspaceCliSessionTab[];
  activeCliSessionTabId: string | null;
  activeSurface: WorkspaceActiveSurface;
  pendingCloseEditorTabId: string | null;
  pendingEditorSelection: {
    tabId: string;
    line: number;
    column?: number;
  } | null;
  projectName: string | null;
  projectFiles: string[];
  workspaceFileCacheByPath: Record<string, string[]>;
  taskCheckpointById: Record<string, string>;
  providerAvailability: Record<ProviderId, boolean>;
  skillCatalog: SkillCatalogState;
  notifications: AppNotification[];
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerTurnActivityByTask: Record<
    string,
    ProviderTurnActivitySnapshot | undefined
  >;
  nativeSessionReadyByTask: Record<string, boolean>;
  /**
   * Runtime-only state for in-flight Coliseums (multi-model parallel turns),
   * keyed by the parent task id. Not persisted — branches are ephemeral child
   * tasks and orphaned branches are reaped on workspace bootstrap.
   */
  activeColiseumsByTask: Record<string, ColiseumGroupState | undefined>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  workspaceRuntimeCacheById: Record<string, WorkspaceSessionState>;
  taskWorkspaceIdById: Record<string, string>;
  staveMuse: StaveMuseState;
  persistenceBootstrapPhase: PersistenceBootstrapPhase;
  persistenceBootstrapMessage: string;
  hydrateProjectRegistry: () => Promise<void>;
  flushProjectRegistry: () => Promise<void>;
  hydrateWorkspaces: () => Promise<void>;
  /** Lightweight refresh: discover new/removed git worktrees without full rehydration. */
  refreshWorkspaces: () => Promise<void>;
  hydrateNotifications: () => Promise<void>;
  flushActiveWorkspaceSnapshot: (args?: { sync?: boolean }) => Promise<void>;
  refreshActiveManagedTask: () => Promise<void>;
  createProject: (args: { name?: string }) => Promise<void>;
  openProjectFromPath: (args: {
    inputPath: string;
  }) => Promise<{ ok: boolean; stderr?: string }>;
  openProject: (args: { projectPath: string }) => Promise<void>;
  removeProjectFromList: (args: { projectPath: string }) => Promise<void>;
  moveProjectInList: (args: {
    projectPath: string;
    direction: "up" | "down";
  }) => void;
  createWorkspace: (args: {
    name: string;
    mode: "branch" | "clean";
    fromBranch?: string;
    fromBranchKind?: "local" | "remote";
    initCommand?: string;
    useRootNodeModulesSymlink?: boolean;
    initialTaskTitle?: string;
  }) => Promise<{
    ok: boolean;
    message?: string;
    noticeLevel?: "success" | "warning";
  }>;
  continueWorkspaceFromSummary: (args: {
    name: string;
    baseBranch?: string;
  }) => Promise<{
    ok: boolean;
    message?: string;
    noticeLevel?: "success" | "warning";
  }>;
  closeWorkspace: (args: { workspaceId: string }) => Promise<void>;
  switchWorkspace: (args: { workspaceId: string }) => Promise<void>;
  moveWorkspaceInProjectList: (args: {
    projectPath: string;
    workspaceId: string;
    direction: "up" | "down";
  }) => void;
  setProjectBasePrompt: (args: {
    projectPath?: string;
    prompt: string;
  }) => void;
  setProjectWorkspaceInitCommand: (args: {
    projectPath?: string;
    command: string;
  }) => void;
  setProjectWorkspaceUseRootNodeModulesSymlink: (args: {
    projectPath?: string;
    enabled: boolean;
  }) => void;
  setDarkMode: (args: { enabled: boolean }) => void;
  installCustomTheme: (args: { theme: CustomThemeDefinition }) => {
    ok: boolean;
    error?: string;
  };
  removeCustomTheme: (args: { themeId: string }) => void;
  updateSettings: (args: { patch: Partial<AppSettings> }) => void;
  setPersistenceBootstrapStatus: (args: {
    phase: PersistenceBootstrapPhase;
    message?: string;
  }) => void;
  refreshProviderCommandCatalog: () => void;
  notifyWorkspacePlansChanged: () => void;
  selectTask: (args: { taskId: string }) => void;
  loadTaskMessages: (args: {
    taskId: string;
    mode?: "latest" | "older";
  }) => Promise<void>;
  clearTaskSelection: () => void;
  updatePromptDraft: (args: {
    taskId: string;
    patch: Partial<PromptDraft>;
  }) => void;
  clearTaskProviderSession: (args: {
    taskId: string;
    providerId: ProviderId;
  }) => void;
  updateWorkspaceInformation: (args: {
    updater: (current: WorkspaceInformationState) => WorkspaceInformationState;
  }) => void;
  applyExternalWorkspaceInformationUpdate: (args: {
    workspaceId: string;
    workspaceInformation: WorkspaceInformationState;
  }) => void;
  clearPromptDraft: (args: { taskId: string }) => void;
  createTask: (args: { title?: string }) => void;
  renameTask: (args: { taskId: string; title: string }) => void;
  restoreTask: (args: { taskId: string }) => void;
  duplicateTask: (args: { taskId: string }) => Promise<void>;
  reorderTasks: (args: {
    activeTaskId: string;
    overTaskId: string;
    filter: TaskFilter;
  }) => void;
  exportTask: (args: { taskId: string }) => Promise<void>;
  viewTaskChanges: (args: { taskId: string }) => Promise<void>;
  rollbackTask: (args: { taskId: string }) => Promise<void>;
  rollbackToCompactBoundary: (args: {
    taskId: string;
    gitRef: string;
    trigger?: string;
  }) => Promise<void>;
  archiveTask: (args: { taskId: string }) => void;
  setTaskProvider: (args: { taskId: string; provider: ProviderId }) => void;
  createTerminalTab: (args?: {
    cwd?: string;
    linkedTaskId?: string | null;
    title?: string;
  }) => string | null;
  createCliSessionTab: (args: {
    provider: "claude-code" | "codex";
    contextMode: CliSessionContextMode;
  }) => string | null;
  /**
   * Runs a preset from the preset bar. For `task` presets this aligns the
   * provider draft + per-provider model settings and spawns a new task; for
   * `cli-session` presets it opens a new CLI session tab.
   */
  applyTaskPreset: (args: { presetId: string }) => void;
  /** Upserts a preset; creates a new entry if `presetId` is unknown. */
  upsertTaskPreset: (args: { preset: TaskPreset }) => void;
  removeTaskPreset: (args: { presetId: string }) => void;
  reorderTaskPresets: (args: {
    fromPresetId: string;
    toPresetId: string;
  }) => void;
  resetTaskPresetsToDefault: () => void;
  setActiveCliSessionTab: (args: { tabId: string | null }) => void;
  setCliSessionTabNativeSession: (args: {
    tabId: string;
    nativeSessionId?: string;
  }) => void;
  renameCliSessionTab: (args: { tabId: string; title: string }) => void;
  reorderCliSessionTabs: (args: { fromTabId: string; toTabId: string }) => void;
  closeCliSessionTab: (args: { tabId: string }) => void;
  setActiveTerminalTab: (args: {
    tabId: string | null;
    openDock?: boolean;
  }) => void;
  renameTerminalTab: (args: { tabId: string; title: string }) => void;
  reorderTerminalTabs: (args: { fromTabId: string; toTabId: string }) => void;
  closeTerminalTab: (args: { tabId: string }) => void;
  setWorkspaceBranch: (args: { workspaceId: string; branch: string }) => void;
  /** Fetch PR status for a single workspace from GitHub. */
  fetchWorkspacePrStatus: (args: { workspaceId: string }) => Promise<void>;
  /** Fetch PR status for all non-default workspaces. */
  fetchAllWorkspacePrStatuses: () => Promise<void>;
  setLayout: (args: { patch: Partial<LayoutState> }) => void;
  toggleEditorDiffMode: () => void;
  toggleEditorMarkdownPreviewMode: () => void;
  openWorkspacePicker: () => Promise<void>;
  refreshProjectFiles: () => Promise<void>;
  refreshProviderAvailability: () => Promise<void>;
  refreshSkillCatalog: (args?: {
    workspacePath?: string | null;
  }) => Promise<void>;
  takeOverTask: (args: { taskId: string }) => void;
  markNotificationRead: (args: { id: string }) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  openNotificationContext: (args: {
    notificationId: string;
  }) => Promise<NotificationContextOpenResult>;
  resolveNotificationApproval: (args: {
    notificationId: string;
    approved: boolean;
  }) => Promise<void>;
  setStaveMuseOpen: (args: { open: boolean }) => void;
  focusStaveMuse: () => void;
  setStaveMuseTarget: (args: {
    kind: StaveMuseState["target"]["kind"];
  }) => void;
  clearStaveMuseConversation: () => void;
  updateStaveMusePromptDraft: (args: { patch: Partial<PromptDraft> }) => void;
  sendStaveMuseMessage: (args: { content: string }) => Promise<void>;
  abortStaveMuseTurn: () => void;
  resolveStaveMuseApproval: (args: {
    messageId: string;
    approved: boolean;
  }) => Promise<void>;
  resolveStaveMuseUserInput: (args: {
    messageId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => Promise<void>;
  sendUserMessage: (args: {
    taskId: string;
    content: string;
    fileContexts?: Array<{
      filePath: string;
      content: string;
      language: string;
      instruction?: string;
    }>;
    imageContexts?: Array<{
      dataUrl: string;
      label: string;
      mimeType: string;
    }>;
  }) => Promise<SendUserMessageResult>;
  startColiseum: (args: {
    parentTaskId: string;
    branches: ColiseumBranchSpec[];
    content: string;
    fileContexts?: Array<{
      filePath: string;
      content: string;
      language: string;
      instruction?: string;
    }>;
    imageContexts?: Array<{
      dataUrl: string;
      label: string;
      mimeType: string;
    }>;
  }) => Promise<StartColiseumResult>;
  pickColiseumChampion: (args: {
    parentTaskId: string;
    championTaskId: string;
  }) => void;
  unpickColiseumChampion: (args: { parentTaskId: string }) => void;
  setColiseumViewMode: (args: {
    parentTaskId: string;
    viewMode: ColiseumGroupState["viewMode"];
    focusedBranchTaskId?: string | null;
  }) => void;
  minimizeColiseum: (args: { parentTaskId: string }) => void;
  restoreColiseum: (args: { parentTaskId: string }) => void;
  closeColiseumBranch: (args: { branchTaskId: string }) => void;
  /**
   * Non-destructive by default is now the norm — this is the explicit
   * destructive action that aborts remaining turns and drops every branch.
   * `dismissColiseum` is preserved as an alias for callers that haven't
   * migrated yet.
   */
  discardColiseumRun: (args: { parentTaskId: string }) => void;
  dismissColiseum: (args: { parentTaskId: string }) => void;
  /**
   * Phase 2.3 "partial pick" — staged as a follow-up prompt on the parent so
   * the user keeps authorship. After the champion's answer is committed to the
   * parent, picking another branch via this action pre-fills the parent's
   * prompt draft with a follow-up ("please also incorporate …") quoting the
   * alternative branch's final text. No new provider turn runs automatically;
   * the user reviews and sends from the composer like any other message.
   */
  enqueueColiseumIncorporateFollowUp: (args: {
    parentTaskId: string;
    branchTaskId: string;
  }) => void;
  /**
   * Stage a merged-answer follow-up on the parent task using the latest
   * reviewer verdict plus branch summaries. This preserves user authorship:
   * no provider turn starts until the user sends the drafted follow-up.
   */
  enqueueColiseumMergedFollowUp: (args: { parentTaskId: string }) => void;
  /**
   * Spawn an ephemeral reviewer task that compares branch outputs and streams
   * a verdict into `group.reviewerVerdict`. Only one reviewer runs at a time
   * per group — relaunching aborts any in-flight reviewer first. Result status
   * `"blocked"` means the caller should surface the reason as a toast.
   */
  launchColiseumReviewer: (args: {
    parentTaskId: string;
    reviewerProvider: ProviderId;
    reviewerModel: string;
  }) => Promise<
    | { status: "blocked"; reason: string }
    | { status: "started"; reviewerTaskId: string; turnId: string }
  >;
  /**
   * Drop the reviewer verdict and kill the reviewer task. Called by the
   * verdict card's "Clear" button and implicitly by `discardColiseumRun`.
   */
  clearColiseumReviewerVerdict: (args: { parentTaskId: string }) => void;
  abortTaskTurn: (args: { taskId: string }) => void;
  resolveApproval: (args: {
    taskId: string;
    messageId: string;
    approved: boolean;
  }) => void;
  resolveUserInput: (args: {
    taskId: string;
    messageId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => void;
  resolveDiff: (args: {
    taskId: string;
    messageId: string;
    accepted: boolean;
    partIndex?: number;
  }) => void;
  openDiffInEditor: (args: {
    editorTabId: string;
    filePath: string;
    oldContent: string;
    newContent: string;
  }) => void;
  openFileFromTree: (args: {
    filePath: string;
    line?: number;
    column?: number;
    fallbackContent?: string;
  }) => Promise<void>;
  setActiveEditorTab: (args: { tabId: string }) => void;
  reorderEditorTabs: (args: { fromTabId: string; toTabId: string }) => void;
  closeEditorTab: (args: { tabId: string }) => void;
  requestCloseActiveEditorTab: () => void;
  clearPendingCloseEditorTab: () => void;
  clearPendingEditorSelection: () => void;
  updateEditorContent: (args: { tabId: string; content: string }) => void;
  saveActiveEditorTab: () => Promise<{ ok: boolean; conflict?: boolean }>;
  checkOpenTabConflicts: () => Promise<void>;
  sendWorkspaceFileToChat: (args: { taskId: string; filePath: string }) => void;
  sendEditorContextToChat: (args: {
    taskId: string;
    instruction?: string;
  }) => void;
}

function getCachedWorkspaceFiles(args: {
  workspacePath?: string | null;
  workspaceFileCacheByPath: Record<string, string[]>;
}) {
  if (!args.workspacePath) {
    return [];
  }
  return args.workspaceFileCacheByPath[args.workspacePath] ?? [];
}

function resolveInitialWorkspaceFiles(args: {
  workspacePath?: string | null;
  activeProjectPath?: string | null;
  activeProjectFiles: string[];
  workspaceFileCacheByPath: Record<string, string[]>;
}) {
  const workspacePath = args.workspacePath?.trim();
  if (!workspacePath) {
    return [];
  }
  if (
    Object.prototype.hasOwnProperty.call(
      args.workspaceFileCacheByPath,
      workspacePath,
    )
  ) {
    return args.workspaceFileCacheByPath[workspacePath] ?? [];
  }
  if (
    args.activeProjectPath &&
    normalizeComparablePath(args.activeProjectPath) ===
      normalizeComparablePath(workspacePath)
  ) {
    return args.activeProjectFiles;
  }
  return [];
}

function rememberCachedWorkspaceFiles(args: {
  workspaceFileCacheByPath: Record<string, string[]>;
  workspacePath?: string | null;
  files: string[];
}) {
  if (!args.workspacePath) {
    return args.workspaceFileCacheByPath;
  }
  const currentFiles = args.workspaceFileCacheByPath[args.workspacePath];
  if (currentFiles && areStringArraysEqual(currentFiles, args.files)) {
    return args.workspaceFileCacheByPath;
  }
  return {
    ...args.workspaceFileCacheByPath,
    [args.workspacePath]: args.files,
  };
}

function removeCachedWorkspaceFiles(args: {
  workspaceFileCacheByPath: Record<string, string[]>;
  workspacePaths: Array<string | null | undefined>;
}) {
  const removablePaths = [
    ...new Set(
      args.workspacePaths
        .map((workspacePath) => workspacePath?.trim())
        .filter((workspacePath): workspacePath is string =>
          Boolean(workspacePath),
        ),
    ),
  ];
  if (removablePaths.length === 0) {
    return args.workspaceFileCacheByPath;
  }
  let changed = false;
  const nextWorkspaceFileCacheByPath = { ...args.workspaceFileCacheByPath };
  for (const workspacePath of removablePaths) {
    if (!(workspacePath in nextWorkspaceFileCacheByPath)) {
      continue;
    }
    delete nextWorkspaceFileCacheByPath[workspacePath];
    changed = true;
  }
  return changed ? nextWorkspaceFileCacheByPath : args.workspaceFileCacheByPath;
}

function resolveWorkspacePathForId(args: {
  activeWorkspaceId: string;
  workspaceId?: string;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  projectPath: string | null;
}) {
  const workspaceId = args.workspaceId ?? args.activeWorkspaceId;
  if (!workspaceId) {
    return null;
  }
  return (
    args.workspacePathById[workspaceId] ??
    (args.workspaceDefaultById[workspaceId] ? (args.projectPath ?? null) : null)
  );
}

function mergeNotificationIntoList(args: {
  notifications: AppNotification[];
  notification: AppNotification;
}) {
  return sortNotificationsNewestFirst([
    args.notification,
    ...args.notifications.filter((item) => item.id !== args.notification.id),
  ]);
}

function markNotificationReadInList(args: {
  notifications: AppNotification[];
  id: string;
  readAt: string;
}) {
  return args.notifications.map((notification) => {
    if (notification.id !== args.id || notification.readAt) {
      return notification;
    }
    return {
      ...notification,
      readAt: args.readAt,
    };
  });
}

function findUnreadApprovalNotificationIds(args: {
  notifications: AppNotification[];
  taskId: string;
  messageId: string;
  requestId: string;
}) {
  return args.notifications.flatMap((notification) => {
    if (!isNotificationUnread(notification)) {
      return [];
    }

    const action = notification.action;
    if (action?.type !== "approval" || action.requestId !== args.requestId) {
      return [];
    }

    if (action.messageId) {
      return action.messageId === args.messageId ? [notification.id] : [];
    }

    if (notification.taskId?.trim() !== args.taskId.trim()) {
      return [];
    }

    return [notification.id];
  });
}

function markAllNotificationsReadInList(args: {
  notifications: AppNotification[];
  readAt: string;
}) {
  let changed = false;
  const nextNotifications = args.notifications.map((notification) => {
    if (notification.readAt) {
      return notification;
    }
    changed = true;
    return {
      ...notification,
      readAt: args.readAt,
    };
  });
  return changed ? nextNotifications : args.notifications;
}

function resolveTaskTitleFromSession(args: {
  session: WorkspaceSessionState;
  taskId: string;
}) {
  return (
    args.session.tasks.find((task) => task.id === args.taskId)?.title.trim() ||
    "Untitled Task"
  );
}

function buildTaskTurnCompletedNotificationInput(args: {
  state: Pick<
    AppState,
    "projectPath" | "projectName" | "workspaces" | "recentProjects"
  >;
  session: WorkspaceSessionState;
  workspaceId: string;
  taskId: string;
  turnId: string;
  provider: ProviderId;
  events: NormalizedProviderEvent[];
}): AppNotificationCreateInput | null {
  const doneEvent = [...args.events]
    .reverse()
    .find(
      (event): event is Extract<NormalizedProviderEvent, { type: "done" }> =>
        event.type === "done",
    );
  if (!doneEvent) {
    return null;
  }
  if (
    workspaceHasActiveTurns({
      activeTurnIdsByTask: args.session.activeTurnIdsByTask,
    })
  ) {
    return null;
  }

  const project = resolveProjectForWorkspaceId({
    state: {
      projectPath: args.state.projectPath,
      projectName: args.state.projectName,
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
    },
    workspaceId: args.workspaceId,
  });
  const workspaceName = resolveWorkspaceName({
    state: {
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
    },
    workspaceId: args.workspaceId,
  });
  const taskTitle = resolveTaskTitleFromSession({
    session: args.session,
    taskId: args.taskId,
  });

  return {
    id: crypto.randomUUID(),
    kind: "task.turn_completed",
    title: taskTitle,
    body: `Latest run finished in ${workspaceName}.`,
    projectPath: project?.projectPath ?? null,
    projectName: project?.projectName ?? null,
    workspaceId: args.workspaceId,
    workspaceName,
    taskId: args.taskId,
    taskTitle,
    turnId: args.turnId,
    providerId: args.provider,
    action: null,
    payload: {
      stopReason: doneEvent.stop_reason ?? null,
    },
    dedupeKey: `task.turn_completed:${args.turnId}`,
  };
}

function buildApprovalNotificationInputs(args: {
  state: Pick<
    AppState,
    "projectPath" | "projectName" | "workspaces" | "recentProjects"
  >;
  session: WorkspaceSessionState;
  workspaceId: string;
  taskId: string;
  turnId: string;
  provider: ProviderId;
  events: NormalizedProviderEvent[];
}): AppNotificationCreateInput[] {
  const approvalEvents = args.events.filter(
    (event): event is Extract<NormalizedProviderEvent, { type: "approval" }> =>
      event.type === "approval",
  );
  if (approvalEvents.length === 0) {
    return [];
  }

  const project = resolveProjectForWorkspaceId({
    state: {
      projectPath: args.state.projectPath,
      projectName: args.state.projectName,
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
    },
    workspaceId: args.workspaceId,
  });
  const workspaceName = resolveWorkspaceName({
    state: {
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
    },
    workspaceId: args.workspaceId,
  });
  const taskTitle = resolveTaskTitleFromSession({
    session: args.session,
    taskId: args.taskId,
  });
  const taskMessages = args.session.messagesByTask[args.taskId] ?? [];

  return approvalEvents.flatMap((event) => {
    const location = findPendingApprovalMessageByRequestId({
      messages: taskMessages,
      requestId: event.requestId,
    });
    if (!location) {
      return [];
    }

    return [
      {
        id: crypto.randomUUID(),
        kind: "task.approval_requested",
        title: taskTitle,
        body: `${event.toolName}: ${event.description}`,
        projectPath: project?.projectPath ?? null,
        projectName: project?.projectName ?? null,
        workspaceId: args.workspaceId,
        workspaceName,
        taskId: args.taskId,
        taskTitle,
        turnId: args.turnId,
        providerId: args.provider,
        action: {
          type: "approval",
          requestId: event.requestId,
          messageId: location.messageId,
        },
        payload: {
          toolName: event.toolName,
          description: event.description,
        },
        dedupeKey: `task.approval_requested:${args.turnId}:${event.requestId}`,
      } satisfies AppNotificationCreateInput,
    ];
  });
}

function showNotificationToast(notification: AppNotification) {
  const { tone, title, ...toastOptions } =
    buildNotificationToastOptions(notification);

  if (tone === "success") {
    toast.success(title, toastOptions);
    return;
  }

  toast.warning(title, toastOptions);
}

const ARCHIVED_TASK_TURN_NOTICE =
  "Generation stopped because the task was archived before this turn completed.";
export const STAVE_OPEN_SETTINGS_EVENT = "stave:open-settings";
export const STAVE_MUSE_OPEN_SETTINGS_EVENT = STAVE_OPEN_SETTINGS_EVENT;
const DEFAULT_STAVE_AUTO_MODEL_SETTINGS = buildStaveAutoModelSettingsPatch({
  presetId: DEFAULT_STAVE_AUTO_MODEL_PRESET_ID,
});
const DEFAULT_STAVE_AUTO_ROLE_RUNTIME_OVERRIDES =
  createDefaultStaveAutoRoleRuntimeOverrides();

function normalizeAppShellMode(value: unknown): AppShellMode {
  return value === "zen" ? "zen" : "stave";
}

function normalizeReasoningExpansionMode(value: unknown): "auto" | "manual" {
  return value === "auto" ? "auto" : "manual";
}

function normalizeBorderBeamSize(
  value: unknown,
): AppSettings["borderBeamSize"] {
  return value === "sm" || value === "md" || value === "line" ? value : "md";
}

function normalizeBorderBeamVariant(
  value: unknown,
): AppSettings["borderBeamVariant"] {
  return value === "colorful" ||
    value === "mono" ||
    value === "ocean" ||
    value === "sunset"
    ? value
    : "colorful";
}

const defaultSettings: AppSettings = {
  appShellMode: "stave",
  showPresetBar: true,
  themeMode: "dark",
  customThemeId: null,
  sidebarArtworkMode: DEFAULT_SIDEBAR_ARTWORK_MODE,
  borderBeamEnabled: false,
  borderBeamSize: "md",
  borderBeamVariant: "colorful",
  userCustomThemes: [],
  themeOverrides: {
    light: {},
    dark: {},
  },
  language: "English",
  updateMode: "auto",
  httpProxy: "",
  smartSuggestions: true,
  chatSendPreview: true,
  chatStreamingEnabled: true,
  messageFontSize: 18,
  messageCodeFontSize: 14,
  messageFontFamily: "Geist Variable",
  messageMonoFontFamily: "JetBrains Mono",
  messageKoreanFontFamily: "Pretendard Variable",
  infoPanelScale: 1,
  reasoningExpansionMode: "manual",
  showInterimMessages: false,
  thinkingPhraseAnimationStyle: "soft",
  claudeFastModeVisible: true,
  codexFastModeVisible: true,
  modelClaude: getDefaultModelForProvider({ providerId: "claude-code" }),
  modelCodex: getDefaultModelForProvider({ providerId: "codex" }),
  modelStave: getDefaultModelForProvider({ providerId: "stave" }),
  taskPresets: cloneDefaultTaskPresets(),
  ...DEFAULT_STAVE_AUTO_MODEL_SETTINGS,
  staveAutoOrchestrationMode: "auto",
  staveAutoMaxSubtasks: 3,
  staveAutoMaxParallelSubtasks: 2,
  staveAutoAllowCrossProviderWorkers: true,
  staveAutoFastMode: false,
  staveAutoRoleRuntimeOverrides: DEFAULT_STAVE_AUTO_ROLE_RUNTIME_OVERRIDES,
  museDefaultTarget: "app",
  museRouterModel: "gpt-5.4-mini",
  museChatModel: "gpt-5.4-mini",
  musePlannerModel: "gpt-5.4",
  museRouterPrompt: DEFAULT_STAVE_MUSE_ROUTER_PROMPT,
  museChatPrompt: DEFAULT_STAVE_MUSE_CHAT_PROMPT,
  musePlannerPrompt: DEFAULT_STAVE_MUSE_PLANNER_PROMPT,
  museAutoHandoffToTask: true,
  museAllowDirectWorkspaceInfoEdits: true,
  rulesPresetPrimary: "typescript-best-practices",
  rulesPresetSecondary: "no-target-brand-keyword",
  permissionMode: "auto-safe",
  subagentsEnabled: true,
  subagentsProfile: "default",
  skillsEnabled: true,
  skillsAutoSuggest: true,
  sharedSkillsHome: "",
  commandPaletteShowRecent: true,
  commandPalettePinnedCommandIds: [],
  commandPaletteHiddenCommandIds: [],
  commandPaletteRecentCommandIds: [],
  appShortcutKeys: { ...DEFAULT_APP_SHORTCUT_KEYS },
  modelShortcutKeys: normalizeModelShortcutKeys(),
  reviewStrictMode: true,
  reviewChecklistPreset: "safety-first",
  terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
  terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
  terminalCursorStyle: "block",
  terminalLineHeight: 1,
  editorFontSize: 14,
  editorFontFamily: "JetBrains Mono, monospace",
  editorWordWrap: true,
  editorMinimap: false,
  editorLineNumbers: "on" as const,
  editorTabSize: 2,
  editorLspEnabled: false,
  editorAiCompletions: false,
  editorEslintEnabled: false,
  editorFormatOnSave: false,
  pythonLspCommand: "",
  typescriptLspCommand: "",
  diffViewMode: "unified",
  scmAutoRefreshSeconds: 0,
  confirmBeforeClose: true,
  notificationSoundEnabled: true,
  notificationSoundVolume: DEFAULT_NOTIFICATION_SOUND_VOLUME,
  notificationSoundPreset: DEFAULT_NOTIFICATION_SOUND_PRESET,
  notificationSoundMode: DEFAULT_NOTIFICATION_SOUND_MODE,
  notificationSoundCustomAudioData: null,
  notificationSoundCustomAudioName: null,
  providerDebugStream: false,
  providerTimeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
  claudeBinaryPath: "",
  claudePermissionMode: "auto",
  claudePermissionModeBeforePlan: null,
  claudeAllowDangerouslySkipPermissions: false,
  claudeSandboxEnabled: false,
  claudeAllowUnsandboxedCommands: true,
  claudeTaskBudgetTokens: 0,
  claudeAdvisorModel: "",
  claudeSettingSources: ["project"],
  claudeEffort: "high",
  claudeThinkingMode: "adaptive",
  claudeAgentProgressSummaries: false,
  claudeFastMode: false,
  codexFileAccess: "danger-full-access",
  codexNetworkAccess: true,
  codexApprovalPolicy: "never",
  codexBinaryPath: "",
  codexReasoningEffort: "medium",
  codexWebSearch: "live",
  codexShowRawReasoning: false,
  codexReasoningSummary: "auto",
  codexReasoningSummarySupport: "auto",
  codexFastMode: false,
  codexPlanMode: false,
  planAutoApprove: undefined,
  promptResponseStyle: DEFAULT_PROMPT_RESPONSE_STYLE,
  promptPrDescription: DEFAULT_PROMPT_PR_DESCRIPTION,
  promptSupervisorBreakdown: DEFAULT_PROMPT_SUPERVISOR_BREAKDOWN,
  promptSupervisorSynthesis: DEFAULT_PROMPT_SUPERVISOR_SYNTHESIS,
  promptPreprocessorClassifier: DEFAULT_PROMPT_PREPROCESSOR_CLASSIFIER,
  promptInlineCompletion: DEFAULT_PROMPT_INLINE_COMPLETION,
  workspaceTurnSummaryPrimaryModel: "gpt-5.4-mini",
  workspaceTurnSummaryFallbackModel: "claude-haiku-4-5",
  workspaceTurnSummaryPrompt: DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY,

  // Lens
  lensSourceMappingHeuristic: true,
  lensSourceMappingReactDebugSource: false,
};

function createDefaultProviderAvailability() {
  return Object.fromEntries(
    listProviderIds().map((providerId) => [providerId, true] as const),
  ) as Record<ProviderId, boolean>;
}

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

function normalizeSharedSkillsHomeSetting(value?: string | null) {
  return value?.trim() ?? "";
}

function getRetainedLoadedMessageTaskIds(args: {
  activeTaskId: string;
  activeTurnIdsByTask: Record<string, string | undefined>;
  activeColiseumsByTask: Record<string, ColiseumGroupState | undefined>;
}) {
  const retained = new Set<string>();
  if (args.activeTaskId) {
    retained.add(args.activeTaskId);
  }
  for (const [taskId, turnId] of Object.entries(args.activeTurnIdsByTask)) {
    if (turnId) {
      retained.add(taskId);
    }
  }
  for (const taskId of collectActiveColiseumTaskIds({
    activeColiseumsByTask: args.activeColiseumsByTask,
  })) {
    retained.add(taskId);
  }
  return retained;
}

function compactLoadedMessagesByTask(args: {
  messagesByTask: Record<string, ChatMessage[]>;
  activeTaskId: string;
  activeTurnIdsByTask: Record<string, string | undefined>;
  activeColiseumsByTask: Record<string, ColiseumGroupState | undefined>;
}) {
  const retained = getRetainedLoadedMessageTaskIds({
    activeTaskId: args.activeTaskId,
    activeTurnIdsByTask: args.activeTurnIdsByTask,
    activeColiseumsByTask: args.activeColiseumsByTask,
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

function findActiveTerminalLinkableTask(
  args: Pick<AppState, "tasks" | "activeTaskId">,
) {
  if (!args.activeTaskId) {
    return null;
  }
  const task = findTaskById(args, args.activeTaskId);
  if (!task || isTaskArchived(task)) {
    return null;
  }
  return task;
}

function findTerminalTabById(
  state: Pick<AppState, "terminalTabs">,
  tabId: string,
) {
  return state.terminalTabs.find((tab) => tab.id === tabId) ?? null;
}

function findCliSessionTabById(
  state: Pick<AppState, "cliSessionTabs">,
  tabId: string,
) {
  return state.cliSessionTabs.find((tab) => tab.id === tabId) ?? null;
}

function createTerminalTabRecord(args: {
  cwd: string;
  linkedTaskId: string | null;
  linkedTaskTitle?: string | null;
  title?: string;
  existingTitles?: string[];
}) {
  const normalizedTitle = args.title?.trim();
  const baseTitle =
    normalizedTitle ||
    getTerminalTabDefaultTitle({
      cwd: args.cwd,
      linkedTaskTitle: args.linkedTaskTitle,
    });
  const title = normalizedTitle
    ? normalizedTitle
    : (() => {
        const existingTitles = args.existingTitles ?? [];
        if (!existingTitles.includes(baseTitle)) {
          return baseTitle;
        }
        let suffix = 2;
        while (existingTitles.includes(`${baseTitle} ${suffix}`)) {
          suffix += 1;
        }
        return `${baseTitle} ${suffix}`;
      })();
  return {
    id: crypto.randomUUID(),
    title,
    linkedTaskId: args.linkedTaskId,
    backend: "ghostty" as const,
    cwd: args.cwd,
    createdAt: Date.now(),
  } satisfies WorkspaceTerminalTab;
}

function buildCliSessionHandoffSummary(args: {
  task: Task;
  messages: ChatMessage[];
  workspacePath: string;
}) {
  const latestUserMessage = [...args.messages]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim());
  const latestAssistantMessage = [...args.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim());
  const lines = [
    `Continue the Stave task "${args.task.title}" in this fresh CLI session.`,
    `Workspace path: ${args.workspacePath || "current workspace"}`,
  ];

  if (latestUserMessage?.content.trim()) {
    lines.push("", "Latest user request:", latestUserMessage.content.trim());
  }
  if (latestAssistantMessage?.content.trim()) {
    lines.push(
      "",
      "Latest assistant context:",
      latestAssistantMessage.content.trim(),
    );
  }

  return lines.join("\n").trim();
}

function createCliSessionTabRecord(args: {
  provider: "claude-code" | "codex";
  contextMode: CliSessionContextMode;
  cwd: string;
  linkedTaskId: string | null;
  linkedTaskTitle?: string | null;
  handoffSummary: string;
  existingTitles?: string[];
}) {
  const baseTitle = getCliSessionTabDefaultTitle({
    providerId: args.provider,
    contextMode: args.contextMode,
    linkedTaskTitle: args.linkedTaskTitle,
  });
  const existingTitles = args.existingTitles ?? [];
  const title = !existingTitles.includes(baseTitle)
    ? baseTitle
    : (() => {
        let suffix = 2;
        while (existingTitles.includes(`${baseTitle} ${suffix}`)) {
          suffix += 1;
        }
        return `${baseTitle} ${suffix}`;
      })();

  return {
    id: crypto.randomUUID(),
    title,
    provider: args.provider,
    contextMode: args.contextMode,
    linkedTaskId: args.linkedTaskId,
    linkedTaskTitle: args.linkedTaskTitle ?? null,
    handoffSummary: args.handoffSummary,
    cwd: args.cwd,
    createdAt: Date.now(),
  } satisfies WorkspaceCliSessionTab;
}

function moveItemById<T extends { id: string }>(args: {
  items: T[];
  fromId: string;
  toId: string;
}) {
  const fromIndex = args.items.findIndex((item) => item.id === args.fromId);
  const toIndex = args.items.findIndex((item) => item.id === args.toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return args.items;
  }
  const nextItems = [...args.items];
  const [moved] = nextItems.splice(fromIndex, 1);
  if (!moved) {
    return args.items;
  }
  nextItems.splice(toIndex, 0, moved);
  return nextItems;
}

function isManagedTaskReadOnly(args: {
  state: Pick<AppState, "tasks">;
  taskId: string;
}) {
  return isTaskManaged(findTaskById(args.state, args.taskId));
}

function mergeRecentProjectsByPath(args: {
  persistedProjects: RecentProjectState[];
  stateProjects: RecentProjectState[];
}) {
  let merged = normalizeRecentProjectStates({
    projects: args.persistedProjects,
  });
  for (const project of normalizeRecentProjectStates({
    projects: args.stateProjects,
  })) {
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
  return merged;
}

function summarizeWorkspaceShell(
  snapshot:
    | Awaited<ReturnType<typeof loadWorkspaceShell>>
    | Awaited<ReturnType<typeof loadWorkspaceShellSummary>>,
) {
  if (!snapshot) {
    return 0;
  }
  return (
    snapshot.tasks.length +
    ("terminalTabCount" in snapshot
      ? snapshot.terminalTabCount
      : (snapshot.terminalTabs?.length ?? 0)) +
    ("cliSessionTabCount" in snapshot
      ? snapshot.cliSessionTabCount
      : (snapshot.cliSessionTabs?.length ?? 0)) +
    Object.values(snapshot.messageCountByTask).reduce(
      (sum, count) => sum + count,
      0,
    )
  );
}

function summarizeWorkspaceSession(session?: WorkspaceSessionState | null) {
  if (!session) {
    return 0;
  }
  return (
    session.tasks.length +
    (session.terminalTabs?.length ?? 0) +
    (session.cliSessionTabs?.length ?? 0) +
    Object.values(session.messageCountByTask).reduce(
      (sum, count) => sum + count,
      0,
    )
  );
}

async function closeTerminalSessionsForWorkspaces(workspaceIds: string[]) {
  const api = window.api?.terminal?.closeSessionsBySlotPrefix;
  if (!api || workspaceIds.length === 0) {
    return;
  }
  await Promise.allSettled(
    workspaceIds.flatMap((wsId) => [
      api({
        prefix: buildTerminalSessionSlotKey({
          surface: "terminal",
          workspaceId: wsId,
          tabId: "",
        }),
      }),
      api({
        prefix: buildTerminalSessionSlotKey({
          surface: "cli",
          workspaceId: wsId,
          tabId: "",
        }),
      }),
    ]),
  );
}

const activeWorkspaceArchiveCleanups = new Set<Promise<void>>();

/**
 * Wait for every background workspace-archive cleanup promise to settle.
 * Archive cleanup (git worktree removal, branch deletion, persistence close)
 * runs detached so the UI can archive a workspace instantly. Tests and
 * shutdown code paths can use this to observe the real completion of that
 * deferred work.
 */
export async function waitForPendingWorkspaceArchiveCleanups(): Promise<void> {
  while (activeWorkspaceArchiveCleanups.size > 0) {
    const pending = Array.from(activeWorkspaceArchiveCleanups);
    await Promise.allSettled(pending);
  }
}

function startWorkspaceArchiveCleanup(args: {
  workspaceId: string;
  workspacePath?: string;
  workspaceBranch?: string;
  projectPath?: string | null;
}): void {
  const promise = performWorkspaceArchiveCleanup(args);
  activeWorkspaceArchiveCleanups.add(promise);
  promise
    .catch((error) => {
      console.error(
        "[workspace-archive] background cleanup rejected",
        args,
        error,
      );
    })
    .finally(() => {
      activeWorkspaceArchiveCleanups.delete(promise);
    });
}

async function performWorkspaceArchiveCleanup(args: {
  workspaceId: string;
  workspacePath?: string;
  workspaceBranch?: string;
  projectPath?: string | null;
}) {
  const { workspaceId, workspacePath, workspaceBranch, projectPath } = args;
  try {
    const stopWorkspaceScripts = window.api?.scripts?.stopAll;
    if (stopWorkspaceScripts) {
      await stopWorkspaceScripts({ workspaceId });
    }
  } catch (error) {
    console.error(
      "[workspace-archive] stopScripts failed",
      { workspaceId },
      error,
    );
  }
  try {
    await closeTerminalSessionsForWorkspaces([workspaceId]);
  } catch (error) {
    console.error(
      "[workspace-archive] closeTerminalSessions failed",
      { workspaceId },
      error,
    );
  }
  const runner = window.api?.terminal?.runCommand;
  if (runner && projectPath && workspacePath) {
    try {
      const removeResult = await runner({
        cwd: projectPath,
        command: `git worktree remove --force ${JSON.stringify(workspacePath)}`,
      });
      if (!removeResult.ok) {
        await runner({
          cwd: projectPath,
          command: `rm -rf ${JSON.stringify(workspacePath)}`,
        });
        await runner({ cwd: projectPath, command: "git worktree prune" });
      }
      if (workspaceBranch) {
        await runner({
          cwd: projectPath,
          command: `git branch -D ${JSON.stringify(workspaceBranch)}`,
        });
      }
    } catch (error) {
      console.error(
        "[workspace-archive] git cleanup failed",
        { workspaceId, workspacePath, workspaceBranch },
        error,
      );
    }
  }
  try {
    await closeWorkspacePersistence({ workspaceId });
  } catch (error) {
    console.error(
      "[workspace-archive] closeWorkspacePersistence failed",
      { workspaceId },
      error,
    );
  }
}

function shouldReloadWorkspaceShellFromPersistence(args: {
  cachedWorkspaceState?: WorkspaceSessionState;
}) {
  return summarizeWorkspaceSession(args.cachedWorkspaceState) === 0;
}

function shouldPreferLoadedWorkspaceState(args: {
  cachedWorkspaceState?: WorkspaceSessionState;
  loadedWorkspaceShellState?: {
    shell: WorkspaceShell | null;
    workspaceState: WorkspaceSessionState;
  } | null;
}) {
  if (!args.loadedWorkspaceShellState) {
    return false;
  }
  return (
    summarizeWorkspaceShell(args.loadedWorkspaceShellState.shell) >
    summarizeWorkspaceSession(args.cachedWorkspaceState)
  );
}

function buildStaveMuseLocalActionContextFromState(
  state: Pick<
    AppState,
    | "activeWorkspaceId"
    | "projectName"
    | "projectPath"
    | "recentProjects"
    | "workspaces"
    | "workspaceBranchById"
    | "workspaceDefaultById"
    | "workspaceInformation"
    | "tasks"
    | "activeTaskId"
    | "activeTurnIdsByTask"
  >,
) {
  const projects: StaveMuseProjectSummary[] = state.recentProjects.map(
    (project) => ({
      projectName: project.projectName,
      projectPath: project.projectPath,
      isCurrent: project.projectPath === state.projectPath,
    }),
  );
  const workspaces: StaveMuseWorkspaceSummary[] = state.workspaces.map(
    (workspace) => ({
      id: workspace.id,
      name: workspace.name,
      branch: state.workspaceBranchById[workspace.id],
      isActive: workspace.id === state.activeWorkspaceId,
      isDefault: Boolean(state.workspaceDefaultById[workspace.id]),
    }),
  );
  const tasks: StaveMuseTaskSummary[] = state.tasks
    .filter((task) => !isTaskArchived(task))
    .map((task) => ({
      id: task.id,
      title: task.title,
      isActive: task.id === state.activeTaskId,
      isResponding: Boolean(state.activeTurnIdsByTask[task.id]),
    }));

  return {
    projectName: state.projectName,
    projectPath: state.projectPath,
    projects,
    workspaces,
    tasks,
    activeTaskId: state.activeTaskId,
    workspaceInformation: state.workspaceInformation,
  } satisfies StaveMuseLocalActionContext;
}

function createStaveMuseUserMessage(args: {
  content: string;
  existingMessages: ChatMessage[];
}): ChatMessage {
  return {
    id: buildMessageId({
      taskId: STAVE_MUSE_SESSION_ID,
      count: args.existingMessages.length,
    }),
    role: "user",
    model: "user",
    providerId: "user",
    content: args.content,
    parts: [createUserTextPart({ text: args.content })],
  };
}

function createStaveMuseAssistantMessage(args: {
  content: string;
  messageCount: number;
  providerId: ProviderId;
  model: string;
}): ChatMessage {
  const timestamp = buildRecentTimestamp();
  return {
    id: buildMessageId({
      taskId: STAVE_MUSE_SESSION_ID,
      count: args.messageCount,
    }),
    role: "assistant",
    model: args.model,
    providerId: args.providerId,
    content: args.content,
    startedAt: timestamp,
    completedAt: timestamp,
    isStreaming: false,
    parts: args.content.trim()
      ? [createUserTextPart({ text: args.content })]
      : [],
  };
}

function buildClearedStaveMusePromptDraft(
  assistant: StaveMuseState,
): PromptDraft {
  return {
    text: "",
    attachedFilePaths: [],
    attachments: [],
    ...(assistant.promptDraft.runtimeOverrides
      ? { runtimeOverrides: assistant.promptDraft.runtimeOverrides }
      : {}),
  };
}

function appendStaveMuseStandaloneMessage(args: {
  assistant: StaveMuseState;
  content: string;
  providerId?: ProviderId;
  model?: string;
}) {
  const assistantMessage = createStaveMuseAssistantMessage({
    content: args.content,
    messageCount: args.assistant.messages.length,
    providerId: args.providerId ?? "stave",
    model: args.model ?? "stave-muse",
  });

  return {
    ...args.assistant,
    messages: [...args.assistant.messages, assistantMessage],
    open: true,
    focusNonce: args.assistant.focusNonce + 1,
  } satisfies StaveMuseState;
}

function appendStaveMuseSubmittedUserMessage(args: {
  assistant: StaveMuseState;
  content: string;
}) {
  const userMessage = createStaveMuseUserMessage({
    content: args.content,
    existingMessages: args.assistant.messages,
  });

  return {
    ...args.assistant,
    messages: [...args.assistant.messages, userMessage],
    promptDraft: buildClearedStaveMusePromptDraft(args.assistant),
    open: true,
    focusNonce: args.assistant.focusNonce + 1,
  } satisfies StaveMuseState;
}

function hasSelectedMuseWorkspace(
  state: Pick<AppState, "activeWorkspaceId" | "workspaces">,
) {
  return (
    Boolean(state.activeWorkspaceId) &&
    state.workspaces.some(
      (workspace) => workspace.id === state.activeWorkspaceId,
    )
  );
}

function coerceMuseCustomFieldValue(args: {
  field: WorkspaceInformationState["customFields"][number];
  value: string;
}) {
  const rawValue = args.value.trim();
  switch (args.field.type) {
    case "number": {
      if (!rawValue) {
        return null;
      }
      const nextValue = Number.parseFloat(rawValue);
      return Number.isFinite(nextValue) ? nextValue : args.field.value;
    }
    case "boolean": {
      const normalized = rawValue.toLowerCase();
      if (["true", "yes", "on", "1", "done"].includes(normalized)) {
        return true;
      }
      if (["false", "no", "off", "0"].includes(normalized)) {
        return false;
      }
      return args.field.value;
    }
    case "single_select":
      return rawValue;
    case "text":
    case "textarea":
    case "date":
    case "url":
    default:
      return rawValue;
  }
}

function updateMuseCustomField(args: {
  field: WorkspaceInformationState["customFields"][number];
  value: string;
}): WorkspaceInformationState["customFields"][number] {
  const nextValue = coerceMuseCustomFieldValue(args);
  switch (args.field.type) {
    case "number":
      return {
        ...args.field,
        value:
          typeof nextValue === "number" || nextValue === null
            ? nextValue
            : args.field.value,
      };
    case "boolean":
      return {
        ...args.field,
        value: typeof nextValue === "boolean" ? nextValue : args.field.value,
      };
    case "single_select":
      return {
        ...args.field,
        value: typeof nextValue === "string" ? nextValue : args.field.value,
      };
    case "text":
    case "textarea":
    case "date":
    case "url":
    default:
      return {
        ...args.field,
        value: typeof nextValue === "string" ? nextValue : args.field.value,
      };
  }
}

function getBlockingConnectedToolStatuses(args: {
  statuses: readonly ConnectedToolStatusEntry[];
}) {
  return args.statuses.filter(
    (entry) =>
      entry.state === "needs-auth" ||
      entry.state === "disabled" ||
      entry.state === "error" ||
      entry.state === "unsupported",
  );
}

function appendStaveMuseLocalExchange(args: {
  assistant: StaveMuseState;
  content: string;
  responseText: string;
  providerId?: ProviderId;
  model?: string;
}) {
  const userMessage = createStaveMuseUserMessage({
    content: args.content,
    existingMessages: args.assistant.messages,
  });
  const messagesWithUser = [...args.assistant.messages, userMessage];
  const assistantMessage = createStaveMuseAssistantMessage({
    content: args.responseText,
    messageCount: messagesWithUser.length,
    providerId: args.providerId ?? "stave",
    model: args.model ?? "stave-muse",
  });

  return {
    ...args.assistant,
    messages: [...messagesWithUser, assistantMessage],
    promptDraft: buildClearedStaveMusePromptDraft(args.assistant),
    open: true,
    focusNonce: args.assistant.focusNonce + 1,
  } satisfies StaveMuseState;
}

function appendStaveMusePendingReply(args: {
  assistant: StaveMuseState;
  providerId: ProviderId;
  model: string;
  turnId: string;
}) {
  const currentMessages = args.assistant.messages;
  const assistantMessage: ChatMessage = {
    id: buildMessageId({
      taskId: STAVE_MUSE_SESSION_ID,
      count: currentMessages.length,
    }),
    role: "assistant",
    model: args.model,
    providerId: args.providerId,
    content: "",
    startedAt: buildRecentTimestamp(),
    isStreaming: true,
    parts: [],
  };

  return {
    ...args.assistant,
    messages: [...currentMessages, assistantMessage],
    activeTurnId: args.turnId,
    open: true,
  } satisfies StaveMuseState;
}

function appendStaveMusePendingTurn(args: {
  assistant: StaveMuseState;
  content: string;
  providerId: ProviderId;
  model: string;
  turnId: string;
}) {
  const currentMessages = args.assistant.messages;
  const userMessage = createStaveMuseUserMessage({
    content: args.content,
    existingMessages: currentMessages,
  });
  const assistantMessage: ChatMessage = {
    id: buildMessageId({
      taskId: STAVE_MUSE_SESSION_ID,
      count: currentMessages.length + 1,
    }),
    role: "assistant",
    model: args.model,
    providerId: args.providerId,
    content: "",
    startedAt: buildRecentTimestamp(),
    isStreaming: true,
    parts: [],
  };

  return {
    ...args.assistant,
    messages: [...currentMessages, userMessage, assistantMessage],
    activeTurnId: args.turnId,
    promptDraft: buildClearedStaveMusePromptDraft(args.assistant),
    open: true,
    focusNonce: args.assistant.focusNonce + 1,
  } satisfies StaveMuseState;
}

function applyProviderEventsToStaveMuse(args: {
  assistant: StaveMuseState;
  events: NormalizedProviderEvent[];
  provider: ProviderId;
  model: string;
  turnId: string;
}) {
  if (args.assistant.activeTurnId !== args.turnId) {
    return args.assistant;
  }

  const replayed = replayProviderEventsToTaskState({
    taskId: STAVE_MUSE_SESSION_ID,
    messages: args.assistant.messages,
    events: args.events,
    provider: args.provider,
    model: args.model,
    turnId: args.turnId,
    nativeSessionReady: args.assistant.nativeSessionReady,
    providerSession: args.assistant.providerSession,
  });

  return {
    ...args.assistant,
    messages: replayed.messages,
    activeTurnId: replayed.activeTurnId,
    nativeSessionReady: replayed.nativeSessionReady,
    providerSession: replayed.providerSession,
  } satisfies StaveMuseState;
}

async function collectStaveMuseRoutingDecision(args: {
  content: string;
  model: string;
  settings: AppSettings;
  contextSnapshot: string;
  projectBasePrompt?: string;
}) {
  const STAVE_MUSE_ROUTER_TIMEOUT_MS = 4_000;
  const runtimeCwd = getStaveMuseRuntimeCwd();
  const fastPathDecision = resolveStaveMuseFastPathDecision({
    input: args.content,
  });
  if (fastPathDecision) {
    return fastPathDecision;
  }
  const provider = inferProviderIdFromModel({ model: args.model });
  const prompt = buildStaveMuseRouterPrompt({
    instructionPrompt: args.settings.museRouterPrompt,
    contextSnapshot: args.contextSnapshot,
    userRequest: args.content,
  });

  return new Promise<StaveMuseRoutingDecision>((resolve) => {
    let responseText = "";
    let settled = false;
    const finalize = (decision: StaveMuseRoutingDecision) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      resolve(decision);
    };
    const timeoutHandle = setTimeout(() => {
      finalize(DEFAULT_STAVE_MUSE_ROUTING_DECISION);
    }, STAVE_MUSE_ROUTER_TIMEOUT_MS);
    const runtimeOptions = applyProjectBasePromptToRuntimeOptions({
      runtimeOptions: buildProviderRuntimeOptions({
        provider,
        model: args.model,
        settings: args.settings,
      }),
      projectBasePrompt: args.projectBasePrompt,
    });
    runProviderTurn({
      provider,
      prompt,
      taskId: `${STAVE_MUSE_SESSION_ID}-router`,
      cwd: runtimeCwd,
      runtimeOptions: {
        ...runtimeOptions,
        claudeAllowedTools: [],
        claudeMaxTurns: 1,
        codexApprovalPolicy: "never",
        codexFastMode: true,
        codexFileAccess: "read-only",
        providerTimeoutMs: Math.min(
          runtimeOptions.providerTimeoutMs ?? STAVE_MUSE_ROUTER_TIMEOUT_MS,
          STAVE_MUSE_ROUTER_TIMEOUT_MS,
        ),
      },
      onEvent: ({ event }) => {
        if (event.type === "text") {
          responseText += event.text;
          return;
        }
        if (
          event.type === "error" ||
          (event.type === "system" &&
            event.content.startsWith("Provider stream failed:"))
        ) {
          finalize(DEFAULT_STAVE_MUSE_ROUTING_DECISION);
          return;
        }
        if (event.type === "done") {
          finalize(parseStaveMuseRoutingDecision(responseText));
        }
      },
    });
  });
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
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

      const runScriptHookInBackground = (args: {
        workspaceId: string;
        trigger: ScriptTrigger;
        taskId?: string;
        taskTitle?: string;
        turnId?: string;
      }) => {
        const runScriptHook = window.api?.scripts?.runHook;
        const context = resolveScriptHookWorkspaceContext(args.workspaceId);
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
          set((state) => {
            if (state.activeTurnIdsByTask[args.taskId] !== args.turnId) {
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
            return {
              providerTurnActivityByTask: nextActivityByTask,
            };
          });
        }, delayMs);
        providerTurnStallTimerByTask.set(args.taskId, handle);
      };

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
          workspaceInformation: args.session.workspaceInformation,
          editorTabs: args.session.editorTabs,
          activeEditorTabId: args.session.activeEditorTabId,
          terminalTabs: args.session.terminalTabs,
          activeTerminalTabId: args.session.activeTerminalTabId,
          terminalDocked: args.session.terminalDocked,
          cliSessionTabs: args.session.cliSessionTabs,
          activeCliSessionTabId: args.session.activeCliSessionTabId,
          activeSurface: args.session.activeSurface,
          providerSessionByTask: args.session.providerSessionByTask,
        });
      };

      const applyWorkspaceTurnSummaryToState = (args: {
        workspaceId: string;
        summary: ReturnType<typeof createWorkspaceTurnSummary>;
      }) => {
        let didUpdate = false;

        set((state) => {
          const cachedSession =
            state.workspaceRuntimeCacheById[args.workspaceId];
          const currentWorkspaceInformation =
            args.workspaceId === state.activeWorkspaceId
              ? state.workspaceInformation
              : cachedSession?.workspaceInformation;
          if (!currentWorkspaceInformation) {
            return state;
          }

          const currentSummary =
            currentWorkspaceInformation.turnSummary ?? null;
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
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
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
          ...new Set(
            [primaryModel.trim(), fallbackModel.trim()].filter(Boolean),
          ),
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
              workspaceTurnSummaryRequestIdByWorkspaceId.get(
                args.workspaceId,
              ) !== requestId
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
                const availability =
                  await window.api.provider.checkAvailability({
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
          set((state) => ({
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
                  projectBasePrompt: resolveProjectBasePrompt({
                    projectPath: args.projectRootPath,
                    recentProjects: rememberedProjects,
                  }),
                  newWorkspaceInitCommand: resolveProjectWorkspaceInitCommand({
                    projectPath: args.projectRootPath,
                    recentProjects: rememberedProjects,
                  }),
                  newWorkspaceUseRootNodeModulesSymlink:
                    resolveProjectWorkspaceRootNodeModulesSymlinkPreference({
                      projectPath: args.projectRootPath,
                      recentProjects: rememberedProjects,
                    }),
                }),
                projectName: args.projectName,
                defaultBranch: args.defaultBranch,
                lastOpenedAt: new Date().toISOString(),
              },
            }),
            defaultBranch: args.defaultBranch,
            projectName: args.projectName,
            projectFiles:
              args.files.length > 0 ? args.files : state.projectFiles,
            workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
            workspaceRuntimeCacheById: savedWorkspaceRuntimeCacheById,
          }));
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
          set(() => ({
            hasHydratedWorkspaces: false,
            workspaceSnapshotVersion: 0,
            promptDraftPersistenceVersion: 0,
            taskMessagesLoadingByTask: {},
            workspaces: nextProject.workspaces,
            activeWorkspaceId: nextProject.activeWorkspaceId,
            projectPath: args.projectRootPath,
            recentProjects: upsertRecentProjectState({
              projects: rememberedProjects,
              project: nextProject,
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
          }));
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

        let workspaceState: ReturnType<
          typeof buildWorkspaceSessionStateFromShell
        >;
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
          newWorkspaceInitCommand: "",
          newWorkspaceUseRootNodeModulesSymlink: false,
        } satisfies RecentProjectState;
        const nextProjectWorkspaceIds = nextProject.workspaces.map(
          (workspace) => workspace.id,
        );

        set(() => ({
          hasHydratedWorkspaces: true,
          workspaceSnapshotVersion: 0,
          workspaces: nextProject.workspaces,
          activeWorkspaceId: nextProject.activeWorkspaceId,
          projectPath: args.projectRootPath,
          recentProjects: upsertRecentProjectState({
            projects: rememberedProjects,
            project: nextProject,
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
        }));
        if (deferredWorkspaceMessageHydration?.activeTaskIdForLatestHydration) {
          void loadTaskMessagesIntoSession({
            workspaceId: defaultWorkspaceId,
            taskId:
              deferredWorkspaceMessageHydration.activeTaskIdForLatestHydration,
            mode: "latest",
          });
        }
        if (deferredWorkspaceMessageHydration) {
          hydrateWorkspaceMessagesInBackground(
            deferredWorkspaceMessageHydration,
          );
        }
      };

      const persistNotification = async (
        notification: AppNotificationCreateInput,
      ) => {
        try {
          const result = await createPersistedNotification({ notification });
          if (!result.notification) {
            return null;
          }
          set((state) => ({
            notifications: mergeNotificationIntoList({
              notifications: state.notifications,
              notification: result.notification!,
            }),
          }));
          const {
            notificationSoundEnabled,
            notificationSoundVolume,
            notificationSoundPreset,
            notificationSoundMode,
            notificationSoundCustomAudioData,
          } = get().settings;
          if (
            notificationSoundEnabled &&
            result.notification.kind === "task.turn_completed"
          ) {
            if (
              notificationSoundMode === "custom" &&
              notificationSoundCustomAudioData
            ) {
              playCustomNotificationSound({
                dataUrl: notificationSoundCustomAudioData,
                volume: notificationSoundVolume,
              });
            } else {
              playNotificationSound({
                preset: notificationSoundPreset,
                volume: notificationSoundVolume,
              });
            }
          }
          showNotificationToast(result.notification);
          return result.notification;
        } catch (error) {
          console.error(
            "[notifications] failed to persist notification",
            error,
          );
          return null;
        }
      };

      const persistNotifications = async (
        notifications: AppNotificationCreateInput[],
      ) => {
        for (const notification of notifications) {
          await persistNotification(notification);
        }
      };

      const openNotificationContextInternal = async (
        notification: AppNotification,
      ): Promise<NotificationContextOpenResult> => {
        const projectPath = notification.projectPath?.trim();
        if (projectPath && projectPath !== get().projectPath) {
          await get().openProject({ projectPath });
        }

        const afterProjectOpen = get();
        const workspaceId = notification.workspaceId?.trim();
        if (workspaceId && afterProjectOpen.activeWorkspaceId !== workspaceId) {
          const workspaceExists = afterProjectOpen.workspaces.some(
            (workspace) => workspace.id === workspaceId,
          );
          if (workspaceExists) {
            await afterProjectOpen.switchWorkspace({ workspaceId });
          }
        }

        const afterWorkspaceOpen = get();
        const taskId = notification.taskId?.trim();
        if (!taskId) {
          return { status: "opened" };
        }

        const targetTask = afterWorkspaceOpen.tasks.find(
          (task) => task.id === taskId,
        );
        if (!targetTask) {
          return { status: "opened" };
        }
        if (isTaskArchived(targetTask)) {
          return {
            status: "archived-task",
            taskId,
            taskTitle:
              targetTask.title.trim() ||
              notification.taskTitle?.trim() ||
              "Untitled Task",
          };
        }

        afterWorkspaceOpen.selectTask({ taskId });
        return { status: "opened" };
      };

      const loadWorkspaceSessionFromPersistence = async (args: {
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
            pageEntries.map(
              ({ taskId, page }) => [taskId, page.messages] as const,
            ),
          ),
          messageCountByTaskOverrides: Object.fromEntries(
            pageEntries.map(
              ({ taskId, page }) => [taskId, page.totalCount] as const,
            ),
          ),
          latestTurns,
          appendInterruptedNotices: args.appendInterruptedNotices,
        });
        return { shell, latestTurns, workspaceState };
      };

      const loadWorkspaceShellStateFromPersistence = async (args: {
        workspaceId: string;
      }) => {
        const [shell, latestTurns] = await Promise.all([
          loadWorkspaceShellForRestore({ workspaceId: args.workspaceId }),
          listActiveWorkspaceTurns({ workspaceId: args.workspaceId }),
        ]);
        const interruptedTaskIds = new Set(
          latestTurns
            .filter((turn) => !turn.completedAt)
            .map((turn) => turn.taskId),
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

      const hydrateDeferredEditorTab = async (args: {
        workspaceId: string;
        tabId: string;
      }) => {
        let filePath = "";
        let shouldHydrate = false;

        set((state) => {
          if (state.activeWorkspaceId !== args.workspaceId) {
            return {};
          }
          const targetTab = state.editorTabs.find(
            (tab) => tab.id === args.tabId,
          );
          if (
            !targetTab ||
            targetTab.contentState === "ready" ||
            targetTab.contentState === "loading"
          ) {
            return {};
          }
          filePath = targetTab.filePath;
          shouldHydrate = true;
          return {
            editorTabs: state.editorTabs.map((tab) =>
              tab.id === args.tabId
                ? {
                    ...tab,
                    contentState: "loading",
                  }
                : tab,
            ),
          };
        });

        if (!shouldHydrate) {
          return;
        }

        let body = null as
          | Awaited<ReturnType<typeof loadWorkspaceEditorTabBodies>>[number]
          | null;
        try {
          body =
            (
              await loadWorkspaceEditorTabBodies({
                workspaceId: args.workspaceId,
                tabIds: [args.tabId],
              })
            )[0] ?? null;
        } catch {
          body = null;
        }

        if (!body && filePath) {
          const state = get();
          const workspaceRootPath =
            state.workspacePathById[args.workspaceId] || state.projectPath;
          let fileData = await workspaceFsAdapter.readFile({
            filePath,
          });
          if (!fileData && workspaceRootPath) {
            await workspaceFsAdapter.setRoot?.({
              rootPath: workspaceRootPath,
              rootName: state.projectName ?? "project",
            });
            fileData = await workspaceFsAdapter.readFile({
              filePath,
            });
          }
          if (fileData) {
            body = {
              id: args.tabId,
              content: fileData.content,
              originalContent: fileData.content,
              savedContent: fileData.content,
            };
          }
        }

        set((state) => {
          if (state.activeWorkspaceId !== args.workspaceId) {
            return {};
          }
          const targetTab = state.editorTabs.find(
            (tab) => tab.id === args.tabId,
          );
          if (!targetTab || targetTab.contentState !== "loading") {
            return {};
          }
          return {
            editorTabs: state.editorTabs.map((tab) => {
              if (tab.id !== args.tabId) {
                return tab;
              }
              if (!body) {
                return {
                  ...tab,
                  contentState: "deferred",
                };
              }
              return {
                ...tab,
                content: body.content,
                contentState: "ready",
                ...(body.originalContent !== undefined
                  ? { originalContent: body.originalContent }
                  : {}),
                ...(body.savedContent !== undefined
                  ? { savedContent: body.savedContent }
                  : {}),
              };
            }),
          };
        });
      };

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
        const currentMessages =
          currentSession.messagesByTask[args.taskId] ?? [];
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
                    [args.taskId]: Math.max(
                      page.totalCount,
                      nextMessages.length,
                    ),
                  },
                },
              },
              taskMessagesLoadingByTask: nextLoadingState,
            };
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

      const refreshWorkspaceFilesInBackground = (args: {
        workspaceId: string;
        workspacePath: string;
        switchMetricToken?: number;
      }) => {
        void workspaceFsAdapter
          .listFiles()
          .then((files) => {
            set((state) => {
              const nextWorkspaceFileCacheByPath = rememberCachedWorkspaceFiles(
                {
                  workspaceFileCacheByPath: state.workspaceFileCacheByPath,
                  workspacePath: args.workspacePath,
                  files,
                },
              );
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
        workspacePrInfoById: {},
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
          editorPanelWidth: DEFAULT_EDITOR_PANEL_WIDTH,
          explorerPanelWidth: 300,
          terminalDockHeight: 210,
          editorVisible: false,
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
        activeSurface: { kind: "task", taskId: "" },
        pendingCloseEditorTabId: null,
        pendingEditorSelection: null,
        projectName: null,
        projectFiles: workspaceFsAdapter.getKnownFiles(),
        workspaceFileCacheByPath: {},
        taskCheckpointById: {},
        providerAvailability: createDefaultProviderAvailability(),
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
        activeTurnIdsByTask: {},
        providerTurnActivityByTask: {},
        nativeSessionReadyByTask: {},
        activeColiseumsByTask: {},
        providerSessionByTask: {},
        workspaceRuntimeCacheById: {},
        taskWorkspaceIdById: {},
        staveMuse: createEmptyStaveMuseState({
          defaultTarget: defaultSettings.museDefaultTarget,
        }),
        persistenceBootstrapPhase: "idle",
        persistenceBootstrapMessage: "",
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
            JSON.stringify(rawPersistedProjects) !==
            JSON.stringify(mergedProjects)
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
          });
          await saveProjectRegistrySnapshot({
            projects,
          });
        },
        hydrateWorkspaces: async () => {
          await get().hydrateProjectRegistry();
          let initialRows = await listWorkspaceSummaries();
          const stateBeforeHydrate = get();
          const currentProject = stateBeforeHydrate.projectPath
            ? (stateBeforeHydrate.recentProjects.find(
                (project) =>
                  project.projectPath === stateBeforeHydrate.projectPath,
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
                  (workspace) =>
                    persistedRowsById.get(workspace.id) ?? workspace,
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

          // Worktree cleanup: remove DB workspaces whose git worktrees no longer exist
          const runner = window.api?.terminal?.runCommand;
          const projectPath = stateBeforeHydrate.projectPath;
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
                if (!registeredPaths.has(normalizeComparablePath(wsPath))) {
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
                  knownPaths.has(normalizedWorktreePath)
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
            (workspace) =>
              workspace.id === stateBeforeHydrate.activeWorkspaceId,
          )
            ? stateBeforeHydrate.activeWorkspaceId
            : (rows.find((workspace) => workspace.id === defaultWorkspaceId)
                ?.id ??
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
            workspaceFileCacheByPath:
              stateBeforeHydrate.workspaceFileCacheByPath,
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
              .filter(
                (workspace) => !rows.some((row) => row.id === workspace.id),
              )
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
                      projectBasePrompt: resolveProjectBasePrompt({
                        projectPath: state.projectPath,
                        recentProjects: state.recentProjects,
                      }),
                      newWorkspaceInitCommand:
                        resolveProjectWorkspaceInitCommand({
                          projectPath: state.projectPath,
                          recentProjects: state.recentProjects,
                        }),
                      newWorkspaceUseRootNodeModulesSymlink:
                        resolveProjectWorkspaceRootNodeModulesSymlinkPreference(
                          {
                            projectPath: state.projectPath,
                            recentProjects: state.recentProjects,
                          },
                        ),
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
            loadedWorkspaceShellState &&
            (preferLoadedWorkspaceState || !cachedWorkspaceState)
          ) {
            if (loadedWorkspaceShellState.activeTaskIdForLatestHydration) {
              void loadTaskMessagesIntoSession({
                workspaceId: preferredWorkspaceId,
                taskId:
                  loadedWorkspaceShellState.activeTaskIdForLatestHydration,
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
            const normalizedWorktreePath = normalizeComparablePath(
              worktree.path,
            );
            if (
              !worktree.branch ||
              !normalizedWorktreePath ||
              normalizedWorktreePath === currentProjectPath ||
              knownPathToId.has(normalizedWorktreePath)
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
            if (wsPath && !registeredWorktreePaths.has(wsPath)) {
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
              for (const [taskId, ownerId] of Object.entries(
                nextTaskOwnership,
              )) {
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
                      projectBasePrompt: resolveProjectBasePrompt({
                        projectPath: current.projectPath,
                        recentProjects: current.recentProjects,
                      }),
                      newWorkspaceInitCommand:
                        resolveProjectWorkspaceInitCommand({
                          projectPath: current.projectPath,
                          recentProjects: current.recentProjects,
                        }),
                      newWorkspaceUseRootNodeModulesSymlink:
                        resolveProjectWorkspaceRootNodeModulesSymlinkPreference(
                          {
                            projectPath: current.projectPath,
                            recentProjects: current.recentProjects,
                          },
                        ),
                    },
                  })
                : current.recentProjects,
            };
          });
        },
        hydrateNotifications: async () => {
          try {
            const notifications = await listPersistedNotifications({
              limit: 500,
            });
            set(() => ({
              notifications,
            }));
          } catch (error) {
            console.error(
              "[notifications] failed to hydrate notifications",
              error,
            );
            set(() => ({
              notifications: [],
            }));
          }
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
              activeColiseumsByTask: current.activeColiseumsByTask,
            });
            if (compactedMessagesByTask === current.messagesByTask) {
              return current;
            }
            return {
              messagesByTask: compactedMessagesByTask,
            };
          });
        },
        refreshActiveManagedTask: async () => {
          const stateBefore = get();
          const workspaceId = stateBefore.activeWorkspaceId;
          const activeTask = findTaskById(
            stateBefore,
            stateBefore.activeTaskId,
          );
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
              nativeSessionReadyByTask:
                refreshedSession.nativeSessionReadyByTask,
              activeColiseumsByTask: refreshedSession.activeColiseumsByTask,
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
        },
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

          set((state) => {
            const matchingProject = state.recentProjects.find(
              (project) => project.projectPath === normalizedProjectPath,
            );
            const workspaceIds = new Set<string>([
              ...(matchingProject?.workspaces.map(
                (workspace) => workspace.id,
              ) ?? []),
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
                ...(isCurrentProject
                  ? Object.values(state.workspacePathById)
                  : []),
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
                editorVisible: false,
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
            });
            const fromIndex = currentProjects.findIndex(
              (project) => project.projectPath === normalizedProjectPath,
            );
            const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
            const nextProjects = moveArrayItem(
              currentProjects,
              fromIndex,
              toIndex,
            );
            return nextProjects === currentProjects
              ? state
              : { recentProjects: nextProjects };
          });
        },
        createWorkspace: async ({
          name,
          mode,
          fromBranch,
          fromBranchKind,
          initCommand,
          useRootNodeModulesSymlink: requestedRootNodeModulesSymlink,
          initialTaskTitle,
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
          const projectWorkspaceInitCommand =
            resolveProjectWorkspaceInitCommand({
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
          let baseBranch =
            fromBranch?.trim() || current.defaultBranch || "main";
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
            workspaceName: branchName,
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
              rootPath: workspacePath,
              rootName: branchName,
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

          set((state) => ({
            workspaceSnapshotVersion: 0,
            workspaces: state.workspaces.some(
              (workspace) => workspace.id === workspaceId,
            )
              ? state.workspaces
              : [
                  ...state.workspaces,
                  {
                    id: workspaceId,
                    name: branchName,
                    updatedAt: new Date().toISOString(),
                  },
                ],
            activeWorkspaceId: workspaceId,
            workspaceBranchById: {
              ...state.workspaceBranchById,
              [workspaceId]: branchName,
            },
            workspacePathById: {
              ...state.workspacePathById,
              [workspaceId]: workspacePath,
            },
            workspaceDefaultById: {
              ...state.workspaceDefaultById,
              [workspaceId]: false,
            },
            workspaceFileCacheByPath: rememberCachedWorkspaceFiles({
              workspaceFileCacheByPath: state.workspaceFileCacheByPath,
              workspacePath,
              files,
            }),
            workspaceRuntimeCacheById: nextRuntimeCacheById,
            taskWorkspaceIdById: registerTaskWorkspaceOwnership({
              taskWorkspaceIdById: state.taskWorkspaceIdById,
              workspaceId,
              tasks: workspaceState.tasks,
            }),
            ...workspaceState,
            projectFiles: files,
          }));
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
            : { ok: true };
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
            current.workspaceBranchById[sourceWorkspaceId] ??
            sourceWorkspaceName;
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
                  const writeSummaryResult = await workspaceFsAdapter.writeFile(
                    {
                      filePath: summaryFilePath,
                      content: summaryMarkdown,
                    },
                  );
                  if (!writeSummaryResult.ok) {
                    warnings.push(
                      "Could not write the continuation brief file.",
                    );
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
        closeWorkspace: async ({ workspaceId }) => {
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
          const workspacePath = state.workspacePathById[workspaceId];
          const workspaceBranch = state.workspaceBranchById[workspaceId];
          const projectPath = state.projectPath;
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
                workspaces: nextState.workspaces.filter(
                  (item) => item.id !== workspaceId,
                ),
                workspaceBranchById: nextBranchById,
                workspacePathById: nextPathById,
                workspaceDefaultById: nextDefaultById,
                activeWorkspaceId: "",
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
              workspacePath,
              workspaceBranch,
              projectPath,
            });
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
              workspaces: nextState.workspaces.filter(
                (item) => item.id !== workspaceId,
              ),
              workspaceBranchById: nextBranchById,
              workspacePathById: nextPathById,
              workspaceDefaultById: nextDefaultById,
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
            workspacePath,
            workspaceBranch,
            projectPath,
          });
        },
        switchWorkspace: async ({ workspaceId }) => {
          const current = get();
          if (workspaceId === current.activeWorkspaceId) {
            return;
          }
          if (
            !current.workspaces.some(
              (workspace) => workspace.id === workspaceId,
            )
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
          const cachedFiles = getCachedWorkspaceFiles({
            workspacePath,
            workspaceFileCacheByPath: current.workspaceFileCacheByPath,
          });
          const switchMetricToken = ++workspaceSwitchMetricTokenCounter;
          const switchStartedAt = getWorkspaceSwitchMetricNow();
          const cachedWorkspaceState =
            current.workspaceRuntimeCacheById[workspaceId];
          const shouldLoadWorkspaceShellState =
            !cachedWorkspaceState ||
            shouldReloadWorkspaceShellFromPersistence({ cachedWorkspaceState });
          let shellResolvedAt = !shouldLoadWorkspaceShellState
            ? switchStartedAt
            : undefined;
          let setRootResolvedAt = switchStartedAt;
          const loadedWorkspaceShellState = !shouldLoadWorkspaceShellState
            ? null
            : loadWorkspaceShellStateFromPersistence({
                workspaceId,
              }).then((result) => {
                shellResolvedAt = getWorkspaceSwitchMetricNow();
                return result;
              });
          await Promise.all([
            loadedWorkspaceShellState,
            Promise.resolve(
              workspaceFsAdapter.setRoot?.({
                rootPath: workspacePath,
                rootName: current.projectName ?? "project",
                files: cachedFiles,
              }),
            ).then(() => {
              setRootResolvedAt = getWorkspaceSwitchMetricNow();
            }),
          ]);
          const nextWorkspaces = current.workspaces;
          const resolvedWorkspaceShellState = !shouldLoadWorkspaceShellState
            ? null
            : await loadedWorkspaceShellState;
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
          const workspaceIds = nextWorkspaces.map((workspace) => workspace.id);
          const nextRuntimeCacheById = saveActiveWorkspaceRuntimeCache({
            state: current,
          });
          if (preferLoadedWorkspaceState) {
            delete nextRuntimeCacheById[workspaceId];
          }

          set((state) => {
            return {
              workspaces:
                nextWorkspaces.length > 0 ? nextWorkspaces : state.workspaces,
              activeWorkspaceId: workspaceId,
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
          registerWorkspaceSwitchMetric({
            workspaceId,
            metric: {
              token: switchMetricToken,
              startedAt: switchStartedAt,
              cacheHit:
                Boolean(cachedWorkspaceState) && !preferLoadedWorkspaceState,
              ...(shellResolvedAt !== undefined ? { shellResolvedAt } : {}),
              setRootResolvedAt,
            },
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
                taskId:
                  resolvedWorkspaceShellState.activeTaskIdForLatestHydration,
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
        },
        moveWorkspaceInProjectList: ({
          projectPath,
          workspaceId,
          direction,
        }) => {
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
                        (project) =>
                          project.projectPath === normalizedProjectPath,
                      )?.lastOpenedAt ?? new Date().toISOString(),
                    defaultBranch: state.defaultBranch,
                    workspaces: nextWorkspaces,
                    activeWorkspaceId: state.activeWorkspaceId,
                    workspaceBranchById: state.workspaceBranchById,
                    workspacePathById: state.workspacePathById,
                    workspaceDefaultById: state.workspaceDefaultById,
                    projectBasePrompt: resolveProjectBasePrompt({
                      projectPath: normalizedProjectPath,
                      recentProjects: state.recentProjects,
                    }),
                    newWorkspaceInitCommand: resolveProjectWorkspaceInitCommand(
                      {
                        projectPath: normalizedProjectPath,
                        recentProjects: state.recentProjects,
                      },
                    ),
                    newWorkspaceUseRootNodeModulesSymlink:
                      resolveProjectWorkspaceRootNodeModulesSymlinkPreference({
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
        setProjectWorkspaceInitCommand: ({ projectPath, command }) => {
          set((state) => {
            const normalizedProjectPath =
              projectPath?.trim() || state.projectPath?.trim() || "";
            if (!normalizedProjectPath) {
              return state;
            }

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
            });
            const existingProject = currentProjects.find(
              (project) => project.projectPath === normalizedProjectPath,
            );
            if (!existingProject) {
              return state;
            }

            const nextCommand = normalizeProjectWorkspaceInitCommand({
              value: command,
            });
            const currentCommand = normalizeProjectWorkspaceInitCommand({
              value: existingProject.newWorkspaceInitCommand,
            });
            if (currentCommand === nextCommand) {
              return state;
            }

            return {
              recentProjects: upsertRecentProjectState({
                projects: currentProjects,
                project: {
                  ...cloneRecentProjectState(existingProject),
                  newWorkspaceInitCommand: nextCommand,
                },
              }),
            };
          });
        },
        setProjectBasePrompt: ({ projectPath, prompt }) => {
          set((state) => {
            const normalizedProjectPath =
              projectPath?.trim() || state.projectPath?.trim() || "";
            if (!normalizedProjectPath) {
              return state;
            }

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
            });
            const existingProject = currentProjects.find(
              (project) => project.projectPath === normalizedProjectPath,
            );
            if (!existingProject) {
              return state;
            }

            const nextPrompt = normalizeProjectBasePrompt({ value: prompt });
            const currentPrompt = normalizeProjectBasePrompt({
              value: existingProject.projectBasePrompt,
            });
            if (currentPrompt === nextPrompt) {
              return state;
            }

            return {
              recentProjects: upsertRecentProjectState({
                projects: currentProjects,
                project: {
                  ...cloneRecentProjectState(existingProject),
                  projectBasePrompt: nextPrompt,
                },
              }),
            };
          });
        },
        setProjectWorkspaceUseRootNodeModulesSymlink: ({
          projectPath,
          enabled,
        }) => {
          set((state) => {
            const normalizedProjectPath =
              projectPath?.trim() || state.projectPath?.trim() || "";
            if (!normalizedProjectPath) {
              return state;
            }

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
            });
            const existingProject = currentProjects.find(
              (project) => project.projectPath === normalizedProjectPath,
            );
            if (!existingProject) {
              return state;
            }

            const nextEnabled =
              normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
                value: enabled,
              });
            const currentEnabled =
              normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
                value: existingProject.newWorkspaceUseRootNodeModulesSymlink,
              });
            if (currentEnabled === nextEnabled) {
              return state;
            }

            return {
              recentProjects: upsertRecentProjectState({
                projects: currentProjects,
                project: {
                  ...cloneRecentProjectState(existingProject),
                  newWorkspaceUseRootNodeModulesSymlink: nextEnabled,
                },
              }),
            };
          });
        },
        setDarkMode: ({ enabled }) => {
          const nextThemeMode: AppSettings["themeMode"] = enabled
            ? "dark"
            : "light";
          const hadCustomTheme = Boolean(get().settings.customThemeId);
          set((state) => {
            if (
              state.isDarkMode === enabled &&
              state.settings.themeMode === nextThemeMode &&
              !state.settings.customThemeId
            ) {
              return state;
            }
            return {
              isDarkMode: enabled,
              settings: {
                ...state.settings,
                themeMode: nextThemeMode,
                customThemeId: null,
              },
            };
          });
          if (hadCustomTheme) {
            applyCustomTheme({ theme: null });
          }
          applyThemeClass({ enabled });
        },

        installCustomTheme: ({ theme }) => {
          const state = get();
          const existing = state.settings.userCustomThemes;
          if (existing.length >= MAX_USER_THEMES) {
            return {
              ok: false,
              error: `Maximum of ${MAX_USER_THEMES} user themes reached.`,
            };
          }
          const allIds = new Set([
            ...BUILTIN_CUSTOM_THEMES.map((t) => t.id),
            ...existing.map((t) => t.id),
          ]);
          if (allIds.has(theme.id)) {
            return {
              ok: false,
              error: `Theme id "${theme.id}" already exists.`,
            };
          }
          set((s) => ({
            settings: {
              ...s.settings,
              userCustomThemes: [...s.settings.userCustomThemes, theme],
            },
          }));
          return { ok: true };
        },

        removeCustomTheme: ({ themeId }) => {
          const state = get();
          const wasActive = state.settings.customThemeId === themeId;
          set((s) => ({
            settings: {
              ...s.settings,
              userCustomThemes: s.settings.userCustomThemes.filter(
                (t) => t.id !== themeId,
              ),
              customThemeId: wasActive ? null : s.settings.customThemeId,
            },
          }));
          if (wasActive) {
            applyCustomTheme({ theme: null });
          }
        },

        updateSettings: ({ patch }) => {
          const normalizedPatch: Partial<AppSettings> = {
            ...patch,
            ...(patch.appShellMode === undefined
              ? {}
              : {
                  appShellMode: normalizeAppShellMode(patch.appShellMode),
                }),
            ...(patch.sharedSkillsHome === undefined
              ? {}
              : {
                  sharedSkillsHome: normalizeSharedSkillsHomeSetting(
                    patch.sharedSkillsHome,
                  ),
                }),
            ...(patch.appShortcutKeys === undefined
              ? {}
              : {
                  appShortcutKeys: normalizeAppShortcutKeys(
                    patch.appShortcutKeys,
                  ),
                }),
            ...(patch.modelShortcutKeys === undefined
              ? {}
              : {
                  modelShortcutKeys: normalizeModelShortcutKeys(
                    patch.modelShortcutKeys,
                  ),
                }),
            ...(patch.reasoningExpansionMode === undefined
              ? {}
              : {
                  reasoningExpansionMode: normalizeReasoningExpansionMode(
                    patch.reasoningExpansionMode,
                  ),
                }),
            ...(patch.providerTimeoutMs === undefined
              ? {}
              : {
                  providerTimeoutMs: normalizeProviderTimeoutMs({
                    value: patch.providerTimeoutMs,
                  }),
                }),
            ...(patch.claudeTaskBudgetTokens === undefined
              ? {}
              : {
                  claudeTaskBudgetTokens: normalizeClaudeTaskBudgetTokens({
                    value: patch.claudeTaskBudgetTokens,
                  }),
                }),
            ...(patch.claudeSettingSources === undefined
              ? {}
              : {
                  claudeSettingSources: normalizeClaudeSettingSources({
                    value: patch.claudeSettingSources,
                  }),
                }),
            ...(patch.staveAutoRoleRuntimeOverrides === undefined
              ? {}
              : {
                  staveAutoRoleRuntimeOverrides:
                    normalizeStaveAutoRoleRuntimeOverrides({
                      value: patch.staveAutoRoleRuntimeOverrides,
                    }),
                }),
            ...(patch.taskPresets === undefined
              ? {}
              : {
                  taskPresets: normalizePersistedTaskPresets(patch.taskPresets),
                }),
            ...(patch.notificationSoundVolume === undefined
              ? {}
              : {
                  notificationSoundVolume: normalizeNotificationSoundVolume(
                    patch.notificationSoundVolume,
                  ),
                }),
            ...(patch.notificationSoundPreset === undefined
              ? {}
              : {
                  notificationSoundPreset: normalizeNotificationSoundPreset(
                    patch.notificationSoundPreset,
                  ),
                }),
            ...(patch.notificationSoundMode === undefined
              ? {}
              : {
                  notificationSoundMode: normalizeNotificationSoundMode(
                    patch.notificationSoundMode,
                  ),
                }),
          };

          // ── resolve custom-theme side-effects ───────────────────────
          // When a custom theme is selected, automatically align themeMode
          // to the theme's base mode so the correct CSS selector activates.
          const customThemeIdChanged =
            normalizedPatch.customThemeId !== undefined;
          if (customThemeIdChanged && normalizedPatch.customThemeId) {
            const userThemes = get().settings.userCustomThemes;
            const theme = findCustomThemeById({
              themeId: normalizedPatch.customThemeId,
              userThemes,
            });
            if (theme && normalizedPatch.themeMode === undefined) {
              normalizedPatch.themeMode = theme.baseMode;
            }
          }

          const nextThemeMode = normalizedPatch.themeMode;
          const nextIsDark = nextThemeMode
            ? resolveDarkModeForTheme({ themeMode: nextThemeMode })
            : null;

          set((state) => {
            const nextSettings = { ...state.settings, ...normalizedPatch };
            const settingsChanged = Object.keys(normalizedPatch).some(
              (key) =>
                nextSettings[key as keyof AppSettings] !==
                state.settings[key as keyof AppSettings],
            );
            if (
              !settingsChanged &&
              (nextIsDark === null || nextIsDark === state.isDarkMode)
            ) {
              return state;
            }
            const nextState: Partial<AppState> = {
              settings: nextSettings,
            };
            if (nextIsDark !== null) {
              nextState.isDarkMode = nextIsDark;
            }
            return {
              ...nextState,
            };
          });

          // ── apply custom theme ────────────────────────────────────────
          if (customThemeIdChanged) {
            const s = get().settings;
            const theme = s.customThemeId
              ? findCustomThemeById({
                  themeId: s.customThemeId,
                  userThemes: s.userCustomThemes,
                })
              : null;
            applyCustomTheme({ theme });
          }

          if (normalizedPatch.themeOverrides) {
            applyThemeOverrides({
              themeOverrides: normalizedPatch.themeOverrides,
            });
          }
          if (nextIsDark !== null) {
            applyThemeClass({ enabled: nextIsDark });
          }
          if (
            normalizedPatch.messageFontFamily !== undefined ||
            normalizedPatch.messageMonoFontFamily !== undefined ||
            normalizedPatch.messageKoreanFontFamily !== undefined
          ) {
            const s = get().settings;
            applyFontOverrides({
              messageFontFamily: s.messageFontFamily,
              messageMonoFontFamily: s.messageMonoFontFamily,
              messageKoreanFontFamily: s.messageKoreanFontFamily,
            });
          }
        },
        setPersistenceBootstrapStatus: ({ phase, message }) => {
          set(() => ({
            persistenceBootstrapPhase: phase,
            persistenceBootstrapMessage: message ?? "",
          }));
        },
        refreshProviderCommandCatalog: () => {
          set((state) => ({
            providerCommandCatalogRefreshNonce:
              state.providerCommandCatalogRefreshNonce + 1,
          }));
        },
        notifyWorkspacePlansChanged: () => {
          set((state) => ({
            workspacePlansRefreshNonce: state.workspacePlansRefreshNonce + 1,
          }));
        },
        selectTask: ({ taskId }) => {
          const stateBefore = get();
          const targetTask =
            stateBefore.tasks.find((task) => task.id === taskId) ?? null;
          if (!targetTask || isTaskArchived(targetTask)) {
            return;
          }
          if (
            stateBefore.activeTaskId === taskId &&
            stateBefore.activeSurface.kind === "task" &&
            stateBefore.activeSurface.taskId === taskId
          ) {
            return;
          }
          const workspaceId =
            stateBefore.taskWorkspaceIdById[taskId] ??
            stateBefore.activeWorkspaceId;
          const shouldLoadMessages =
            !(taskId in stateBefore.messagesByTask) &&
            (stateBefore.messageCountByTask[taskId] ?? 0) > 0;
          set((state) => ({
            activeTaskId: taskId,
            activeSurface: { kind: "task", taskId },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          }));
          if (workspaceId && shouldLoadMessages) {
            void loadTaskMessagesIntoSession({
              workspaceId,
              taskId,
              mode: "latest",
            });
          }
        },
        loadTaskMessages: async ({ taskId, mode = "latest" }) => {
          const state = get();
          const workspaceId =
            state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
          if (!workspaceId || !taskId) {
            return;
          }
          await loadTaskMessagesIntoSession({
            workspaceId,
            taskId,
            mode,
          });
        },
        clearTaskSelection: () =>
          set((state) => {
            if (!state.activeTaskId) {
              return state;
            }
            return {
              activeTaskId: "",
              activeSurface:
                state.activeSurface.kind === "task"
                  ? { kind: "task", taskId: "" }
                  : state.activeSurface,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          }),
        updatePromptDraft: ({ taskId, patch }) => {
          set((state) => {
            const workspaceId =
              state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
            const cachedSession =
              workspaceId && workspaceId !== state.activeWorkspaceId
                ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
                : null;
            const promptDraftByTask =
              cachedSession?.promptDraftByTask ?? state.promptDraftByTask;
            const currentDraft =
              promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT;
            const nextDraft = normalizePromptDraftForStorage({
              text: currentDraft.text,
              attachedFilePaths: currentDraft.attachedFilePaths,
              attachments: currentDraft.attachments,
              runtimeOverrides: currentDraft.runtimeOverrides,
              queuedNextTurn: currentDraft.queuedNextTurn,
              ...patch,
            });
            const textChanged = nextDraft.text !== currentDraft.text;
            const attachedFilePathsChanged =
              nextDraft.attachedFilePaths.length !==
                currentDraft.attachedFilePaths.length ||
              nextDraft.attachedFilePaths.some(
                (p, i) => p !== currentDraft.attachedFilePaths[i],
              );
            const attachmentsChanged =
              nextDraft.attachments.length !==
                currentDraft.attachments.length ||
              nextDraft.attachments.some(
                (a, i) => a !== currentDraft.attachments[i],
              );
            const runtimeOverridesChanged =
              !arePromptDraftRuntimeOverridesEqual(
                nextDraft.runtimeOverrides,
                currentDraft.runtimeOverrides,
              );
            const queuedNextTurnChanged = !arePromptDraftQueuedNextTurnEqual(
              nextDraft.queuedNextTurn,
              currentDraft.queuedNextTurn,
            );
            if (
              !textChanged &&
              !attachedFilePathsChanged &&
              !attachmentsChanged &&
              !runtimeOverridesChanged &&
              !queuedNextTurnChanged
            ) {
              return state;
            }
            if (cachedSession) {
              return {
                workspaceRuntimeCacheById: {
                  ...state.workspaceRuntimeCacheById,
                  [workspaceId]: {
                    ...cachedSession,
                    promptDraftByTask: {
                      ...cachedSession.promptDraftByTask,
                      [taskId]: nextDraft,
                    },
                  },
                },
              };
            }
            const onlyTextChanged =
              textChanged &&
              !attachedFilePathsChanged &&
              !attachmentsChanged &&
              !runtimeOverridesChanged &&
              !queuedNextTurnChanged;
            return {
              promptDraftByTask: {
                ...state.promptDraftByTask,
                [taskId]: nextDraft,
              },
              ...(onlyTextChanged
                ? {
                    promptDraftPersistenceVersion:
                      incrementPromptDraftPersistenceVersion(state),
                  }
                : {
                    workspaceSnapshotVersion:
                      incrementWorkspaceSnapshotVersion(state),
                  }),
            };
          });
        },
        clearTaskProviderSession: ({ taskId, providerId }) => {
          set((state) => {
            const currentSession = state.providerSessionByTask[taskId];
            const existingSessionId = currentSession?.[providerId]?.trim();
            if (!existingSessionId) {
              return state;
            }

            const nextTaskSession: TaskProviderSessionState = {
              ...currentSession,
            };
            delete nextTaskSession[providerId];

            const activeProvider = state.tasks.find(
              (task) => task.id === taskId,
            )?.provider;
            const nextNativeSessionReady =
              activeProvider !== undefined &&
              activeProvider !== "stave" &&
              Boolean(nextTaskSession[activeProvider]?.trim());

            return {
              providerSessionByTask: {
                ...state.providerSessionByTask,
                [taskId]: nextTaskSession,
              },
              nativeSessionReadyByTask: {
                ...state.nativeSessionReadyByTask,
                [taskId]: nextNativeSessionReady,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        updateWorkspaceInformation: ({ updater }) => {
          set((state) => {
            const nextWorkspaceInformation = updater(
              state.workspaceInformation,
            );
            if (nextWorkspaceInformation === state.workspaceInformation) {
              return state;
            }
            return {
              workspaceInformation: nextWorkspaceInformation,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        applyExternalWorkspaceInformationUpdate: ({
          workspaceId,
          workspaceInformation,
        }) => {
          set((state) => {
            const cachedSession = state.workspaceRuntimeCacheById[workspaceId];
            const nextRuntimeCacheById = cachedSession
              ? {
                  ...state.workspaceRuntimeCacheById,
                  [workspaceId]: {
                    ...cachedSession,
                    workspaceInformation,
                  },
                }
              : state.workspaceRuntimeCacheById;

            if (workspaceId === state.activeWorkspaceId) {
              return {
                workspaceInformation,
                workspaceRuntimeCacheById: nextRuntimeCacheById,
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            }

            if (cachedSession) {
              return {
                workspaceRuntimeCacheById: nextRuntimeCacheById,
              };
            }

            return state;
          });
        },
        clearPromptDraft: ({ taskId }) => {
          set((state) => {
            const workspaceId =
              state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
            const cachedSession =
              workspaceId && workspaceId !== state.activeWorkspaceId
                ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
                : null;
            const promptDraftByTask =
              cachedSession?.promptDraftByTask ?? state.promptDraftByTask;
            const currentDraft =
              promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT;
            if (
              !hasPromptDraftPayload(currentDraft) &&
              !currentDraft.queuedNextTurn
            ) {
              return state;
            }
            const nextDraft = buildClearedPromptDraft(currentDraft);
            if (cachedSession) {
              return {
                workspaceRuntimeCacheById: {
                  ...state.workspaceRuntimeCacheById,
                  [workspaceId]: {
                    ...cachedSession,
                    promptDraftByTask: {
                      ...cachedSession.promptDraftByTask,
                      [taskId]: nextDraft,
                    },
                  },
                },
              };
            }
            return {
              promptDraftByTask: {
                ...state.promptDraftByTask,
                [taskId]: nextDraft,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        createTask: ({ title }) => {
          const trimmed = (title ?? "").trim();
          const stateBefore = get();
          const workspaceId = stateBefore.activeWorkspaceId;
          if (
            !workspaceId ||
            !stateBefore.workspaces.some(
              (workspace) => workspace.id === workspaceId,
            )
          ) {
            return;
          }
          const nextTask: Task = {
            id: crypto.randomUUID(),
            title: trimmed.length > 0 ? trimmed : "New Task",
            provider: stateBefore.draftProvider,
            updatedAt: buildRecentTimestamp(),
            unread: false,
            archivedAt: null,
            controlMode: "interactive",
            controlOwner: "stave",
          };
          set((state) => {
            return {
              tasks: [nextTask, ...state.tasks],
              activeTaskId: nextTask.id,
              activeSurface: { kind: "task", taskId: nextTask.id },
              messagesByTask: {
                ...state.messagesByTask,
                [nextTask.id]: [],
              },
              messageCountByTask: {
                ...state.messageCountByTask,
                [nextTask.id]: 0,
              },
              nativeSessionReadyByTask: {
                ...state.nativeSessionReadyByTask,
                [nextTask.id]: false,
              },
              providerSessionByTask: {
                ...state.providerSessionByTask,
                [nextTask.id]: {},
              },
              taskWorkspaceIdById: {
                ...state.taskWorkspaceIdById,
                [nextTask.id]: workspaceId,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          runScriptHookInBackground({
            workspaceId,
            trigger: "task.created",
            taskId: nextTask.id,
            taskTitle: nextTask.title,
          });
        },
        renameTask: ({ taskId, title }) => {
          const nextTitle = title.trim();
          if (!nextTitle) {
            return;
          }
          set((state) => {
            if (isManagedTaskReadOnly({ state, taskId })) {
              return state;
            }
            return {
              tasks: state.tasks.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      title: nextTitle,
                      updatedAt: buildRecentTimestamp(),
                    }
                  : task,
              ),
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        restoreTask: ({ taskId }) => {
          const stateBefore = get();
          const workspaceId =
            stateBefore.taskWorkspaceIdById[taskId] ??
            stateBefore.activeWorkspaceId;
          const shouldLoadMessages =
            !(taskId in stateBefore.messagesByTask) &&
            (stateBefore.messageCountByTask[taskId] ?? 0) > 0;
          set((state) => {
            const targetTask = state.tasks.find((task) => task.id === taskId);
            if (!targetTask || !isTaskArchived(targetTask)) {
              return {};
            }
            return {
              tasks: state.tasks.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      archivedAt: null,
                      updatedAt: buildRecentTimestamp(),
                    }
                  : task,
              ),
              activeTaskId: taskId,
              activeSurface: { kind: "task", taskId },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          if (workspaceId && shouldLoadMessages) {
            void loadTaskMessagesIntoSession({
              workspaceId,
              taskId,
              mode: "latest",
            });
          }
        },
        duplicateTask: async ({ taskId }) => {
          const stateBefore = get();
          const sourceTask = stateBefore.tasks.find(
            (task) => task.id === taskId,
          );
          if (!sourceTask) {
            return;
          }
          const workspaceId =
            stateBefore.taskWorkspaceIdById[taskId] ??
            stateBefore.activeWorkspaceId;
          const sourceMessages = (() => {
            const loadedMessages = stateBefore.messagesByTask[taskId];
            const totalCount =
              stateBefore.messageCountByTask[taskId] ??
              loadedMessages?.length ??
              0;
            if (loadedMessages && loadedMessages.length >= totalCount) {
              return loadedMessages;
            }
            return null;
          })();
          const completeSourceMessages =
            sourceMessages ??
            (await loadWorkspaceSnapshot({ workspaceId }))?.messagesByTask[
              taskId
            ] ??
            [];

          set((state) => {
            const nextTaskId = crypto.randomUUID();
            const duplicatedMessages = completeSourceMessages.map(
              (message) => ({
                ...message,
                id: crypto.randomUUID(),
                isStreaming: false,
              }),
            );
            const duplicatedTask: Task = {
              ...sourceTask,
              id: nextTaskId,
              title: `${sourceTask.title} (copy)`,
              updatedAt: buildRecentTimestamp(),
              unread: false,
              archivedAt: null,
              controlMode: "interactive",
              controlOwner: "stave",
            };
            return {
              tasks: [duplicatedTask, ...state.tasks],
              activeTaskId: duplicatedTask.id,
              taskCheckpointById: {
                ...state.taskCheckpointById,
                [duplicatedTask.id]: state.taskCheckpointById[taskId] ?? "",
              },
              messagesByTask: {
                ...state.messagesByTask,
                [duplicatedTask.id]: duplicatedMessages,
              },
              messageCountByTask: {
                ...state.messageCountByTask,
                [duplicatedTask.id]: duplicatedMessages.length,
              },
              nativeSessionReadyByTask: {
                ...state.nativeSessionReadyByTask,
                [duplicatedTask.id]: false,
              },
              providerSessionByTask: {
                ...state.providerSessionByTask,
                [duplicatedTask.id]: {},
              },
              taskWorkspaceIdById: {
                ...state.taskWorkspaceIdById,
                [duplicatedTask.id]: workspaceId,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        reorderTasks: ({ activeTaskId, overTaskId, filter }) => {
          set((state) => {
            const nextTasks = reorderTasksWithinFilter({
              tasks: state.tasks,
              activeTaskId,
              overTaskId,
              filter,
            });
            if (nextTasks === state.tasks) {
              return {};
            }
            return {
              tasks: nextTasks,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
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
            ? result.stdout.trim() ||
              "No file changes for this task checkpoint."
            : result.stderr.trim() || "Failed to load task changes.";
          const output =
            result.ok &&
            rawOutput !== "No file changes for this task checkpoint."
              ? `### Task Changes\n\n\`\`\`diff\n${rawOutput}\n\`\`\``
              : result.ok
                ? rawOutput
                : `> **Failed to load task changes.** ${rawOutput}`;

          set((nextState) => {
            const current = nextState.messagesByTask[taskId] ?? [];
            const message: ChatMessage = {
              id: buildMessageId({ taskId, count: current.length }),
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
                [taskId]: [...current, message],
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

          const rawOutput = rollbackResult.ok
            ? `Rollback complete to checkpoint ${checkpoint}.`
            : rollbackResult.stderr.trim() || "Rollback failed.";
          const output = rollbackResult.ok
            ? `Rollback complete to checkpoint \`${checkpoint}\`.`
            : `> **Rollback failed.** ${rollbackResult.stderr.trim() || "Unknown error."}`;

          const files = await workspaceFsAdapter.listFiles();
          set((nextState) => {
            const current = nextState.messagesByTask[taskId] ?? [];
            const message: ChatMessage = {
              id: buildMessageId({ taskId, count: current.length }),
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
              messagesByTask: {
                ...nextState.messagesByTask,
                [taskId]: [...current, message],
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
          }) => {
            set((nextState) => {
              const current = nextState.messagesByTask[taskId] ?? [];
              const message: ChatMessage = {
                id: buildMessageId({ taskId, count: current.length }),
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
                messagesByTask: {
                  ...nextState.messagesByTask,
                  [taskId]: [...current, message],
                },
                messageCountByTask: {
                  ...nextState.messageCountByTask,
                  [taskId]: Math.max(
                    (nextState.messageCountByTask[taskId] ?? current.length) +
                      1,
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
          const rawOutput = restoreResult.ok
            ? `Restore complete to ${compactBoundaryLabel} checkpoint ${resolvedGitRef}.`
            : restoreResult.stderr.trim() || "Restore failed.";
          const output = restoreResult.ok
            ? `Restore complete to ${compactBoundaryLabel} checkpoint \`${resolvedGitRef}\`.`
            : `> **Restore failed.** ${restoreResult.stderr.trim() || "Unknown error."}`;
          const files = await workspaceFsAdapter.listFiles();
          appendResultMessage({
            rawOutput,
            output,
            files,
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
            isManagedTaskReadOnly({ state: stateBefore, taskId })
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
              tab.linkedTaskId === taskId
                ? { ...tab, linkedTaskId: null }
                : tab,
            );
            const nextCliSessionTabs = state.cliSessionTabs.map((tab) =>
              tab.linkedTaskId === taskId
                ? { ...tab, linkedTaskId: null }
                : tab,
            );
            const nextActiveTaskId = shouldSwitch
              ? fallbackTaskId
              : state.activeTaskId;
            return {
              tasks: nextTasks,
              activeTaskId: nextActiveTaskId,
              activeSurface:
                state.activeSurface.kind === "task" &&
                state.activeSurface.taskId === taskId
                  ? { kind: "task", taskId: nextActiveTaskId }
                  : state.activeSurface,
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
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          if (activeTurnId) {
            const abortTurn = window.api?.provider?.abortTurn;
            if (abortTurn) {
              void abortTurn({ turnId: activeTurnId });
            }
          }
          void window.api?.provider?.cleanupTask?.({ taskId });
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
            if (isManagedTaskReadOnly({ state, taskId })) {
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
                // stave has no native conversation ID of its own; treat as not ready
                [taskId]:
                  provider !== "stave" &&
                  Boolean(
                    (
                      state.providerSessionByTask[taskId] as Record<
                        string,
                        string | undefined
                      >
                    )?.[provider]?.trim(),
                  ),
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          void window.api?.provider?.cleanupTask?.({ taskId });
        },
        createTerminalTab: (args) => {
          const state = get();
          const workspaceId = state.activeWorkspaceId;
          const workspacePath =
            state.workspacePathById[workspaceId] ?? state.projectPath ?? "";
          const cwd = args?.cwd?.trim() || workspacePath;
          if (!workspaceId || !cwd) {
            return null;
          }

          const linkedTask =
            args?.linkedTaskId === undefined
              ? findActiveTerminalLinkableTask(state)
              : args.linkedTaskId
                ? findTaskById(state, args.linkedTaskId)
                : null;
          const nextTab = createTerminalTabRecord({
            cwd,
            linkedTaskId:
              linkedTask && !isTaskArchived(linkedTask) ? linkedTask.id : null,
            linkedTaskTitle:
              linkedTask && !isTaskArchived(linkedTask)
                ? linkedTask.title
                : null,
            title: args?.title,
            existingTitles: state.terminalTabs.map((tab) => tab.title),
          });

          set((current) => ({
            terminalTabs: [...current.terminalTabs, nextTab],
            activeTerminalTabId: nextTab.id,
            layout: {
              ...current.layout,
              terminalDocked: true,
            },
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(current),
          }));

          return nextTab.id;
        },
        createCliSessionTab: ({ provider, contextMode }) => {
          const state = get();
          const workspaceId = state.activeWorkspaceId;
          const workspacePath =
            state.workspacePathById[workspaceId] ?? state.projectPath ?? "";
          if (!workspaceId || !workspacePath) {
            return null;
          }

          const linkedTask =
            contextMode === "active-task"
              ? findActiveTerminalLinkableTask(state)
              : null;
          if (contextMode === "active-task" && !linkedTask) {
            return null;
          }

          const nextTab = createCliSessionTabRecord({
            provider,
            contextMode,
            cwd: workspacePath,
            linkedTaskId: linkedTask?.id ?? null,
            linkedTaskTitle: linkedTask?.title ?? null,
            handoffSummary: linkedTask
              ? buildCliSessionHandoffSummary({
                  task: linkedTask,
                  messages: state.messagesByTask[linkedTask.id] ?? [],
                  workspacePath,
                })
              : "",
            existingTitles: state.cliSessionTabs.map((tab) => tab.title),
          });

          set((current) => ({
            cliSessionTabs: [...current.cliSessionTabs, nextTab],
            activeCliSessionTabId: nextTab.id,
            activeSurface: { kind: "cli-session", cliSessionTabId: nextTab.id },
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(current),
          }));

          return nextTab.id;
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
            if (preset.provider === "stave") {
              // `stave` meta-provider has no native CLI binary.
              return;
            }
            const cliProvider: Exclude<ProviderId, "stave"> = preset.provider;
            get().createCliSessionTab({
              provider: cliProvider,
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
            } else if (preset.provider === "codex") {
              settingsPatch.modelCodex = preset.model;
            } else if (preset.provider === "stave") {
              settingsPatch.modelStave = preset.model;
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
        setActiveCliSessionTab: ({ tabId }) => {
          set((state) => {
            if (tabId === null) {
              if (
                state.activeCliSessionTabId === null &&
                state.activeSurface.kind === "task"
              ) {
                return state;
              }
              return {
                activeCliSessionTabId: null,
                activeSurface: { kind: "task", taskId: state.activeTaskId },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            }
            if (!findCliSessionTabById(state, tabId)) {
              return state;
            }
            if (
              state.activeCliSessionTabId === tabId &&
              state.activeSurface.kind === "cli-session" &&
              state.activeSurface.cliSessionTabId === tabId
            ) {
              return state;
            }
            return {
              activeCliSessionTabId: tabId,
              activeSurface: { kind: "cli-session", cliSessionTabId: tabId },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        setCliSessionTabNativeSession: ({ tabId, nativeSessionId }) => {
          set((state) => {
            const tab = findCliSessionTabById(state, tabId);
            const normalizedNativeSessionId =
              nativeSessionId?.trim() || undefined;
            if (!tab || tab.nativeSessionId === normalizedNativeSessionId) {
              return state;
            }
            return {
              cliSessionTabs: state.cliSessionTabs.map((item) =>
                item.id === tabId
                  ? { ...item, nativeSessionId: normalizedNativeSessionId }
                  : item,
              ),
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        renameCliSessionTab: ({ tabId, title }) => {
          const normalizedTitle = title.trim();
          if (!normalizedTitle) {
            return;
          }
          set((state) => {
            const tab = findCliSessionTabById(state, tabId);
            if (!tab || tab.title === normalizedTitle) {
              return state;
            }
            return {
              cliSessionTabs: state.cliSessionTabs.map((item) =>
                item.id === tabId ? { ...item, title: normalizedTitle } : item,
              ),
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        reorderCliSessionTabs: ({ fromTabId, toTabId }) => {
          set((state) => {
            const nextTabs = moveItemById({
              items: state.cliSessionTabs,
              fromId: fromTabId,
              toId: toTabId,
            });
            if (nextTabs === state.cliSessionTabs) {
              return state;
            }
            return {
              cliSessionTabs: nextTabs,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        closeCliSessionTab: ({ tabId }) => {
          set((state) => {
            const closingIndex = state.cliSessionTabs.findIndex(
              (tab) => tab.id === tabId,
            );
            if (closingIndex < 0) {
              return state;
            }
            const nextTabs = state.cliSessionTabs.filter(
              (tab) => tab.id !== tabId,
            );
            const fallbackTab =
              nextTabs[
                Math.min(closingIndex, Math.max(nextTabs.length - 1, 0))
              ] ?? null;
            const nextActiveCliSessionTabId =
              state.activeCliSessionTabId === tabId
                ? (fallbackTab?.id ?? null)
                : state.activeCliSessionTabId;
            return {
              cliSessionTabs: nextTabs,
              activeCliSessionTabId: nextActiveCliSessionTabId,
              activeSurface:
                state.activeSurface.kind === "cli-session" &&
                state.activeSurface.cliSessionTabId === tabId
                  ? fallbackTab
                    ? { kind: "cli-session", cliSessionTabId: fallbackTab.id }
                    : { kind: "task", taskId: state.activeTaskId }
                  : state.activeSurface,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        setActiveTerminalTab: ({ tabId, openDock }) => {
          set((state) => {
            if (tabId !== null && !findTerminalTabById(state, tabId)) {
              return state;
            }
            const shouldUpdateDock = openDock && !state.layout.terminalDocked;
            if (state.activeTerminalTabId === tabId && !shouldUpdateDock) {
              return state;
            }
            return {
              activeTerminalTabId: tabId,
              ...(shouldUpdateDock
                ? {
                    layout: {
                      ...state.layout,
                      terminalDocked: true,
                    },
                  }
                : {}),
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        renameTerminalTab: ({ tabId, title }) => {
          const normalizedTitle = title.trim();
          if (!normalizedTitle) {
            return;
          }
          set((state) => {
            const tab = findTerminalTabById(state, tabId);
            if (!tab || tab.title === normalizedTitle) {
              return state;
            }
            return {
              terminalTabs: state.terminalTabs.map((item) =>
                item.id === tabId ? { ...item, title: normalizedTitle } : item,
              ),
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        reorderTerminalTabs: ({ fromTabId, toTabId }) => {
          set((state) => {
            const nextTabs = moveItemById({
              items: state.terminalTabs,
              fromId: fromTabId,
              toId: toTabId,
            });
            if (nextTabs === state.terminalTabs) {
              return state;
            }
            return {
              terminalTabs: nextTabs,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        closeTerminalTab: ({ tabId }) => {
          set((state) => {
            const closingIndex = state.terminalTabs.findIndex(
              (tab) => tab.id === tabId,
            );
            if (closingIndex < 0) {
              return state;
            }
            const nextTabs = state.terminalTabs.filter(
              (tab) => tab.id !== tabId,
            );
            const fallbackTab =
              nextTabs[
                Math.min(closingIndex, Math.max(nextTabs.length - 1, 0))
              ] ?? null;
            const nextActiveTerminalTabId =
              state.activeTerminalTabId === tabId
                ? (fallbackTab?.id ?? null)
                : state.activeTerminalTabId;
            return {
              terminalTabs: nextTabs,
              activeTerminalTabId: nextActiveTerminalTabId,
              layout:
                nextTabs.length === 0
                  ? {
                      ...state.layout,
                      terminalDocked: false,
                    }
                  : state.layout,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        setWorkspaceBranch: ({ workspaceId, branch }) =>
          set((state) => {
            if (
              !state.workspaces.some(
                (workspace) => workspace.id === workspaceId,
              )
            ) {
              return state;
            }
            return {
              workspaceBranchById: {
                ...state.workspaceBranchById,
                [workspaceId]: branch,
              },
            };
          }),
        fetchWorkspacePrStatus: async ({ workspaceId }) => {
          const state = get();
          if (
            !state.workspaces.some((workspace) => workspace.id === workspaceId)
          )
            return;
          const cwd = state.workspacePathById[workspaceId];
          if (!cwd) return;
          if (state.workspaceDefaultById[workspaceId]) return;

          const getPrStatus = window.api?.sourceControl?.getPrStatus;
          if (!getPrStatus) return;

          try {
            const result = await getPrStatus({ cwd });
            if (!result.ok) return;

            const pr = result.pr as GitHubPrPayload | null;
            const derived = pr ? derivePrStatus(pr) : ("no_pr" as const);
            const info: WorkspacePrInfo = {
              pr,
              derived,
              lastFetched: Date.now(),
            };

            set((s) => ({
              workspacePrInfoById: {
                ...s.workspacePrInfoById,
                [workspaceId]: info,
              },
            }));
          } catch {
            // Silently ignore – PR status is best-effort.
          }
        },
        fetchAllWorkspacePrStatuses: async () => {
          const state = get();
          const getPrStatus = window.api?.sourceControl?.getPrStatus;
          if (!getPrStatus) return;

          const nonDefaultIds = state.workspaces
            .filter((ws) => !state.workspaceDefaultById[ws.id])
            .map((ws) => ws.id);

          // Fetch sequentially to avoid hammering GitHub API.
          for (const wsId of nonDefaultIds) {
            const cwd = state.workspacePathById[wsId];
            if (!cwd) continue;

            try {
              const result = await getPrStatus({ cwd });
              if (!result.ok) continue;

              const pr = result.pr as GitHubPrPayload | null;
              const derived = pr ? derivePrStatus(pr) : ("no_pr" as const);
              const info: WorkspacePrInfo = {
                pr,
                derived,
                lastFetched: Date.now(),
              };

              set((s) => ({
                workspacePrInfoById: {
                  ...s.workspacePrInfoById,
                  [wsId]: info,
                },
              }));
            } catch {
              // ignore
            }
          }
        },
        setLayout: ({ patch }) =>
          set((state) => {
            const nextLayout = mergeLayoutPatch({
              layout: state.layout,
              patch,
            });
            if (!nextLayout) {
              return state;
            }
            return {
              layout: nextLayout,
              ...(nextLayout.terminalDocked !== state.layout.terminalDocked
                ? {
                    workspaceSnapshotVersion:
                      incrementWorkspaceSnapshotVersion(state),
                  }
                : {}),
            };
          }),
        toggleEditorDiffMode: () =>
          set((state) => {
            const nextEditorDiffMode = !state.layout.editorDiffMode;
            return {
              layout: {
                ...state.layout,
                editorDiffMode: nextEditorDiffMode,
                // Diff and markdown preview are mutually exclusive views.
                editorMarkdownPreviewMode: nextEditorDiffMode
                  ? false
                  : state.layout.editorMarkdownPreviewMode,
              },
            };
          }),
        toggleEditorMarkdownPreviewMode: () =>
          set((state) => {
            const activeTab = state.editorTabs.find(
              (tab) => tab.id === state.activeEditorTabId,
            );
            const activeTabIsMarkdown = Boolean(
              activeTab &&
              activeTab.kind !== "image" &&
              activeTab.language === "markdown",
            );
            if (!activeTabIsMarkdown) {
              return {};
            }
            const nextPreviewMode = !state.layout.editorMarkdownPreviewMode;
            return {
              layout: {
                ...state.layout,
                editorMarkdownPreviewMode: nextPreviewMode,
                // Diff and markdown preview are mutually exclusive views.
                editorDiffMode: nextPreviewMode
                  ? false
                  : state.layout.editorDiffMode,
              },
            };
          }),
        openWorkspacePicker: async () => {
          const root = await workspaceFsAdapter.pickRoot();
          if (!root) {
            return;
          }
          set((state) => ({
            projectName: root.rootName,
            projectFiles: root.files,
            layout: {
              ...state.layout,
              editorVisible: true,
            },
          }));
        },
        refreshProjectFiles: async () => {
          const files = await workspaceFsAdapter.listFiles();
          const state = get();
          const workspacePath = resolveWorkspacePathForId({
            activeWorkspaceId: state.activeWorkspaceId,
            workspacePathById: state.workspacePathById,
            workspaceDefaultById: state.workspaceDefaultById,
            projectPath: state.projectPath,
          });
          set((current) => {
            const nextWorkspaceFileCacheByPath = rememberCachedWorkspaceFiles({
              workspaceFileCacheByPath: current.workspaceFileCacheByPath,
              workspacePath,
              files,
            });
            if (
              areStringArraysEqual(current.projectFiles, files) &&
              nextWorkspaceFileCacheByPath === current.workspaceFileCacheByPath
            ) {
              return current;
            }
            return {
              projectFiles: files,
              workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
            };
          });
        },
        refreshProviderAvailability: async () => {
          const checkAvailability = window.api?.provider?.checkAvailability;
          if (!checkAvailability) {
            return;
          }
          const claudeBinaryPath = get().settings.claudeBinaryPath || undefined;
          const codexBinaryPath = get().settings.codexBinaryPath || undefined;
          const availabilityEntries = await Promise.all(
            listProviderIds().map(async (providerId) => {
              const result = await checkAvailability({
                providerId,
                runtimeOptions: {
                  ...(claudeBinaryPath ? { claudeBinaryPath } : {}),
                  ...(codexBinaryPath ? { codexBinaryPath } : {}),
                },
              });
              return [providerId, result.ok && result.available] as const;
            }),
          );

          const providerAvailability = createDefaultProviderAvailability();
          availabilityEntries.forEach(([providerId, available]) => {
            providerAvailability[providerId] = available;
          });

          set(() => ({
            providerAvailability,
          }));
        },
        refreshSkillCatalog: async (args = {}) => {
          const getCatalog = window.api?.skills?.getCatalog;
          const fallbackWorkspacePath =
            get().workspacePathById[get().activeWorkspaceId] ??
            get().projectPath ??
            null;
          const workspacePath =
            args.workspacePath === undefined
              ? fallbackWorkspacePath
              : args.workspacePath;
          const sharedSkillsHome =
            normalizeSharedSkillsHomeSetting(get().settings.sharedSkillsHome) ||
            null;

          if (!getCatalog) {
            set(() => ({
              skillCatalog: {
                status: "error",
                workspacePath,
                sharedSkillsHome,
                fetchedAt: new Date().toISOString(),
                skills: [],
                roots: [],
                detail: "Skill catalog API is unavailable in this build.",
              },
            }));
            return;
          }

          set((state) => ({
            skillCatalog: {
              ...state.skillCatalog,
              status: "loading",
              workspacePath,
              sharedSkillsHome,
              detail: "Loading skill catalog...",
            },
          }));

          try {
            const result = await getCatalog({
              ...(workspacePath ? { workspacePath } : {}),
              ...(sharedSkillsHome ? { sharedSkillsHome } : {}),
            });
            // Use the frontend-normalized `workspacePath` and `sharedSkillsHome`
            // rather than the backend-expanded values so that the comparison keys
            // in component useEffects stay consistent (the backend expands `~`
            // and resolves symlinks, but the component compares against the raw
            // settings string, which would otherwise never match and cause an
            // infinite re-fetch loop).
            set(() => ({
              skillCatalog: {
                status: result.ok ? "ready" : "error",
                workspacePath,
                sharedSkillsHome,
                fetchedAt: result.catalog.fetchedAt,
                skills: result.catalog.skills,
                roots: result.catalog.roots,
                detail: result.ok
                  ? result.catalog.detail
                  : result.message?.trim() || result.catalog.detail,
              },
            }));
          } catch (error) {
            set(() => ({
              skillCatalog: {
                status: "error",
                workspacePath,
                sharedSkillsHome,
                fetchedAt: new Date().toISOString(),
                skills: [],
                roots: [],
                detail: String(error),
              },
            }));
          }
        },
        takeOverTask: ({ taskId }) => {
          set((state) => {
            const task = findTaskById(state, taskId);
            if (
              !task ||
              !canTakeOverTask({
                task,
                activeTurnId: state.activeTurnIdsByTask[taskId],
              })
            ) {
              return state;
            }
            return {
              tasks: state.tasks.map((item) =>
                item.id === taskId
                  ? {
                      ...item,
                      controlMode: "interactive",
                      controlOwner: "stave",
                      updatedAt: buildRecentTimestamp(),
                    }
                  : item,
              ),
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        markNotificationRead: async ({ id }) => {
          const readAt = new Date().toISOString();
          set((state) => ({
            notifications: markNotificationReadInList({
              notifications: state.notifications,
              id,
              readAt,
            }),
          }));
          try {
            const persisted = await markPersistedNotificationRead({
              id,
              readAt,
            });
            if (!persisted) {
              return;
            }
            set((state) => ({
              notifications: mergeNotificationIntoList({
                notifications: state.notifications,
                notification: persisted,
              }),
            }));
          } catch (error) {
            console.error(
              "[notifications] failed to mark notification as read",
              error,
            );
          }
        },
        markAllNotificationsRead: async () => {
          const readAt = new Date().toISOString();
          set((state) => ({
            notifications: markAllNotificationsReadInList({
              notifications: state.notifications,
              readAt,
            }),
          }));
          try {
            await markAllPersistedNotificationsRead({ readAt });
          } catch (error) {
            console.error(
              "[notifications] failed to mark all notifications as read",
              error,
            );
          }
        },
        openNotificationContext: async ({ notificationId }) => {
          const notification = get().notifications.find(
            (item) => item.id === notificationId,
          );
          if (!notification) {
            return { status: "opened" };
          }
          const result = await openNotificationContextInternal(notification);
          if (isNotificationUnread(notification)) {
            await get().markNotificationRead({ id: notification.id });
          }
          return result;
        },
        resolveNotificationApproval: async ({ notificationId, approved }) => {
          const notification = get().notifications.find(
            (item) => item.id === notificationId,
          );
          if (!notification || notification.action?.type !== "approval") {
            return;
          }

          await openNotificationContextInternal(notification);
          const latestState = get();
          const taskId = notification.taskId?.trim();
          if (!taskId) {
            if (isNotificationUnread(notification)) {
              await latestState.markNotificationRead({ id: notification.id });
            }
            return;
          }

          const locatedApproval = findPendingApprovalMessageByRequestId({
            messages: latestState.messagesByTask[taskId] ?? [],
            requestId: notification.action.requestId,
          });

          if (isManagedTaskReadOnly({ state: latestState, taskId })) {
            if (isNotificationUnread(notification)) {
              await latestState.markNotificationRead({ id: notification.id });
            }
            return;
          }

          if (!locatedApproval) {
            if (isNotificationUnread(notification)) {
              await latestState.markNotificationRead({ id: notification.id });
            }
            return;
          }

          latestState.resolveApproval({
            taskId,
            messageId:
              notification.action.messageId ?? locatedApproval.messageId,
            approved,
          });
          await latestState.markNotificationRead({ id: notification.id });
        },
        setStaveMuseOpen: ({ open }) => {
          set((state) => {
            if (state.staveMuse.open === open) {
              return state;
            }
            return {
              staveMuse: {
                ...state.staveMuse,
                open,
              },
            };
          });
        },
        focusStaveMuse: () => {
          set((state) => ({
            staveMuse: {
              ...state.staveMuse,
              open: true,
              focusNonce: state.staveMuse.focusNonce + 1,
            },
          }));
        },
        setStaveMuseTarget: ({ kind }) => {
          set((state) => {
            if (state.staveMuse.target.kind === kind) {
              return state;
            }
            return {
              staveMuse: {
                ...state.staveMuse,
                open: true,
                target: { kind },
              },
            };
          });
        },
        clearStaveMuseConversation: () => {
          const activeTurnId = get().staveMuse.activeTurnId;
          if (activeTurnId) {
            void window.api?.provider?.abortTurn?.({ turnId: activeTurnId });
          }
          void window.api?.provider?.cleanupTask?.({
            taskId: STAVE_MUSE_SESSION_ID,
          });
          set((state) => ({
            staveMuse: {
              ...createEmptyStaveMuseState(),
              open: state.staveMuse.open,
              target: state.staveMuse.target,
              focusNonce: state.staveMuse.focusNonce + 1,
            },
          }));
        },
        updateStaveMusePromptDraft: ({ patch }) => {
          set((state) => {
            const currentDraft = state.staveMuse.promptDraft;
            const nextDraft = {
              text: currentDraft.text,
              attachedFilePaths: currentDraft.attachedFilePaths,
              attachments: currentDraft.attachments,
              runtimeOverrides: currentDraft.runtimeOverrides,
              ...patch,
            };
            const textChanged = nextDraft.text !== currentDraft.text;
            const attachedFilePathsChanged =
              nextDraft.attachedFilePaths.length !==
                currentDraft.attachedFilePaths.length ||
              nextDraft.attachedFilePaths.some(
                (path, index) => path !== currentDraft.attachedFilePaths[index],
              );
            const attachmentsChanged =
              nextDraft.attachments.length !==
                currentDraft.attachments.length ||
              nextDraft.attachments.some(
                (attachment, index) =>
                  attachment !== currentDraft.attachments[index],
              );
            const runtimeOverridesChanged =
              !arePromptDraftRuntimeOverridesEqual(
                nextDraft.runtimeOverrides,
                currentDraft.runtimeOverrides,
              );
            if (
              !textChanged &&
              !attachedFilePathsChanged &&
              !attachmentsChanged &&
              !runtimeOverridesChanged
            ) {
              return state;
            }
            return {
              staveMuse: {
                ...state.staveMuse,
                promptDraft: nextDraft,
              },
            };
          });
        },
        sendStaveMuseMessage: async ({ content }) => {
          const trimmedContent = content.trim();
          if (!trimmedContent) {
            return;
          }

          const stateBeforeSubmit = get();
          if (stateBeforeSubmit.staveMuse.activeTurnId) {
            return;
          }

          const historyBeforeSubmit = stateBeforeSubmit.staveMuse.messages;

          set((state) => ({
            staveMuse: appendStaveMuseSubmittedUserMessage({
              assistant: state.staveMuse,
              content: trimmedContent,
            }),
          }));

          const appendMuseResponse = (
            responseText: string,
            args?: {
              providerId?: ProviderId;
              model?: string;
            },
          ) => {
            set((state) => ({
              staveMuse: appendStaveMuseStandaloneMessage({
                assistant: state.staveMuse,
                content: responseText,
                providerId: args?.providerId,
                model: args?.model,
              }),
            }));
          };

          const buildMuseContext = () =>
            buildStaveMuseLocalActionContextFromState(get());
          const ensureWorkspaceInfoContext = () => {
            const state = get();
            if (hasSelectedMuseWorkspace(state)) {
              return true;
            }
            appendMuseResponse("Select a workspace first.");
            return false;
          };
          const applyWorkspaceInformationUpdate = (
            updater: (
              current: WorkspaceInformationState,
            ) => WorkspaceInformationState,
          ) => {
            if (!ensureWorkspaceInfoContext()) {
              return false;
            }
            get().updateWorkspaceInformation({ updater });
            return true;
          };

          const stateBeforeRouting = get();
          const localAction = resolveStaveMuseLocalAction({
            input: trimmedContent,
            context: buildMuseContext(),
            allowDirectWorkspaceInfoEdits:
              stateBeforeRouting.settings.museAllowDirectWorkspaceInfoEdits,
          });

          if (localAction) {
            switch (localAction.kind) {
              case "show_summary":
                appendMuseResponse(
                  buildStaveMuseSummaryResponse({
                    target: get().staveMuse.target,
                    context: buildMuseContext(),
                  }),
                );
                return;
              case "show_information_summary":
                appendMuseResponse(
                  buildStaveMuseLocalActionResponse({
                    action: localAction,
                    context: buildMuseContext(),
                  }),
                );
                return;
              case "open_settings":
                window.dispatchEvent(
                  new CustomEvent(STAVE_MUSE_OPEN_SETTINGS_EVENT, {
                    detail: { section: "muse" },
                  }),
                );
                break;
              case "toggle_information_panel":
                get().setLayout({
                  patch: {
                    sidebarOverlayVisible: localAction.open ?? true,
                    sidebarOverlayTab: "information",
                  },
                });
                break;
              case "toggle_changes_panel":
                get().setLayout({
                  patch: {
                    sidebarOverlayVisible: localAction.open ?? true,
                    sidebarOverlayTab: "changes",
                  },
                });
                break;
              case "toggle_explorer_panel":
                get().setLayout({
                  patch: {
                    sidebarOverlayVisible: localAction.open ?? true,
                    sidebarOverlayTab: "explorer",
                  },
                });
                break;
              case "toggle_scripts_panel":
                get().setLayout({
                  patch: {
                    sidebarOverlayVisible: localAction.open ?? true,
                    sidebarOverlayTab: "scripts",
                  },
                });
                break;
              case "toggle_editor":
                get().setLayout({
                  patch: {
                    editorVisible:
                      localAction.open ?? !get().layout.editorVisible,
                  },
                });
                break;
              case "toggle_terminal":
                get().setLayout({
                  patch: {
                    terminalDocked:
                      localAction.open ?? !get().layout.terminalDocked,
                  },
                });
                break;
              case "toggle_workspace_sidebar":
                get().setLayout({
                  patch: {
                    workspaceSidebarCollapsed:
                      localAction.open === undefined
                        ? !get().layout.workspaceSidebarCollapsed
                        : !localAction.open,
                  },
                });
                break;
              case "switch_workspace":
                await get().switchWorkspace({
                  workspaceId: localAction.workspaceId,
                });
                break;
              case "open_project":
                await get().openProject({
                  projectPath: localAction.projectPath,
                });
                break;
              case "create_task":
                if (!hasSelectedMuseWorkspace(get())) {
                  appendMuseResponse("Open a project workspace first.");
                  return;
                }
                get().createTask({ title: localAction.title });
                break;
              case "select_task":
                get().selectTask({ taskId: localAction.taskId });
                break;
              case "replace_notes":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    notes: localAction.text,
                  }))
                ) {
                  return;
                }
                break;
              case "append_notes":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    notes: current.notes.trim()
                      ? `${current.notes.trim()}\n${localAction.text}`
                      : localAction.text,
                  }))
                ) {
                  return;
                }
                break;
              case "clear_notes":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    notes: "",
                  }))
                ) {
                  return;
                }
                break;
              case "add_todo":
                if (
                  !applyWorkspaceInformationUpdate((current) => {
                    const nextTodo = createWorkspaceTodoItem();
                    nextTodo.text = localAction.text;
                    return {
                      ...current,
                      todos: [...current.todos, nextTodo],
                    };
                  })
                ) {
                  return;
                }
                break;
              case "complete_todo":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    todos: current.todos.map((todo) =>
                      todo.id === localAction.todoId
                        ? { ...todo, completed: true }
                        : todo,
                    ),
                  }))
                ) {
                  return;
                }
                break;
              case "delete_todo":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    todos: current.todos.filter(
                      (todo) => todo.id !== localAction.todoId,
                    ),
                  }))
                ) {
                  return;
                }
                break;
              case "add_jira_link":
                if (
                  !applyWorkspaceInformationUpdate((current) => {
                    const nextLink = createWorkspaceJiraIssue();
                    nextLink.issueKey = localAction.issueKey;
                    nextLink.title = localAction.issueKey;
                    nextLink.url = localAction.url;
                    return {
                      ...current,
                      jiraIssues: [...current.jiraIssues, nextLink],
                    };
                  })
                ) {
                  return;
                }
                break;
              case "remove_jira_link":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    jiraIssues: current.jiraIssues.filter(
                      (issue) => issue.id !== localAction.linkId,
                    ),
                  }))
                ) {
                  return;
                }
                break;
              case "add_pull_request_link":
                if (
                  !applyWorkspaceInformationUpdate((current) => {
                    const nextLink = createWorkspaceLinkedPullRequest();
                    nextLink.title = localAction.title;
                    nextLink.url = localAction.url;
                    return {
                      ...current,
                      linkedPullRequests: [
                        ...current.linkedPullRequests,
                        nextLink,
                      ],
                    };
                  })
                ) {
                  return;
                }
                break;
              case "remove_pull_request_link":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    linkedPullRequests: current.linkedPullRequests.filter(
                      (pullRequest) => pullRequest.id !== localAction.linkId,
                    ),
                  }))
                ) {
                  return;
                }
                break;
              case "add_confluence_link":
                if (
                  !applyWorkspaceInformationUpdate((current) => {
                    const nextLink = createWorkspaceConfluencePage();
                    nextLink.title = localAction.title;
                    nextLink.url = localAction.url;
                    return {
                      ...current,
                      confluencePages: [...current.confluencePages, nextLink],
                    };
                  })
                ) {
                  return;
                }
                break;
              case "remove_confluence_link":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    confluencePages: current.confluencePages.filter(
                      (page) => page.id !== localAction.linkId,
                    ),
                  }))
                ) {
                  return;
                }
                break;
              case "add_figma_link":
                if (
                  !applyWorkspaceInformationUpdate((current) => {
                    const nextLink = createWorkspaceFigmaResource();
                    nextLink.title = localAction.title;
                    nextLink.url = localAction.url;
                    nextLink.nodeId = localAction.nodeId;
                    return {
                      ...current,
                      figmaResources: [...current.figmaResources, nextLink],
                    };
                  })
                ) {
                  return;
                }
                break;
              case "remove_figma_link":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    figmaResources: current.figmaResources.filter(
                      (resource) => resource.id !== localAction.linkId,
                    ),
                  }))
                ) {
                  return;
                }
                break;
              case "add_slack_link":
                if (
                  !applyWorkspaceInformationUpdate((current) => {
                    const nextLink = createWorkspaceSlackThread();
                    nextLink.url = localAction.url;
                    nextLink.channelName = localAction.channelName;
                    return {
                      ...current,
                      slackThreads: [...current.slackThreads, nextLink],
                    };
                  })
                ) {
                  return;
                }
                break;
              case "remove_slack_link":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    slackThreads: current.slackThreads.filter(
                      (thread) => thread.id !== localAction.linkId,
                    ),
                  }))
                ) {
                  return;
                }
                break;
              case "add_custom_field":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    customFields: [
                      ...current.customFields,
                      createWorkspaceInfoCustomField({
                        type: localAction.fieldType,
                        label: localAction.label,
                      }),
                    ],
                  }))
                ) {
                  return;
                }
                break;
              case "set_custom_field":
                if (
                  !applyWorkspaceInformationUpdate((current) => ({
                    ...current,
                    customFields: current.customFields.map((field) =>
                      field.id === localAction.fieldId
                        ? updateMuseCustomField({
                            field,
                            value: localAction.value,
                          })
                        : field,
                    ),
                  }))
                ) {
                  return;
                }
                break;
            }

            appendMuseResponse(
              buildStaveMuseLocalActionResponse({
                action: localAction,
                context: buildMuseContext(),
              }),
            );
            return;
          }

          const contextSnapshot = buildStaveMuseContextSnapshot({
            target: stateBeforeRouting.staveMuse.target,
            context: buildMuseContext(),
          });
          const routingDecision = await collectStaveMuseRoutingDecision({
            content: trimmedContent,
            model: stateBeforeRouting.settings.museRouterModel,
            settings: stateBeforeRouting.settings,
            contextSnapshot,
            projectBasePrompt: resolveProjectBasePrompt({
              projectPath: stateBeforeRouting.projectPath,
              recentProjects: stateBeforeRouting.recentProjects,
            }),
          });

          const explicitTaskRequest =
            isStaveMuseExplicitTaskRequest(trimmedContent);
          if (routingDecision.mode === "handoff") {
            const currentState = get();
            if (
              !currentState.settings.museAutoHandoffToTask &&
              !explicitTaskRequest
            ) {
              appendMuseResponse(
                "This request needs task chat. Turn on Auto Handoff To Task or ask Muse to open a task for it.",
                { model: "stave-muse-router" },
              );
              return;
            }
            if (!hasSelectedMuseWorkspace(currentState)) {
              appendMuseResponse(
                "Open a project workspace first so I can hand this off to a task.",
              );
              return;
            }

            const requestedWorkspace = findStaveMuseWorkspaceMention({
              input: trimmedContent,
              workspaces: buildMuseContext().workspaces,
            });
            if (
              requestedWorkspace &&
              requestedWorkspace.id !== get().activeWorkspaceId
            ) {
              await get().switchWorkspace({
                workspaceId: requestedWorkspace.id,
              });
            }

            const nextTitle =
              normalizeSuggestedTaskTitle({ title: trimmedContent }) ??
              "Muse Task";
            get().createTask({ title: nextTitle });
            const nextTaskId = get().activeTaskId;
            void get().sendUserMessage({
              taskId: nextTaskId,
              content: trimmedContent,
            });
            appendMuseResponse(
              `Created task "${nextTitle}" and handed the request off to task chat.${routingDecision.reason ? ` ${routingDecision.reason}` : ""}`,
              { model: "stave-muse-router" },
            );
            return;
          }

          const activeModel =
            routingDecision.mode === "planner"
              ? stateBeforeRouting.settings.musePlannerModel
              : stateBeforeRouting.settings.museChatModel;
          const provider = inferProviderIdFromModel({ model: activeModel });
          const providerRuntimeOptions = {
            ...applyProjectBasePromptToRuntimeOptions({
              runtimeOptions: buildProviderRuntimeOptions({
                provider,
                model: activeModel,
                settings: get().settings,
              }),
              projectBasePrompt: resolveProjectBasePrompt({
                projectPath: stateBeforeRouting.projectPath,
                recentProjects: stateBeforeRouting.recentProjects,
              }),
            }),
            ...(provider === "claude-code"
              ? {
                  claudeDisallowedTools: [
                    "Bash",
                    "Glob",
                    "Grep",
                    "LS",
                    "NotebookRead",
                    "Read",
                  ],
                  claudePermissionMode: "plan" as const,
                }
              : {
                  codexApprovalPolicy: "never" as const,
                  codexFileAccess: "read-only" as const,
                }),
          };
          const connectedToolIds = resolveRequestedStaveMuseConnectedTools({
            input: trimmedContent,
          });
          const turnId = crypto.randomUUID();
          const workspaceId = get().activeWorkspaceId || undefined;
          const museRuntimeCwd = getStaveMuseRuntimeCwd();
          const promptContextPart = buildStaveMuseInstructionContextPart({
            mode: routingDecision.mode === "planner" ? "planner" : "chat",
            prompt:
              routingDecision.mode === "planner"
                ? stateBeforeRouting.settings.musePlannerPrompt
                : stateBeforeRouting.settings.museChatPrompt,
          });
          const retrievedContextParts: CanonicalRetrievedContextPart[] = [
            promptContextPart,
            {
              type: "retrieved_context",
              sourceId: "stave:muse-context",
              title: "Stave Muse Context",
              content: contextSnapshot,
            },
          ];

          if (window.api?.provider?.checkAvailability) {
            try {
              const availability = await window.api.provider.checkAvailability({
                providerId: provider,
                runtimeOptions: providerRuntimeOptions,
              });
              if (!availability.ok || !availability.available) {
                appendMuseResponse(
                  buildStaveMuseProviderUnavailableMessage({
                    providerId: provider,
                    detail: availability.detail,
                  }),
                  {
                    providerId: "stave",
                    model: "system",
                  },
                );
                return;
              }
            } catch (error) {
              appendMuseResponse(
                buildStaveMuseProviderUnavailableMessage({
                  providerId: provider,
                  detail: String(error),
                }),
                {
                  providerId: "stave",
                  model: "system",
                },
              );
              return;
            }
          }

          if (
            connectedToolIds.length > 0 &&
            window.api?.provider?.getConnectedToolStatus
          ) {
            try {
              const connectedToolStatus =
                await window.api.provider.getConnectedToolStatus({
                  providerId: provider,
                  cwd: museRuntimeCwd,
                  runtimeOptions: providerRuntimeOptions,
                  toolIds: connectedToolIds,
                });
              const blockingStatuses = getBlockingConnectedToolStatuses({
                statuses: connectedToolStatus.tools,
              });
              if (blockingStatuses.length > 0) {
                appendMuseResponse(
                  buildStaveMuseConnectedToolPreflightMessage({
                    providerId: provider,
                    blockingTools: blockingStatuses,
                  }),
                  {
                    providerId: "stave",
                    model: "system",
                  },
                );
                return;
              }
            } catch (error) {
              appendMuseResponse(
                buildStaveMuseConnectedToolPreflightMessage({
                  providerId: provider,
                  blockingTools: connectedToolIds.map((toolId) => ({
                    id: toolId,
                    label: toolId,
                    state: "error" as const,
                    available: false,
                    detail: String(error),
                  })),
                }),
                {
                  providerId: "stave",
                  model: "system",
                },
              );
              return;
            }
          }

          const conversation = buildCanonicalConversationRequest({
            turnId,
            taskId: STAVE_MUSE_SESSION_ID,
            workspaceId,
            providerId: provider,
            model: activeModel,
            history: historyBeforeSubmit,
            userInput: trimmedContent,
            mode: "chat",
            retrievedContextParts,
          });

          set((state) => ({
            staveMuse: appendStaveMusePendingReply({
              assistant: state.staveMuse,
              providerId: provider,
              model: activeModel,
              turnId,
            }),
          }));

          const providerTurnEventController = createProviderTurnEventController(
            {
              flushEvents: (pendingEvents) => {
                set((state) => ({
                  staveMuse: applyProviderEventsToStaveMuse({
                    assistant: state.staveMuse,
                    events: pendingEvents,
                    provider,
                    model: activeModel,
                    turnId,
                  }),
                }));
              },
            },
          );

          runProviderTurn({
            turnId,
            provider,
            prompt: trimmedContent,
            conversation,
            taskId: STAVE_MUSE_SESSION_ID,
            workspaceId,
            cwd: museRuntimeCwd,
            runtimeOptions: providerRuntimeOptions,
            onEvent: ({ event }) =>
              providerTurnEventController.handleEvent(event),
          });
        },
        abortStaveMuseTurn: () => {
          const stateBefore = get();
          const activeTurnId = stateBefore.staveMuse.activeTurnId;
          if (activeTurnId) {
            void window.api?.provider?.abortTurn?.({ turnId: activeTurnId });
          }
          void window.api?.provider?.cleanupTask?.({
            taskId: STAVE_MUSE_SESSION_ID,
          });
          set((state) => {
            const current = state.staveMuse.messages;
            const interruptedMessages =
              interruptPendingToolInteractionsInMessages({
                messages: current,
              });
            const target = interruptedMessages[interruptedMessages.length - 1];
            if (!target || target.role !== "assistant" || !target.isStreaming) {
              return {
                staveMuse: {
                  ...state.staveMuse,
                  messages: interruptedMessages,
                  activeTurnId: undefined,
                  providerSession: undefined,
                  nativeSessionReady: false,
                },
              };
            }
            const aborted: ChatMessage = {
              ...target,
              completedAt: buildRecentTimestamp(),
              isStreaming: false,
              parts: [
                ...target.parts,
                {
                  type: "system_event",
                  content: LOCAL_ABORT_SYSTEM_EVENT_CONTENT,
                },
              ],
            };
            return {
              staveMuse: {
                ...state.staveMuse,
                messages: [...interruptedMessages.slice(0, -1), aborted],
                activeTurnId: undefined,
                providerSession: undefined,
                nativeSessionReady: false,
              },
            };
          });
        },
        resolveStaveMuseApproval: async ({ messageId, approved }) => {
          const stateBefore = get();
          const activeTurnId = stateBefore.staveMuse.activeTurnId;
          const message = stateBefore.staveMuse.messages.find(
            (item) => item.id === messageId,
          );
          const approvalPart = findLatestPendingApprovalPart({ message });

          const appendApprovalFailure = (failureText: string) => {
            set((state) => ({
              staveMuse: appendStaveMuseStandaloneMessage({
                assistant: state.staveMuse,
                content: failureText,
                providerId: "stave",
                model: "system",
              }),
            }));
          };

          const applyApprovalResponse = (requestId: string) => {
            set((state) => ({
              staveMuse: {
                ...state.staveMuse,
                messages: updateMessageById({
                  messages: state.staveMuse.messages,
                  messageId,
                  update: (currentMessage) => ({
                    ...currentMessage,
                    parts: updateApprovalPartsByRequestId({
                      parts: currentMessage.parts,
                      requestId,
                      approved,
                    }),
                  }),
                }),
              },
            }));
          };

          if (activeTurnId && approvalPart) {
            const respondApproval = window.api?.provider?.respondApproval;
            if (respondApproval) {
              void respondApproval({
                turnId: activeTurnId,
                requestId: approvalPart.requestId,
                approved,
              })
                .then((result) => {
                  if (!result.ok) {
                    appendApprovalFailure(
                      `Approval delivery failed: ${result.message ?? "unknown"}`,
                    );
                    return;
                  }
                  applyApprovalResponse(approvalPart.requestId);
                })
                .catch((error) => {
                  appendApprovalFailure(
                    `Approval delivery failed: ${String(error)}`,
                  );
                });
              return;
            }
          }

          if (
            !activeTurnId &&
            approvalPart &&
            window.api?.provider?.respondApproval
          ) {
            appendApprovalFailure(
              "Approval delivery failed: no active turn found for this Muse turn.",
            );
            return;
          }
          if (approvalPart) {
            appendApprovalFailure(
              "Approval delivery failed: no active turn found for this Muse turn.",
            );
          }
        },
        resolveStaveMuseUserInput: async ({ messageId, answers, denied }) => {
          const stateBefore = get();
          const activeTurnId = stateBefore.staveMuse.activeTurnId;
          const message = stateBefore.staveMuse.messages.find(
            (item) => item.id === messageId,
          );
          const userInputPart = findLatestPendingUserInputPart({ message });

          const appendUserInputFailure = (failureText: string) => {
            set((state) => ({
              staveMuse: appendStaveMuseStandaloneMessage({
                assistant: state.staveMuse,
                content: failureText,
                providerId: "stave",
                model: "system",
              }),
            }));
          };

          const applyUserInputResponse = (requestId: string) => {
            set((state) => ({
              staveMuse: {
                ...state.staveMuse,
                messages: updateMessageById({
                  messages: state.staveMuse.messages,
                  messageId,
                  update: (currentMessage) => ({
                    ...currentMessage,
                    parts: updateUserInputPartsByRequestId({
                      parts: currentMessage.parts,
                      requestId,
                      answers,
                      denied,
                    }),
                  }),
                }),
              },
            }));
          };

          if (activeTurnId && userInputPart) {
            const respondUserInput = window.api?.provider?.respondUserInput;
            if (respondUserInput) {
              void respondUserInput({
                turnId: activeTurnId,
                requestId: userInputPart.requestId,
                answers,
                denied,
              })
                .then((result) => {
                  if (!result.ok) {
                    appendUserInputFailure(
                      `User input delivery failed: ${result.message ?? "unknown"}`,
                    );
                    return;
                  }
                  applyUserInputResponse(userInputPart.requestId);
                })
                .catch((error) => {
                  appendUserInputFailure(
                    `User input delivery failed: ${String(error)}`,
                  );
                });
              return;
            }
          }

          if (
            !activeTurnId &&
            userInputPart &&
            window.api?.provider?.respondUserInput
          ) {
            appendUserInputFailure(
              "User input delivery failed: no active turn found for this Muse turn.",
            );
            return;
          }
          if (userInputPart) {
            appendUserInputFailure(
              "User input delivery failed: no active turn found for this Muse turn.",
            );
          }
        },
        sendUserMessage: async ({
          taskId,
          content,
          fileContexts,
          imageContexts,
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
            const seededTitleText = resolveSkillSelections({
              text: content,
              skills: state.skillCatalog.skills,
              providerId: state.draftProvider,
            }).normalizedText;
            const seededTitle =
              seededTitleText.split("\n")[0]?.trim().slice(0, 48) || "New Task";
            const seededTask: Task = {
              id: seededTaskId,
              title: seededTitle,
              provider: state.draftProvider,
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
          if (isManagedTaskReadOnly({ state, taskId: resolvedTaskId })) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          const provider =
            task?.provider ?? state.draftProvider ?? "claude-code";
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
          const promptDraft = normalizePromptDraftForStorage({
            ...(taskWorkspaceSession.promptDraftByTask[resolvedTaskId] ??
              sourcePromptDraft),
            text: content,
            queuedNextTurn: undefined,
          });
          const activeTurnId =
            taskWorkspaceSession.activeTurnIdsByTask[resolvedTaskId];
          if (activeTurnId) {
            const queuedPromptDraft = normalizePromptDraftForStorage({
              ...(taskWorkspaceSession.promptDraftByTask[resolvedTaskId] ??
                sourcePromptDraft),
              text: "",
              queuedNextTurn: {
                queuedAt: buildRecentTimestamp(),
                sourceTurnId: activeTurnId,
                content,
              },
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

          let promptDraftClearedOptimistically = false;
          const clearSubmittedPromptDraft = () => {
            if (promptDraftClearedOptimistically) {
              return;
            }
            promptDraftClearedOptimistically = true;
            updatePromptDraftsForWorkspace({
              [resolvedTaskId]: buildClearedPromptDraft(promptDraft),
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
              [resolvedTaskId]: promptDraft,
              ...(sourcePromptDraftTaskId !== resolvedTaskId
                ? {
                    [sourcePromptDraftTaskId]: sourcePromptDraft,
                  }
                : {}),
            });
          };

          clearSubmittedPromptDraft();

          try {
            const resolvedPromptDraftRuntimeState =
              resolvePromptDraftRuntimeState({
                promptDraft,
                fallback: {
                  claudePermissionMode: state.settings.claudePermissionMode,
                  claudePermissionModeBeforePlan:
                    state.settings.claudePermissionModeBeforePlan,
                  codexPlanMode: state.settings.codexPlanMode,
                },
              });
            const activeModel =
              provider === "claude-code"
                ? resolvePromptDraftModelForProvider({
                    providerId: provider,
                    runtimeOverrides: promptDraft.runtimeOverrides,
                    fallbackModel: state.settings.modelClaude,
                  })
                : provider === "stave"
                  ? resolvePromptDraftModelForProvider({
                      providerId: provider,
                      runtimeOverrides: promptDraft.runtimeOverrides,
                      fallbackModel: state.settings.modelStave,
                    })
                  : resolvePromptDraftModelForProvider({
                      providerId: provider,
                      runtimeOverrides: promptDraft.runtimeOverrides,
                      fallbackModel: state.settings.modelCodex,
                    });

            const skillSelection = resolveSkillSelections({
              text: content,
              skills: state.skillCatalog.skills,
              providerId: provider,
            });
            const normalizedPrompt = skillSelection.normalizedText;
            const resolvedFileContexts = await getDraftFileContexts({
              promptDraft,
              session: taskWorkspaceSession,
              workspaceRootPath: workspaceCwd,
              fileContexts,
            });
            const resolvedImageContexts = getDraftImageContexts({
              promptDraft,
              imageContexts,
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

            // ── Auto task naming ──────────────────────────────────────────────────
            // On every prompt, fire a lightweight single-turn Claude query to keep
            // the task title up-to-date with the evolving conversation context.
            // Runs fully async — never blocks the main turn.
            {
              const capturedTaskId = resolvedTaskId;
              const promptForTitle = normalizedPrompt || content;
              const historyForTitle = latestHistory.slice(-6).map((m) => ({
                role: m.role as string,
                content: m.content,
              }));
              void window.api?.provider
                ?.suggestTaskName?.({
                  prompt: promptForTitle,
                  history: historyForTitle,
                })
                .then((result) => {
                  if (result?.ok && result.title) {
                    const safeTitle = normalizeSuggestedTaskTitle({
                      title: result.title,
                    });
                    if (safeTitle) {
                      get().renameTask({
                        taskId: capturedTaskId,
                        title: safeTitle,
                      });
                    }
                  }
                })
                .catch(() => {
                  // Title generation failed — keep the current title.
                });
            }
            // ─────────────────────────────────────────────────────────────────────

            const providerSession =
              latestWorkspaceSession.providerSessionByTask[resolvedTaskId];
            const taskWorkspaceSummary =
              state.workspaces.find(
                (workspace) => workspace.id === taskWorkspaceId,
              ) ?? null;
            const taskWorkspaceTasks = latestWorkspaceSession.tasks;
            const taskWorkspaceInformation =
              latestWorkspaceSession.workspaceInformation;

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
              }),
            ];
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
              prompt: normalizedPrompt || content,
              currentTaskId: resolvedTaskId,
              tasks: taskWorkspaceTasks,
              messagesByTask: latestWorkspaceSession.messagesByTask,
            });
            if (referencedTaskContext) {
              retrievedContextParts.push(referencedTaskContext);
            }
            // ──────────────────────────────────────────────────────────────────────

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
              nativeSessionId: providerSession?.[provider] ?? null,
              retrievedContextParts,
            });
            const prompt = normalizedPrompt;
            promptDraftClearedOptimistically = false;

            if (taskWorkspaceId === state.activeWorkspaceId) {
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
                  content,
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
                    [resolvedTaskId]: buildClearedPromptDraft(
                      nextState.promptDraftByTask[resolvedTaskId] ??
                        promptDraft,
                    ),
                    ...(sourcePromptDraftTaskId !== resolvedTaskId
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
                  content,
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
                        [resolvedTaskId]: buildClearedPromptDraft(
                          cachedSession.promptDraftByTask[resolvedTaskId] ??
                            promptDraft,
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
            const providerTurnEventController =
              createProviderTurnEventController({
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
                  const turnStillActive =
                    currentState.activeTurnIdsByTask[resolvedTaskId] === turnId;
                  const nextTurnActivityByTask = turnStillActive
                    ? applyProviderTurnActivityEvents({
                        activityByTask: currentState.providerTurnActivityByTask,
                        taskId: resolvedTaskId,
                        turnId,
                        providerId: provider,
                        events: pendingEvents,
                      })
                    : currentState.providerTurnActivityByTask;
                  persistInactiveWorkspaceSession =
                    applied.persistInactiveWorkspaceSession;
                  updatedSession = applied.updatedSession;
                  const activityChanged =
                    nextTurnActivityByTask !==
                    currentState.providerTurnActivityByTask;
                  if (applied.stateChanged || activityChanged) {
                    set({
                      ...applied.statePatch,
                      ...(activityChanged
                        ? {
                            providerTurnActivityByTask: nextTurnActivityByTask,
                          }
                        : {}),
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
                      workspaceId:
                        persistedInactiveWorkspaceSession.workspaceId,
                      workspaceName: resolveWorkspaceName({
                        state: latestState,
                        workspaceId:
                          persistedInactiveWorkspaceSession.workspaceId,
                      }),
                      activeTaskId:
                        persistedInactiveWorkspaceSession.session.activeTaskId,
                      tasks: persistedInactiveWorkspaceSession.session.tasks,
                      messagesByTask:
                        persistedInactiveWorkspaceSession.session
                          .messagesByTask,
                      promptDraftByTask:
                        persistedInactiveWorkspaceSession.session
                          .promptDraftByTask,
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
                        persistedInactiveWorkspaceSession.session
                          .terminalDocked,
                      cliSessionTabs:
                        persistedInactiveWorkspaceSession.session
                          .cliSessionTabs,
                      activeCliSessionTabId:
                        persistedInactiveWorkspaceSession.session
                          .activeCliSessionTabId,
                      activeSurface:
                        persistedInactiveWorkspaceSession.session.activeSurface,
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
                  const planTextToPersist = resolveWorkspacePlanPersistenceText(
                    {
                      planText: nextPlanReady?.planText,
                      lastPersistedPlanText: lastPersistedPlanTextForTurn,
                    },
                  );
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
                      });
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
                    if (notificationsToPersist.length > 0) {
                      void persistNotifications(notificationsToPersist);
                    }
                  }
                  if (applied.turnCompleted) {
                    const latestWorkspaceSession = getWorkspaceSessionForState({
                      state: latestState,
                      workspaceId: taskWorkspaceId,
                    });
                    const queuedPromptDraft =
                      latestWorkspaceSession?.promptDraftByTask[resolvedTaskId];
                    if (queuedPromptDraft?.queuedNextTurn) {
                      const queuedContent =
                        queuedPromptDraft.queuedNextTurn.content ??
                        queuedPromptDraft.text;
                      const autoDispatchDraft = normalizePromptDraftForStorage({
                        ...queuedPromptDraft,
                        text: queuedContent,
                        queuedNextTurn: undefined,
                      });
                      // Restore the queued payload as a normal draft before
                      // dispatch so attachment-only follow-ups and blocked
                      // auto-sends do not lose the staged content.
                      get().updatePromptDraft({
                        taskId: resolvedTaskId,
                        patch: {
                          text: autoDispatchDraft.text,
                          attachedFilePaths:
                            autoDispatchDraft.attachedFilePaths,
                          attachments: autoDispatchDraft.attachments,
                          queuedNextTurn: undefined,
                        },
                      });
                      if (hasPromptDraftPayload(autoDispatchDraft)) {
                        void get().sendUserMessage({
                          taskId: resolvedTaskId,
                          content: autoDispatchDraft.text,
                        });
                      } else {
                        get().clearPromptDraft({ taskId: resolvedTaskId });
                      }
                    }
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
              });

            runScriptHookInBackground({
              workspaceId: taskWorkspaceId,
              trigger: "turn.started",
              taskId: resolvedTaskId,
              taskTitle: task?.title,
              turnId,
            });

            runProviderTurn({
              turnId,
              provider,
              prompt,
              conversation,
              taskId: resolvedTaskId,
              workspaceId: taskWorkspaceId,
              cwd: workspaceCwd,
              runtimeOptions: applyProjectBasePromptToRuntimeOptions({
                runtimeOptions: buildProviderRuntimeOptions({
                  provider,
                  model: activeModel,
                  settings: {
                    ...get().settings,
                    claudePermissionMode:
                      resolvedPromptDraftRuntimeState.claudePermissionMode,
                    codexPlanMode:
                      resolvedPromptDraftRuntimeState.codexPlanMode,
                  },
                  providerSession,
                }),
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
        startColiseum: async ({
          parentTaskId,
          branches,
          content,
          fileContexts,
          imageContexts,
        }) => {
          const branchValidationError = validateColiseumBranches(branches);
          if (branchValidationError) {
            return {
              status: "blocked",
              reason: branchValidationError,
            } satisfies StartColiseumResult;
          }

          let state = get();
          const runtimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!runtimeTarget) {
            return {
              status: "blocked",
              reason: "Parent task not found.",
            } satisfies StartColiseumResult;
          }
          const parentTask = runtimeTarget.task;
          if (parentTask.coliseumParentTaskId) {
            return {
              status: "blocked",
              reason: "Cannot start a Coliseum from within a Coliseum branch.",
            } satisfies StartColiseumResult;
          }
          if (isManagedTaskReadOnly({ state, taskId: parentTaskId })) {
            return {
              status: "blocked",
              reason: "This task is managed externally.",
            } satisfies StartColiseumResult;
          }
          if (state.activeColiseumsByTask[parentTaskId]) {
            return {
              status: "blocked",
              reason: "A Coliseum is already running on this task.",
            } satisfies StartColiseumResult;
          }

          const { workspaceId: parentWorkspaceId, cwd: parentWorkspaceCwd } =
            resolveTaskWorkspaceContext({
              taskId: parentTaskId,
              activeWorkspaceId: state.activeWorkspaceId,
              taskWorkspaceIdById: state.taskWorkspaceIdById,
              workspacePathById: state.workspacePathById,
              workspaceDefaultById: state.workspaceDefaultById,
              projectPath: state.projectPath,
            });
          if (!parentWorkspaceId) {
            return {
              status: "blocked",
              reason: "Parent task has no workspace.",
            } satisfies StartColiseumResult;
          }

          const parentWorkspaceSession =
            getWorkspaceSessionForState({
              state,
              workspaceId: parentWorkspaceId,
            }) ?? runtimeTarget.session;
          const parentHistory =
            parentWorkspaceSession.messagesByTask[parentTaskId] ?? [];
          if (parentWorkspaceSession.activeTurnIdsByTask[parentTaskId]) {
            return {
              status: "blocked",
              reason: "Parent task has an active turn.",
            } satisfies StartColiseumResult;
          }
          if (findLatestPendingApproval({ messages: parentHistory })) {
            return {
              status: "blocked",
              reason: "Parent task has a pending approval.",
            } satisfies StartColiseumResult;
          }
          if (findLatestPendingUserInput({ messages: parentHistory })) {
            return {
              status: "blocked",
              reason: "Parent task has a pending user input.",
            } satisfies StartColiseumResult;
          }

          const parentPromptDraft =
            parentWorkspaceSession.promptDraftByTask[parentTaskId];
          const resolvedFileContexts =
            fileContexts !== undefined
              ? fileContexts
              : await getDraftFileContexts({
                  promptDraft: parentPromptDraft ?? EMPTY_PROMPT_DRAFT,
                  session: parentWorkspaceSession,
                  workspaceRootPath: parentWorkspaceCwd,
                  fileContexts,
                });
          const resolvedImageContexts =
            imageContexts !== undefined
              ? imageContexts
              : getDraftImageContexts({
                  promptDraft: parentPromptDraft ?? EMPTY_PROMPT_DRAFT,
                  imageContexts,
                });

          // Re-read state in case file reads yielded the event loop.
          state = get();
          const latestWorkspaceSession = getWorkspaceSessionForState({
            state,
            workspaceId: parentWorkspaceId,
          });
          if (!latestWorkspaceSession) {
            return {
              status: "blocked",
              reason: "Parent workspace session unavailable.",
            } satisfies StartColiseumResult;
          }
          // Re-check invariants after async gap.
          if (latestWorkspaceSession.activeTurnIdsByTask[parentTaskId]) {
            return {
              status: "blocked",
              reason: "Parent task started a turn during setup.",
            } satisfies StartColiseumResult;
          }
          if (state.activeColiseumsByTask[parentTaskId]) {
            return {
              status: "blocked",
              reason: "A Coliseum is already running on this task.",
            } satisfies StartColiseumResult;
          }
          const latestParentHistory =
            latestWorkspaceSession.messagesByTask[parentTaskId] ??
            parentHistory;
          const latestParentTask =
            latestWorkspaceSession.tasks.find((t) => t.id === parentTaskId) ??
            parentTask;
          const latestParentPromptDraft =
            latestWorkspaceSession.promptDraftByTask[parentTaskId];

          let plan;
          try {
            plan = planColiseumFanOut({
              parentTask: latestParentTask,
              parentMessages: latestParentHistory,
              parentPromptDraft: latestParentPromptDraft,
              parentTaskWorkspaceId: parentWorkspaceId,
              branches,
              content,
              fileContexts:
                resolvedFileContexts.length > 0
                  ? resolvedFileContexts
                  : undefined,
              imageContexts:
                resolvedImageContexts.length > 0
                  ? resolvedImageContexts
                  : undefined,
            });
          } catch (planError) {
            return {
              status: "blocked",
              reason:
                planError instanceof Error
                  ? planError.message
                  : String(planError),
            } satisfies StartColiseumResult;
          }

          // Apply the fan-out state patch. The parent workspace may or may not
          // be the active workspace — handle both.
          set((nextState) => {
            const mergedTasks = [...nextState.tasks, ...plan.branchTasks];
            const mergedTaskWorkspaceIdById = {
              ...nextState.taskWorkspaceIdById,
              ...plan.branchTaskWorkspaceIdById,
            };
            if (parentWorkspaceId === nextState.activeWorkspaceId) {
              return {
                tasks: mergedTasks,
                messagesByTask: {
                  ...nextState.messagesByTask,
                  ...plan.branchMessagesByTask,
                },
                messageCountByTask: {
                  ...nextState.messageCountByTask,
                  ...plan.branchMessageCountByTask,
                },
                activeTurnIdsByTask: {
                  ...nextState.activeTurnIdsByTask,
                  ...plan.branchActiveTurnIdsByTask,
                },
                providerSessionByTask: {
                  ...nextState.providerSessionByTask,
                  ...plan.branchProviderSessionByTask,
                },
                nativeSessionReadyByTask: {
                  ...nextState.nativeSessionReadyByTask,
                  ...plan.branchNativeSessionReadyByTask,
                },
                promptDraftByTask: {
                  ...nextState.promptDraftByTask,
                  ...plan.branchPromptDraftByTask,
                },
                activeColiseumsByTask: {
                  ...nextState.activeColiseumsByTask,
                  [parentTaskId]: plan.group,
                },
                taskWorkspaceIdById: mergedTaskWorkspaceIdById,
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              };
            }
            // Parent task lives in an inactive workspace cache.
            const cachedSession =
              nextState.workspaceRuntimeCacheById[parentWorkspaceId];
            if (!cachedSession) {
              return nextState;
            }
            return {
              taskWorkspaceIdById: mergedTaskWorkspaceIdById,
              workspaceRuntimeCacheById: {
                ...nextState.workspaceRuntimeCacheById,
                [parentWorkspaceId]: {
                  ...cachedSession,
                  tasks: [...cachedSession.tasks, ...plan.branchTasks],
                  messagesByTask: {
                    ...cachedSession.messagesByTask,
                    ...plan.branchMessagesByTask,
                  },
                  messageCountByTask: {
                    ...cachedSession.messageCountByTask,
                    ...plan.branchMessageCountByTask,
                  },
                  activeTurnIdsByTask: {
                    ...cachedSession.activeTurnIdsByTask,
                    ...plan.branchActiveTurnIdsByTask,
                  },
                  providerSessionByTask: {
                    ...cachedSession.providerSessionByTask,
                    ...plan.branchProviderSessionByTask,
                  },
                  nativeSessionReadyByTask: {
                    ...cachedSession.nativeSessionReadyByTask,
                    ...plan.branchNativeSessionReadyByTask,
                  },
                  promptDraftByTask: {
                    ...cachedSession.promptDraftByTask,
                    ...plan.branchPromptDraftByTask,
                  },
                  activeColiseumsByTask: {
                    ...cachedSession.activeColiseumsByTask,
                    [parentTaskId]: plan.group,
                  },
                },
              },
            };
          });

          // Dispatch each branch's provider turn. Each branch gets its own
          // event controller so stream events are routed via the branch's
          // taskId — the existing applyPendingProviderEventsToStoreState router
          // already gates on `activeTurnIdsByTask[taskId]`, so cross-branch
          // isolation is free as long as each branch's taskId and turnId are
          // unique (guaranteed by planColiseumFanOut).
          const skillSelection = resolveSkillSelections({
            text: content,
            skills: state.skillCatalog.skills,
            providerId: latestParentTask.provider,
          });
          const normalizedPrompt = skillSelection.normalizedText;

          for (const dispatch of plan.branchDispatchList) {
            const { taskId, turnId, provider, model } = dispatch;
            const inheritedOverrides: PromptDraft["runtimeOverrides"] =
              latestParentPromptDraft?.runtimeOverrides
                ? { ...latestParentPromptDraft.runtimeOverrides, model }
                : { model };
            const branchPromptDraft: PromptDraft = {
              text: "",
              attachedFilePaths: [],
              attachments: [],
              runtimeOverrides: inheritedOverrides,
            };
            const resolvedPromptDraftRuntimeState =
              resolvePromptDraftRuntimeState({
                promptDraft: branchPromptDraft,
                fallback: {
                  claudePermissionMode: state.settings.claudePermissionMode,
                  claudePermissionModeBeforePlan:
                    state.settings.claudePermissionModeBeforePlan,
                  codexPlanMode: state.settings.codexPlanMode,
                },
              });
            const branchProviderSession =
              plan.branchProviderSessionByTask[taskId];
            const conversation = buildCanonicalConversationRequest({
              turnId,
              taskId,
              workspaceId: parentWorkspaceId,
              providerId: provider,
              model,
              history: latestParentHistory,
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
              nativeSessionId: null,
              retrievedContextParts: [],
            });

            const turnActivityStartedAt = Date.now();
            set((nextState) => ({
              providerTurnActivityByTask: startProviderTurnActivity({
                activityByTask: nextState.providerTurnActivityByTask,
                taskId,
                turnId,
                providerId: provider,
                now: turnActivityStartedAt,
              }),
            }));
            scheduleProviderTurnStallTimer({
              taskId,
              turnId,
              lastEventAt: turnActivityStartedAt,
            });

            const providerTurnEventController =
              createProviderTurnEventController({
                flushEvents: (pendingEvents) => {
                  const currentState = get();
                  const applied = applyPendingProviderEventsToStoreState({
                    state: currentState,
                    taskWorkspaceId: parentWorkspaceId,
                    taskId,
                    events: pendingEvents,
                    provider,
                    model,
                    turnId,
                  });
                  const turnStillActive =
                    currentState.activeTurnIdsByTask[taskId] === turnId;
                  const nextTurnActivityByTask = turnStillActive
                    ? applyProviderTurnActivityEvents({
                        activityByTask: currentState.providerTurnActivityByTask,
                        taskId,
                        turnId,
                        providerId: provider,
                        events: pendingEvents,
                      })
                    : currentState.providerTurnActivityByTask;
                  const activityChanged =
                    nextTurnActivityByTask !==
                    currentState.providerTurnActivityByTask;
                  if (applied.stateChanged || activityChanged) {
                    set({
                      ...applied.statePatch,
                      ...(activityChanged
                        ? {
                            providerTurnActivityByTask: nextTurnActivityByTask,
                          }
                        : {}),
                    });
                  }
                  if (
                    !turnStillActive ||
                    pendingEvents.some((event) => event.type === "done")
                  ) {
                    clearProviderTurnStallTimer(taskId);
                  } else {
                    const nextActivity = nextTurnActivityByTask[taskId];
                    if (nextActivity) {
                      scheduleProviderTurnStallTimer({
                        taskId,
                        turnId,
                        lastEventAt: nextActivity.lastEventAt,
                      });
                    }
                  }
                },
              });

            runProviderTurn({
              turnId,
              provider,
              prompt: normalizedPrompt,
              conversation,
              taskId,
              workspaceId: parentWorkspaceId,
              cwd: parentWorkspaceCwd,
              runtimeOptions: applyProjectBasePromptToRuntimeOptions({
                runtimeOptions: buildProviderRuntimeOptions({
                  provider,
                  model,
                  settings: {
                    ...get().settings,
                    claudePermissionMode:
                      resolvedPromptDraftRuntimeState.claudePermissionMode,
                    codexPlanMode:
                      resolvedPromptDraftRuntimeState.codexPlanMode,
                  },
                  providerSession: branchProviderSession,
                }),
                projectBasePrompt: resolveProjectBasePrompt({
                  projectPath: get().projectPath,
                  recentProjects: get().recentProjects,
                }),
              }),
              onEvent: ({ event }) =>
                providerTurnEventController.handleEvent(event),
            });
          }

          return {
            status: "started",
            parentTaskId,
            workspaceId: parentWorkspaceId,
            branchTaskIds: plan.group.branchTaskIds,
          } satisfies StartColiseumResult;
        },
        pickColiseumChampion: ({ parentTaskId, championTaskId }) => {
          const state = get();
          const group = state.activeColiseumsByTask[parentTaskId];
          if (!group) {
            return;
          }
          if (!group.branchTaskIds.includes(championTaskId)) {
            return;
          }
          const parentRuntimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!parentRuntimeTarget) {
            return;
          }
          const workspaceId = parentRuntimeTarget.workspaceId;
          const parentSession = parentRuntimeTarget.session;
          const parentMessages =
            parentSession.messagesByTask[parentTaskId] ?? [];
          const championMessages =
            parentSession.messagesByTask[championTaskId] ?? [];

          let promotion;
          try {
            promotion = promoteColiseumChampion({
              group,
              championTaskId,
              parentMessages,
              championMessages,
              // Re-pick: if a champion was already grafted, roll the parent
              // back to pre-fan-out first so the new champion's tail replaces
              // (not appends to) the previous pick.
              replacePreviousPick: group.championTaskId != null,
            });
          } catch {
            return;
          }

          // Non-destructive: branches stay alive so the user can re-pick or
          // keep comparing. Runtime caches are NOT evicted here — discard is
          // now the explicit destructive action.
          const championProviderSession =
            parentSession.providerSessionByTask[championTaskId] ?? {};
          const championNativeSessionReady =
            parentSession.nativeSessionReadyByTask[championTaskId] ?? false;

          const pickedAt = buildRecentTimestamp();
          const nextGroup: ColiseumGroupState = {
            ...group,
            status: "promoted",
            championTaskId,
            pickedHistory: [
              ...group.pickedHistory,
              { championTaskId, pickedAt },
            ],
          };

          set((nextState) => {
            const applyPatchToSession = <
              S extends {
                messagesByTask: Record<string, ChatMessage[]>;
                messageCountByTask: Record<string, number>;
                providerSessionByTask: Record<string, TaskProviderSessionState>;
                nativeSessionReadyByTask: Record<string, boolean>;
                activeColiseumsByTask: Record<
                  string,
                  ColiseumGroupState | undefined
                >;
              },
            >(
              session: S,
            ): S => ({
              ...session,
              messagesByTask: {
                ...session.messagesByTask,
                [parentTaskId]: promotion.nextParentMessages,
              },
              messageCountByTask: {
                ...session.messageCountByTask,
                [parentTaskId]: promotion.nextParentMessages.length,
              },
              providerSessionByTask: {
                ...session.providerSessionByTask,
                [parentTaskId]: championProviderSession,
              },
              nativeSessionReadyByTask: {
                ...session.nativeSessionReadyByTask,
                [parentTaskId]: championNativeSessionReady,
              },
              activeColiseumsByTask: {
                ...session.activeColiseumsByTask,
                [parentTaskId]: nextGroup,
              },
            });

            if (workspaceId === nextState.activeWorkspaceId) {
              return {
                messagesByTask: {
                  ...nextState.messagesByTask,
                  [parentTaskId]: promotion.nextParentMessages,
                },
                messageCountByTask: {
                  ...nextState.messageCountByTask,
                  [parentTaskId]: promotion.nextParentMessages.length,
                },
                providerSessionByTask: {
                  ...nextState.providerSessionByTask,
                  [parentTaskId]: championProviderSession,
                },
                nativeSessionReadyByTask: {
                  ...nextState.nativeSessionReadyByTask,
                  [parentTaskId]: championNativeSessionReady,
                },
                activeColiseumsByTask: {
                  ...nextState.activeColiseumsByTask,
                  [parentTaskId]: nextGroup,
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              };
            }
            const cachedSession =
              nextState.workspaceRuntimeCacheById[workspaceId];
            if (!cachedSession) {
              return nextState;
            }
            return {
              workspaceRuntimeCacheById: {
                ...nextState.workspaceRuntimeCacheById,
                [workspaceId]: applyPatchToSession(cachedSession),
              },
            };
          });
        },
        unpickColiseumChampion: ({ parentTaskId }) => {
          const state = get();
          const group = state.activeColiseumsByTask[parentTaskId];
          if (!group || !group.championTaskId) {
            return;
          }
          const parentRuntimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!parentRuntimeTarget) {
            return;
          }
          const workspaceId = parentRuntimeTarget.workspaceId;
          const parentSession = parentRuntimeTarget.session;
          const parentMessages =
            parentSession.messagesByTask[parentTaskId] ?? [];
          const { nextParentMessages } = unpickColiseumChampionUtil({
            group,
            parentMessages,
          });
          const nextGroup: ColiseumGroupState = {
            ...group,
            status: "ready",
            championTaskId: null,
          };

          set((nextState) => {
            if (workspaceId === nextState.activeWorkspaceId) {
              return {
                messagesByTask: {
                  ...nextState.messagesByTask,
                  [parentTaskId]: nextParentMessages,
                },
                messageCountByTask: {
                  ...nextState.messageCountByTask,
                  [parentTaskId]: nextParentMessages.length,
                },
                activeColiseumsByTask: {
                  ...nextState.activeColiseumsByTask,
                  [parentTaskId]: nextGroup,
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              };
            }
            const cachedSession =
              nextState.workspaceRuntimeCacheById[workspaceId];
            if (!cachedSession) {
              return nextState;
            }
            return {
              workspaceRuntimeCacheById: {
                ...nextState.workspaceRuntimeCacheById,
                [workspaceId]: {
                  ...cachedSession,
                  messagesByTask: {
                    ...cachedSession.messagesByTask,
                    [parentTaskId]: nextParentMessages,
                  },
                  messageCountByTask: {
                    ...cachedSession.messageCountByTask,
                    [parentTaskId]: nextParentMessages.length,
                  },
                  activeColiseumsByTask: {
                    ...cachedSession.activeColiseumsByTask,
                    [parentTaskId]: nextGroup,
                  },
                },
              },
            };
          });
        },
        setColiseumViewMode: ({
          parentTaskId,
          viewMode,
          focusedBranchTaskId,
        }) => {
          const state = get();
          const group = state.activeColiseumsByTask[parentTaskId];
          if (!group) {
            return;
          }
          const parentRuntimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!parentRuntimeTarget) {
            return;
          }
          const workspaceId = parentRuntimeTarget.workspaceId;
          // When switching to focus without an explicit branch, default to the
          // champion if one is picked, else the first branch.
          const resolvedFocus =
            viewMode === "focus"
              ? (focusedBranchTaskId ??
                group.focusedBranchTaskId ??
                group.championTaskId ??
                group.branchTaskIds[0] ??
                null)
              : null;
          const nextGroup: ColiseumGroupState = {
            ...group,
            viewMode,
            focusedBranchTaskId: resolvedFocus,
          };
          set((nextState) =>
            workspaceId === nextState.activeWorkspaceId
              ? {
                  activeColiseumsByTask: {
                    ...nextState.activeColiseumsByTask,
                    [parentTaskId]: nextGroup,
                  },
                }
              : nextState.workspaceRuntimeCacheById[workspaceId]
                ? {
                    workspaceRuntimeCacheById: {
                      ...nextState.workspaceRuntimeCacheById,
                      [workspaceId]: {
                        ...nextState.workspaceRuntimeCacheById[workspaceId]!,
                        activeColiseumsByTask: {
                          ...nextState.workspaceRuntimeCacheById[workspaceId]!
                            .activeColiseumsByTask,
                          [parentTaskId]: nextGroup,
                        },
                      },
                    },
                  }
                : nextState,
          );
        },
        minimizeColiseum: ({ parentTaskId }) => {
          const state = get();
          const group = state.activeColiseumsByTask[parentTaskId];
          if (!group || group.minimized) {
            return;
          }
          const parentRuntimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!parentRuntimeTarget) {
            return;
          }
          const workspaceId = parentRuntimeTarget.workspaceId;
          const nextGroup: ColiseumGroupState = { ...group, minimized: true };
          set((nextState) =>
            workspaceId === nextState.activeWorkspaceId
              ? {
                  activeColiseumsByTask: {
                    ...nextState.activeColiseumsByTask,
                    [parentTaskId]: nextGroup,
                  },
                }
              : nextState.workspaceRuntimeCacheById[workspaceId]
                ? {
                    workspaceRuntimeCacheById: {
                      ...nextState.workspaceRuntimeCacheById,
                      [workspaceId]: {
                        ...nextState.workspaceRuntimeCacheById[workspaceId]!,
                        activeColiseumsByTask: {
                          ...nextState.workspaceRuntimeCacheById[workspaceId]!
                            .activeColiseumsByTask,
                          [parentTaskId]: nextGroup,
                        },
                      },
                    },
                  }
                : nextState,
          );
        },
        restoreColiseum: ({ parentTaskId }) => {
          const state = get();
          const group = state.activeColiseumsByTask[parentTaskId];
          if (!group || !group.minimized) {
            return;
          }
          const parentRuntimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!parentRuntimeTarget) {
            return;
          }
          const workspaceId = parentRuntimeTarget.workspaceId;
          const nextGroup: ColiseumGroupState = { ...group, minimized: false };
          set((nextState) =>
            workspaceId === nextState.activeWorkspaceId
              ? {
                  activeColiseumsByTask: {
                    ...nextState.activeColiseumsByTask,
                    [parentTaskId]: nextGroup,
                  },
                }
              : nextState.workspaceRuntimeCacheById[workspaceId]
                ? {
                    workspaceRuntimeCacheById: {
                      ...nextState.workspaceRuntimeCacheById,
                      [workspaceId]: {
                        ...nextState.workspaceRuntimeCacheById[workspaceId]!,
                        activeColiseumsByTask: {
                          ...nextState.workspaceRuntimeCacheById[workspaceId]!
                            .activeColiseumsByTask,
                          [parentTaskId]: nextGroup,
                        },
                      },
                    },
                  }
                : nextState,
          );
        },
        closeColiseumBranch: ({ branchTaskId }) => {
          const state = get();
          // Find the parent group that owns this branch.
          const entry = Object.entries(state.activeColiseumsByTask).find(
            ([, group]) => group?.branchTaskIds.includes(branchTaskId),
          );
          if (!entry) {
            return;
          }
          const [parentTaskId, group] = entry;
          if (!group) {
            return;
          }
          const parentRuntimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!parentRuntimeTarget) {
            return;
          }
          const workspaceId = parentRuntimeTarget.workspaceId;

          // Side effects: abort the branch's turn if still running, cleanup provider cache.
          const activeTurnId =
            parentRuntimeTarget.session.activeTurnIdsByTask[branchTaskId];
          if (activeTurnId) {
            const abortTurn = window.api?.provider?.abortTurn;
            if (abortTurn) {
              void abortTurn({ turnId: activeTurnId });
            }
          }
          clearProviderTurnStallTimer(branchTaskId);
          const cleanupTask = window.api?.provider?.cleanupTask;
          if (cleanupTask) {
            void cleanupTask({ taskId: branchTaskId });
          }

          const nextBranchTaskIds = group.branchTaskIds.filter(
            (id) => id !== branchTaskId,
          );
          // If fewer than 2 branches remain, drop the whole group (no contest
          // to continue). Otherwise shrink the group.
          const dropGroup = nextBranchTaskIds.length < 2;
          const branchesToDrop = dropGroup
            ? group.branchTaskIds
            : [branchTaskId];

          set((nextState) => {
            const branchDropSet = new Set(branchesToDrop);
            const patchForActive = () => ({
              tasks: nextState.tasks.filter(
                (task) => !branchDropSet.has(task.id),
              ),
              messagesByTask: stripColiseumBranchesFromRecords(
                nextState.messagesByTask,
                branchesToDrop,
              ),
              messageCountByTask: stripColiseumBranchesFromRecords(
                nextState.messageCountByTask,
                branchesToDrop,
              ),
              activeTurnIdsByTask: stripColiseumBranchesFromRecords(
                nextState.activeTurnIdsByTask,
                branchesToDrop,
              ),
              providerSessionByTask: stripColiseumBranchesFromRecords(
                nextState.providerSessionByTask,
                branchesToDrop,
              ),
              nativeSessionReadyByTask: stripColiseumBranchesFromRecords(
                nextState.nativeSessionReadyByTask,
                branchesToDrop,
              ),
              promptDraftByTask: stripColiseumBranchesFromRecords(
                nextState.promptDraftByTask,
                branchesToDrop,
              ),
              taskWorkspaceIdById: stripColiseumBranchesFromRecords(
                nextState.taskWorkspaceIdById,
                branchesToDrop,
              ),
              activeColiseumsByTask: dropGroup
                ? (() => {
                    const copy = { ...nextState.activeColiseumsByTask };
                    delete copy[parentTaskId];
                    return copy;
                  })()
                : {
                    ...nextState.activeColiseumsByTask,
                    [parentTaskId]: {
                      ...group,
                      branchTaskIds: nextBranchTaskIds,
                    },
                  },
              activeTaskId:
                nextState.activeTaskId &&
                branchDropSet.has(nextState.activeTaskId)
                  ? parentTaskId
                  : nextState.activeTaskId,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(nextState),
            });

            if (workspaceId === nextState.activeWorkspaceId) {
              return patchForActive();
            }
            const cachedSession =
              nextState.workspaceRuntimeCacheById[workspaceId];
            if (!cachedSession) {
              return nextState;
            }
            return {
              taskWorkspaceIdById: stripColiseumBranchesFromRecords(
                nextState.taskWorkspaceIdById,
                branchesToDrop,
              ),
              workspaceRuntimeCacheById: {
                ...nextState.workspaceRuntimeCacheById,
                [workspaceId]: {
                  ...cachedSession,
                  tasks: cachedSession.tasks.filter(
                    (task) => !branchDropSet.has(task.id),
                  ),
                  messagesByTask: stripColiseumBranchesFromRecords(
                    cachedSession.messagesByTask,
                    branchesToDrop,
                  ),
                  messageCountByTask: stripColiseumBranchesFromRecords(
                    cachedSession.messageCountByTask,
                    branchesToDrop,
                  ),
                  activeTurnIdsByTask: stripColiseumBranchesFromRecords(
                    cachedSession.activeTurnIdsByTask,
                    branchesToDrop,
                  ),
                  providerSessionByTask: stripColiseumBranchesFromRecords(
                    cachedSession.providerSessionByTask,
                    branchesToDrop,
                  ),
                  nativeSessionReadyByTask: stripColiseumBranchesFromRecords(
                    cachedSession.nativeSessionReadyByTask,
                    branchesToDrop,
                  ),
                  promptDraftByTask: stripColiseumBranchesFromRecords(
                    cachedSession.promptDraftByTask,
                    branchesToDrop,
                  ),
                  activeColiseumsByTask: dropGroup
                    ? (() => {
                        const copy = {
                          ...cachedSession.activeColiseumsByTask,
                        };
                        delete copy[parentTaskId];
                        return copy;
                      })()
                    : {
                        ...cachedSession.activeColiseumsByTask,
                        [parentTaskId]: {
                          ...group,
                          branchTaskIds: nextBranchTaskIds,
                        },
                      },
                },
              },
            };
          });
        },
        discardColiseumRun: ({ parentTaskId }) => {
          const state = get();
          const group = state.activeColiseumsByTask[parentTaskId];
          if (!group) {
            return;
          }
          // Discard = drop the whole contest without promoting any branch.
          // If a champion was previously picked, its graft stays on the parent —
          // only the branches and arena state are removed. To fully roll the
          // parent back to pre-fan-out, the caller should invoke
          // `unpickColiseumChampion` first.
          //
          // The reviewer task (if any) lives under the same parent and is
          // torn down alongside branches so no orphaned runtime remains.
          const abortTurn = window.api?.provider?.abortTurn;
          const cleanupTask = window.api?.provider?.cleanupTask;
          const ephemeralTaskIds = [
            ...group.branchTaskIds,
            ...(group.reviewerTaskId ? [group.reviewerTaskId] : []),
          ];
          for (const ephemeralTaskId of ephemeralTaskIds) {
            const activeTurnId = state.activeTurnIdsByTask[ephemeralTaskId];
            if (activeTurnId && abortTurn) {
              void abortTurn({ turnId: activeTurnId });
            }
            clearProviderTurnStallTimer(ephemeralTaskId);
            if (cleanupTask) {
              void cleanupTask({ taskId: ephemeralTaskId });
            }
          }
          const parentRuntimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!parentRuntimeTarget) {
            return;
          }
          const workspaceId = parentRuntimeTarget.workspaceId;
          const branchesToDrop = ephemeralTaskIds;

          set((nextState) => {
            const branchDropSet = new Set(branchesToDrop);
            const dropActiveColiseumsFromActive = {
              ...nextState.activeColiseumsByTask,
            };
            delete dropActiveColiseumsFromActive[parentTaskId];

            if (workspaceId === nextState.activeWorkspaceId) {
              return {
                tasks: nextState.tasks.filter(
                  (task) => !branchDropSet.has(task.id),
                ),
                messagesByTask: stripColiseumBranchesFromRecords(
                  nextState.messagesByTask,
                  branchesToDrop,
                ),
                messageCountByTask: stripColiseumBranchesFromRecords(
                  nextState.messageCountByTask,
                  branchesToDrop,
                ),
                activeTurnIdsByTask: stripColiseumBranchesFromRecords(
                  nextState.activeTurnIdsByTask,
                  branchesToDrop,
                ),
                providerSessionByTask: stripColiseumBranchesFromRecords(
                  nextState.providerSessionByTask,
                  branchesToDrop,
                ),
                nativeSessionReadyByTask: stripColiseumBranchesFromRecords(
                  nextState.nativeSessionReadyByTask,
                  branchesToDrop,
                ),
                promptDraftByTask: stripColiseumBranchesFromRecords(
                  nextState.promptDraftByTask,
                  branchesToDrop,
                ),
                taskWorkspaceIdById: stripColiseumBranchesFromRecords(
                  nextState.taskWorkspaceIdById,
                  branchesToDrop,
                ),
                activeColiseumsByTask: dropActiveColiseumsFromActive,
                activeTaskId:
                  nextState.activeTaskId &&
                  branchDropSet.has(nextState.activeTaskId)
                    ? parentTaskId
                    : nextState.activeTaskId,
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              };
            }
            const cachedSession =
              nextState.workspaceRuntimeCacheById[workspaceId];
            if (!cachedSession) {
              return nextState;
            }
            const nextCachedColiseums = {
              ...cachedSession.activeColiseumsByTask,
            };
            delete nextCachedColiseums[parentTaskId];
            return {
              taskWorkspaceIdById: stripColiseumBranchesFromRecords(
                nextState.taskWorkspaceIdById,
                branchesToDrop,
              ),
              workspaceRuntimeCacheById: {
                ...nextState.workspaceRuntimeCacheById,
                [workspaceId]: {
                  ...cachedSession,
                  tasks: cachedSession.tasks.filter(
                    (task) => !branchDropSet.has(task.id),
                  ),
                  messagesByTask: stripColiseumBranchesFromRecords(
                    cachedSession.messagesByTask,
                    branchesToDrop,
                  ),
                  messageCountByTask: stripColiseumBranchesFromRecords(
                    cachedSession.messageCountByTask,
                    branchesToDrop,
                  ),
                  activeTurnIdsByTask: stripColiseumBranchesFromRecords(
                    cachedSession.activeTurnIdsByTask,
                    branchesToDrop,
                  ),
                  providerSessionByTask: stripColiseumBranchesFromRecords(
                    cachedSession.providerSessionByTask,
                    branchesToDrop,
                  ),
                  nativeSessionReadyByTask: stripColiseumBranchesFromRecords(
                    cachedSession.nativeSessionReadyByTask,
                    branchesToDrop,
                  ),
                  promptDraftByTask: stripColiseumBranchesFromRecords(
                    cachedSession.promptDraftByTask,
                    branchesToDrop,
                  ),
                  activeColiseumsByTask: nextCachedColiseums,
                },
              },
            };
          });
        },
        // Legacy alias. New callers should use `discardColiseumRun` directly so
        // the destructive intent is obvious.
        dismissColiseum: ({ parentTaskId }) => {
          get().discardColiseumRun({ parentTaskId });
        },
        enqueueColiseumIncorporateFollowUp: ({
          parentTaskId,
          branchTaskId,
        }) => {
          const state = get();
          const group = state.activeColiseumsByTask[parentTaskId];
          if (!group || !group.branchTaskIds.includes(branchTaskId)) {
            return;
          }
          const parentRuntimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!parentRuntimeTarget) {
            return;
          }
          const parentSession = parentRuntimeTarget.session;
          const meta = group.branchMeta[branchTaskId];
          if (!meta) return;

          const branchMessages =
            parentSession.messagesByTask[branchTaskId] ?? [];
          const branchAssistantText = (() => {
            // Final assistant text from the branch — same accumulator the
            // reviewer summary uses but scoped to this single branch.
            const tail = branchMessages.slice(group.parentMessageCountAtFanout);
            const assistants = tail.filter((m) => m.role === "assistant");
            return assistants
              .flatMap((msg) =>
                msg.parts
                  .filter(
                    (
                      p,
                    ): p is Extract<
                      (typeof msg.parts)[number],
                      { type: "text" }
                    > => p.type === "text",
                  )
                  .map((p) => p.text),
              )
              .join("\n")
              .trim();
          })();

          const quotedText =
            branchAssistantText.length > 0
              ? branchAssistantText
                  .split("\n")
                  .map((line) => `> ${line}`)
                  .join("\n")
              : "> _(no final text — branch used only tools)_";

          const providerLabel = meta.provider;
          const modelLabel = meta.model;
          const followUpText = `Please also use useful ideas from the ${providerLabel}/${modelLabel} branch's answer (below). Reconcile with the current champion where they overlap, and call out explicit trade-offs if something has to give.\n\n${quotedText}\n\n— (auto-generated from Coliseum "Use ideas from…")`;

          const currentDraft =
            parentSession.promptDraftByTask[parentTaskId] ?? EMPTY_PROMPT_DRAFT;
          const separator = currentDraft.text.trim().length > 0 ? "\n\n" : "";
          const nextText = `${currentDraft.text}${separator}${followUpText}`;

          get().updatePromptDraft({
            taskId: parentTaskId,
            patch: { text: nextText },
          });
        },
        enqueueColiseumMergedFollowUp: ({ parentTaskId }) => {
          const state = get();
          const group = state.activeColiseumsByTask[parentTaskId];
          const reviewerVerdict = group?.reviewerVerdict;
          if (
            !group ||
            !reviewerVerdict ||
            reviewerVerdict.status !== "complete"
          ) {
            return;
          }
          const parentRuntimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!parentRuntimeTarget) {
            return;
          }
          const parentSession = parentRuntimeTarget.session;

          const branchSummaries = group.branchTaskIds
            .map((branchId) => {
              const meta = group.branchMeta[branchId];
              if (!meta) return null;
              const branchMessages =
                parentSession.messagesByTask[branchId] ?? [];
              return extractBranchSummary({
                branchMeta: meta,
                branchMessages,
                parentMessageCountAtFanout: group.parentMessageCountAtFanout,
              });
            })
            .filter(
              (summary): summary is NonNullable<typeof summary> =>
                summary !== null,
            );
          if (branchSummaries.length === 0) {
            return;
          }

          const followUpText = buildColiseumMergedFollowUp({
            reviewerVerdict,
            branchSummaries,
            championTaskId: group.championTaskId,
          });
          const currentDraft =
            parentSession.promptDraftByTask[parentTaskId] ?? EMPTY_PROMPT_DRAFT;
          const separator = currentDraft.text.trim().length > 0 ? "\n\n" : "";
          const nextText = `${currentDraft.text}${separator}${followUpText}`;

          get().updatePromptDraft({
            taskId: parentTaskId,
            patch: { text: nextText },
          });
        },
        launchColiseumReviewer: async ({
          parentTaskId,
          reviewerProvider,
          reviewerModel,
        }) => {
          const state = get();
          const group = state.activeColiseumsByTask[parentTaskId];
          if (!group) {
            return {
              status: "blocked",
              reason: "Coliseum not found for this task.",
            } as const;
          }
          const parentRuntimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!parentRuntimeTarget) {
            return {
              status: "blocked",
              reason: "Parent task not found.",
            } as const;
          }
          const parentSession = parentRuntimeTarget.session;
          const workspaceId = parentRuntimeTarget.workspaceId;
          const parentTask = parentRuntimeTarget.task;

          // Abort any prior reviewer cleanly before starting a new one — the
          // verdict card's "Re-run" button lands here.
          if (group.reviewerTaskId) {
            const priorTurnId = state.activeTurnIdsByTask[group.reviewerTaskId];
            const abortTurn = window.api?.provider?.abortTurn;
            if (priorTurnId && abortTurn) {
              void abortTurn({ turnId: priorTurnId });
            }
            const cleanupTask = window.api?.provider?.cleanupTask;
            if (cleanupTask) {
              void cleanupTask({ taskId: group.reviewerTaskId });
            }
            clearProviderTurnStallTimer(group.reviewerTaskId);
          }

          // Pull the original user prompt — the first user message added at
          // fan-out time. Using messagesByTask on a branch: message index
          // `parentMessageCountAtFanout` is the user's Coliseum prompt.
          const firstBranchId = group.branchTaskIds[0];
          const firstBranchMessages = firstBranchId
            ? (parentSession.messagesByTask[firstBranchId] ?? [])
            : [];
          const originalUserPrompt =
            firstBranchMessages[group.parentMessageCountAtFanout]?.content ??
            "";

          // Reduce each branch to the summary shape the reviewer needs.
          const branchSummaries = group.branchTaskIds
            .map((branchId) => {
              const meta = group.branchMeta[branchId];
              if (!meta) return null;
              const branchMessages =
                parentSession.messagesByTask[branchId] ?? [];
              return extractBranchSummary({
                branchMeta: meta,
                branchMessages,
                parentMessageCountAtFanout: group.parentMessageCountAtFanout,
              });
            })
            .filter((s): s is NonNullable<typeof s> => s !== null);
          if (branchSummaries.length === 0) {
            return {
              status: "blocked",
              reason: "No branch output available to review yet.",
            } as const;
          }

          const reviewerPrompt = buildReviewerPrompt({
            originalUserPrompt,
            branchSummaries,
          });

          const parentPromptDraft =
            parentSession.promptDraftByTask[parentTaskId];

          const plan = planReviewerLaunch({
            parentTask,
            group,
            parentTaskWorkspaceId: workspaceId,
            reviewerProvider,
            reviewerModel,
            reviewerPrompt,
            parentPromptDraft,
          });

          // Apply reviewer task + seeded messages + group state to the store.
          set((nextState) => {
            const mergedTaskWorkspaceIdById = {
              ...nextState.taskWorkspaceIdById,
              [plan.reviewerTask.id]: workspaceId,
            };
            if (workspaceId === nextState.activeWorkspaceId) {
              return {
                tasks: [...nextState.tasks, plan.reviewerTask],
                messagesByTask: {
                  ...nextState.messagesByTask,
                  [plan.reviewerTask.id]: plan.reviewerMessages,
                },
                messageCountByTask: {
                  ...nextState.messageCountByTask,
                  [plan.reviewerTask.id]: plan.reviewerMessages.length,
                },
                activeTurnIdsByTask: {
                  ...nextState.activeTurnIdsByTask,
                  [plan.reviewerTask.id]: plan.reviewerTurnId,
                },
                providerSessionByTask: {
                  ...nextState.providerSessionByTask,
                  [plan.reviewerTask.id]: plan.reviewerProviderSession,
                },
                nativeSessionReadyByTask: {
                  ...nextState.nativeSessionReadyByTask,
                  [plan.reviewerTask.id]: false,
                },
                promptDraftByTask: {
                  ...nextState.promptDraftByTask,
                  [plan.reviewerTask.id]: plan.reviewerPromptDraft,
                },
                activeColiseumsByTask: {
                  ...nextState.activeColiseumsByTask,
                  [parentTaskId]: plan.nextGroup,
                },
                taskWorkspaceIdById: mergedTaskWorkspaceIdById,
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              };
            }
            const cachedSession =
              nextState.workspaceRuntimeCacheById[workspaceId];
            if (!cachedSession) {
              return nextState;
            }
            return {
              taskWorkspaceIdById: mergedTaskWorkspaceIdById,
              workspaceRuntimeCacheById: {
                ...nextState.workspaceRuntimeCacheById,
                [workspaceId]: {
                  ...cachedSession,
                  tasks: [...cachedSession.tasks, plan.reviewerTask],
                  messagesByTask: {
                    ...cachedSession.messagesByTask,
                    [plan.reviewerTask.id]: plan.reviewerMessages,
                  },
                  messageCountByTask: {
                    ...cachedSession.messageCountByTask,
                    [plan.reviewerTask.id]: plan.reviewerMessages.length,
                  },
                  activeTurnIdsByTask: {
                    ...cachedSession.activeTurnIdsByTask,
                    [plan.reviewerTask.id]: plan.reviewerTurnId,
                  },
                  providerSessionByTask: {
                    ...cachedSession.providerSessionByTask,
                    [plan.reviewerTask.id]: plan.reviewerProviderSession,
                  },
                  nativeSessionReadyByTask: {
                    ...cachedSession.nativeSessionReadyByTask,
                    [plan.reviewerTask.id]: false,
                  },
                  promptDraftByTask: {
                    ...cachedSession.promptDraftByTask,
                    [plan.reviewerTask.id]: plan.reviewerPromptDraft,
                  },
                  activeColiseumsByTask: {
                    ...cachedSession.activeColiseumsByTask,
                    [parentTaskId]: plan.nextGroup,
                  },
                },
              },
            };
          });

          // Resolve workspace cwd for dispatch.
          const { cwd: parentWorkspaceCwd } = resolveTaskWorkspaceContext({
            taskId: parentTaskId,
            activeWorkspaceId: state.activeWorkspaceId,
            taskWorkspaceIdById: state.taskWorkspaceIdById,
            workspacePathById: state.workspacePathById,
            workspaceDefaultById: state.workspaceDefaultById,
            projectPath: state.projectPath,
          });

          const reviewerTaskId = plan.reviewerTask.id;
          const reviewerTurnId = plan.reviewerTurnId;
          const reviewerConversation = buildCanonicalConversationRequest({
            turnId: reviewerTurnId,
            taskId: reviewerTaskId,
            workspaceId,
            providerId: reviewerProvider,
            model: reviewerModel,
            history: [],
            userInput: reviewerPrompt,
            mode: "chat",
            nativeSessionId: null,
            retrievedContextParts: [],
          });

          const resolvedRuntimeState = resolvePromptDraftRuntimeState({
            promptDraft: plan.reviewerPromptDraft,
            fallback: {
              claudePermissionMode: state.settings.claudePermissionMode,
              claudePermissionModeBeforePlan:
                state.settings.claudePermissionModeBeforePlan,
              codexPlanMode: state.settings.codexPlanMode,
            },
          });

          const turnActivityStartedAt = Date.now();
          set((nextState) => ({
            providerTurnActivityByTask: startProviderTurnActivity({
              activityByTask: nextState.providerTurnActivityByTask,
              taskId: reviewerTaskId,
              turnId: reviewerTurnId,
              providerId: reviewerProvider,
              now: turnActivityStartedAt,
            }),
          }));
          scheduleProviderTurnStallTimer({
            taskId: reviewerTaskId,
            turnId: reviewerTurnId,
            lastEventAt: turnActivityStartedAt,
          });

          const reviewerEventController = createProviderTurnEventController({
            flushEvents: (pendingEvents) => {
              const currentState = get();
              const applied = applyPendingProviderEventsToStoreState({
                state: currentState,
                taskWorkspaceId: workspaceId,
                taskId: reviewerTaskId,
                events: pendingEvents,
                provider: reviewerProvider,
                model: reviewerModel,
                turnId: reviewerTurnId,
              });
              const turnStillActive =
                currentState.activeTurnIdsByTask[reviewerTaskId] ===
                reviewerTurnId;
              const nextTurnActivityByTask = turnStillActive
                ? applyProviderTurnActivityEvents({
                    activityByTask: currentState.providerTurnActivityByTask,
                    taskId: reviewerTaskId,
                    turnId: reviewerTurnId,
                    providerId: reviewerProvider,
                    events: pendingEvents,
                  })
                : currentState.providerTurnActivityByTask;
              const activityChanged =
                nextTurnActivityByTask !==
                currentState.providerTurnActivityByTask;
              if (applied.stateChanged || activityChanged) {
                set({
                  ...applied.statePatch,
                  ...(activityChanged
                    ? {
                        providerTurnActivityByTask: nextTurnActivityByTask,
                      }
                    : {}),
                });
              }

              // Mirror reviewer task's assistant text into the group's
              // `reviewerVerdict.content` so the arena card can subscribe
              // directly to `group.reviewerVerdict` without pulling the
              // reviewer task's messages (which are hidden from the task
              // list by `coliseumParentTaskId`). Kept here rather than in
              // the shared reducer so main task logic stays untouched.
              mirrorReviewerVerdict({
                set,
                get,
                parentTaskId,
                reviewerTaskId,
                workspaceId,
                pendingEvents,
              });

              if (
                !turnStillActive ||
                pendingEvents.some((event) => event.type === "done")
              ) {
                clearProviderTurnStallTimer(reviewerTaskId);
              } else {
                const nextActivity = nextTurnActivityByTask[reviewerTaskId];
                if (nextActivity) {
                  scheduleProviderTurnStallTimer({
                    taskId: reviewerTaskId,
                    turnId: reviewerTurnId,
                    lastEventAt: nextActivity.lastEventAt,
                  });
                }
              }
            },
          });

          runProviderTurn({
            turnId: reviewerTurnId,
            provider: reviewerProvider,
            prompt: reviewerPrompt,
            conversation: reviewerConversation,
            taskId: reviewerTaskId,
            workspaceId,
            cwd: parentWorkspaceCwd,
            runtimeOptions: applyProjectBasePromptToRuntimeOptions({
              runtimeOptions: buildProviderRuntimeOptions({
                provider: reviewerProvider,
                model: reviewerModel,
                settings: {
                  ...get().settings,
                  claudePermissionMode:
                    resolvedRuntimeState.claudePermissionMode,
                  codexPlanMode: resolvedRuntimeState.codexPlanMode,
                },
                providerSession: plan.reviewerProviderSession,
              }),
              projectBasePrompt: resolveProjectBasePrompt({
                projectPath: get().projectPath,
                recentProjects: get().recentProjects,
              }),
            }),
            onEvent: ({ event }) => reviewerEventController.handleEvent(event),
          });

          return {
            status: "started",
            reviewerTaskId,
            turnId: reviewerTurnId,
          } as const;
        },
        clearColiseumReviewerVerdict: ({ parentTaskId }) => {
          const state = get();
          const group = state.activeColiseumsByTask[parentTaskId];
          if (!group || (!group.reviewerTaskId && !group.reviewerVerdict)) {
            return;
          }
          const reviewerTaskId = group.reviewerTaskId;
          const parentRuntimeTarget = resolveTaskRuntimeTarget({
            state,
            taskId: parentTaskId,
          });
          if (!parentRuntimeTarget) {
            return;
          }
          const workspaceId = parentRuntimeTarget.workspaceId;

          if (reviewerTaskId) {
            const activeTurnId = state.activeTurnIdsByTask[reviewerTaskId];
            const abortTurn = window.api?.provider?.abortTurn;
            if (activeTurnId && abortTurn) {
              void abortTurn({ turnId: activeTurnId });
            }
            clearProviderTurnStallTimer(reviewerTaskId);
            const cleanupTask = window.api?.provider?.cleanupTask;
            if (cleanupTask) {
              void cleanupTask({ taskId: reviewerTaskId });
            }
          }

          set((nextState) => {
            const dropIds = reviewerTaskId ? [reviewerTaskId] : [];
            const nextGroup = clearReviewerFromGroup(group);
            if (workspaceId === nextState.activeWorkspaceId) {
              return {
                tasks:
                  dropIds.length > 0
                    ? nextState.tasks.filter(
                        (task) => !dropIds.includes(task.id),
                      )
                    : nextState.tasks,
                messagesByTask: stripColiseumBranchesFromRecords(
                  nextState.messagesByTask,
                  dropIds,
                ),
                messageCountByTask: stripColiseumBranchesFromRecords(
                  nextState.messageCountByTask,
                  dropIds,
                ),
                activeTurnIdsByTask: stripColiseumBranchesFromRecords(
                  nextState.activeTurnIdsByTask,
                  dropIds,
                ),
                providerSessionByTask: stripColiseumBranchesFromRecords(
                  nextState.providerSessionByTask,
                  dropIds,
                ),
                nativeSessionReadyByTask: stripColiseumBranchesFromRecords(
                  nextState.nativeSessionReadyByTask,
                  dropIds,
                ),
                promptDraftByTask: stripColiseumBranchesFromRecords(
                  nextState.promptDraftByTask,
                  dropIds,
                ),
                taskWorkspaceIdById: stripColiseumBranchesFromRecords(
                  nextState.taskWorkspaceIdById,
                  dropIds,
                ),
                activeColiseumsByTask: {
                  ...nextState.activeColiseumsByTask,
                  [parentTaskId]: nextGroup,
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              };
            }
            const cachedSession =
              nextState.workspaceRuntimeCacheById[workspaceId];
            if (!cachedSession) {
              return nextState;
            }
            return {
              taskWorkspaceIdById: stripColiseumBranchesFromRecords(
                nextState.taskWorkspaceIdById,
                dropIds,
              ),
              workspaceRuntimeCacheById: {
                ...nextState.workspaceRuntimeCacheById,
                [workspaceId]: {
                  ...cachedSession,
                  tasks:
                    dropIds.length > 0
                      ? cachedSession.tasks.filter(
                          (task) => !dropIds.includes(task.id),
                        )
                      : cachedSession.tasks,
                  messagesByTask: stripColiseumBranchesFromRecords(
                    cachedSession.messagesByTask,
                    dropIds,
                  ),
                  messageCountByTask: stripColiseumBranchesFromRecords(
                    cachedSession.messageCountByTask,
                    dropIds,
                  ),
                  activeTurnIdsByTask: stripColiseumBranchesFromRecords(
                    cachedSession.activeTurnIdsByTask,
                    dropIds,
                  ),
                  providerSessionByTask: stripColiseumBranchesFromRecords(
                    cachedSession.providerSessionByTask,
                    dropIds,
                  ),
                  nativeSessionReadyByTask: stripColiseumBranchesFromRecords(
                    cachedSession.nativeSessionReadyByTask,
                    dropIds,
                  ),
                  promptDraftByTask: stripColiseumBranchesFromRecords(
                    cachedSession.promptDraftByTask,
                    dropIds,
                  ),
                  activeColiseumsByTask: {
                    ...cachedSession.activeColiseumsByTask,
                    [parentTaskId]: nextGroup,
                  },
                },
              },
            };
          });
        },
        abortTaskTurn: ({ taskId }) => {
          const stateBefore = get();
          if (isManagedTaskReadOnly({ state: stateBefore, taskId })) {
            return;
          }
          const activeTurnId = stateBefore.activeTurnIdsByTask[taskId];
          clearProviderTurnStallTimer(taskId);
          if (activeTurnId) {
            const abortTurn = window.api?.provider?.abortTurn;
            if (abortTurn) {
              void abortTurn({ turnId: activeTurnId });
            }
          }
          // Clean up provider runtime state (thread caches, session maps) so a
          // subsequent turn does not try to resume a stale / aborted thread.
          const cleanupTask = window.api?.provider?.cleanupTask;
          if (cleanupTask) {
            void cleanupTask({ taskId });
          }

          set((state) => {
            const current = state.messagesByTask[taskId] ?? [];
            const interruptedMessages =
              interruptPendingToolInteractionsInMessages({
                messages: current,
              });
            const target = interruptedMessages[interruptedMessages.length - 1];
            // Clear persisted provider session so stale thread IDs are not
            // carried across to subsequent turns or workspace reloads.
            const { [taskId]: _dropped, ...restProviderSession } =
              state.providerSessionByTask;
            if (!target || target.role !== "assistant" || !target.isStreaming) {
              return {
                messagesByTask:
                  interruptedMessages === current
                    ? state.messagesByTask
                    : {
                        ...state.messagesByTask,
                        [taskId]: interruptedMessages,
                      },
                activeTurnIdsByTask: {
                  ...state.activeTurnIdsByTask,
                  [taskId]: undefined,
                },
                providerTurnActivityByTask: clearProviderTurnActivity({
                  activityByTask: state.providerTurnActivityByTask,
                  taskId,
                }),
                providerSessionByTask: restProviderSession,
                ...(interruptedMessages === current
                  ? {}
                  : {
                      workspaceSnapshotVersion:
                        incrementWorkspaceSnapshotVersion(state),
                    }),
              };
            }

            const aborted: ChatMessage = {
              ...target,
              completedAt: buildRecentTimestamp(),
              isStreaming: false,
              parts: [
                ...target.parts,
                {
                  type: "system_event",
                  content: LOCAL_ABORT_SYSTEM_EVENT_CONTENT,
                },
              ],
            };

            return {
              messagesByTask: {
                ...state.messagesByTask,
                [taskId]: [...interruptedMessages.slice(0, -1), aborted],
              },
              activeTurnIdsByTask: {
                ...state.activeTurnIdsByTask,
                [taskId]: undefined,
              },
              providerTurnActivityByTask: clearProviderTurnActivity({
                activityByTask: state.providerTurnActivityByTask,
                taskId,
              }),
              providerSessionByTask: restProviderSession,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        resolveApproval: ({ taskId, messageId, approved }) => {
          if (taskId === STAVE_MUSE_SESSION_ID) {
            void get().resolveStaveMuseApproval({ messageId, approved });
            return;
          }
          const stateBefore = get();
          if (isManagedTaskReadOnly({ state: stateBefore, taskId })) {
            return;
          }
          const runtimeTarget = resolveTaskRuntimeTarget({
            state: stateBefore,
            taskId,
          });
          const workspaceId =
            runtimeTarget?.workspaceId ??
            stateBefore.taskWorkspaceIdById[taskId] ??
            stateBefore.activeWorkspaceId;
          const targetSession =
            runtimeTarget?.session ??
            (workspaceId
              ? getWorkspaceSessionForState({ state: stateBefore, workspaceId })
              : null);
          const activeTurnId = targetSession?.activeTurnIdsByTask[taskId];
          const message = (targetSession?.messagesByTask[taskId] ?? []).find(
            (item) => item.id === messageId,
          );
          const approvalPart = findLatestPendingApprovalPart({ message });

          const appendApprovalFailure = (failureText: string) => {
            set((state) => {
              const cachedSession =
                workspaceId && workspaceId !== state.activeWorkspaceId
                  ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
                  : null;
              const current =
                (cachedSession?.messagesByTask ?? state.messagesByTask)[
                  taskId
                ] ?? [];
              const systemMessage: ChatMessage = {
                id: buildMessageId({ taskId, count: current.length }),
                role: "assistant",
                model: "system",
                providerId: "user",
                content: failureText,
                parts: [
                  {
                    type: "system_event",
                    content: failureText,
                  },
                ],
              };
              if (cachedSession && workspaceId) {
                return {
                  workspaceRuntimeCacheById: {
                    ...state.workspaceRuntimeCacheById,
                    [workspaceId]: {
                      ...cachedSession,
                      messagesByTask: {
                        ...cachedSession.messagesByTask,
                        [taskId]: [...current, systemMessage],
                      },
                      messageCountByTask: {
                        ...cachedSession.messageCountByTask,
                        [taskId]: Math.max(
                          (cachedSession.messageCountByTask[taskId] ??
                            current.length) + 1,
                          current.length + 1,
                        ),
                      },
                    },
                  },
                };
              }
              return {
                messagesByTask: {
                  ...state.messagesByTask,
                  [taskId]: [...current, systemMessage],
                },
                messageCountByTask: {
                  ...state.messageCountByTask,
                  [taskId]: Math.max(
                    (state.messageCountByTask[taskId] ?? current.length) + 1,
                    current.length + 1,
                  ),
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            });
          };

          const applyApprovalResponse = (requestId: string) => {
            const resolvedAt = Date.now();
            set((state) => {
              const nextProviderTurnActivityByTask = activeTurnId
                ? markProviderTurnInteractionResolved({
                    activityByTask: state.providerTurnActivityByTask,
                    taskId,
                    turnId: activeTurnId,
                    now: resolvedAt,
                  })
                : state.providerTurnActivityByTask;
              if (workspaceId && workspaceId !== state.activeWorkspaceId) {
                const cachedSession =
                  state.workspaceRuntimeCacheById[workspaceId];
                if (!cachedSession) {
                  return state;
                }
                const nextMessagesState = applyApprovalState({
                  messagesByTask: cachedSession.messagesByTask,
                  workspaceSnapshotVersion: 0,
                  taskId,
                  messageId,
                  requestId,
                  approved,
                });
                return {
                  workspaceRuntimeCacheById: {
                    ...state.workspaceRuntimeCacheById,
                    [workspaceId]: {
                      ...cachedSession,
                      messagesByTask: nextMessagesState.messagesByTask,
                    },
                  },
                  providerTurnActivityByTask: nextProviderTurnActivityByTask,
                };
              }

              return {
                ...applyApprovalState({
                  messagesByTask: state.messagesByTask,
                  workspaceSnapshotVersion: state.workspaceSnapshotVersion,
                  taskId,
                  messageId,
                  requestId,
                  approved,
                }),
                providerTurnActivityByTask: nextProviderTurnActivityByTask,
              };
            });
            if (activeTurnId) {
              scheduleProviderTurnStallTimer({
                taskId,
                turnId: activeTurnId,
                lastEventAt: resolvedAt,
              });
            }
            const latestState = get();
            const unreadNotificationIds = findUnreadApprovalNotificationIds({
              notifications: latestState.notifications,
              taskId,
              messageId,
              requestId,
            });
            if (unreadNotificationIds.length > 0) {
              void Promise.all(
                unreadNotificationIds.map((notificationId) =>
                  latestState.markNotificationRead({ id: notificationId }),
                ),
              );
            }
          };

          if (activeTurnId && approvalPart) {
            const respondApproval = window.api?.provider?.respondApproval;
            if (respondApproval) {
              void respondApproval({
                turnId: activeTurnId,
                requestId: approvalPart.requestId,
                approved,
              })
                .then((result) => {
                  if (!result.ok) {
                    appendApprovalFailure(
                      `Approval delivery failed: ${result.message ?? "unknown"}`,
                    );
                    return;
                  }
                  applyApprovalResponse(approvalPart.requestId);
                })
                .catch((error) => {
                  appendApprovalFailure(
                    `Approval delivery failed: ${String(error)}`,
                  );
                });
              return;
            }
          }

          if (
            !activeTurnId &&
            approvalPart &&
            workspaceId &&
            window.api?.localMcp?.respondApproval
          ) {
            void window.api.localMcp
              .respondApproval({
                workspaceId,
                taskId,
                requestId: approvalPart.requestId,
                approved,
              })
              .then((result) => {
                if (!result.ok) {
                  appendApprovalFailure(
                    `Approval delivery failed: ${result.message ?? "unknown"}`,
                  );
                  return;
                }
                applyApprovalResponse(approvalPart.requestId);
              })
              .catch((error) => {
                appendApprovalFailure(
                  `Approval delivery failed: ${String(error)}`,
                );
              });
            return;
          }

          if (
            !activeTurnId &&
            approvalPart &&
            window.api?.provider?.respondApproval
          ) {
            appendApprovalFailure(
              "Approval delivery failed: no active turn found for this task.",
            );
            return;
          }
          if (approvalPart) {
            appendApprovalFailure(
              "Approval delivery failed: no active turn found for this task.",
            );
            return;
          }
        },
        resolveUserInput: ({ taskId, messageId, answers, denied }) => {
          if (taskId === STAVE_MUSE_SESSION_ID) {
            void get().resolveStaveMuseUserInput({
              messageId,
              answers,
              denied,
            });
            return;
          }
          const stateBefore = get();
          if (isManagedTaskReadOnly({ state: stateBefore, taskId })) {
            return;
          }
          const runtimeTarget = resolveTaskRuntimeTarget({
            state: stateBefore,
            taskId,
          });
          const workspaceId =
            runtimeTarget?.workspaceId ??
            stateBefore.taskWorkspaceIdById[taskId] ??
            stateBefore.activeWorkspaceId;
          const targetSession =
            runtimeTarget?.session ??
            (workspaceId
              ? getWorkspaceSessionForState({ state: stateBefore, workspaceId })
              : null);
          const activeTurnId = targetSession?.activeTurnIdsByTask[taskId];
          const message = (targetSession?.messagesByTask[taskId] ?? []).find(
            (item) => item.id === messageId,
          );
          const userInputPart = findLatestPendingUserInputPart({ message });

          const appendUserInputFailure = (failureText: string) => {
            set((state) => {
              const cachedSession =
                workspaceId && workspaceId !== state.activeWorkspaceId
                  ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
                  : null;
              const current =
                (cachedSession?.messagesByTask ?? state.messagesByTask)[
                  taskId
                ] ?? [];
              const systemMessage: ChatMessage = {
                id: buildMessageId({ taskId, count: current.length }),
                role: "assistant",
                model: "system",
                providerId: "user",
                content: failureText,
                parts: [
                  {
                    type: "system_event",
                    content: failureText,
                  },
                ],
              };
              if (cachedSession && workspaceId) {
                return {
                  workspaceRuntimeCacheById: {
                    ...state.workspaceRuntimeCacheById,
                    [workspaceId]: {
                      ...cachedSession,
                      messagesByTask: {
                        ...cachedSession.messagesByTask,
                        [taskId]: [...current, systemMessage],
                      },
                      messageCountByTask: {
                        ...cachedSession.messageCountByTask,
                        [taskId]: Math.max(
                          (cachedSession.messageCountByTask[taskId] ??
                            current.length) + 1,
                          current.length + 1,
                        ),
                      },
                    },
                  },
                };
              }
              return {
                messagesByTask: {
                  ...state.messagesByTask,
                  [taskId]: [...current, systemMessage],
                },
                messageCountByTask: {
                  ...state.messageCountByTask,
                  [taskId]: Math.max(
                    (state.messageCountByTask[taskId] ?? current.length) + 1,
                    current.length + 1,
                  ),
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            });
          };

          const applyUserInputResponse = (requestId: string) => {
            const resolvedAt = Date.now();
            set((state) => {
              const nextProviderTurnActivityByTask = activeTurnId
                ? markProviderTurnInteractionResolved({
                    activityByTask: state.providerTurnActivityByTask,
                    taskId,
                    turnId: activeTurnId,
                    now: resolvedAt,
                  })
                : state.providerTurnActivityByTask;
              if (workspaceId && workspaceId !== state.activeWorkspaceId) {
                const cachedSession =
                  state.workspaceRuntimeCacheById[workspaceId];
                if (!cachedSession) {
                  return state;
                }
                const nextMessagesState = applyUserInputState({
                  messagesByTask: cachedSession.messagesByTask,
                  workspaceSnapshotVersion: 0,
                  taskId,
                  messageId,
                  requestId,
                  answers,
                  denied,
                });
                return {
                  workspaceRuntimeCacheById: {
                    ...state.workspaceRuntimeCacheById,
                    [workspaceId]: {
                      ...cachedSession,
                      messagesByTask: nextMessagesState.messagesByTask,
                    },
                  },
                  providerTurnActivityByTask: nextProviderTurnActivityByTask,
                };
              }

              return {
                ...applyUserInputState({
                  messagesByTask: state.messagesByTask,
                  workspaceSnapshotVersion: state.workspaceSnapshotVersion,
                  taskId,
                  messageId,
                  requestId,
                  answers,
                  denied,
                }),
                providerTurnActivityByTask: nextProviderTurnActivityByTask,
              };
            });
            if (activeTurnId) {
              scheduleProviderTurnStallTimer({
                taskId,
                turnId: activeTurnId,
                lastEventAt: resolvedAt,
              });
            }
          };

          if (activeTurnId && userInputPart) {
            const respondUserInput = window.api?.provider?.respondUserInput;
            if (respondUserInput) {
              void respondUserInput({
                turnId: activeTurnId,
                requestId: userInputPart.requestId,
                answers,
                denied,
              })
                .then((result) => {
                  if (!result.ok) {
                    appendUserInputFailure(
                      `User input delivery failed: ${result.message ?? "unknown"}`,
                    );
                    return;
                  }
                  applyUserInputResponse(userInputPart.requestId);
                })
                .catch((error) => {
                  appendUserInputFailure(
                    `User input delivery failed: ${String(error)}`,
                  );
                });
              return;
            }
          }

          if (
            !activeTurnId &&
            userInputPart &&
            workspaceId &&
            window.api?.localMcp?.respondUserInput
          ) {
            void window.api.localMcp
              .respondUserInput({
                workspaceId,
                taskId,
                requestId: userInputPart.requestId,
                answers,
                denied,
              })
              .then((result) => {
                if (!result.ok) {
                  appendUserInputFailure(
                    `User input delivery failed: ${result.message ?? "unknown"}`,
                  );
                  return;
                }
                applyUserInputResponse(userInputPart.requestId);
              })
              .catch((error) => {
                appendUserInputFailure(
                  `User input delivery failed: ${String(error)}`,
                );
              });
            return;
          }

          if (
            !activeTurnId &&
            userInputPart &&
            window.api?.provider?.respondUserInput
          ) {
            appendUserInputFailure(
              "User input delivery failed: no active turn found for this task.",
            );
            return;
          }
          if (userInputPart) {
            appendUserInputFailure(
              "User input delivery failed: no active turn found for this task.",
            );
          }
        },
        resolveDiff: ({ taskId, messageId, accepted, partIndex }) => {
          if (taskId === STAVE_MUSE_SESSION_ID) {
            set((state) => ({
              staveMuse: {
                ...state.staveMuse,
                messages: updateMessageById({
                  messages: state.staveMuse.messages,
                  messageId,
                  update: (message) => ({
                    ...message,
                    parts: message.parts.map((part, index) => {
                      if (part.type !== "code_diff") {
                        return part;
                      }
                      if (partIndex != null && index !== partIndex) {
                        return part;
                      }
                      return {
                        ...part,
                        status: accepted ? "accepted" : "rejected",
                      };
                    }),
                  }),
                }),
              },
            }));
            return;
          }
          set((state) => {
            const current = state.messagesByTask[taskId] ?? [];
            return {
              messagesByTask: {
                ...state.messagesByTask,
                [taskId]: updateMessageById({
                  messages: current,
                  messageId,
                  update: (message) => ({
                    ...message,
                    parts: message.parts.map((part, index) => {
                      if (part.type !== "code_diff") {
                        return part;
                      }
                      if (partIndex != null && index !== partIndex) {
                        return part;
                      }
                      return {
                        ...part,
                        status: accepted ? "accepted" : "rejected",
                      };
                    }),
                  }),
                }),
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        openDiffInEditor: ({
          editorTabId,
          filePath,
          oldContent,
          newContent,
        }) => {
          set((state) => {
            const existing = state.editorTabs.find(
              (tab) => tab.id === editorTabId,
            );
            const nextLanguage = resolveLanguage({ filePath });
            if (existing) {
              const canRefreshExisting = !existing.isDirty;
              const shouldRefreshExisting =
                canRefreshExisting &&
                (existing.filePath !== filePath ||
                  existing.language !== nextLanguage ||
                  existing.originalContent !== oldContent ||
                  existing.content !== newContent ||
                  existing.savedContent !== newContent);

              return {
                editorTabs: shouldRefreshExisting
                  ? state.editorTabs.map((tab) =>
                      tab.id === existing.id
                        ? {
                            ...tab,
                            filePath,
                            language: nextLanguage,
                            content: newContent,
                            contentState: "ready",
                            originalContent: oldContent,
                            savedContent: newContent,
                            hasConflict: false,
                            isDirty: false,
                          }
                        : tab,
                    )
                  : state.editorTabs,
                activeEditorTabId: existing.id,
                layout: {
                  ...state.layout,
                  editorVisible: true,
                  editorDiffMode: true,
                  editorMarkdownPreviewMode: false,
                },
                workspaceSnapshotVersion:
                  shouldRefreshExisting ||
                  state.activeEditorTabId !== existing.id
                    ? incrementWorkspaceSnapshotVersion(state)
                    : state.workspaceSnapshotVersion,
              };
            }

            const nextTab: EditorTab = {
              id: editorTabId,
              filePath,
              kind: "text",
              language: nextLanguage,
              content: newContent,
              contentState: "ready",
              originalContent: oldContent,
              savedContent: newContent,
              baseRevision: null,
              hasConflict: false,
              isDirty: false,
            };

            return {
              editorTabs: [...state.editorTabs, nextTab],
              activeEditorTabId: nextTab.id,
              layout: {
                ...state.layout,
                editorVisible: true,
                editorDiffMode: true,
                editorMarkdownPreviewMode: false,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        openFileFromTree: async ({
          filePath,
          line,
          column,
          fallbackContent,
        }) => {
          const state = get();
          const workspaceRootPath =
            state.workspacePathById[state.activeWorkspaceId] ||
            state.projectPath ||
            workspaceFsAdapter.getRootPath?.() ||
            undefined;
          const normalizedFilePath = resolveWorkspaceRelativeFilePath({
            filePath,
            workspacePath: workspaceRootPath,
          });
          if (!normalizedFilePath) {
            return;
          }

          const normalizedLine =
            typeof line === "number" && Number.isFinite(line)
              ? Math.max(1, Math.floor(line))
              : undefined;
          const normalizedColumn =
            typeof column === "number" && Number.isFinite(column)
              ? Math.max(1, Math.floor(column))
              : undefined;
          const pendingSelection = normalizedLine
            ? {
                tabId: `file:${normalizedFilePath}`,
                line: normalizedLine,
                ...(normalizedColumn ? { column: normalizedColumn } : {}),
              }
            : null;
          const isImageFile = isImageFilePath({ filePath: normalizedFilePath });
          let fileData = isImageFile
            ? null
            : await workspaceFsAdapter.readFile({
                filePath: normalizedFilePath,
              });
          let imageData = isImageFile
            ? await workspaceFsAdapter.readFileDataUrl({
                filePath: normalizedFilePath,
              })
            : null;
          if (!fileData && !imageData) {
            if (workspaceRootPath) {
              await workspaceFsAdapter.setRoot?.({
                rootPath: workspaceRootPath,
                rootName: state.projectName ?? "project",
              });
              fileData = isImageFile
                ? null
                : await workspaceFsAdapter.readFile({
                    filePath: normalizedFilePath,
                  });
              imageData = isImageFile
                ? await workspaceFsAdapter.readFileDataUrl({
                    filePath: normalizedFilePath,
                  })
                : null;
            }
          }

          let existingDeferredTabId: string | null = null;
          set((state) => {
            const tabId = `file:${normalizedFilePath}`;
            const existing = state.editorTabs.find((tab) => tab.id === tabId);
            if (existing) {
              existingDeferredTabId =
                existing.contentState === "deferred" ? existing.id : null;
              return {
                activeEditorTabId: existing.id,
                layout: {
                  ...state.layout,
                  editorVisible: true,
                  editorDiffMode: false,
                },
                pendingEditorSelection: pendingSelection,
                workspaceSnapshotVersion:
                  state.activeEditorTabId !== existing.id
                    ? incrementWorkspaceSnapshotVersion(state)
                    : state.workspaceSnapshotVersion,
              };
            }

            const fileContent = isImageFile
              ? (imageData?.dataUrl ?? "")
              : (fileData?.content ?? fallbackContent ?? "");
            const baseRevision = isImageFile
              ? (imageData?.revision ?? null)
              : (fileData?.revision ?? null);
            const nextTab: EditorTab = {
              id: tabId,
              filePath: normalizedFilePath,
              kind: isImageFile ? "image" : "text",
              language: resolveLanguage({ filePath: normalizedFilePath }),
              content: fileContent,
              contentState: "ready",
              originalContent: isImageFile ? undefined : fileContent,
              savedContent: isImageFile ? undefined : fileContent,
              baseRevision,
              hasConflict: false,
              isDirty: false,
            };

            return {
              editorTabs: [...state.editorTabs, nextTab],
              activeEditorTabId: nextTab.id,
              layout: {
                ...state.layout,
                editorVisible: true,
                editorDiffMode: false,
              },
              pendingEditorSelection: pendingSelection,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          if (existingDeferredTabId) {
            void hydrateDeferredEditorTab({
              workspaceId: state.activeWorkspaceId,
              tabId: existingDeferredTabId,
            });
          }
        },
        setActiveEditorTab: ({ tabId }) => {
          let workspaceId = "";
          let shouldHydrate = false;
          set((state) => {
            if (state.activeEditorTabId === tabId) {
              return {};
            }
            const selectedTab = state.editorTabs.find(
              (tab) => tab.id === tabId,
            );
            if (!selectedTab) {
              return {};
            }
            workspaceId = state.activeWorkspaceId;
            shouldHydrate = selectedTab.contentState === "deferred";
            const isDiffTab = isDiffEditorTab(selectedTab);
            return {
              activeEditorTabId: tabId,
              layout: {
                ...state.layout,
                editorDiffMode: isDiffTab,
                editorMarkdownPreviewMode: isDiffTab
                  ? false
                  : state.layout.editorMarkdownPreviewMode,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          if (shouldHydrate && workspaceId) {
            void hydrateDeferredEditorTab({
              workspaceId,
              tabId,
            });
          }
        },
        reorderEditorTabs: ({ fromTabId, toTabId }) =>
          set((state) => {
            const fromIndex = state.editorTabs.findIndex(
              (tab) => tab.id === fromTabId,
            );
            const toIndex = state.editorTabs.findIndex(
              (tab) => tab.id === toTabId,
            );
            if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
              return {};
            }

            const nextTabs = [...state.editorTabs];
            const [movedTab] = nextTabs.splice(fromIndex, 1);
            if (!movedTab) {
              return {};
            }
            nextTabs.splice(toIndex, 0, movedTab);
            return {
              editorTabs: nextTabs,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          }),
        closeEditorTab: ({ tabId }) =>
          set((state) => {
            const closingIndex = state.editorTabs.findIndex(
              (tab) => tab.id === tabId,
            );
            if (closingIndex < 0) {
              return {};
            }
            const nextPendingEditorSelection =
              state.pendingEditorSelection?.tabId === tabId
                ? null
                : state.pendingEditorSelection;
            const nextTabs = state.editorTabs.filter((tab) => tab.id !== tabId);
            if (nextTabs.length === 0) {
              return {
                editorTabs: [],
                activeEditorTabId: null,
                pendingEditorSelection: null,
                layout: {
                  ...state.layout,
                  editorVisible: false,
                  editorDiffMode: false,
                  editorMarkdownPreviewMode: false,
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            }

            if (state.activeEditorTabId !== tabId) {
              return {
                editorTabs: nextTabs,
                pendingEditorSelection: nextPendingEditorSelection,
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            }

            const fallbackIndex = Math.max(0, closingIndex - 1);
            const fallbackTab = nextTabs[fallbackIndex] ?? nextTabs[0];
            const isDiffTab = isDiffEditorTab(fallbackTab);

            return {
              editorTabs: nextTabs,
              activeEditorTabId: fallbackTab?.id ?? null,
              pendingEditorSelection: nextPendingEditorSelection,
              layout: {
                ...state.layout,
                editorDiffMode: isDiffTab,
                editorMarkdownPreviewMode: isDiffTab
                  ? false
                  : state.layout.editorMarkdownPreviewMode,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          }),
        requestCloseActiveEditorTab: () =>
          set((state) => {
            if (!state.activeEditorTabId) {
              return {};
            }
            return { pendingCloseEditorTabId: state.activeEditorTabId };
          }),
        clearPendingCloseEditorTab: () =>
          set({ pendingCloseEditorTabId: null }),
        clearPendingEditorSelection: () =>
          set({ pendingEditorSelection: null }),
        updateEditorContent: ({ tabId, content }) => {
          set((state) => {
            let changed = false;
            const nextTabs = state.editorTabs.map((tab) => {
              if (
                tab.id !== tabId ||
                tab.kind === "image" ||
                tab.content === content
              ) {
                return tab;
              }
              changed = true;
              return {
                ...tab,
                content,
                isDirty:
                  (tab.savedContent ?? tab.originalContent ?? tab.content) !==
                  content,
                hasConflict: false,
              };
            });

            if (!changed) {
              return {};
            }

            return {
              editorTabs: nextTabs,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        saveActiveEditorTab: async () => {
          const state = get();
          const tabId = state.activeEditorTabId;
          const activeTab = state.editorTabs.find((tab) => tab.id === tabId);
          if (!activeTab) {
            return { ok: false };
          }
          if (activeTab.contentState && activeTab.contentState !== "ready") {
            return { ok: false };
          }
          if (activeTab.kind === "image") {
            return { ok: false };
          }

          // Format on save with ESLint
          let contentToSave = activeTab.content;
          if (
            state.settings.editorFormatOnSave &&
            state.settings.editorEslintEnabled
          ) {
            const rootPath =
              state.workspacePathById[state.activeWorkspaceId] ||
              state.projectPath;
            if (rootPath) {
              const formatted = await formatWithEslint({
                rootPath,
                filePath: activeTab.filePath,
                text: activeTab.content,
              });
              if (formatted !== null) {
                contentToSave = formatted;
                // Update the tab content with formatted text
                set((s) => ({
                  editorTabs: s.editorTabs.map((tab) =>
                    tab.id === activeTab.id
                      ? { ...tab, content: formatted }
                      : tab,
                  ),
                }));
              }
            }
          }

          let result = await workspaceFsAdapter.writeFile({
            filePath: activeTab.filePath,
            content: contentToSave,
            expectedRevision: activeTab.baseRevision,
          });
          if (!result.ok) {
            const workspaceRootPath =
              state.workspacePathById[state.activeWorkspaceId] ||
              state.projectPath;
            if (workspaceRootPath) {
              await workspaceFsAdapter.setRoot?.({
                rootPath: workspaceRootPath,
                rootName: state.projectName ?? "project",
              });
              result = await workspaceFsAdapter.writeFile({
                filePath: activeTab.filePath,
                content: activeTab.content,
                expectedRevision: activeTab.baseRevision,
              });
            }
          }

          if (!result.ok) {
            if (result.conflict) {
              set((nextState) => ({
                editorTabs: nextState.editorTabs.map((tab) =>
                  tab.id === activeTab.id
                    ? {
                        ...tab,
                        hasConflict: true,
                        baseRevision: result.revision ?? tab.baseRevision,
                      }
                    : tab,
                ),
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              }));
            }
            return { ok: false, conflict: result.conflict };
          }

          set((nextState) => ({
            editorTabs: nextState.editorTabs.map((tab) =>
              tab.id === activeTab.id
                ? {
                    ...tab,
                    contentState: "ready",
                    originalContent: tab.id.startsWith("file:")
                      ? tab.content
                      : tab.originalContent,
                    savedContent: tab.content,
                    baseRevision: result.revision ?? tab.baseRevision,
                    hasConflict: false,
                    isDirty: false,
                  }
                : tab,
            ),
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(nextState),
          }));

          return { ok: true };
        },
        checkOpenTabConflicts: async () => {
          const state = get();
          const updates: Array<{
            tabId: string;
            fromDisk: string;
            revision: string;
            dirty: boolean;
            kind: "text" | "image";
          }> = [];

          for (const tab of state.editorTabs) {
            if (tab.kind === "image") {
              const imageDisk = await workspaceFsAdapter.readFileDataUrl({
                filePath: tab.filePath,
              });
              if (!imageDisk) {
                continue;
              }
              if (tab.baseRevision && imageDisk.revision === tab.baseRevision) {
                continue;
              }
              updates.push({
                tabId: tab.id,
                fromDisk: imageDisk.dataUrl,
                revision: imageDisk.revision,
                dirty: tab.isDirty,
                kind: "image",
              });
              continue;
            }

            const disk = await workspaceFsAdapter.readFile({
              filePath: tab.filePath,
            });
            if (!disk) {
              continue;
            }

            if (tab.baseRevision && disk.revision === tab.baseRevision) {
              continue;
            }

            updates.push({
              tabId: tab.id,
              fromDisk: disk.content,
              revision: disk.revision,
              dirty: tab.isDirty,
              kind: "text",
            });
          }

          if (updates.length === 0) {
            return;
          }

          set((nextState) => ({
            editorTabs: nextState.editorTabs.map((tab) => {
              const update = updates.find((item) => item.tabId === tab.id);
              if (!update) {
                return tab;
              }

              if (update.dirty) {
                return {
                  ...tab,
                  hasConflict: true,
                  baseRevision: update.revision,
                };
              }

              return {
                ...tab,
                content: update.fromDisk,
                contentState: "ready",
                originalContent:
                  update.kind === "image"
                    ? tab.originalContent
                    : tab.id.startsWith("file:")
                      ? update.fromDisk
                      : tab.originalContent,
                savedContent:
                  update.kind === "image" ? tab.savedContent : update.fromDisk,
                baseRevision: update.revision,
                hasConflict: false,
                isDirty: false,
              };
            }),
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(nextState),
          }));
        },
        sendEditorContextToChat: ({ taskId, instruction }) => {
          const state = get();
          const tabId = state.activeEditorTabId;
          const activeTab = state.editorTabs.find((tab) => tab.id === tabId);
          if (
            !canSendEditorContextToTask({
              taskId,
              hasActiveEditorTab: Boolean(activeTab),
              isTaskResponding: Boolean(
                taskId && state.activeTurnIdsByTask[taskId],
              ),
            }) ||
            !activeTab ||
            (activeTab.contentState && activeTab.contentState !== "ready")
          ) {
            return;
          }

          get().sendWorkspaceFileToChat({
            taskId,
            filePath: activeTab.filePath,
          });
        },
        sendWorkspaceFileToChat: ({ taskId, filePath }) => {
          const state = get();
          const normalizedFilePath = filePath.trim();
          if (
            !canSendWorkspaceFileToTask({
              taskId,
              filePath: normalizedFilePath,
              isTaskResponding: Boolean(
                taskId && state.activeTurnIdsByTask[taskId],
              ),
            })
          ) {
            return;
          }

          const currentDraft =
            state.promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT;
          if (!currentDraft.attachedFilePaths.includes(normalizedFilePath)) {
            get().updatePromptDraft({
              taskId,
              patch: {
                attachedFilePaths: [
                  ...currentDraft.attachedFilePaths,
                  normalizedFilePath,
                ],
              },
            });
          }

          set((s) => ({ promptFocusNonce: s.promptFocusNonce + 1 }));
        },
      };
    },
    {
      name: APP_STORE_KEY,
      partialize: (state) => ({
        // Keep localStorage limited to lightweight UI/session state.
        // Project/workspace history is mirrored into SQLite so this cache is not the only durable source.
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        projectPath: state.projectPath,
        recentProjects: captureCurrentProjectState({
          recentProjects: state.recentProjects,
          projectPath: state.projectPath,
          projectName: state.projectName,
          defaultBranch: state.defaultBranch,
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceBranchById: state.workspaceBranchById,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
        }),
        defaultBranch: state.defaultBranch,
        workspaceBranchById: state.workspaceBranchById,
        workspacePathById: state.workspacePathById,
        workspaceDefaultById: state.workspaceDefaultById,
        taskCheckpointById: state.taskCheckpointById,
        isDarkMode: state.isDarkMode,
        draftProvider: state.draftProvider,
        layout: state.layout,
        settings: state.settings,
        projectName: state.projectName,
        staveMuse: {
          ...state.staveMuse,
          activeTurnId: undefined,
          messages: state.staveMuse.messages.slice(-40),
        },
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }
        const persistedSettings = state.settings;
        // Merge with defaultSettings so newly added fields are never undefined
        // for users whose persisted state pre-dates those fields.
        state.settings = { ...defaultSettings, ...persistedSettings };
        // Migrate legacy fastModeVisible → per-provider fields.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = state.settings as any;
        const legacyLayoutZenMode =
          (
            state.layout as LayoutState & {
              zenMode?: boolean;
            }
          ).zenMode === true;
        state.settings.appShellMode = normalizeAppShellMode(
          persistedSettings?.appShellMode ??
            (legacyLayoutZenMode ? "zen" : defaultSettings.appShellMode),
        );
        state.settings.showPresetBar =
          typeof raw.showPresetBar === "boolean"
            ? raw.showPresetBar
            : defaultSettings.showPresetBar;
        state.settings.sidebarArtworkMode = normalizeSidebarArtworkMode(
          raw.sidebarArtworkMode,
        );
        state.settings.borderBeamSize = normalizeBorderBeamSize(
          raw.borderBeamSize,
        );
        state.settings.borderBeamVariant = normalizeBorderBeamVariant(
          raw.borderBeamVariant,
        );
        if (
          typeof persistedSettings?.terminalFontFamily === "string" &&
          persistedSettings.terminalFontFamily.trim() ===
            LEGACY_TERMINAL_FONT_FAMILY
        ) {
          state.settings.terminalFontFamily = DEFAULT_TERMINAL_FONT_FAMILY;
        }
        state.settings.notificationSoundEnabled =
          typeof raw.notificationSoundEnabled === "boolean"
            ? raw.notificationSoundEnabled
            : defaultSettings.notificationSoundEnabled;
        state.settings.notificationSoundVolume =
          normalizeNotificationSoundVolume(raw.notificationSoundVolume);
        state.settings.notificationSoundPreset =
          normalizeNotificationSoundPreset(raw.notificationSoundPreset);
        state.settings.notificationSoundMode = normalizeNotificationSoundMode(
          raw.notificationSoundMode,
        );
        state.settings.commandPaletteShowRecent =
          typeof raw.commandPaletteShowRecent === "boolean"
            ? raw.commandPaletteShowRecent
            : defaultSettings.commandPaletteShowRecent;
        state.settings.sharedSkillsHome = normalizeSharedSkillsHomeSetting(
          raw.sharedSkillsHome,
        );
        state.settings.commandPalettePinnedCommandIds = Array.isArray(
          raw.commandPalettePinnedCommandIds,
        )
          ? raw.commandPalettePinnedCommandIds.filter(
              (value: unknown): value is string => typeof value === "string",
            )
          : defaultSettings.commandPalettePinnedCommandIds;
        state.settings.commandPaletteHiddenCommandIds = Array.isArray(
          raw.commandPaletteHiddenCommandIds,
        )
          ? raw.commandPaletteHiddenCommandIds.filter(
              (value: unknown): value is string => typeof value === "string",
            )
          : defaultSettings.commandPaletteHiddenCommandIds;
        state.settings.commandPaletteRecentCommandIds = Array.isArray(
          raw.commandPaletteRecentCommandIds,
        )
          ? raw.commandPaletteRecentCommandIds.filter(
              (value: unknown): value is string => typeof value === "string",
            )
          : defaultSettings.commandPaletteRecentCommandIds;
        state.settings.appShortcutKeys = normalizeAppShortcutKeys(
          raw.appShortcutKeys,
        );
        state.settings.taskPresets = normalizePersistedTaskPresets(
          raw.taskPresets,
        );
        state.settings.modelShortcutKeys = normalizeModelShortcutKeys(
          raw.modelShortcutKeys,
        );
        if (
          typeof raw.staveModelPlanner === "string" &&
          typeof raw.staveAutoPlanModel !== "string"
        ) {
          raw.staveAutoPlanModel = raw.staveModelPlanner;
        }
        if (
          typeof raw.staveModelComplex === "string" &&
          typeof raw.staveAutoAnalyzeModel !== "string"
        ) {
          raw.staveAutoAnalyzeModel = raw.staveModelComplex;
        }
        if (
          typeof raw.staveModelCodeGen === "string" &&
          typeof raw.staveAutoImplementModel !== "string"
        ) {
          raw.staveAutoImplementModel = raw.staveModelCodeGen;
        }
        if (
          typeof raw.staveModelQuickEdit === "string" &&
          typeof raw.staveAutoQuickEditModel !== "string"
        ) {
          raw.staveAutoQuickEditModel = raw.staveModelQuickEdit;
        }
        if (
          typeof raw.staveModelDefault === "string" &&
          typeof raw.staveAutoGeneralModel !== "string"
        ) {
          raw.staveAutoGeneralModel = raw.staveModelDefault;
        }
        if (
          typeof raw.stavePreprocessorModel === "string" &&
          typeof raw.staveAutoClassifierModel !== "string"
        ) {
          raw.staveAutoClassifierModel = raw.stavePreprocessorModel;
        }
        if (
          typeof raw.staveSupervisorModel === "string" &&
          typeof raw.staveAutoSupervisorModel !== "string"
        ) {
          raw.staveAutoSupervisorModel = raw.staveSupervisorModel;
        }
        if (
          typeof raw.staveModelComplex === "string" &&
          typeof raw.staveAutoVerifyModel !== "string"
        ) {
          raw.staveAutoVerifyModel = raw.staveModelComplex;
        }
        if (
          typeof raw.staveOrchestrationEnabled === "boolean" &&
          typeof raw.staveAutoOrchestrationMode !== "string"
        ) {
          raw.staveAutoOrchestrationMode = raw.staveOrchestrationEnabled
            ? "auto"
            : "off";
        }
        delete raw.staveModelPlanner;
        delete raw.staveModelEcosystem;
        delete raw.staveModelComplex;
        delete raw.staveModelCodeGen;
        delete raw.staveModelQuickEdit;
        delete raw.staveModelDefault;
        delete raw.stavePreprocessorModel;
        delete raw.staveSupervisorModel;
        delete raw.staveOrchestrationEnabled;
        // Migrate string font sizes ("base"/"lg"/"xl") to numeric pixel values.
        const _legacyFontSizeMap: Record<string, number> = {
          base: 16,
          lg: 18,
          xl: 20,
        };
        if (typeof raw.messageFontSize === "string") {
          raw.messageFontSize = _legacyFontSizeMap[raw.messageFontSize] ?? 18;
        }
        if (typeof raw.messageCodeFontSize === "string") {
          raw.messageCodeFontSize =
            _legacyFontSizeMap[raw.messageCodeFontSize] ?? 14;
        }
        if (typeof raw.fastModeVisible === "boolean") {
          state.settings.claudeFastModeVisible ??= raw.fastModeVisible;
          state.settings.codexFastModeVisible ??= raw.fastModeVisible;
          delete raw.fastModeVisible;
        }
        if (
          typeof raw.reasoningDefaultExpanded === "boolean" &&
          typeof persistedSettings?.reasoningExpansionMode !== "string"
        ) {
          raw.reasoningExpansionMode = raw.reasoningDefaultExpanded
            ? "auto"
            : "manual";
        }
        delete raw.reasoningDefaultExpanded;
        delete raw.codexSandboxMode;
        delete raw.codexSkipGitRepoCheck;
        delete raw.codexNetworkAccessEnabled;
        delete raw.codexPathOverride;
        delete raw.codexModelReasoningEffort;
        delete raw.codexWebSearchMode;
        delete raw.codexShowRawAgentReasoning;
        delete raw.codexSupportsReasoningSummaries;
        delete raw.codexExperimentalPlanMode;
        state.settings.thinkingPhraseAnimationStyle =
          normalizeThinkingPhraseAnimationStyle(
            state.settings.thinkingPhraseAnimationStyle,
          );
        state.settings.promptResponseStyle = normalizeResponseStylePrompt(
          state.settings.promptResponseStyle,
        );
        const legacyProjectInitCommand = normalizeProjectWorkspaceInitCommand({
          value: raw.newWorkspaceInitCommand,
        });
        delete raw.newWorkspaceInitCommand;
        state.settings.codexApprovalPolicy = normalizeCodexApprovalPolicy({
          value: state.settings.codexApprovalPolicy,
        });
        state.settings.claudeTaskBudgetTokens = normalizeClaudeTaskBudgetTokens(
          {
            value: state.settings.claudeTaskBudgetTokens,
          },
        );
        state.settings.claudeSettingSources = normalizeClaudeSettingSources({
          value: state.settings.claudeSettingSources,
        });
        state.settings.reasoningExpansionMode = normalizeReasoningExpansionMode(
          state.settings.reasoningExpansionMode,
        );
        state.settings.staveAutoRoleRuntimeOverrides =
          normalizeStaveAutoRoleRuntimeOverrides({
            value: raw.staveAutoRoleRuntimeOverrides,
          });
        state.settings.modelClaude = upgradeSettingsScopedClaudeOpusModel({
          model: state.settings.modelClaude,
        });
        state.settings.claudeAdvisorModel =
          upgradeSettingsScopedClaudeOpusModel({
            model: state.settings.claudeAdvisorModel,
          });
        state.settings.staveAutoSupervisorModel =
          upgradeSettingsScopedClaudeOpusModel({
            model: state.settings.staveAutoSupervisorModel,
          });
        state.settings.staveAutoPlanModel =
          upgradeSettingsScopedClaudeOpusModel({
            model: state.settings.staveAutoPlanModel,
          });
        state.settings.staveAutoAnalyzeModel =
          upgradeSettingsScopedClaudeOpusModel({
            model: state.settings.staveAutoAnalyzeModel,
          });
        state.settings.staveAutoImplementModel =
          upgradeSettingsScopedClaudeOpusModel({
            model: state.settings.staveAutoImplementModel,
          });
        state.settings.staveAutoQuickEditModel =
          upgradeSettingsScopedClaudeOpusModel({
            model: state.settings.staveAutoQuickEditModel,
          });
        state.settings.staveAutoGeneralModel =
          upgradeSettingsScopedClaudeOpusModel({
            model: state.settings.staveAutoGeneralModel,
          });
        state.settings.staveAutoVerifyModel =
          upgradeSettingsScopedClaudeOpusModel({
            model: state.settings.staveAutoVerifyModel,
          });
        state.settings.providerTimeoutMs = normalizeProviderTimeoutMs({
          value: state.settings.providerTimeoutMs,
        });
        state.settings.codexPlanMode ??= false;
        state.promptDraftByTask = Object.fromEntries(
          Object.entries(state.promptDraftByTask).map(([taskId, draft]) => {
            const runtimeOverrides = draft.runtimeOverrides;
            if (
              !runtimeOverrides ||
              !Object.hasOwn(runtimeOverrides, "codexExperimentalPlanMode")
            ) {
              return [taskId, draft];
            }
            const {
              codexExperimentalPlanMode: _unused,
              ...nextRuntimeOverrides
            } = runtimeOverrides as typeof runtimeOverrides & {
              codexExperimentalPlanMode?: boolean;
            };
            return [
              taskId,
              {
                ...draft,
                runtimeOverrides: nextRuntimeOverrides,
              },
            ];
          }),
        );
        state.recentProjects = normalizeRecentProjectStates({
          projects: state.recentProjects,
        });
        const normalizedCurrentProject = normalizeCurrentProjectState({
          projectPath: state.projectPath,
          projectName: state.projectName,
          defaultBranch: state.defaultBranch,
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceBranchById: state.workspaceBranchById,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
          recentProjects: state.recentProjects,
        });
        if (state.projectPath && normalizedCurrentProject) {
          state.projectName = normalizeProjectDisplayName({
            projectPath: normalizedCurrentProject.projectPath,
            projectName:
              state.projectName?.trim() || normalizedCurrentProject.projectName,
          });
          state.defaultBranch = normalizedCurrentProject.defaultBranch;
          state.workspaces = normalizedCurrentProject.workspaces;
          state.activeWorkspaceId = normalizedCurrentProject.activeWorkspaceId;
          state.workspaceBranchById =
            normalizedCurrentProject.workspaceBranchById;
          state.workspacePathById = normalizedCurrentProject.workspacePathById;
          state.workspaceDefaultById =
            normalizedCurrentProject.workspaceDefaultById;
        } else if (state.projectPath) {
          state.workspaces = [];
          state.activeWorkspaceId = "";
          state.workspaceBranchById = {};
          state.workspacePathById = {};
          state.workspaceDefaultById = {};
        }
        if (legacyProjectInitCommand) {
          state.recentProjects = state.recentProjects.map((project) => ({
            ...cloneRecentProjectState(project),
            newWorkspaceInitCommand: normalizeProjectWorkspaceInitCommand({
              value:
                project.newWorkspaceInitCommand || legacyProjectInitCommand,
            }),
          }));
        }
        state.layout = normalizeLayoutState(state.layout);
        state.staveMuse = state.staveMuse
          ? {
              ...createEmptyStaveMuseState({
                defaultTarget: state.settings.museDefaultTarget,
              }),
              ...state.staveMuse,
              activeTurnId: undefined,
            }
          : createEmptyStaveMuseState({
              defaultTarget: state.settings.museDefaultTarget,
            });
        const isDark = resolveDarkModeForTheme({
          themeMode: state.settings?.themeMode ?? "dark",
          fallback: state.isDarkMode,
        });
        state.isDarkMode = isDark;
        applyThemeClass({ enabled: isDark });
        // Apply persisted custom theme before user overrides so cascade order
        // is correct: base → custom-theme → manual overrides.
        if (state.settings.customThemeId) {
          const theme = findCustomThemeById({
            themeId: state.settings.customThemeId,
            userThemes: state.settings.userCustomThemes,
          });
          applyCustomTheme({ theme });
        }
        applyThemeOverrides({ themeOverrides: state.settings.themeOverrides });
        applyFontOverrides({
          messageFontFamily: state.settings.messageFontFamily,
          messageMonoFontFamily: state.settings.messageMonoFontFamily,
          messageKoreanFontFamily: state.settings.messageKoreanFontFamily,
        });
      },
    },
  ),
);
