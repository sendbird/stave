import { PromptInput } from "@/components/ai-elements";
import { ComposerContextDock } from "@/components/session/ComposerContextDock";
import { ComposerWorkspaceBar } from "@/components/session/composer-workspace-bar";
import { MacroControl } from "@/components/session/MacroControl";
import { MacroQuickPicks } from "@/components/session/MacroQuickPicks";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type ModelSelectorOption } from "@/components/ai-elements/model-selector";
import type { LocalChangeReviewRequest } from "@/components/ai-elements/local-change-review-dialog";
import type { PromptInputProviderModeStatus } from "@/components/ai-elements/prompt-input-provider-mode";
import {
  COMPOSER_CONTROL_BUTTON,
  COMPOSER_CONTROL_GROUP,
  COMPOSER_CONTROL_GROUP_MENU,
  COMPOSER_CONTROL_GROUP_PRIMARY,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import { useComposerFrameFits } from "@/hooks/use-composer-frame-fits";
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
  resolveWorkerArmState,
  resolveWorkerProfile,
} from "@/lib/providers/worker-mode";
import { resolveWorkerShortcutAction } from "@/lib/worker-shortcuts";
import {
  buildAdvisorEffortPatch,
  buildAdvisorEnabledPatch,
  buildAdvisorModelPatch,
  buildAdvisorProviderPatch,
  buildAdvisorTogglePatch,
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
import {
  ChevronDown,
  History,
  SplitSquareHorizontal,
} from "lucide-react";
import { listCompareRunHistoryEntries } from "@/lib/compare-run-history";
import {
  type CommandPaletteItem,
  type CommandPaletteProviderNote,
} from "@/lib/commands";
import {
  type ProviderModePresetDefinition,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import {
  resolveAdvisorArmState,
  resolveAdvisorSelectedProviderId,
} from "@/lib/providers/advisor";
import { isAdvisorExchangeBlocking } from "@/lib/providers/advisor-activity";
import {
  describeLocalMcpBlock,
  useLocalMcpReadiness,
} from "@/lib/local-mcp-readiness";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  getProviderDescriptor,
  getSdkModelOptions,
  isManagedExecutionProviderId,
  providerSupportsMidTurnSteering,
} from "@/lib/providers/model-catalog";
import { type ModelShortcutEffort } from "@/lib/providers/model-shortcuts";
import {
  addTrustedToolEntry,
  buildTrustedToolEntryForApproval,
} from "@/lib/providers/trusted-tools";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import {
  formatProviderTurnIdleDuration,
  resolveProviderTurnDisplayState,
} from "@/lib/providers/turn-status";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import {
  cx,
  sx,
} from "@/components/ads/utils/stylex";
import { chatInputStyles } from "./chat-input.styles";
import { useAppStore } from "@/store/app.store";
import { buildUtilityInferenceContext } from "@/store/provider-runtime-options";
import { resolveActiveTurnProviderId } from "@/store/chat-state-helpers";
import {
  findPendingApprovals,
  findLatestPendingUserInput,
} from "@/store/provider-message.utils";
import {
  resolveLensAnnotationClearTargets,
  shouldIncludeImageAttachmentAsProviderContext,
} from "@/lib/lens/lens-annotation-attachment";
import { buildWorkspaceInformationReferenceOptions } from "@/lib/workspace-information-references";
import {
  reportUtilityInferenceError,
  reportUtilityInferenceOutcome,
} from "@/lib/providers/utility-inference-notice";
import { RenderProfiler } from "@/lib/render-profiler";
import type {
  Attachment,
  PromptDraft,
  PromptDraftRuntimeOverrides,
  TaskControlOwner,
  TaskSourceContext,
} from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import { buildChatInputGoalStatus } from "./chat-input.runtime";
import { ChatInputApprovalQueue } from "./chat-input-approval-queue";
import { ManagedTaskTakeoverNotice } from "./ManagedTaskTakeoverNotice";
import {
  resolveManagedTaskComposerAccess,
  TaskSourceContextNotice,
} from "./TaskSourceContextNotice";
import {
  buildAttachedFileContext,
  resolvePastedFileAbsolutePath,
  toWorkspaceRelativeFilePath,
} from "./chat-input.attachments";
import { TurnActivity } from "./TurnActivity";
import {
  buildApprovalGuidancePrompt,
  canApplyPromptEnhancementResult,
  EMPTY_MESSAGES,
  EMPTY_PROMPT_DRAFT,
  getLatestPromptSuggestions,
  getLatestUserPromptMessage,
  getPromptHistoryEntries,
  isStaleActiveTurnDraft,
  shouldHandleApprovalEnterShortcut,
  shouldHandleApprovalTabShortcut,
} from "./chat-input.utils";
import {
  buildPromptEnhancementHistory,
  buildPromptEnhancementWorkspaceSummary,
  recordPromptEnhancementExemplar,
  selectPromptEnhancementExemplars,
  type PromptEnhancementExemplar,
} from "@/lib/providers/prompt-enhancement-context";

const PROMPT_DRAFT_SAVE_DELAY_MS = 1200;
const PROMPT_DRAFT_IDLE_TIMEOUT_MS = 750;
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
  modelCatalogs?: Partial<
    Record<
      ModelSelectorOption["providerId"],
      {
        status: "idle" | "loading" | "ready" | "error";
        detail?: string;
        isDynamic?: boolean;
      }
    >
  >;
  onRefreshModelCatalogs?: () => void;
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

export function ChatInputComposer(args: ChatInputComposerProps) {
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
    settingsAdvisorEnabled,
    settingsAdvisorTarget,
    settingsAdvisorTargetByProvider,
    settingsCodexBinaryPath,
    skipTaskAdvisor,
    composerControlPlacements,
    composerLayout,
    settingsWorkerEnabled,
    settingsWorkerConfigByProvider,
    macros,
    applyMacroToDraft,
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
          state.settings.advisorEnabled,
          state.settings.advisorTarget,
          state.settings.advisorTargetByProvider,
          state.settings.codexBinaryPath,
          state.skipTaskAdvisor,
          state.settings.composerControlPlacements,
          state.settings.composerLayout,
          state.settings.workerEnabled,
          state.settings.workerConfigByProvider,
          state.settings.macros,
          state.applyMacroToDraft,
        ] as const,
    ),
  );

  // `framed` is a preference, not a guarantee: the frame pays for its two
  // wings out of the composer measure, so a squeezed column (sidebar open,
  // information panel open, small window) renders the classic stack instead.
  const { ref: composerMeasureRef, fits: composerFrameFits } =
    useComposerFrameFits();
  const useFramedComposer = composerLayout === "framed" && composerFrameFits;
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
        settingsEnabled: settingsAdvisorEnabled,
        settingsTargetByProvider: settingsAdvisorTargetByProvider,
      }),
    [
      promptDraft.runtimeOverrides,
      settingsAdvisorEnabled,
      settingsAdvisorTarget,
      settingsAdvisorTargetByProvider,
    ],
  );
  const managedActiveProvider = isManagedExecutionProviderId(
    args.activeProvider,
  )
    ? args.activeProvider
    : "claude-code";
  const workerActiveProvider = args.activeProvider;
  const workerRuntimeModels = useMemo(
    () =>
      args.modelOptions
        .filter(
          (option) =>
            !option.isAuto &&
            option.available &&
            option.providerId === workerActiveProvider,
        )
        .map((option) => option.model),
    [args.modelOptions, workerActiveProvider],
  );
  const [advisorPickerOpen, setAdvisorPickerOpen] = useState(false);
  // Consults travel over Local MCP, so an armed Advisor with a broken link is
  // silently inert. Read only while the Advisor is armed or being configured —
  // there is nothing to warn about otherwise.
  const localMcpReadiness = useLocalMcpReadiness({
    enabled:
      isManagedExecutionProviderId(args.activeProvider) &&
      (advisorArm.enabled || advisorPickerOpen),
    primaryProviderId: managedActiveProvider,
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
  // Which provider the picker configures. Independent of arming, so a task can
  // be set up before the Advisor is turned on.
  const advisorSelectedProviderId = resolveAdvisorSelectedProviderId({
    arm: advisorArm,
    primaryProviderId: args.activeProvider,
  });
  // Codex advertises models dynamically, so the list is only worth fetching
  // once the user actually opens the picker on a Codex advisor.
  const advisorCodexCatalog = useCodexModelCatalog({
    enabled: advisorPickerOpen && advisorSelectedProviderId === "codex",
    codexBinaryPath: settingsCodexBinaryPath,
  });
  const advisorModelOptions = useMemo(() => {
    const providerId = advisorSelectedProviderId;
    const catalog: readonly string[] =
      providerId === "codex"
        ? advisorCodexCatalog.models
        : getSdkModelOptions({ providerId });
    const selected = advisorArm.targetByProvider[providerId].model;
    // Keep a persisted-but-unlisted model visible so the picker always shows
    // what is actually configured instead of silently disagreeing with it.
    return !catalog.includes(selected) ? [selected, ...catalog] : [...catalog];
  }, [
    advisorArm.targetByProvider,
    advisorCodexCatalog.models,
    advisorSelectedProviderId,
  ]);

  const workerArm = useMemo(
    () =>
      resolveWorkerArmState({
        providerId: workerActiveProvider,
        overrides: promptDraft.runtimeOverrides,
        settingsConfig: settingsWorkerConfigByProvider?.[workerActiveProvider],
        settingsEnabled: settingsWorkerEnabled,
      }),
    [
      workerActiveProvider,
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
        providerId: workerActiveProvider,
        primaryModel: args.selectedModelOption.model,
        intent: buildWorkerRuntimeIntent(workerArm),
        runtimeModels: workerRuntimeModels,
      }),
    [
      args.selectedModelOption.model,
      workerActiveProvider,
      workerArm,
      workerRuntimeModels,
    ],
  );
  const [workerPickerOpen, setWorkerPickerOpen] = useState(false);
  const workerLocalMcpReadiness = useLocalMcpReadiness({
    enabled:
      (workerActiveProvider === "cursor" || workerActiveProvider === "kiro") &&
      (workerArm.enabled || workerPickerOpen),
    primaryProviderId: workerActiveProvider,
    refreshKey: workerPickerOpen,
  });
  const workerExecutionBlock = useMemo(
    () =>
      workerArm.enabled &&
      (workerActiveProvider === "cursor" || workerActiveProvider === "kiro")
        ? describeLocalMcpBlock({
            readiness: workerLocalMcpReadiness.readiness,
            capability: "Worker calls",
          })
        : null,
    [
      workerActiveProvider,
      workerArm.enabled,
      workerLocalMcpReadiness.readiness,
    ],
  );

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

  function handleApplyMacro(request: {
    macroId: string;
    draftText: string;
    tokenMatch?: { start: number; end: number };
  }) {
    const result = applyMacroToDraft({
      taskId: args.providerSelectionTarget,
      macroId: request.macroId,
      draftText: request.draftText,
      tokenMatch: request.tokenMatch,
    });
    if (!result.ok || result.text == null) {
      return null;
    }
    adoptPromptDraftText({
      taskId: args.providerSelectionTarget,
      text: result.text,
    });
    if (result.instantRun) {
      void submitInstantMacro({
        text: result.text,
        providerOverride: result.providerOverride,
        runtimeOverrides: result.runtimeOverrides,
      });
    }
    return {
      text: result.text,
      caretIndex: result.caretIndex ?? result.text.length,
      instantRun: result.instantRun === true,
    };
  }

  async function submitInstantMacro(request: {
    text: string;
    providerOverride?: ProviderId;
    runtimeOverrides?: PromptDraftRuntimeOverrides;
  }) {
    const text = request.text.trim();
    if (!text) {
      return;
    }
    cancelPendingDraftSave();
    useAppStore.getState().requestTaskScrollToLatest({
      taskId: args.activeTaskId,
    });
    const sendResult = await sendUserMessage({
      taskId: args.activeTaskId,
      content: text,
      turnOrigin: "conversation",
      providerOverride: request.providerOverride,
      runtimeOverrides: request.runtimeOverrides,
    });
    if (
      sendResult.status === "started" ||
      sendResult.status === "queued" ||
      sendResult.status === "steered"
    ) {
      adoptPromptDraftText({
        taskId: args.providerSelectionTarget,
        text: "",
      });
      return;
    }
    if (sendResult.status === "blocked") {
      toast.warning("Couldn't run the macro immediately", {
        description:
          "The prompt is in the composer. Finish the pending action and send it.",
      });
    }
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
  // Whether a staged queue item may be promoted into the turn that is already
  // running, instead of waiting for that turn to finish. Deliberately
  // independent of what is typed in the composer — only the queued item's own
  // payload gets steered, so the composer's attachments are irrelevant here.
  // Per-item attachments still block steering and are checked on each chip.
  // Capability comes from the provider serving the RUNNING turn (resolved the
  // same way the store resolves it), not from the model selector, which the
  // user may switch mid-turn without retargeting that turn.
  const canSteerQueuedTurns =
    midTurnSteeringEnabled &&
    args.isTurnActive &&
    providerTurnDisplayState !== "stalled" &&
    !!activeTurnId &&
    providerSupportsMidTurnSteering({
      providerId: resolveActiveTurnProviderId({
        activeTurnId,
        activity: providerTurnActivity ?? undefined,
        fallbackProviderId: args.activeProvider,
        messages: activeTaskMessages,
      }),
    });
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
  const [promptEnhancementPending, setPromptEnhancementPending] =
    useState(false);
  const [promptEnhancementRevealing, setPromptEnhancementRevealing] =
    useState(false);
  const [promptEnhancementRevealVersion, setPromptEnhancementRevealVersion] =
    useState(0);
  // The draft the rewrite replaced. The composer diffs the enhanced prompt
  // against it so the reveal can highlight what actually changed.
  const [promptEnhancementSourceText, setPromptEnhancementSourceText] =
    useState("");
  const promptEnhancementRequestRef = useRef(0);
  const promptEnhancementPendingRef = useRef(false);
  const promptEnhancementRevealingRef = useRef(false);
  const promptEnhancementResultRef = useRef<{
    targetTaskId: string;
    sourceText: string;
    enhancedPrompt: string;
  } | null>(null);
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

  async function handleEnhancePrompt() {
    const sourceText = draftTextRef.current;
    if (
      !sourceText.trim() ||
      promptEnhancementPendingRef.current ||
      promptEnhancementRevealingRef.current
    ) {
      return;
    }
    const enhancePrompt = window.api?.provider?.enhancePrompt;
    if (!enhancePrompt) {
      reportUtilityInferenceError({
        feature: "prompt-enhancement",
        error: "Prompt-enhancement bridge unavailable.",
      });
      return;
    }

    const targetTaskId = args.providerSelectionTarget;
    const requestId = ++promptEnhancementRequestRef.current;
    promptEnhancementPendingRef.current = true;
    setPromptEnhancementPending(true);
    commitCurrentDraftText();

    try {
      // Reference material is attached only when it exists, so an empty
      // workspace pays for nothing beyond the draft.
      const storeState = useAppStore.getState();
      const history = buildPromptEnhancementHistory(
        storeState.messagesByTask[args.activeTaskId],
      );
      const workspaceSummary = buildPromptEnhancementWorkspaceSummary(
        storeState.workspaceInformation,
      );
      const styleProfile =
        storeState.settings.promptEnhancementStyleProfile.trim() || undefined;
      const exemplars = storeState.settings.promptEnhancementLearnFromEdits
        ? selectPromptEnhancementExemplars(
            storeState.settings.promptEnhancementExemplars,
          )
        : undefined;
      const result = await enhancePrompt({
        ...buildUtilityInferenceContext({
          cwd: args.workspaceCwd,
          provider: args.activeProvider,
          model: args.selectedModelOption.model,
          settings: storeState.settings,
        }),
        prompt: sourceText,
        ...(history ? { history } : {}),
        ...(workspaceSummary ? { workspaceSummary } : {}),
        ...(styleProfile ? { styleProfile } : {}),
        ...(exemplars ? { exemplars } : {}),
      });
      if (promptEnhancementRequestRef.current !== requestId) {
        return;
      }
      reportUtilityInferenceOutcome({
        feature: "prompt-enhancement",
        ok: result.ok,
        utility: result.utility,
      });
      if (!result.ok || !result.prompt) {
        return;
      }
      if (
        !canApplyPromptEnhancementResult({
          sourceTaskId: targetTaskId,
          currentTaskId: syncedDraftRef.current.taskId,
          sourceText,
          currentText: draftTextRef.current,
        })
      ) {
        toast.info("Draft changed while the prompt was being enhanced", {
          description: "Your newer draft was kept unchanged.",
        });
        return;
      }

      const enhancedPrompt = result.prompt.trim();
      if (enhancedPrompt === sourceText.trim()) {
        toast.info("This prompt is already clear");
        setFocusNonce((current) => current + 1);
        return;
      }

      adoptPromptDraftText({ taskId: targetTaskId, text: enhancedPrompt });
      commitPromptDraftText({ taskId: targetTaskId, text: enhancedPrompt });
      promptEnhancementResultRef.current = {
        targetTaskId,
        sourceText,
        enhancedPrompt,
      };
      promptEnhancementRevealingRef.current = true;
      setPromptEnhancementSourceText(sourceText);
      setPromptEnhancementRevealing(true);
      setPromptEnhancementRevealVersion((current) => current + 1);
    } catch (error) {
      if (promptEnhancementRequestRef.current === requestId) {
        reportUtilityInferenceError({
          feature: "prompt-enhancement",
          error,
        });
      }
    } finally {
      if (promptEnhancementRequestRef.current === requestId) {
        promptEnhancementPendingRef.current = false;
        setPromptEnhancementPending(false);
      }
    }
  }

  function handlePromptEnhancementRevealComplete() {
    const enhancementResult = promptEnhancementResultRef.current;
    if (!enhancementResult || !promptEnhancementRevealingRef.current) {
      return;
    }

    promptEnhancementResultRef.current = null;
    promptEnhancementRevealingRef.current = false;
    setPromptEnhancementRevealing(false);
    if (
      syncedDraftRef.current.taskId !== enhancementResult.targetTaskId ||
      draftTextRef.current !== enhancementResult.enhancedPrompt
    ) {
      return;
    }

    setFocusNonce((current) => current + 1);
    recordPromptEnhancementOutcome({
      source: enhancementResult.sourceText,
      enhanced: enhancementResult.enhancedPrompt,
      outcome: "kept",
    });
    toast.success("Prompt enhanced", {
      action: {
        label: "Undo",
        onClick: () => {
          if (
            syncedDraftRef.current.taskId !== enhancementResult.targetTaskId ||
            draftTextRef.current !== enhancementResult.enhancedPrompt
          ) {
            return;
          }
          adoptPromptDraftText({
            taskId: enhancementResult.targetTaskId,
            text: enhancementResult.sourceText,
          });
          commitPromptDraftText({
            taskId: enhancementResult.targetTaskId,
            text: enhancementResult.sourceText,
          });
          recordPromptEnhancementOutcome({
            source: enhancementResult.sourceText,
            enhanced: enhancementResult.enhancedPrompt,
            outcome: "undone",
          });
          setFocusNonce((current) => current + 1);
        },
      },
    });
  }

  /**
   * Taste memory for Enhance. A kept rewrite is a positive example, an undone
   * one a negative example; the same source keeps only its latest outcome.
   */
  function recordPromptEnhancementOutcome(entry: {
    source: string;
    enhanced: string;
    outcome: PromptEnhancementExemplar["outcome"];
  }) {
    const store = useAppStore.getState();
    if (!store.settings.promptEnhancementLearnFromEdits) {
      return;
    }
    store.updateSettings({
      patch: {
        promptEnhancementExemplars: recordPromptEnhancementExemplar(
          store.settings.promptEnhancementExemplars,
          entry,
        ),
      },
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

  // Promote one staged queue item into the response that is already running
  // instead of waiting for it to finish. On any failure the store returns
  // before mutating, so the item simply stays queued.
  async function steerQueuedTurnNow(itemId: string) {
    const item = queuedTurns.find((queuedItem) => queuedItem.id === itemId);
    if (!item) {
      return;
    }
    const submissionTaskId = args.providerSelectionTarget;
    if (pendingSteerTaskIdsRef.current.has(submissionTaskId)) {
      return;
    }
    useAppStore.getState().requestTaskScrollToLatest({
      taskId: args.activeTaskId,
    });
    setSteerSubmissionPending(submissionTaskId, true);
    try {
      const result = await sendUserMessage({
        taskId: args.activeTaskId,
        content: item.content,
        turnOrigin: "conversation",
        queuedTurnId: itemId,
        submitIntent: "steer",
      });
      if (result.status === "steer-unavailable") {
        toast.error("Couldn't steer this queued prompt", {
          description: result.message,
        });
      } else if (result.status === "steer-delivery-unknown") {
        toast.warning("Steer delivery is unconfirmed", {
          description: result.message,
        });
      } else if (result.status === "blocked") {
        toast.warning("Couldn't steer the queued prompt", {
          description:
            "The task is busy or waiting on another action. The prompt stays queued.",
        });
      }
    } finally {
      setSteerSubmissionPending(submissionTaskId, false);
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

  useEffect(() => {
    promptEnhancementRequestRef.current += 1;
    promptEnhancementPendingRef.current = false;
    promptEnhancementRevealingRef.current = false;
    promptEnhancementResultRef.current = null;
    setPromptEnhancementPending(false);
    setPromptEnhancementRevealing(false);
    setPromptEnhancementSourceText("");
  }, [args.providerSelectionTarget]);

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
      className={sx(
        chatInputStyles.root,
        args.isEmpty && chatInputStyles.rootEmpty,
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
      <div className={sx(chatInputStyles.measure)} ref={composerMeasureRef}>
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
            onResolveApproval={({ messageId, approved, scope }) => {
              resolveApproval({
                taskId: args.activeTaskId,
                messageId,
                approved,
                ...(scope ? { scope } : {}),
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
            className={sx(chatInputStyles.steerRow)}
            role="status"
            aria-live="polite"
          >
            <span
              className={sx(chatInputStyles.steerDot)}
              aria-hidden
            />
            <span>Steering · waiting for provider acknowledgement</span>
          </div>
        ) : null}
        {providerTurnDisplayState === "stalled" ? (
          <div className={sx(chatInputStyles.stalledBanner)}>
            <div className={sx(chatInputStyles.stalledInner)}>
              <Badge variant="warning" className={sx(chatInputStyles.stalledBadge)}>
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
        {useFramedComposer ? null : (
          // Classic mode is the shipped stack: a full-measure activity shelf
          // sitting directly on a full-measure card.
          <RenderProfiler id="TurnActivity">
            <TurnActivity />
          </RenderProfiler>
        )}
        <PromptInput
          framed={useFramedComposer}
          frameTop={
            useFramedComposer ? (
              <RenderProfiler id="TurnActivity">
                <TurnActivity frameInset />
              </RenderProfiler>
            ) : undefined
          }
          frameBottom={useFramedComposer ? <ComposerWorkspaceBar /> : undefined}
          focusToken={`${args.providerSelectionTarget}:${focusNonce}`}
          value={draftText}
          onEnhancePrompt={handleEnhancePrompt}
          promptEnhancementPending={promptEnhancementPending}
          promptEnhancementRevealing={promptEnhancementRevealing}
          promptEnhancementRevealVersion={promptEnhancementRevealVersion}
          promptEnhancementSourceText={promptEnhancementSourceText}
          onPromptEnhancementRevealComplete={
            handlePromptEnhancementRevealComplete
          }
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
          advisorActive={
            isManagedExecutionProviderId(args.activeProvider) &&
            (advisorArm.enabled || advisorPickerOpen)
          }
          workerActive={
            getProviderDescriptor({ providerId: args.activeProvider })
              .capabilities.worker &&
            (workerArm.enabled || workerPickerOpen)
          }
          secretsActive={
            (promptDraft.runtimeOverrides?.boundSecretIds?.length ?? 0) > 0
          }
          advisorControl={
            isManagedExecutionProviderId(args.activeProvider) ? (
            <PromptInputAdvisorPill
              arm={advisorArm}
              primaryProviderId={args.activeProvider}
              primaryModel={args.selectedModelOption.model}
              selectedProviderId={advisorSelectedProviderId}
              advisorModelOptions={advisorModelOptions}
              blocking={advisorBlockingTurn}
              consultBlock={advisorConsultBlock}
              disabled={isInputBlocked}
              open={advisorPickerOpen}
              onOpenChange={setAdvisorPickerOpen}
              onSetEnabled={(enabled) => {
                applyRuntimeOverrides(
                  buildAdvisorEnabledPatch({
                    overrides: promptDraft.runtimeOverrides,
                    arm: advisorArm,
                    providerId: advisorSelectedProviderId,
                    enabled,
                  }),
                );
                // Disarming while the Advisor holds the turn has to release the
                // turn too, otherwise the switch silently means "next time" at
                // the one moment the user wants it to mean now.
                if (!enabled && advisorBlockingTurn) {
                  skipTaskAdvisor({ taskId: args.activeTaskId });
                }
              }}
              onSelectProvider={(providerId) => {
                applyRuntimeOverrides(
                  buildAdvisorProviderPatch({
                    overrides: promptDraft.runtimeOverrides,
                    arm: advisorArm,
                    providerId,
                  }),
                );
              }}
              onSelectModel={(model) => {
                applyRuntimeOverrides(
                  buildAdvisorModelPatch({
                    overrides: promptDraft.runtimeOverrides,
                    arm: advisorArm,
                    providerId: advisorSelectedProviderId,
                    model,
                  }),
                );
              }}
              onSelectEffort={(effort) => {
                applyRuntimeOverrides(
                  buildAdvisorEffortPatch({
                    overrides: promptDraft.runtimeOverrides,
                    arm: advisorArm,
                    providerId: advisorSelectedProviderId,
                    effort,
                  }),
                );
              }}
            />
            ) : null
          }
          workerControl={
            getProviderDescriptor({ providerId: args.activeProvider })
              .capabilities.worker ? (
            <PromptInputWorkerPill
              arm={workerArm}
              resolution={workerResolution}
              primaryProviderId={workerActiveProvider}
              primaryModel={args.selectedModelOption.model}
              runtimeModels={workerRuntimeModels}
              executionBlock={workerExecutionBlock}
              disabled={isInputBlocked}
              open={workerPickerOpen}
              onOpenChange={setWorkerPickerOpen}
              onToggle={handleWorkerToggle}
              onSelectPreset={(presetId) => {
                applyRuntimeOverrides(
                  buildWorkerPresetPatch({
                    overrides: promptDraft.runtimeOverrides,
                    providerId: workerActiveProvider,
                    presetId,
                  }),
                );
              }}
              onSelectModel={(model) => {
                applyRuntimeOverrides(
                  buildWorkerModelPatch({
                    overrides: promptDraft.runtimeOverrides,
                    providerId: workerActiveProvider,
                    model,
                  }),
                );
              }}
              onSelectEffort={(effort) => {
                applyRuntimeOverrides(
                  buildWorkerEffortPatch({
                    overrides: promptDraft.runtimeOverrides,
                    providerId: workerActiveProvider,
                    effort,
                  }),
                );
              }}
            />
            ) : null
          }
          macroQuickPicks={
            args.isTurnActive ? null : (
              <MacroQuickPicks
                macros={macros}
                disabled={isInputBlocked}
                onSelect={(macro) => {
                  handleApplyMacro({
                    macroId: macro.id,
                    draftText: draftTextRef.current,
                  });
                }}
              />
            )
          }
          macroControl={
            args.isTurnActive ? null : (
              // No wrapper: every host lane (in-card toolbar, wing, bottom
              // shelf) sizes composer controls with a single `[&_button]`
              // rule, so a box around the button would absorb that rule and
              // leave the pill floating at its own height inside the row.
              <MacroControl
                macros={macros}
                disabled={isInputBlocked}
                onSelect={(macro) => {
                  handleApplyMacro({
                    macroId: macro.id,
                    draftText: draftTextRef.current,
                  });
                }}
              />
            )
          }
          secretsControl={
            args.isTurnActive ? null : (
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
            )
          }
          compareControl={
            args.isTurnActive ? null : (
              <div
                className={COMPOSER_CONTROL_GROUP}
                data-compare-control="true"
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cx(
                          COMPOSER_CONTROL_BUTTON,
                          COMPOSER_CONTROL_GROUP_PRIMARY,
                        )}
                        aria-label="Prepare a comparison in isolated candidate workspaces"
                        {...composerControlAttributes}
                        disabled={
                          isInputBlocked || draftText.trim().length === 0
                        }
                        onClick={handleOpenComparePreparation}
                      />
                    }
                  >
                    <SplitSquareHorizontal size={16} />
                    <ComposerControlLabel>Compare</ComposerControlLabel>
                  </TooltipTrigger>
                  <TooltipContent side="top" className={sx(chatInputStyles.tooltipContent)}>
                    Prepare a shared brief and review criteria before running
                    two configurable candidates in separate workspaces.
                  </TooltipContent>
                </Tooltip>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cx(
                          COMPOSER_CONTROL_BUTTON,
                          COMPOSER_CONTROL_GROUP_MENU,
                          sx(chatInputStyles.compareControlMenuTrigger),
                        )}
                        aria-label="Compare options and recent runs"
                        {...composerControlAttributes}
                        disabled={
                          recentCompareRuns.length === 0 &&
                          (isInputBlocked || draftText.trim().length === 0)
                        }
                      >
                        <ChevronDown size={14} />
                      </Button>
                    }
                  />

                  <DropdownMenuContent
                    align="start"
                    sideOffset={6}
                    xstyle={chatInputStyles.menuContentWide}
                  >
                    <DropdownMenuLabel className={sx(chatInputStyles.menuLabelRow)}>
                      <SplitSquareHorizontal size={14} />
                      Compare
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      disabled={isInputBlocked || draftText.trim().length === 0}
                      onSelect={handleOpenComparePreparation}
                    >
                      <SplitSquareHorizontal size={16} />
                      <span className={sx(chatInputStyles.itemText)}>
                        <span className={sx(chatInputStyles.itemTitle)}>
                          Prepare new comparison
                        </span>
                        <span className={sx(chatInputStyles.itemDescription)}>
                          Configure candidates, criteria, and judge
                        </span>
                      </span>
                    </DropdownMenuItem>

                  {recentCompareRuns.length > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className={sx(chatInputStyles.menuLabelRecent)}>
                        <History size={14} />
                        Recent runs
                      </DropdownMenuLabel>
                      {recentCompareRuns.map((run) => (
                        <DropdownMenuItem
                          key={run.id}
                          className={sx(chatInputStyles.menuItemStart)}
                          onSelect={() =>
                            useAppStore
                              .getState()
                              .openCompareRun({ compareRunId: run.id })
                          }
                        >
                          <span className={sx(chatInputStyles.runDot)} />
                          <span className={sx(chatInputStyles.itemText)}>
                            <span className={sx(chatInputStyles.itemTitleTruncate)}>
                              {run.title}
                            </span>
                            <span className={sx(chatInputStyles.itemDescriptionCapitalize)}>
                              {run.stateLabel}
                            </span>
                          </span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className={sx(chatInputStyles.menuItemGap)}
                        onSelect={() => setCompareHistoryOpen(true)}
                      >
                        <History size={16} />
                        <span className={sx(chatInputStyles.itemText)}>
                          <span className={sx(chatInputStyles.itemTitle)}>
                            View all compare runs…
                          </span>
                          <span className={sx(chatInputStyles.itemDescription)}>
                            Search and filter {compareRunHistoryEntries.length}{" "}
                            saved runs
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
          modelCatalogs={args.modelCatalogs}
          onRefreshModelCatalogs={args.onRefreshModelCatalogs}
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
          macros={macros}
          onMacroSelect={({ macro, match, draftText }) =>
            handleApplyMacro({
              macroId: macro.id,
              draftText,
              tokenMatch: match ?? undefined,
            })
          }
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
          canSteerQueuedTurn={canSteerQueuedTurns}
          onSteerQueuedTurn={({ itemId }) => void steerQueuedTurnNow(itemId)}
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
          contextMeter={<ComposerContextDock />}
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
          onOpenAttachedFile={({ filePath }) =>
            openFileFromTree({ filePath })
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
                .map((tab) => buildAttachedFileContext({
                  filePath: tab.filePath,
                  kind: tab.kind === "image" ? "image" : "text",
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

