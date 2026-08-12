import { PromptInput } from "@/components/ai-elements";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildAutoModelSelectorOption,
  buildModelSelectorOptions,
  buildModelSelectorValue,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector";
import type { LocalChangeReviewRequest } from "@/components/ai-elements/local-change-review-dialog";
import type { PromptInputProviderModeStatus } from "@/components/ai-elements/prompt-input-provider-mode";
import { PromptInputAdvisorPill } from "@/components/ai-elements/prompt-input-advisor-mode";
import { PromptInputWorkerPill } from "@/components/ai-elements/prompt-input-worker-mode";
import {
  buildWorkerEffortPatch,
  buildWorkerModelPatch,
  buildWorkerPresetPatch,
  buildWorkerTogglePatch,
} from "@/components/ai-elements/prompt-input-worker-mode.utils";
import {
  buildWorkerRuntimeIntent,
  formatWorkerRuntimeStatusValue,
  resolveWorkerArmState,
  resolveWorkerProfile,
} from "@/lib/providers/worker-mode";
import { resolveWorkerShortcutAction } from "@/lib/worker-shortcuts";
import {
  buildAdvisorArmPatch,
  buildAdvisorEffortPatch,
  buildAdvisorModelPatch,
  buildAdvisorTogglePatch,
  formatAdvisorRuntimeStatusValue,
} from "@/components/ai-elements/prompt-input-advisor-mode.utils";
import type { PromptInputRuntimeStatusItem } from "@/components/ai-elements/prompt-input-runtime-bar";
import { resolveAdvisorShortcutAction } from "@/lib/advisor-shortcuts";
import {
  CompareRunPrepareDialog,
  type CompareRunPreparation,
} from "@/components/compare/CompareRunPrepareDialog";
import { CompareRunHistoryDialog } from "@/components/compare/CompareRunHistoryDialog";
import { SecretBindingControl } from "@/components/session/SecretBindingControl";
import {
  consumeComparePreparationRequest,
  subscribeComparePreparationRequest,
} from "@/components/compare/compare-prepare-request";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  toast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { ChevronDown, History, SplitSquareHorizontal } from "lucide-react";
import { listCompareRunHistoryEntries } from "@/lib/compare-run-history";
import {
  buildCommandPaletteItems,
  type CommandPaletteItem,
  type CommandPaletteProviderNote,
} from "@/lib/commands";
import {
  CLAUDE_PROVIDER_MODE_PRESETS,
  CODEX_PROVIDER_MODE_PRESETS,
  detectClaudeProviderModePreset,
  detectCodexProviderModePreset,
  resolveClaudeProviderModePresentation,
  resolveCodexProviderModePresentation,
  type ProviderModePresetDefinition,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import { resolveAdvisorArmState } from "@/lib/providers/advisor";
import { isAdvisorExchangeBlocking } from "@/lib/providers/advisor-activity";
import {
  describeLocalMcpBlock,
  useLocalMcpReadiness,
} from "@/lib/local-mcp-readiness";
import { applyModelRuntimePreference } from "@/lib/providers/model-runtime-preferences";
import { buildModelEffortRuntimeOverrides } from "@/lib/providers/model-effort";
import type { ClaudeSettingSource } from "@/lib/providers/provider.types";
import {
  getCachedProviderCommandCatalog,
  getInitialProviderCommandCatalog,
  setCachedProviderCommandCatalog,
  toProviderCommandCatalogState,
  type ProviderCommandCatalogState,
} from "@/lib/providers/provider-command-catalog";
import {
  clampCodexEffortToModel,
  getDefaultModelForProvider,
  getProviderLabel,
  getSdkModelOptions,
  listProviderIds,
  normalizeModelSelection,
  providerSupportsMidTurnSteering,
  providerSupportsNativeCommandCatalog,
} from "@/lib/providers/model-catalog";
import {
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
  resolveModelShortcutEffort,
  type ModelShortcutEffort,
} from "@/lib/providers/model-shortcuts";
import {
  addTrustedToolEntry,
  buildTrustedToolEntryForApproval,
} from "@/lib/providers/trusted-tools";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
  findOptionLabel,
} from "@/lib/providers/runtime-option-contract";
import {
  formatProviderTurnIdleDuration,
  resolveProviderTurnDisplayState,
} from "@/lib/providers/turn-status";
import { getEffectiveSkillEntries } from "@/lib/skills/catalog";
import {
  canTakeOverTask,
  getTaskControlOwner,
  isTaskArchived,
  isTaskManaged,
} from "@/lib/tasks";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import { cn } from "@/lib/utils";
import { buildLocalChangeReviewPrompt } from "@/lib/local-change-review";
import { useAppStore } from "@/store/app.store";
import {
  findPendingApprovals,
  findLatestPendingUserInput,
} from "@/store/provider-message.utils";
import {
  resolveLensAnnotationClearTargets,
  shouldIncludeImageAttachmentAsProviderContext,
} from "@/lib/lens/lens-annotation-attachment";
import { buildWorkspaceInformationReferenceOptions } from "@/lib/workspace-information-references";
import { dispatchTopBarPrAction } from "@/components/layout/top-bar-pr-events";
import { RenderProfiler } from "@/lib/render-profiler";
import {
  resolvePromptDraftPlanModeChange,
  resolvePromptDraftModelForProvider,
  resolvePromptDraftRuntimeState,
} from "@/store/prompt-draft-runtime";
import type {
  Attachment,
  ChatMessage,
  PromptDraft,
  PromptDraftRuntimeOverrides,
  TaskControlOwner,
  TaskSourceContext,
} from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import {
  buildChatInputGoalStatus,
  buildChatInputRuntimeStatusItems,
  buildCommandCatalogRuntimeOptions,
} from "./chat-input.runtime";
import { ChatInputApprovalQueue } from "./chat-input-approval-queue";
import { ManagedTaskTakeoverNotice } from "./ManagedTaskTakeoverNotice";
import {
  resolveManagedTaskComposerAccess,
  TaskSourceContextNotice,
} from "./TaskSourceContextNotice";
import {
  resolvePastedFileAbsolutePath,
  toWorkspaceRelativeFilePath,
} from "./chat-input.attachments";
import { useScopedTaskId } from "./task-scope-context";
import { TurnActivity } from "./TurnActivity";
import {
  buildApprovalGuidancePrompt,
  getLatestPromptSuggestions,
  getLatestUserPromptMessage,
  getPromptHistoryEntries,
  isStaleActiveTurnDraft,
  shouldEnablePromptInputWindowShortcuts,
  shouldHandleApprovalEnterShortcut,
  shouldHandleApprovalTabShortcut,
} from "./chat-input.utils";

const EMPTY_PROMPT_DRAFT: PromptDraft = {
  text: "",
  attachedFilePaths: [],
  attachments: [],
};
const EMPTY_MESSAGES: ChatMessage[] = [];
const PROMPT_DRAFT_SAVE_DELAY_MS = 1200;
const PROMPT_DRAFT_IDLE_TIMEOUT_MS = 750;
const PROVIDER_IDS = listProviderIds();
const INACTIVE_CLAUDE_SETTING_SOURCES: ClaudeSettingSource[] = ["project"];
const INACTIVE_CLAUDE_SETTINGS = [
  "auto",
  null,
  false,
  false,
  true,
  0,
  INACTIVE_CLAUDE_SETTING_SOURCES,
  "medium",
  "adaptive",
  false,
  "",
] as const;
const INACTIVE_CODEX_SETTINGS = [
  "workspace-write",
  false,
  "untrusted",
  "medium",
  "cached",
  false,
  "auto",
  "auto",
  "",
  false,
  false,
] as const;
const EMPTY_PROVIDER_MODE_PRESETS: readonly ProviderModePresetDefinition[] = [];

function getImageAttachmentMimeType(
  attachment: Extract<Attachment, { kind: "image" }>,
) {
  return attachment.mimeType?.trim() || "image/png";
}

interface ChatInputComposerProps {
  isEmpty: boolean;
  activeTaskId: string;
  windowShortcutsEnabled: boolean;
  activeProvider: ModelSelectorOption["providerId"];
  workspaceCwd?: string;
  providerSelectionTarget: string;
  isTurnActive: boolean;
  managedTaskOwner: TaskControlOwner | null;
  sourceContexts: readonly TaskSourceContext[];
  currentPrUrl: string | null;
  currentPrHeadSha: string | null;
  onRemoveSourceContext: (sourceId: string) => void;
  onClearSourceContexts: () => void;
  onRefreshPrContext: () => void;
  canTakeOverManagedTask: boolean;
  onTakeOverManagedTask: () => void;
  selectedModelOption: ModelSelectorOption;
  modelOptions: ModelSelectorOption[];
  modelShortcutKeys: readonly string[];
  modelShortcutEfforts: readonly ModelShortcutEffort[];
  commandPaletteItems: readonly CommandPaletteItem[];
  commandPaletteProviderNote?: CommandPaletteProviderNote;
  skillsEnabled: boolean;
  skillsAutoSuggest: boolean;
  skillPaletteItems: readonly SkillCatalogEntry[];
  providerModeStatus?: PromptInputProviderModeStatus | null;
  providerModePresets: readonly ProviderModePresetDefinition[];
  activeProviderModePresetId: ProviderModePresetId | null;
  goalStatus: ReturnType<typeof buildChatInputGoalStatus>;
  runtimeStatusItems: readonly PromptInputRuntimeStatusItem[];
  effortLabel?: string;
  effortValue?: string;
  fastMode?: boolean;
  onFastModeChange?: (enabled: boolean) => void;
  planMode?: boolean;
  onPlanModeChange?: (enabled: boolean) => void;
  thinkingMode?: "adaptive" | "enabled" | "disabled";
  onThinkingModeChange?: (value: "adaptive" | "enabled" | "disabled") => void;
  onProviderModeSelect?: (presetId: ProviderModePresetId) => void;
  onModelSelect: (args: {
    selection: ModelSelectorOption;
    effort?: Exclude<ModelShortcutEffort, "">;
    fastMode?: boolean;
  }) => void;
  reviewModelOptions: readonly ModelSelectorOption[];
  preferredReviewModelKey?: string;
  onLocalChangeReview: (
    request: LocalChangeReviewRequest,
  ) => boolean | Promise<boolean>;
}

function ChatInputComposer(args: ChatInputComposerProps) {
  const [focusNonce, setFocusNonce] = useState(0);
  const [guidanceFocusNonce, setGuidanceFocusNonce] = useState(0);
  const pendingSteerTaskIdsRef = useRef(new Set<string>());
  const [, setPendingSteerRevision] = useState(0);
  const [
    promptDraft,
    promptFocusNonce,
    promptCommentShortcut,
    steerQueueEnterAction,
    midTurnSteeringEnabled,
    clearPromptDraft,
    updatePromptDraft,
    sendUserMessage,
    openFileFromTree,
    abortTaskTurn,
    resolveApproval,
    resolveUserInput,
    updateSettings,
    trustedTools,
    lensVisualCommentScreenshotsAsImageContext,
    workspaceInformation,
    settingsAdvisorTarget,
    settingsCodexBinaryPath,
    skipTaskAdvisor,
    composerControlPlacements,
    settingsWorkerEnabled,
    settingsWorkerConfigByProvider,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.promptDraftByTask[args.providerSelectionTarget] ??
            EMPTY_PROMPT_DRAFT,
          state.promptFocusNonce,
          state.settings.promptCommentShortcut,
          state.settings.steerQueueEnterAction,
          state.settings.midTurnSteeringEnabled,
          state.clearPromptDraft,
          state.updatePromptDraft,
          state.sendUserMessage,
          state.openFileFromTree,
          state.abortTaskTurn,
          state.resolveApproval,
          state.resolveUserInput,
          state.updateSettings,
          state.settings.trustedTools,
          state.settings.lensVisualCommentScreenshotsAsImageContext,
          state.workspaceInformation,
          state.settings.advisorTarget,
          state.settings.codexBinaryPath,
          state.skipTaskAdvisor,
          state.settings.composerControlPlacements,
          state.settings.workerEnabled,
          state.settings.workerConfigByProvider,
        ] as const,
    ),
  );
  const [pendingUserInputMessageId, pendingUserInputPart] = useAppStore(
    useShallow((state) => {
      const messages =
        state.messagesByTask[args.activeTaskId] ?? EMPTY_MESSAGES;
      // Scan every message (like pending approvals) instead of only the last
      // one, so a pending AskUserQuestion card stays visible even if another
      // part or message lands after the user_input part.
      const pending = findLatestPendingUserInput({ messages });
      return [pending?.messageId ?? null, pending?.part ?? null] as const;
    }),
  );
  const pendingUserInput = useMemo(() => {
    if (!pendingUserInputMessageId || !pendingUserInputPart) {
      return null;
    }
    return {
      messageId: pendingUserInputMessageId,
      part: pendingUserInputPart,
    };
  }, [pendingUserInputMessageId, pendingUserInputPart]);
  const activeTaskMessages = useAppStore(
    (state) => state.messagesByTask[args.activeTaskId] ?? EMPTY_MESSAGES,
  );
  const activeTurnId = useAppStore(
    (state) => state.activeTurnIdsByTask[args.activeTaskId] ?? null,
  );
  const providerTurnActivity = useAppStore(
    (state) => state.providerTurnActivityByTask[args.activeTaskId] ?? null,
  );
  // A boolean, not the snapshot: the pill only needs to know whether the turn
  // is currently parked on the Advisor, and the monitor owns the detail.
  const advisorBlockingTurn = useAppStore((state) => {
    const snapshot = state.advisorExchangeByTask[args.activeTaskId];
    return snapshot ? isAdvisorExchangeBlocking(snapshot) : false;
  });
  const advisorArm = useMemo(
    () =>
      resolveAdvisorArmState({
        overrides: promptDraft.runtimeOverrides,
        settingsTarget: settingsAdvisorTarget,
      }),
    [promptDraft.runtimeOverrides, settingsAdvisorTarget],
  );
  const [advisorPickerOpen, setAdvisorPickerOpen] = useState(false);
  // Consults travel over Local MCP, so an armed Advisor with a broken link is
  // silently inert. Read only while the Advisor is armed or being configured —
  // there is nothing to warn about otherwise.
  const localMcpReadiness = useLocalMcpReadiness({
    enabled: advisorArm.enabled || advisorPickerOpen,
    primaryProviderId: args.activeProvider,
    refreshKey: advisorPickerOpen,
  });
  const advisorConsultBlock = useMemo(
    () =>
      advisorArm.enabled
        ? describeLocalMcpBlock({
            readiness: localMcpReadiness.readiness,
            capability: "Advisor consults",
          })
        : null,
    [advisorArm.enabled, localMcpReadiness.readiness],
  );
  // Codex advertises models dynamically, so the list is only worth fetching
  // once the user actually opens the picker on a Codex advisor.
  const advisorCodexCatalog = useCodexModelCatalog({
    enabled: advisorPickerOpen && advisorArm.target?.providerId === "codex",
    codexBinaryPath: settingsCodexBinaryPath,
  });
  const advisorModelOptions = useMemo(() => {
    const providerId = advisorArm.target?.providerId;
    if (!providerId) {
      return [] as readonly string[];
    }
    const catalog: readonly string[] =
      providerId === "codex"
        ? advisorCodexCatalog.models
        : getSdkModelOptions({ providerId });
    const selected = advisorArm.target?.model;
    // Keep a persisted-but-unlisted model visible so the picker always shows
    // what is actually configured instead of silently disagreeing with it.
    return selected && !catalog.includes(selected)
      ? [selected, ...catalog]
      : [...catalog];
  }, [advisorArm.target, advisorCodexCatalog.models]);

  const workerArm = useMemo(
    () =>
      resolveWorkerArmState({
        providerId: args.activeProvider,
        overrides: promptDraft.runtimeOverrides,
        settingsConfig: settingsWorkerConfigByProvider?.[args.activeProvider],
        settingsEnabled: settingsWorkerEnabled,
      }),
    [
      args.activeProvider,
      promptDraft.runtimeOverrides,
      settingsWorkerConfigByProvider,
      settingsWorkerEnabled,
    ],
  );
  // Resolved here rather than inside the pill so the composer shows exactly what
  // the turn would send — including "unavailable" for an ineligible primary.
  const workerResolution = useMemo(
    () =>
      resolveWorkerProfile({
        providerId: args.activeProvider,
        primaryModel: args.selectedModelOption.model,
        intent: buildWorkerRuntimeIntent(workerArm),
      }),
    [args.activeProvider, args.selectedModelOption.model, workerArm],
  );
  const [workerPickerOpen, setWorkerPickerOpen] = useState(false);

  // Shared by the Advisor and Worker controls: both write task-local runtime
  // overrides through the same merge, so they must share the commit-first fix.
  function applyRuntimeOverrides(runtimeOverrides: PromptDraftRuntimeOverrides) {
    // Commit first: `updatePromptDraft` merges onto the stored draft, so an
    // uncommitted composer edit would otherwise be dropped by the patch.
    commitCurrentDraftText();
    updatePromptDraft({
      taskId: args.providerSelectionTarget,
      patch: { runtimeOverrides },
    });
  }
  const pendingApprovals = useMemo(
    () => findPendingApprovals({ messages: activeTaskMessages }),
    [activeTaskMessages],
  );
  const pendingApproval = pendingApprovals[0] ?? null;
  const queuedNextTurn = promptDraft.queuedNextTurn ?? null;
  const queuedTurns = promptDraft.queuedTurns ?? [];
  const promptBatch = promptDraft.promptBatch ?? [];
  const latestUserPromptMessage = useMemo(
    () => getLatestUserPromptMessage(activeTaskMessages),
    [activeTaskMessages],
  );
  const isInputBlocked = pendingApproval != null || pendingUserInput != null;
  const isSteerSubmitting = pendingSteerTaskIdsRef.current.has(
    args.providerSelectionTarget,
  );

  // Owned by the host, not the pill: placement can demote the Advisor into the
  // ⋯ tray or hide it, and a shortcut that dies with its button is worse than
  // no shortcut. Toggling arms the Advisor, which force-shows the pill anyway;
  // opening the picker force-shows it via `advisorPickerOpen`.
  function handleAdvisorToggle() {
    const patch = buildAdvisorTogglePatch({
      overrides: promptDraft.runtimeOverrides,
      arm: advisorArm,
    });
    if (!patch) {
      // Nothing is configured to arm, so the picker is the only honest
      // response to a toggle request.
      setAdvisorPickerOpen(true);
      return;
    }
    applyRuntimeOverrides(patch);
    // Turning the Advisor off while it is holding the turn has to release the
    // turn too, otherwise the control silently means "next time" at the one
    // moment the user wants it to mean now.
    if (advisorArm.enabled && advisorBlockingTurn) {
      skipTaskAdvisor({ taskId: args.activeTaskId });
    }
  }
  function handleWorkerToggle() {
    applyRuntimeOverrides(
      buildWorkerTogglePatch({
        overrides: promptDraft.runtimeOverrides,
        arm: workerArm,
      }),
    );
  }
  const workerToggleRef = useRef(handleWorkerToggle);
  workerToggleRef.current = handleWorkerToggle;

  const advisorToggleRef = useRef(handleAdvisorToggle);
  advisorToggleRef.current = handleAdvisorToggle;
  const advisorShortcutsEnabled = args.windowShortcutsEnabled && !isInputBlocked;
  useEffect(() => {
    if (!advisorShortcutsEnabled) {
      return;
    }
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const action = resolveAdvisorShortcutAction(event);
      if (!action) {
        return;
      }
      // Claimed before the composer can insert the Option-composed character
      // this chord produces on macOS.
      event.preventDefault();
      if (action === "picker") {
        setAdvisorPickerOpen(true);
        return;
      }
      advisorToggleRef.current();
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [advisorShortcutsEnabled]);
  // Shares the Advisor's enable gate: both are composer chords that must go
  // quiet while the input is blocked on an approval or a question.
  useEffect(() => {
    if (!advisorShortcutsEnabled) {
      return;
    }
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const action = resolveWorkerShortcutAction(event);
      if (!action) {
        return;
      }
      // Same reason as the Advisor chord: claim it before the composer inserts
      // the Option-composed character macOS produces for Alt+W.
      event.preventDefault();
      if (action === "picker") {
        setWorkerPickerOpen(true);
        return;
      }
      workerToggleRef.current();
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [advisorShortcutsEnabled]);

  function setSteerSubmissionPending(taskId: string, pending: boolean) {
    if (pending) {
      pendingSteerTaskIdsRef.current.add(taskId);
    } else {
      pendingSteerTaskIdsRef.current.delete(taskId);
    }
    setPendingSteerRevision((revision) => revision + 1);
  }

  const compareRunsById = useAppStore((state) => state.compareRunsById);
  const compareRunHistoryEntries = useMemo(
    () => listCompareRunHistoryEntries({ runsById: compareRunsById }),
    [compareRunsById],
  );
  const recentCompareRuns = useMemo(
    () => compareRunHistoryEntries.slice(0, 8),
    [compareRunHistoryEntries],
  );
  const providerTurnDisplayState = useMemo(
    () =>
      resolveProviderTurnDisplayState({
        activeTurnId,
        activity: providerTurnActivity,
      }),
    [activeTurnId, providerTurnActivity],
  );
  // Whether Enter/Tab should offer the explicit steer-or-queue choice for the
  // currently active turn (Codex CLI-style dedicated keys — no fallback
  // between them, see `sendUserMessage`'s `submitIntent`). Which key does
  // which is user-configurable via `settings.steerQueueEnterAction`
  // (defaults to Enter=queue, Tab=steer). Mid-turn steering itself must be
  // turned on via `settings.midTurnSteeringEnabled` (Settings → Chat →
  // Active Turn) — otherwise the option is hidden entirely rather than offered
  // and then rejected by the main process. Requires plain text only;
  // attachments always fall back to queue-only mode.
  const canSteerActiveTurn =
    midTurnSteeringEnabled &&
    providerSupportsMidTurnSteering({ providerId: args.activeProvider }) &&
    (promptDraft.attachments?.length ?? 0) === 0 &&
    (promptDraft.attachedFilePaths?.length ?? 0) === 0;
  const managedTaskComposerAccess = resolveManagedTaskComposerAccess({
    managedTaskOwner: args.managedTaskOwner,
    isTurnActive: args.isTurnActive && providerTurnDisplayState !== "stalled",
    canSteerActiveTurn,
  });
  const stalledDurationLabel = useMemo(
    () =>
      providerTurnDisplayState === "stalled"
        ? formatProviderTurnIdleDuration({ activity: providerTurnActivity })
        : null,
    [providerTurnActivity, providerTurnDisplayState],
  );
  const promptHistoryEntries = useMemo(
    () => getPromptHistoryEntries(activeTaskMessages),
    [activeTaskMessages],
  );
  const promptSuggestions = useMemo(
    () =>
      args.isTurnActive || isInputBlocked
        ? []
        : getLatestPromptSuggestions(activeTaskMessages),
    [activeTaskMessages, args.isTurnActive, isInputBlocked],
  );
  const workspaceInformationReferenceOptions = useMemo(
    () => buildWorkspaceInformationReferenceOptions(workspaceInformation),
    [workspaceInformation],
  );
  const [draftText, setDraftText] = useState(promptDraft.text);
  const [comparePrepareOpen, setComparePrepareOpen] = useState(false);
  const [compareHistoryOpen, setCompareHistoryOpen] = useState(false);
  const [compareStarting, setCompareStarting] = useState(false);
  const draftTextRef = useRef(promptDraft.text);
  const syncedDraftRef = useRef({
    taskId: args.providerSelectionTarget,
    text: promptDraft.text,
  });
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftSaveIdleRef = useRef<number | null>(null);
  const staleDraftResetTurnKeyRef = useRef<string | null>(null);
  // Global focus requests (e.g. app-wide "focus prompt" shortcuts) target
  // the store's ACTIVE task by design; an unfocused split panel must not
  // steal focus. The ref keeps task switches from replaying an old nonce.
  const lastHandledPromptFocusNonceRef = useRef(0);
  useEffect(() => {
    if (promptFocusNonce === lastHandledPromptFocusNonceRef.current) return;
    lastHandledPromptFocusNonceRef.current = promptFocusNonce;
    if (useAppStore.getState().activeTaskId !== args.activeTaskId) return;
    setFocusNonce((current) => current + 1);
  }, [args.activeTaskId, promptFocusNonce]);

  function cancelPendingDraftSave() {
    if (draftSaveTimerRef.current === null) {
      if (draftSaveIdleRef.current !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(draftSaveIdleRef.current);
        draftSaveIdleRef.current = null;
      }
      return;
    }
    window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = null;
    if (draftSaveIdleRef.current !== null && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(draftSaveIdleRef.current);
      draftSaveIdleRef.current = null;
    }
  }

  function adoptPromptDraftText(nextDraft: { taskId: string; text: string }) {
    syncedDraftRef.current = nextDraft;
    draftTextRef.current = nextDraft.text;
    setDraftText(nextDraft.text);
  }

  function commitPromptDraftText(nextDraft: { taskId: string; text: string }) {
    cancelPendingDraftSave();
    const store = useAppStore.getState();
    const currentText = store.promptDraftByTask[nextDraft.taskId]?.text ?? "";
    if (currentText !== nextDraft.text) {
      store.updatePromptDraft({
        taskId: nextDraft.taskId,
        patch: { text: nextDraft.text },
      });
    }
    syncedDraftRef.current = nextDraft;
  }

  function commitCurrentDraftText() {
    commitPromptDraftText({
      taskId: syncedDraftRef.current.taskId,
      text: draftTextRef.current,
    });
  }

  function handleOpenComparePreparation() {
    commitCurrentDraftText();
    setComparePrepareOpen(true);
  }

  useEffect(() => {
    const handlePrepareCompare = () => {
      const request = consumeComparePreparationRequest(args.activeTaskId);
      if (!request) {
        return;
      }
      const store = useAppStore.getState();
      if (store.activeTaskId !== args.activeTaskId) {
        return;
      }

      const taskId = args.providerSelectionTarget;
      const text = draftTextRef.current;
      if (store.promptDraftByTask[taskId]?.text !== text) {
        store.updatePromptDraft({
          taskId,
          patch: { text },
        });
      }
      syncedDraftRef.current = { taskId, text };
      setComparePrepareOpen(true);
    };

    const unsubscribe =
      subscribeComparePreparationRequest(handlePrepareCompare);
    handlePrepareCompare();
    return unsubscribe;
  }, [args.activeTaskId, args.providerSelectionTarget]);

  async function handleStartCompareRun(preparation: CompareRunPreparation) {
    setCompareStarting(true);
    try {
      const result = await useAppStore.getState().startCompareRun(preparation);
      if (!result.ok) {
        toast.error("Unable to start compare run", {
          description: result.message,
        });
        return;
      }
      setComparePrepareOpen(false);
      toast.success("Compare candidates are running separately", {
        description:
          "A fresh-context judge will score the results after every candidate finishes.",
      });
    } catch (error) {
      toast.error("Unable to start compare run", {
        description:
          error instanceof Error ? error.message : "Unexpected runtime error.",
      });
    } finally {
      setCompareStarting(false);
    }
  }

  function clearLensAnnotationsOnMessageSubmit(taskId: string) {
    const store = useAppStore.getState();
    const workspaceId =
      store.taskWorkspaceIdById[taskId] ?? store.activeWorkspaceId;
    const attachments = store.promptDraftByTask[taskId]?.attachments ?? [];
    for (const target of resolveLensAnnotationClearTargets({
      attachments,
      fallbackWorkspaceId: workspaceId ?? undefined,
    })) {
      void window.api?.lens?.clearAnnotations?.(target);
    }
  }

  function stageApprovalGuidance(guidanceArgs: {
    toolName: string;
    description: string;
    guidance: string;
  }) {
    const nextText = buildApprovalGuidancePrompt({
      currentDraft: draftTextRef.current,
      toolName: guidanceArgs.toolName,
      description: guidanceArgs.description,
      guidance: guidanceArgs.guidance,
    });
    adoptPromptDraftText({
      taskId: args.providerSelectionTarget,
      text: nextText,
    });
    commitPromptDraftText({
      taskId: args.providerSelectionTarget,
      text: nextText,
    });
    setFocusNonce((current) => current + 1);
    toast.message("Guidance drafted", {
      description:
        "The current approval will be denied. Send the staged follow-up after the turn stops.",
    });
  }

  function updateNonTextPromptDraft(patch: Partial<PromptDraft>) {
    commitCurrentDraftText();
    updatePromptDraft({
      taskId: args.providerSelectionTarget,
      patch,
    });
  }

  function createDraftItemId(prefix: string) {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function stagePromptBatchItem() {
    const content = draftTextRef.current.trim();
    if (!content) {
      return;
    }
    cancelPendingDraftSave();
    updatePromptDraft({
      taskId: args.providerSelectionTarget,
      patch: {
        text: "",
        attachedFilePaths: [],
        attachments: [],
        promptBatch: [
          ...promptBatch,
          {
            id: createDraftItemId("batch"),
            createdAt: new Date().toISOString(),
            content,
            attachedFilePaths: promptDraft.attachedFilePaths,
            attachments: promptDraft.attachments,
          },
        ],
      },
    });
    adoptPromptDraftText({
      taskId: args.providerSelectionTarget,
      text: "",
    });
  }

  function removePromptBatchItem(itemId: string) {
    updateNonTextPromptDraft({
      promptBatch: promptBatch.filter((item) => item.id !== itemId),
    });
  }

  function updateQueuedTurn(args: { itemId: string; content: string }) {
    updateNonTextPromptDraft({
      queuedTurns: queuedTurns
        .map((item) =>
          item.id === args.itemId ? { ...item, content: args.content } : item,
        )
        .filter((item) => item.content.trim().length > 0),
    });
  }

  function removeQueuedTurn(itemId: string) {
    updateNonTextPromptDraft({
      queuedTurns: queuedTurns.filter((item) => item.id !== itemId),
    });
  }

  // Manually dispatch one staged queued turn while no turn is running (e.g.
  // after the user interrupted the run that would have auto-dispatched it).
  // The composer draft stays untouched; only the item leaves the queue.
  async function sendQueuedTurnNow(itemId: string) {
    const item = queuedTurns.find((queuedItem) => queuedItem.id === itemId);
    if (!item) {
      return;
    }
    useAppStore.getState().requestTaskScrollToLatest({
      taskId: args.activeTaskId,
    });
    const result = await sendUserMessage({
      taskId: args.activeTaskId,
      content: item.content,
      turnOrigin: "conversation",
      queuedTurnId: itemId,
    });
    if (result.status === "blocked") {
      toast.warning("Couldn't send the queued prompt", {
        description:
          "The task is busy or waiting on another action. The prompt stays queued.",
      });
    }
  }

  const filePicker = window.api?.fs?.pickFiles;
  const workspaceRootPath = args.workspaceCwd?.trim() || undefined;
  const handleOpenFileSelector =
    workspaceRootPath && filePicker
      ? async () => {
          const result = await filePicker({ rootPath: workspaceRootPath });
          if (!result.ok || result.filePaths.length === 0) {
            return;
          }

          const currentFilePaths =
            useAppStore.getState().promptDraftByTask[
              args.providerSelectionTarget
            ]?.attachedFilePaths ?? [];
          const nextFilePaths = [...currentFilePaths];
          for (const filePath of result.filePaths) {
            if (!nextFilePaths.includes(filePath)) {
              nextFilePaths.push(filePath);
            }
          }
          updateNonTextPromptDraft({ attachedFilePaths: nextFilePaths });
        }
      : undefined;
  const handlePasteFiles = workspaceRootPath
    ? async (input: { files: File[] }) => {
        const currentFilePaths =
          useAppStore.getState().promptDraftByTask[args.providerSelectionTarget]
            ?.attachedFilePaths ?? [];
        const nextFilePaths = [...currentFilePaths];
        let attachedCount = 0;

        for (const file of input.files) {
          const absolutePath = resolvePastedFileAbsolutePath({
            file,
            getPathForFile: window.api?.fs?.getPathForFile,
          });
          if (!absolutePath) {
            continue;
          }

          const relativePath = toWorkspaceRelativeFilePath({
            absolutePath,
            rootPath: workspaceRootPath,
          });
          if (!relativePath || nextFilePaths.includes(relativePath)) {
            continue;
          }

          nextFilePaths.push(relativePath);
          attachedCount += 1;
        }

        if (attachedCount === 0) {
          toast.warning("No workspace files were attached", {
            description:
              "Paste files copied from the current workspace, or use Attach Files.",
          });
          return;
        }

        updateNonTextPromptDraft({ attachedFilePaths: nextFilePaths });
      }
    : undefined;

  function schedulePromptDraftSave(nextDraft: {
    taskId: string;
    text: string;
  }) {
    cancelPendingDraftSave();
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      if ("requestIdleCallback" in window) {
        draftSaveIdleRef.current = window.requestIdleCallback(
          () => {
            draftSaveIdleRef.current = null;
            commitPromptDraftText(nextDraft);
          },
          { timeout: PROMPT_DRAFT_IDLE_TIMEOUT_MS },
        );
        return;
      }
      commitPromptDraftText(nextDraft);
    }, PROMPT_DRAFT_SAVE_DELAY_MS);
  }

  useEffect(() => {
    const syncedDraft = syncedDraftRef.current;
    if (args.providerSelectionTarget !== syncedDraft.taskId) {
      commitPromptDraftText({
        taskId: syncedDraft.taskId,
        text: draftTextRef.current,
      });
      adoptPromptDraftText({
        taskId: args.providerSelectionTarget,
        text: promptDraft.text,
      });
      return;
    }
    if (promptDraft.text !== syncedDraft.text) {
      adoptPromptDraftText({
        taskId: args.providerSelectionTarget,
        text: promptDraft.text,
      });
    }
  }, [args.providerSelectionTarget, promptDraft.text]);

  useLayoutEffect(() => {
    if (!activeTurnId) {
      staleDraftResetTurnKeyRef.current = null;
      return;
    }

    if (!latestUserPromptMessage) {
      return;
    }

    const resetTurnKey = `${activeTurnId}:${latestUserPromptMessage.id}`;
    if (staleDraftResetTurnKeyRef.current === resetTurnKey) {
      return;
    }
    staleDraftResetTurnKeyRef.current = resetTurnKey;

    if (
      !isStaleActiveTurnDraft({
        isTurnActive: args.isTurnActive,
        draftText: draftTextRef.current,
        latestUserPrompt: latestUserPromptMessage.content,
        queuedNextTurn:
          queuedNextTurn ??
          (queuedTurns[0] ? { queuedAt: queuedTurns[0].queuedAt } : null),
      })
    ) {
      return;
    }

    cancelPendingDraftSave();
    clearPromptDraft({ taskId: args.providerSelectionTarget });
    adoptPromptDraftText({
      taskId: args.providerSelectionTarget,
      text: "",
    });
  }, [
    activeTurnId,
    args.isTurnActive,
    args.providerSelectionTarget,
    clearPromptDraft,
    latestUserPromptMessage,
    queuedNextTurn,
    queuedTurns,
  ]);

  useEffect(
    () => () => {
      commitPromptDraftText({
        taskId: syncedDraftRef.current.taskId,
        text: draftTextRef.current,
      });
    },
    [],
  );

  useEffect(() => {
    const flushDraftText = () => {
      commitPromptDraftText({
        taskId: syncedDraftRef.current.taskId,
        text: draftTextRef.current,
      });
    };
    window.addEventListener("beforeunload", flushDraftText);
    return () => window.removeEventListener("beforeunload", flushDraftText);
  }, []);

  useEffect(() => {
    if (!pendingApproval) {
      return;
    }

    const handleApprovalShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      // Window-level Enter/Tab approval shortcuts act on the GLOBAL active
      // task; other visible split panels with their own pending approvals
      // must not also resolve them.
      if (useAppStore.getState().activeTaskId !== args.activeTaskId) {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        shouldHandleApprovalTabShortcut({
          key: event.key,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing,
          targetTagName: target?.tagName,
          targetRole: target?.getAttribute("role"),
          targetIsContentEditable: target?.isContentEditable,
        })
      ) {
        event.preventDefault();
        setGuidanceFocusNonce((current) => current + 1);
        return;
      }

      if (
        !shouldHandleApprovalEnterShortcut({
          key: event.key,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing,
          targetTagName: target?.tagName,
          targetRole: target?.getAttribute("role"),
          targetIsContentEditable: target?.isContentEditable,
        })
      ) {
        return;
      }

      event.preventDefault();
      resolveApproval({
        taskId: args.activeTaskId,
        messageId: pendingApproval.messageId,
        approved: true,
      });
    };

    window.addEventListener("keydown", handleApprovalShortcut);
    return () => window.removeEventListener("keydown", handleApprovalShortcut);
  }, [
    args.activeTaskId,
    pendingApproval,
    resolveApproval,
  ]);

  return (
    <div
      className={cn(
        "bg-background px-3 py-2.5 sm:px-4",
        args.isEmpty && "pb-6",
      )}
    >
      {comparePrepareOpen ? (
        <CompareRunPrepareDialog
          open={comparePrepareOpen}
          seedPrompt={draftText}
          submitting={compareStarting}
          onOpenChange={setComparePrepareOpen}
          onSubmit={(preparation) => void handleStartCompareRun(preparation)}
        />
      ) : null}
      {compareHistoryOpen ? (
        <CompareRunHistoryDialog
          open={compareHistoryOpen}
          runsById={compareRunsById}
          onOpenChange={setCompareHistoryOpen}
          onOpenRun={(compareRunId) =>
            useAppStore.getState().openCompareRun({ compareRunId })
          }
        />
      ) : null}
      <div className="mx-auto max-w-6xl">
        <TaskSourceContextNotice
          sourceContexts={args.sourceContexts}
          currentPrUrl={args.currentPrUrl}
          currentPrHeadSha={args.currentPrHeadSha}
          onRemove={args.onRemoveSourceContext}
          onClear={args.onClearSourceContexts}
          onRefreshPrContext={args.onRefreshPrContext}
        />
        {args.managedTaskOwner ? (
          <ManagedTaskTakeoverNotice
            owner={args.managedTaskOwner}
            isTurnActive={args.isTurnActive}
            canTakeOver={args.canTakeOverManagedTask}
            onTakeOver={args.onTakeOverManagedTask}
          />
        ) : null}
        {pendingApprovals.length > 0 ? (
          <ChatInputApprovalQueue
            approvals={pendingApprovals}
            guidanceFocusNonce={guidanceFocusNonce}
            onResolveApproval={({ messageId, approved }) => {
              resolveApproval({
                taskId: args.activeTaskId,
                messageId,
                approved,
              });
            }}
            onTrustAndApprove={({ messageId, toolName, input }) => {
              const trustedEntry = buildTrustedToolEntryForApproval({
                toolName,
                input,
              });
              if (trustedEntry) {
                updateSettings({
                  patch: {
                    trustedTools: addTrustedToolEntry({
                      entries: trustedTools,
                      entry: trustedEntry,
                    }),
                  },
                });
              }
              resolveApproval({
                taskId: args.activeTaskId,
                messageId,
                approved: true,
              });
            }}
            onDraftGuidance={({
              messageId,
              toolName,
              description,
              guidance,
            }) => {
              stageApprovalGuidance({
                toolName,
                description,
                guidance,
              });
              resolveApproval({
                taskId: args.activeTaskId,
                messageId,
                approved: false,
              });
            }}
          />
        ) : null}
        {isSteerSubmitting ? (
          <div
            className="mb-2 flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <span
              className="size-1.5 animate-pulse rounded-full bg-primary"
              aria-hidden
            />
            <span>Steering · waiting for provider acknowledgement</span>
          </div>
        ) : null}
        {providerTurnDisplayState === "stalled" ? (
          <div className="mb-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-muted-foreground dark:bg-warning/15">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning" className="uppercase tracking-[0.12em]">
                Stalled
              </Badge>
              <span>
                No provider events for {stalledDurationLabel ?? "a while"}. This
                run may be stuck. Press <Kbd>Esc</Kbd> or use stop to interrupt
                it — or just send a new message to interrupt this run and
                continue.
              </span>
            </div>
          </div>
        ) : null}
        <RenderProfiler id="TurnActivity">
          <TurnActivity />
        </RenderProfiler>
        <PromptInput
          focusToken={`${args.providerSelectionTarget}:${focusNonce}`}
          value={draftText}
          onBlur={commitCurrentDraftText}
          disabled={
            isInputBlocked ||
            isSteerSubmitting ||
            managedTaskComposerAccess.disabled
          }
          windowShortcutsEnabled={args.windowShortcutsEnabled}
          isTurnActive={args.isTurnActive}
          composerControlPlacements={composerControlPlacements}
          onComposerControlPlacementsChange={(next) =>
            updateSettings({ patch: { composerControlPlacements: next } })
          }
          advisorActive={advisorArm.enabled || advisorPickerOpen}
          workerActive={workerArm.enabled || workerPickerOpen}
          secretsActive={
            (promptDraft.runtimeOverrides?.boundSecretIds?.length ?? 0) > 0
          }
          advisorControl={
            <PromptInputAdvisorPill
              arm={advisorArm}
              primaryProviderId={args.activeProvider}
              primaryModel={args.selectedModelOption.model}
              advisorModelOptions={advisorModelOptions}
              blocking={advisorBlockingTurn}
              consultBlock={advisorConsultBlock}
              disabled={isInputBlocked}
              open={advisorPickerOpen}
              onOpenChange={setAdvisorPickerOpen}
              onToggle={handleAdvisorToggle}
              onSelectProvider={(optionId) => {
                applyRuntimeOverrides(
                  buildAdvisorArmPatch({
                    overrides: promptDraft.runtimeOverrides,
                    arm: advisorArm,
                    optionId,
                  }),
                );
                if (optionId === "off" && advisorBlockingTurn) {
                  skipTaskAdvisor({ taskId: args.activeTaskId });
                }
              }}
              onSelectModel={(model) => {
                const patch = buildAdvisorModelPatch({
                  overrides: promptDraft.runtimeOverrides,
                  arm: advisorArm,
                  model,
                });
                if (patch) {
                  applyRuntimeOverrides(patch);
                }
              }}
              onSelectEffort={(effort) => {
                const patch = buildAdvisorEffortPatch({
                  overrides: promptDraft.runtimeOverrides,
                  arm: advisorArm,
                  effort,
                });
                if (patch) {
                  applyRuntimeOverrides(patch);
                }
              }}
            />
          }
          workerControl={
            <PromptInputWorkerPill
              arm={workerArm}
              resolution={workerResolution}
              primaryProviderId={args.activeProvider}
              primaryModel={args.selectedModelOption.model}
              disabled={isInputBlocked}
              open={workerPickerOpen}
              onOpenChange={setWorkerPickerOpen}
              onToggle={handleWorkerToggle}
              onSelectPreset={(presetId) => {
                applyRuntimeOverrides(
                  buildWorkerPresetPatch({
                    overrides: promptDraft.runtimeOverrides,
                    providerId: args.activeProvider,
                    presetId,
                  }),
                );
              }}
              onSelectModel={(model) => {
                applyRuntimeOverrides(
                  buildWorkerModelPatch({
                    overrides: promptDraft.runtimeOverrides,
                    providerId: args.activeProvider,
                    model,
                  }),
                );
              }}
              onSelectEffort={(effort) => {
                applyRuntimeOverrides(
                  buildWorkerEffortPatch({
                    overrides: promptDraft.runtimeOverrides,
                    providerId: args.activeProvider,
                    effort,
                  }),
                );
              }}
            />
          }
          secretsControl={
            args.isTurnActive ? null : (
              <div
                className="inline-flex h-9 items-stretch"
                data-secret-binding-control="true"
              >
                <SecretBindingControl
                  boundSecretIds={promptDraft.runtimeOverrides?.boundSecretIds}
                  disabled={isInputBlocked}
                  onChange={(nextBoundSecretIds) => {
                    cancelPendingDraftSave();
                    updatePromptDraft({
                      taskId: args.providerSelectionTarget,
                      patch: {
                        runtimeOverrides: {
                          ...(promptDraft.runtimeOverrides ?? {}),
                          boundSecretIds:
                            nextBoundSecretIds.length > 0
                              ? nextBoundSecretIds
                              : undefined,
                        },
                      },
                    });
                  }}
                />
              </div>
            )
          }
          compareControl={
            args.isTurnActive ? null : (
              <div
                className="inline-flex h-9 items-stretch gap-0.5 rounded-md"
                data-compare-control="true"
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-full gap-1.5 px-2.5 text-xs text-muted-foreground shadow-none hover:text-foreground"
                        disabled={
                          isInputBlocked || draftText.trim().length === 0
                        }
                        aria-label="Prepare a comparison in isolated candidate workspaces"
                        onClick={handleOpenComparePreparation}
                      />
                    }
                  >
                    <SplitSquareHorizontal className="size-4" />
                    Compare
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-72">
                    Prepare a shared brief and review criteria before running
                    Two configurable candidates in separate workspaces.
                  </TooltipContent>
                </Tooltip>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        className="inline-flex w-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,box-shadow] duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50"
                        aria-label="Compare options and recent runs"
                        disabled={
                          recentCompareRuns.length === 0 &&
                          (isInputBlocked || draftText.trim().length === 0)
                        }
                      />
                    }
                  >
                    <ChevronDown className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={6}
                    className="w-80"
                  >
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <SplitSquareHorizontal className="size-3.5" />
                      Compare
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      disabled={isInputBlocked || draftText.trim().length === 0}
                      onSelect={handleOpenComparePreparation}
                    >
                      <SplitSquareHorizontal className="size-4" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">
                          Prepare new comparison
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Configure candidates, criteria, and judge
                        </span>
                      </span>
                    </DropdownMenuItem>

                    {recentCompareRuns.length > 0 ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                          <History className="size-3.5" />
                          Recent runs
                        </DropdownMenuLabel>
                        {recentCompareRuns.map((run) => (
                          <DropdownMenuItem
                            key={run.id}
                            className="items-start gap-2"
                            onSelect={() =>
                              useAppStore
                                .getState()
                                .openCompareRun({ compareRunId: run.id })
                            }
                          >
                            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary/70" />
                            <span className="min-w-0 flex-1">
                              <span className="block w-full truncate text-sm">
                                {run.title}
                              </span>
                              <span className="block text-xs capitalize text-muted-foreground">
                                {run.stateLabel}
                              </span>
                            </span>
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2"
                          onSelect={() => setCompareHistoryOpen(true)}
                        >
                          <History className="size-4" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm">
                              View all compare runs…
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              Search and filter{" "}
                              {compareRunHistoryEntries.length} saved runs
                            </span>
                          </span>
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          }
          submitMode={managedTaskComposerAccess.submitMode}
          queuedNextTurn={queuedNextTurn}
          queuedTurns={queuedTurns}
          promptBatch={promptBatch}
          promptCommentShortcut={promptCommentShortcut}
          steerQueueEnterAction={steerQueueEnterAction}
          onClearQueuedNextTurn={
            queuedNextTurn || queuedTurns.length > 0
              ? () => {
                  cancelPendingDraftSave();
                  updatePromptDraft({
                    taskId: args.providerSelectionTarget,
                    patch: {
                      queuedNextTurn: undefined,
                      queuedTurns: undefined,
                    },
                  });
                }
              : undefined
          }
          selectedModel={args.selectedModelOption}
          modelOptions={args.modelOptions}
          modelShortcutKeys={args.modelShortcutKeys}
          modelShortcutEfforts={args.modelShortcutEfforts}
          attachedFilePaths={promptDraft.attachedFilePaths}
          promptHistoryEntries={promptHistoryEntries}
          promptSuggestions={promptSuggestions}
          commandPaletteItems={args.commandPaletteItems}
          commandPaletteProviderNote={args.commandPaletteProviderNote}
          skillsEnabled={args.skillsEnabled}
          skillsAutoSuggest={args.skillsAutoSuggest}
          skillPaletteItems={args.skillPaletteItems}
          workspaceInformationReferenceOptions={
            workspaceInformationReferenceOptions
          }
          onValueChange={(value) => {
            draftTextRef.current = value;
            setDraftText(value);
            schedulePromptDraftSave({
              taskId: args.providerSelectionTarget,
              text: value,
            });
          }}
          onStagePromptBatch={stagePromptBatchItem}
          onRemovePromptBatchItem={({ itemId }) =>
            removePromptBatchItem(itemId)
          }
          onUpdateQueuedTurn={updateQueuedTurn}
          onRemoveQueuedTurn={({ itemId }) => removeQueuedTurn(itemId)}
          onSendQueuedTurn={({ itemId }) => void sendQueuedTurnNow(itemId)}
          onSuggestionSelect={async (suggestion) => {
            cancelPendingDraftSave();
            useAppStore.getState().requestTaskScrollToLatest({
              taskId: args.activeTaskId,
            });
            clearLensAnnotationsOnMessageSubmit(args.activeTaskId);
            const result = await sendUserMessage({
              taskId: args.activeTaskId,
              content: suggestion,
              turnOrigin: "conversation",
            });
            if (
              result.status === "started" ||
              result.status === "queued" ||
              result.status === "steered"
            ) {
              adoptPromptDraftText({
                taskId: args.providerSelectionTarget,
                text: "",
              });
            }
          }}
          onModelSelect={(selectionArgs) => {
            commitCurrentDraftText();
            args.onModelSelect(selectionArgs);
          }}
          fastMode={args.fastMode}
          onFastModeChange={
            args.onFastModeChange
              ? (enabled) => {
                  commitCurrentDraftText();
                  args.onFastModeChange?.(enabled);
                }
              : undefined
          }
          planMode={args.planMode}
          onPlanModeChange={
            args.onPlanModeChange
              ? (enabled) => {
                  commitCurrentDraftText();
                  args.onPlanModeChange?.(enabled);
                }
              : undefined
          }
          thinkingMode={args.thinkingMode}
          onThinkingModeChange={
            args.onThinkingModeChange
              ? (value) => {
                  commitCurrentDraftText();
                  args.onThinkingModeChange?.(value);
                }
              : undefined
          }
          pendingUserInput={pendingUserInput}
          onUserInputSubmit={
            pendingUserInput
              ? ({ messageId, answers }) => {
                  resolveUserInput({
                    taskId: args.activeTaskId,
                    messageId,
                    answers,
                  });
                }
              : undefined
          }
          onUserInputDeny={
            pendingUserInput
              ? ({ messageId }) => {
                  resolveUserInput({
                    taskId: args.activeTaskId,
                    messageId,
                    denied: true,
                  });
                }
              : undefined
          }
          providerModeStatus={args.providerModeStatus}
          providerModePresets={args.providerModePresets}
          activeProviderModePresetId={args.activeProviderModePresetId}
          goalStatus={args.goalStatus}
          onProviderModeSelect={
            args.onProviderModeSelect
              ? (presetId) => {
                  commitCurrentDraftText();
                  args.onProviderModeSelect?.(presetId);
                }
              : undefined
          }
          runtimeStatusItems={args.runtimeStatusItems}
          effortLabel={args.effortLabel}
          effortValue={args.effortValue}
          attachments={promptDraft.attachments}
          onAttachFilesChange={({ filePaths }) =>
            updateNonTextPromptDraft({ attachedFilePaths: filePaths })
          }
          onOpenFileSelector={handleOpenFileSelector}
          onPasteFiles={handlePasteFiles}
          onAttachmentsChange={({ attachments }) =>
            updateNonTextPromptDraft({ attachments })
          }
          workspaceCwd={args.workspaceCwd}
          reviewModelOptions={args.reviewModelOptions}
          preferredReviewModelKey={args.preferredReviewModelKey}
          onLocalChangeReview={(request) => {
            commitCurrentDraftText();
            return args.onLocalChangeReview(request);
          }}
          onSubmit={async ({ text, filePaths, intent }) => {
            const steerSubmission = intent === "steer";
            const submissionTaskId = args.providerSelectionTarget;
            if (
              steerSubmission &&
              pendingSteerTaskIdsRef.current.has(submissionTaskId)
            ) {
              return;
            }
            useAppStore.getState().requestTaskScrollToLatest({
              taskId: args.activeTaskId,
            });
            cancelPendingDraftSave();
            const submittedDraft = {
              taskId: submissionTaskId,
              text: draftTextRef.current,
            };
            if (steerSubmission) {
              setSteerSubmissionPending(submissionTaskId, true);
            } else {
              adoptPromptDraftText({
                taskId: submittedDraft.taskId,
                text: "",
              });
            }
            const restoreSubmittedDraft = () => {
              if (
                syncedDraftRef.current.taskId !== submittedDraft.taskId ||
                draftTextRef.current !== ""
              ) {
                return;
              }
              adoptPromptDraftText(submittedDraft);
              commitPromptDraftText(submittedDraft);
            };
            const clearSubmittedDraft = () => {
              if (
                syncedDraftRef.current.taskId !== submittedDraft.taskId ||
                draftTextRef.current !== submittedDraft.text
              ) {
                return;
              }
              const clearedDraft = {
                taskId: submittedDraft.taskId,
                text: "",
              };
              adoptPromptDraftText(clearedDraft);
              commitPromptDraftText(clearedDraft);
            };
            try {
              for (const fp of filePaths) {
                await openFileFromTree({ filePath: fp });
              }
              const latestTabs = useAppStore.getState().editorTabs;
              const fileContexts = filePaths
                .map((fp) => latestTabs.find((item) => item.filePath === fp))
                .filter((tab): tab is NonNullable<typeof tab> => tab != null)
                .map((tab) => ({
                  filePath: tab.filePath,
                  content: tab.content,
                  language: tab.language,
                }));
              const currentAttachments =
                useAppStore.getState().promptDraftByTask[
                  args.providerSelectionTarget
                ]?.attachments ?? [];
              const imageContexts = currentAttachments
                .filter((a): a is Extract<Attachment, { kind: "image" }> =>
                  shouldIncludeImageAttachmentAsProviderContext(
                    a,
                    lensVisualCommentScreenshotsAsImageContext,
                  ),
                )
                .map((a) => ({
                  dataUrl: a.dataUrl,
                  label: a.label,
                  mimeType: getImageAttachmentMimeType(a),
                }));
              clearLensAnnotationsOnMessageSubmit(args.activeTaskId);
              const result = await sendUserMessage({
                taskId: args.activeTaskId,
                content: text,
                fileContexts:
                  fileContexts.length > 0 ? fileContexts : undefined,
                imageContexts:
                  imageContexts.length > 0 ? imageContexts : undefined,
                submitIntent: intent,
                turnOrigin: "conversation",
              });
              if (result.status === "steered") {
                clearSubmittedDraft();
              } else if (result.status === "blocked") {
                restoreSubmittedDraft();
              } else if (result.status === "steer-unavailable") {
                // Explicit steer request failed — restore the draft instead
                // of silently queueing it, so the user can see what happened
                // and choose (edit and retry, or press Tab to queue).
                restoreSubmittedDraft();
                toast.error("Couldn't steer this turn", {
                  description: result.message,
                });
              } else if (result.status === "steer-delivery-unknown") {
                toast.warning("Steer delivery is unconfirmed", {
                  description: result.message,
                });
              }
            } catch (error) {
              restoreSubmittedDraft();
              throw error;
            } finally {
              if (steerSubmission) {
                setSteerSubmissionPending(submissionTaskId, false);
              }
            }
          }}
          onAbort={() => abortTaskTurn({ taskId: args.activeTaskId })}
        />
      </div>
    </div>
  );
}

function BaseChatInput() {
  const [providerCommandCatalog, setProviderCommandCatalog] = useState(() =>
    getCachedProviderCommandCatalog({
      providerId: "claude-code",
    }),
  );
  const activeTaskId = useScopedTaskId();
  const windowShortcutsEnabled = useAppStore((state) =>
    shouldEnablePromptInputWindowShortcuts({
      scopedTaskId: activeTaskId,
      activeTaskId: state.activeTaskId,
    }),
  );
  const [
    providerAvailability,
    providerCommandCatalogRefreshNonce,
    setTaskProvider,
    updatePromptDraft,
    clearTaskProviderSession,
    abortTaskTurn,
    updateSettings,
    updateModelRuntimePreference,
    refreshSkillCatalog,
    sendUserMessage,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.providerAvailability,
          state.providerCommandCatalogRefreshNonce,
          state.setTaskProvider,
          state.updatePromptDraft,
          state.clearTaskProviderSession,
          state.abortTaskTurn,
          state.updateSettings,
          state.updateModelRuntimePreference,
          state.refreshSkillCatalog,
          state.sendUserMessage,
        ] as const,
    ),
  );
  const activeTask = useAppStore(
    (state) =>
      state.tasks.find(
        (task) => task.id === activeTaskId && !isTaskArchived(task),
      ) ?? null,
  );
  const draftProvider = useAppStore((state) => state.draftProvider);
  const activeProvider = activeTask?.provider ?? draftProvider;
  const activeProviderGoal = useAppStore(
    (state) => state.providerGoalByTask[activeTaskId] ?? null,
  );
  const codexBinaryPathForCatalog = useAppStore(
    (state) => state.settings.codexBinaryPath,
  );
  const promptDraftRuntimeOverrides = useAppStore(
    (state) =>
      state.promptDraftByTask[activeTaskId || "draft:session"]
        ?.runtimeOverrides,
  );
  const settingsAdvisorTarget = useAppStore(
    (state) => state.settings.advisorTarget,
  );
  const settingsWorkerEnabled = useAppStore(
    (state) => state.settings.workerEnabled,
  );
  const settingsWorkerConfigByProvider = useAppStore(
    (state) => state.settings.workerConfigByProvider,
  );
  const workspaceCwd = useAppStore(
    (state) =>
      state.workspacePathById[state.activeWorkspaceId] ??
      state.projectPath ??
      undefined,
  );
  // Current-branch PR identity, so an attached PR-context part can be shown as
  // stale once the PR head moves (`src/lib/pr-context.ts`).
  const currentPrUrl = useAppStore(
    (state) =>
      state.workspacePrInfoById[state.activeWorkspaceId]?.pr?.url ?? null,
  );
  const currentPrHeadSha = useAppStore(
    (state) =>
      state.workspacePrInfoById[state.activeWorkspaceId]?.pr?.headRefOid ??
      null,
  );
  const activeMessageCount = useAppStore(
    (state) =>
      state.messageCountByTask[activeTaskId] ??
      (state.messagesByTask[activeTaskId] ?? EMPTY_MESSAGES).length,
  );
  const activeTurnId = useAppStore(
    (state) => state.activeTurnIdsByTask[activeTaskId] ?? null,
  );
  const isTurnActive = Boolean(activeTurnId);
  const latestMessageIsPlanResponse = useAppStore((state) => {
    const messages = state.messagesByTask[activeTaskId] ?? EMPTY_MESSAGES;
    const lastMessage = messages[messages.length - 1];
    return Boolean(
      lastMessage &&
      lastMessage.role === "assistant" &&
      lastMessage.isPlanResponse === true &&
      lastMessage.planText?.trim(),
    );
  });
  const [
    modelClaude,
    modelCodex,
    skillsEnabled,
    skillsAutoSuggest,
    providerTimeoutMs,
    modelShortcutKeys,
    modelShortcutEfforts,
    autoRoutingEnabled,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelClaude,
          state.settings.modelCodex,
          state.settings.skillsEnabled,
          state.settings.skillsAutoSuggest,
          state.settings.providerTimeoutMs,
          state.settings.modelShortcutKeys,
          state.settings.modelShortcutEfforts,
          state.settings.autoRoutingEnabled,
        ] as const,
    ),
  );
  const providerSelectionTarget = activeTaskId || "draft:session";
  const activeModel =
    activeProvider === "claude-code"
      ? resolvePromptDraftModelForProvider({
          providerId: activeProvider,
          runtimeOverrides: promptDraftRuntimeOverrides,
          fallbackModel: modelClaude,
        })
      : resolvePromptDraftModelForProvider({
          providerId: activeProvider,
          runtimeOverrides: promptDraftRuntimeOverrides,
          fallbackModel: modelCodex,
        });
  const [
    claudePermissionMode,
    claudePermissionModeBeforePlan,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    claudeTaskBudgetTokens,
    claudeSettingSources,
    claudeEffort,
    claudeThinkingMode,
    claudeAgentProgressSummaries,
    claudeBinaryPath,
  ] = useAppStore(
    useShallow((state) => {
      if (activeProvider !== "claude-code") {
        return INACTIVE_CLAUDE_SETTINGS;
      }
      const settings = applyModelRuntimePreference({
        settings: state.settings,
        providerId: activeProvider,
        model: activeModel,
      });
      return [
        settings.claudePermissionMode,
        settings.claudePermissionModeBeforePlan,
        settings.claudeAllowDangerouslySkipPermissions,
        settings.claudeSandboxEnabled,
        settings.claudeAllowUnsandboxedCommands,
        settings.claudeTaskBudgetTokens,
        settings.claudeSettingSources,
        settings.claudeEffort,
        settings.claudeThinkingMode,
        settings.claudeAgentProgressSummaries,
        settings.claudeBinaryPath,
      ] as const;
    }),
  );
  const [
    codexFileAccess,
    codexNetworkAccess,
    codexApprovalPolicy,
    codexReasoningEffort,
    codexWebSearch,
    codexShowRawReasoning,
    codexReasoningSummary,
    codexReasoningSummarySupport,
    codexBinaryPath,
    codexPlanMode,
    codexFastMode,
  ] = useAppStore(
    useShallow((state) => {
      if (activeProvider !== "codex") {
        return INACTIVE_CODEX_SETTINGS;
      }
      const settings = applyModelRuntimePreference({
        settings: state.settings,
        providerId: activeProvider,
        model: activeModel,
      });
      return [
        settings.codexFileAccess,
        settings.codexNetworkAccess,
        settings.codexApprovalPolicy,
        settings.codexReasoningEffort,
        settings.codexWebSearch,
        settings.codexShowRawReasoning,
        settings.codexReasoningSummary,
        settings.codexReasoningSummarySupport,
        settings.codexBinaryPath,
        settings.codexPlanMode,
        settings.codexFastMode,
      ] as const;
    }),
  );
  const skillCatalog = useAppStore((state) => state.skillCatalog);
  const taskRuntimeState = useMemo(
    () =>
      resolvePromptDraftRuntimeState({
        promptDraft: promptDraftRuntimeOverrides
          ? {
              ...EMPTY_PROMPT_DRAFT,
              runtimeOverrides: promptDraftRuntimeOverrides,
            }
          : null,
        fallback: {
          claudePermissionMode,
          claudePermissionModeBeforePlan,
          codexPlanMode,
        },
      }),
    [
      claudePermissionMode,
      claudePermissionModeBeforePlan,
      codexPlanMode,
      promptDraftRuntimeOverrides,
    ],
  );
  const effectiveClaudePermissionMode = taskRuntimeState.claudePermissionMode;
  const effectiveClaudePermissionModeBeforePlan =
    taskRuntimeState.claudePermissionModeBeforePlan;
  const effectiveCodexPlanMode = taskRuntimeState.codexPlanMode;
  const isEmpty = activeMessageCount === 0;
  const activeProviderAvailable = providerAvailability[activeProvider];
  const isAutoRoutingSelected =
    promptDraftRuntimeOverrides?.autoRouting === true;
  const autoModelOption = useMemo<ModelSelectorOption>(
    () =>
      buildAutoModelSelectorOption({
        providerId: activeProvider,
        available: autoRoutingEnabled,
      }),
    [activeProvider, autoRoutingEnabled],
  );
  const selectedModelOption = useMemo<ModelSelectorOption>(
    () =>
      isAutoRoutingSelected
        ? autoModelOption
        : buildModelSelectorValue({
            providerId: activeProvider,
            model: activeModel,
            available: activeProviderAvailable,
          }),
    [
      activeModel,
      activeProvider,
      activeProviderAvailable,
      autoModelOption,
      isAutoRoutingSelected,
    ],
  );
  const codexModelCatalog = useCodexModelCatalog({
    enabled: true,
    codexBinaryPath: codexBinaryPathForCatalog,
  });
  const codexModelEnrichment = useMemo(() => {
    if (codexModelCatalog.entries.length === 0) {
      return undefined;
    }
    const map = new Map<
      string,
      { description?: string; isDefault?: boolean }
    >();
    for (const entry of codexModelCatalog.entries) {
      const id = entry.model.trim();
      if (id) {
        map.set(id, {
          description: entry.description || undefined,
          isDefault: entry.isDefault || undefined,
        });
      }
    }
    return map.size > 0 ? map : undefined;
  }, [codexModelCatalog.entries]);
  const modelOptions = useMemo<ModelSelectorOption[]>(
    () => [
      autoModelOption,
      ...buildModelSelectorOptions({
        providerIds: PROVIDER_IDS,
        availabilityByProvider: providerAvailability,
        modelsByProvider: {
          codex: codexModelCatalog.models,
        },
        enrichmentByModel: codexModelEnrichment,
      }),
    ],
    [
      autoModelOption,
      codexModelCatalog.models,
      codexModelEnrichment,
      providerAvailability,
    ],
  );
  const normalizedModelShortcutKeys = useMemo(
    () => normalizeModelShortcutKeys(modelShortcutKeys),
    [modelShortcutKeys],
  );
  const normalizedModelShortcutEfforts = useMemo(
    () => normalizeModelShortcutEfforts(modelShortcutEfforts),
    [modelShortcutEfforts],
  );
  const managedTaskOwner = isTaskManaged(activeTask)
    ? getTaskControlOwner(activeTask)
    : null;
  const canTakeOverManagedTask = canTakeOverTask({
    task: activeTask,
  });
  const effortLabel = useMemo(() => {
    if (activeProvider === "claude-code") {
      return findOptionLabel(CLAUDE_EFFORT_OPTIONS, claudeEffort);
    }
    if (activeProvider === "codex") {
      return findOptionLabel(CODEX_EFFORT_OPTIONS, codexReasoningEffort);
    }
    return undefined;
  }, [activeProvider, claudeEffort, codexReasoningEffort]);
  const effortValue =
    activeProvider === "claude-code"
      ? claudeEffort
      : activeProvider === "codex"
        ? codexReasoningEffort
        : undefined;
  const goalStatus = useMemo(
    () =>
      buildChatInputGoalStatus({
        providerGoal: activeProvider === "codex" ? activeProviderGoal : null,
      }),
    [activeProvider, activeProviderGoal],
  );
  const advisorRuntimeSummary = useMemo(
    () =>
      formatAdvisorRuntimeStatusValue(
        resolveAdvisorArmState({
          overrides: promptDraftRuntimeOverrides,
          settingsTarget: settingsAdvisorTarget,
        }),
      ),
    [promptDraftRuntimeOverrides, settingsAdvisorTarget],
  );
  // Resolved separately from the composer's copy: the runtime bar lives in a
  // different component, and reporting a stale shape here would contradict the
  // pill sitting a few pixels away.
  const workerRuntimeSummary = useMemo(
    () =>
      formatWorkerRuntimeStatusValue(
        resolveWorkerProfile({
          providerId: activeProvider,
          primaryModel: activeModel,
          intent: buildWorkerRuntimeIntent(
            resolveWorkerArmState({
              providerId: activeProvider,
              overrides: promptDraftRuntimeOverrides,
              settingsConfig: settingsWorkerConfigByProvider?.[activeProvider],
              settingsEnabled: settingsWorkerEnabled,
            }),
          ),
        }),
      ),
    [
      activeProvider,
      activeModel,
      promptDraftRuntimeOverrides,
      settingsWorkerConfigByProvider,
      settingsWorkerEnabled,
    ],
  );
  const runtimeStatusItems = useMemo(() => {
    return buildChatInputRuntimeStatusItems({
      activeProvider,
      advisorSummary: advisorRuntimeSummary,
      workerSummary: workerRuntimeSummary,
      providerTimeoutMs,
      claudePermissionMode: effectiveClaudePermissionMode,
      claudeAllowDangerouslySkipPermissions,
      claudeSandboxEnabled,
      claudeAllowUnsandboxedCommands,
      claudeTaskBudgetTokens,
      claudeSettingSources,
      claudeEffort,
      claudeThinkingMode,
      claudeAgentProgressSummaries,
      claudeBinaryPath,
      codexFileAccess,
      codexNetworkAccess,
      codexApprovalPolicy,
      codexReasoningEffort,
      codexWebSearch,
      codexShowRawReasoning,
      codexReasoningSummary,
      codexReasoningSummarySupport,
      codexFastMode,
      codexPlanMode: effectiveCodexPlanMode,
      codexBinaryPath,
      claudePermissionModeBeforePlan: effectiveClaudePermissionModeBeforePlan,
    });
  }, [
    activeProvider,
    advisorRuntimeSummary,
    workerRuntimeSummary,
    claudeAllowDangerouslySkipPermissions,
    claudeAgentProgressSummaries,
    claudeAllowUnsandboxedCommands,
    claudeEffort,
    claudeBinaryPath,
    claudeSandboxEnabled,
    claudeSettingSources,
    claudeTaskBudgetTokens,
    claudeThinkingMode,
    codexApprovalPolicy,
    codexFastMode,
    codexReasoningEffort,
    codexNetworkAccess,
    codexBinaryPath,
    codexReasoningSummary,
    codexFileAccess,
    codexShowRawReasoning,
    codexReasoningSummarySupport,
    codexWebSearch,
    effectiveClaudePermissionMode,
    effectiveClaudePermissionModeBeforePlan,
    effectiveCodexPlanMode,
    providerTimeoutMs,
  ]);
  const providerModeStatus =
    useMemo<PromptInputProviderModeStatus | null>(() => {
      if (activeProvider === "claude-code") {
        return {
          providerLabel: "Claude",
          ...resolveClaudeProviderModePresentation({
            settings: {
              claudePermissionMode,
              claudeAllowDangerouslySkipPermissions,
              claudeSandboxEnabled,
              claudeAllowUnsandboxedCommands,
            },
            planMode: effectiveClaudePermissionMode === "plan",
          }),
        };
      }

      if (activeProvider === "codex") {
        return {
          providerLabel: "Codex",
          ...resolveCodexProviderModePresentation({
            settings: {
              codexFileAccess,
              codexApprovalPolicy,
              codexNetworkAccess,
              codexWebSearch,
            },
            planMode: effectiveCodexPlanMode,
          }),
        };
      }

      return null;
    }, [
      activeProvider,
      claudeAllowDangerouslySkipPermissions,
      claudeAllowUnsandboxedCommands,
      claudePermissionMode,
      claudeSandboxEnabled,
      codexApprovalPolicy,
      codexFileAccess,
      codexNetworkAccess,
      codexWebSearch,
      effectiveClaudePermissionMode,
      effectiveCodexPlanMode,
    ]);
  const activeProviderModePresetId =
    useMemo<ProviderModePresetId | null>(() => {
      if (activeProvider === "claude-code") {
        return detectClaudeProviderModePreset({
          settings: {
            claudePermissionMode,
            claudeAllowDangerouslySkipPermissions,
            claudeSandboxEnabled,
            claudeAllowUnsandboxedCommands,
          },
        });
      }

      if (activeProvider === "codex") {
        return detectCodexProviderModePreset({
          settings: {
            codexFileAccess,
            codexApprovalPolicy,
            codexNetworkAccess,
            codexWebSearch,
          },
        });
      }

      return null;
    }, [
      activeProvider,
      claudeAllowDangerouslySkipPermissions,
      claudeAllowUnsandboxedCommands,
      claudePermissionMode,
      claudeSandboxEnabled,
      codexApprovalPolicy,
      codexFileAccess,
      codexNetworkAccess,
      codexWebSearch,
    ]);
  const providerModePresets = useMemo(() => {
    if (activeProvider === "claude-code") {
      return CLAUDE_PROVIDER_MODE_PRESETS;
    }
    if (activeProvider === "codex") {
      return CODEX_PROVIDER_MODE_PRESETS;
    }
    return EMPTY_PROVIDER_MODE_PRESETS;
  }, [activeProvider]);
  const onProviderModeSelect = useMemo(() => {
    if (activeProvider === "claude-code") {
      return (presetId: ProviderModePresetId) =>
        updateModelRuntimePreference({
          providerId: activeProvider,
          model: activeModel,
          patch: { mode: presetId },
        });
    }
    if (activeProvider === "codex") {
      return (presetId: ProviderModePresetId) =>
        updateModelRuntimePreference({
          providerId: activeProvider,
          model: activeModel,
          patch: { mode: presetId },
        });
    }
    return undefined;
  }, [activeModel, activeProvider, updateModelRuntimePreference]);

  useEffect(() => {
    let cancelled = false;

    if (!providerSupportsNativeCommandCatalog({ providerId: activeProvider })) {
      const nextCatalog = getInitialProviderCommandCatalog({
        providerId: activeProvider,
      });
      setProviderCommandCatalog(nextCatalog);
      setCachedProviderCommandCatalog({
        providerId: activeProvider,
        cwd: workspaceCwd,
        catalog: nextCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    const getCommandCatalog = window.api?.provider?.getCommandCatalog;
    if (!getCommandCatalog) {
      const nextCatalog: ProviderCommandCatalogState = {
        providerId: activeProvider,
        status: "error",
        commands: [],
        detail: "Provider command catalog API is unavailable in this build.",
      };
      setProviderCommandCatalog(nextCatalog);
      setCachedProviderCommandCatalog({
        providerId: activeProvider,
        cwd: workspaceCwd,
        catalog: nextCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    const loadingCatalog: ProviderCommandCatalogState = {
      providerId: activeProvider,
      status: "loading",
      commands: [],
      detail: `Loading ${getProviderLabel({ providerId: activeProvider })} native slash commands...`,
    };
    setProviderCommandCatalog(loadingCatalog);
    setCachedProviderCommandCatalog({
      providerId: activeProvider,
      cwd: workspaceCwd,
      catalog: loadingCatalog,
    });

    const runtimeOptions = buildCommandCatalogRuntimeOptions({
      activeProvider,
      claudeSettingSources,
      claudeBinaryPath,
    });

    void getCommandCatalog({
      providerId: activeProvider,
      cwd: workspaceCwd,
      runtimeOptions,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const nextCatalog = toProviderCommandCatalogState({
          providerId: activeProvider,
          response,
        });
        setProviderCommandCatalog(nextCatalog);
        setCachedProviderCommandCatalog({
          providerId: activeProvider,
          cwd: workspaceCwd,
          catalog: nextCatalog,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const nextCatalog = toProviderCommandCatalogState({
          providerId: activeProvider,
          error,
        });
        setProviderCommandCatalog(nextCatalog);
        setCachedProviderCommandCatalog({
          providerId: activeProvider,
          cwd: workspaceCwd,
          catalog: nextCatalog,
        });
      });

    return () => {
      cancelled = true;
    };
    // Deps are deliberately limited to inputs that can change the native
    // command catalog. Every re-run spawns a `claude` subprocess that
    // reconnects all MCP servers, so re-running on model / effort / thinking /
    // permission / sandbox changes used to duplicate remote connector
    // handshakes (Figma, Slack) around the first message of a session.
  }, [
    activeProvider,
    claudeBinaryPath,
    claudeSettingSources,
    providerCommandCatalogRefreshNonce,
    workspaceCwd,
  ]);

  const commandPalette = useMemo(
    () =>
      buildCommandPaletteItems({
        provider: activeProvider,
        providerCommandCatalog,
      }),
    [activeProvider, providerCommandCatalog],
  );
  const skillPalette = useMemo(
    () =>
      getEffectiveSkillEntries({
        skills: skillCatalog.skills,
        providerId: activeProvider,
      }),
    [activeProvider, skillCatalog.skills],
  );
  const deferredCommandPaletteItems = useDeferredValue(commandPalette.items);
  const deferredSkillPalette = useDeferredValue(skillPalette);

  // Prefer a second provider when one authored the latest answer, while still
  // letting the user select any available provider and model in the dialog.
  const lastAssistantProviderId = useAppStore((state) => {
    const messages = state.messagesByTask[activeTaskId] ?? EMPTY_MESSAGES;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as ChatMessage | undefined;
      if (!msg) continue;
      if (
        msg.role === "assistant" &&
        (msg.providerId === "claude-code" || msg.providerId === "codex")
      ) {
        return msg.providerId;
      }
    }
    return null;
  });
  const suggestedReviewProvider = useMemo<"claude-code" | "codex">(() => {
    if (!lastAssistantProviderId) return activeProvider;
    if (lastAssistantProviderId === "claude-code") return "codex";
    return "claude-code";
  }, [activeProvider, lastAssistantProviderId]);
  const reviewModelOptions = useMemo(
    () =>
      modelOptions
        .filter(
          (option) => option.available && !option.isAuto && option.model.trim(),
        )
        .map((option) => {
          const configuredModel =
            option.providerId === "claude-code" ? modelClaude : modelCodex;
          return option.model === configuredModel
            ? { ...option, isDefault: true }
            : option;
        }),
    [modelClaude, modelCodex, modelOptions],
  );
  const preferredReviewModelKey = useMemo(() => {
    const configuredModel =
      suggestedReviewProvider === "claude-code" ? modelClaude : modelCodex;
    return (
      reviewModelOptions.find(
        (option) =>
          option.providerId === suggestedReviewProvider &&
          option.model === configuredModel,
      ) ??
      reviewModelOptions.find(
        (option) =>
          option.providerId === suggestedReviewProvider && option.isDefault,
      ) ??
      reviewModelOptions.find(
        (option) => option.providerId === suggestedReviewProvider,
      ) ??
      reviewModelOptions[0]
    )?.key;
  }, [modelClaude, modelCodex, reviewModelOptions, suggestedReviewProvider]);
  const handleLocalChangeReview = useCallback(
    async (review: LocalChangeReviewRequest) => {
      const result = await sendUserMessage({
        taskId: activeTaskId,
        content: buildLocalChangeReviewPrompt({
          scope: review.scope,
          focuses: review.focuses,
          instructions: review.instructions,
        }),
        providerOverride: review.reviewer.providerId,
        turnOrigin: "utility",
        runtimeOverrides: {
          autoRouting: false,
          model: review.reviewer.model,
          ...buildModelEffortRuntimeOverrides({
            providerId: review.reviewer.providerId,
            model: review.reviewer.model,
            effort: review.effort,
          }),
        },
        preservePromptDraft: true,
      });
      if (result.status === "blocked") {
        toast.error("Could not start local change review", {
          description: "Finish the pending task interaction and try again.",
        });
        return false;
      }
      return true;
    },
    [activeTaskId, sendUserMessage],
  );

  useEffect(() => {
    if (!skillsEnabled) {
      return;
    }
    const targetPath = workspaceCwd ?? null;
    if (skillCatalog.workspacePath === targetPath) {
      if (skillCatalog.status === "loading") {
        return;
      }
      const fetchedAtMs = skillCatalog.fetchedAt
        ? Date.parse(skillCatalog.fetchedAt)
        : 0;
      if (skillCatalog.status === "ready") {
        const CATALOG_TTL_MS = 5 * 60 * 1000;
        if (Date.now() - fetchedAtMs < CATALOG_TTL_MS) {
          return;
        }
      }
      if (skillCatalog.status === "error") {
        const ERROR_RETRY_TTL_MS = 30 * 1000;
        if (Date.now() - fetchedAtMs < ERROR_RETRY_TTL_MS) {
          return;
        }
      }
    }
    void refreshSkillCatalog({ workspacePath: targetPath });
  }, [
    refreshSkillCatalog,
    skillsEnabled,
    skillCatalog.status,
    skillCatalog.workspacePath,
    skillCatalog.fetchedAt,
    workspaceCwd,
  ]);

  return (
    <ChatInputComposer
      isEmpty={isEmpty}
      activeTaskId={activeTaskId}
      windowShortcutsEnabled={windowShortcutsEnabled}
      activeProvider={activeProvider}
      workspaceCwd={workspaceCwd}
      providerSelectionTarget={providerSelectionTarget}
      isTurnActive={isTurnActive}
      managedTaskOwner={managedTaskOwner}
      sourceContexts={activeTask?.sourceContexts ?? []}
      currentPrUrl={currentPrUrl}
      currentPrHeadSha={currentPrHeadSha}
      onRemoveSourceContext={(sourceId) => {
        useAppStore
          .getState()
          .removeTaskSourceContext({ taskId: activeTaskId, sourceId });
      }}
      onClearSourceContexts={() => {
        useAppStore
          .getState()
          .clearTaskSourceContexts({ taskId: activeTaskId });
      }}
      onRefreshPrContext={() => dispatchTopBarPrAction("attach-context")}
      canTakeOverManagedTask={canTakeOverManagedTask}
      onTakeOverManagedTask={() => {
        void useAppStore
          .getState()
          .takeOverTask({ taskId: activeTaskId })
          .then((result) => {
            if (!result.ok) {
              toast.error("Could not take over this task", {
                description: result.message,
              });
              return;
            }
            if (result.craneReceiptPending) {
              toast.info("Task control is now local", {
                description:
                  "Crane is temporarily unreachable; its terminal status will retry in the background.",
              });
            }
          });
      }}
      selectedModelOption={selectedModelOption}
      modelOptions={modelOptions}
      modelShortcutKeys={normalizedModelShortcutKeys}
      modelShortcutEfforts={normalizedModelShortcutEfforts}
      commandPaletteItems={deferredCommandPaletteItems}
      commandPaletteProviderNote={commandPalette.providerNote}
      skillsEnabled={skillsEnabled}
      skillsAutoSuggest={skillsAutoSuggest}
      skillPaletteItems={deferredSkillPalette}
      providerModeStatus={providerModeStatus}
      providerModePresets={providerModePresets}
      activeProviderModePresetId={activeProviderModePresetId}
      goalStatus={goalStatus}
      onProviderModeSelect={onProviderModeSelect}
      runtimeStatusItems={runtimeStatusItems}
      effortLabel={effortLabel}
      effortValue={effortValue}
      reviewModelOptions={reviewModelOptions}
      preferredReviewModelKey={preferredReviewModelKey}
      onLocalChangeReview={handleLocalChangeReview}
      onModelSelect={({ selection, effort, fastMode: nextFastMode }) => {
        if (selection.isAuto) {
          const { model: _model, ...restRuntimeOverrides } =
            promptDraftRuntimeOverrides ?? {};
          updatePromptDraft({
            taskId: providerSelectionTarget,
            patch: {
              runtimeOverrides: {
                ...restRuntimeOverrides,
                autoRouting: true,
              },
            },
          });
          return;
        }
        const nextModel = normalizeModelSelection({
          value: selection.model,
          fallback: getDefaultModelForProvider({
            providerId: selection.providerId,
          }),
        });
        setTaskProvider({
          taskId: providerSelectionTarget,
          provider: selection.providerId,
        });
        updatePromptDraft({
          taskId: providerSelectionTarget,
          patch: {
            runtimeOverrides: {
              ...(promptDraftRuntimeOverrides ?? {}),
              autoRouting: false,
              model: nextModel,
            },
          },
        });
        if (selection.providerId === "claude-code") {
          const shortcutEffort = resolveModelShortcutEffort({
            shortcutKey: selection.key,
            effort,
          });
          if (
            shortcutEffort &&
            CLAUDE_EFFORT_OPTIONS.some(
              (option) => option.value === shortcutEffort,
            )
          ) {
            updateModelRuntimePreference({
              providerId: selection.providerId,
              model: nextModel,
              patch: { effort: shortcutEffort },
            });
          }
          return;
        }
        if (selection.providerId === "codex") {
          // Some Codex models accept a narrower effort scale than others
          // (e.g. GPT-5.6 Luna has no "Ultra") — clamp so switching models
          // never leaves an unsupported effort selected.
          const shortcutEffort = resolveModelShortcutEffort({
            shortcutKey: selection.key,
            effort,
          });
          if (shortcutEffort || nextFastMode !== undefined) {
            updateModelRuntimePreference({
              providerId: selection.providerId,
              model: nextModel,
              patch: {
                ...(shortcutEffort
                  ? {
                      effort: clampCodexEffortToModel({
                        model: nextModel,
                        effort: shortcutEffort as typeof codexReasoningEffort,
                      }),
                    }
                  : {}),
                ...(nextFastMode === undefined
                  ? {}
                  : { fastMode: nextFastMode }),
              },
            });
          }
          return;
        }
      }}
      fastMode={activeProvider === "codex" ? codexFastMode : undefined}
      onFastModeChange={
        activeProvider === "codex"
          ? (enabled) => {
              updateModelRuntimePreference({
                providerId: activeProvider,
                model: activeModel,
                patch: { fastMode: enabled },
              });
            }
          : undefined
      }
      planMode={
        activeProvider === "codex"
          ? effectiveCodexPlanMode
          : activeProvider === "claude-code" &&
            effectiveClaudePermissionMode === "plan"
      }
      onPlanModeChange={
        activeProvider === "codex"
          ? (enabled) => {
              const nextPlanModeState = resolvePromptDraftPlanModeChange({
                providerId: activeProvider,
                enabled,
                runtimeOverrides: promptDraftRuntimeOverrides,
                claudePermissionMode: effectiveClaudePermissionMode,
                claudePermissionModeBeforePlan:
                  effectiveClaudePermissionModeBeforePlan,
                codexPlanMode: effectiveCodexPlanMode,
                isTurnActive,
                hasPlanResponse: latestMessageIsPlanResponse,
              });
              updatePromptDraft({
                taskId: providerSelectionTarget,
                patch: {
                  runtimeOverrides: nextPlanModeState.runtimeOverrides,
                },
              });
              if (nextPlanModeState.shouldAbortActiveTurn) {
                abortTaskTurn({ taskId: providerSelectionTarget });
              } else if (nextPlanModeState.shouldClearCodexSession) {
                clearTaskProviderSession({
                  taskId: providerSelectionTarget,
                  providerId: "codex",
                });
              }
            }
          : activeProvider === "claude-code"
            ? (enabled) => {
                const nextPlanModeState = resolvePromptDraftPlanModeChange({
                  providerId: activeProvider,
                  enabled,
                  runtimeOverrides: promptDraftRuntimeOverrides,
                  claudePermissionMode: effectiveClaudePermissionMode,
                  claudePermissionModeBeforePlan:
                    effectiveClaudePermissionModeBeforePlan,
                  codexPlanMode: effectiveCodexPlanMode,
                });
                updatePromptDraft({
                  taskId: providerSelectionTarget,
                  patch: {
                    runtimeOverrides: nextPlanModeState.runtimeOverrides,
                  },
                });
              }
            : undefined
      }
      thinkingMode={
        activeProvider === "claude-code" ? claudeThinkingMode : undefined
      }
      onThinkingModeChange={
        activeProvider === "claude-code"
          ? (value) => updateSettings({ patch: { claudeThinkingMode: value } })
          : undefined
      }
    />
  );
}

export function ChatInput() {
  return <BaseChatInput />;
}
