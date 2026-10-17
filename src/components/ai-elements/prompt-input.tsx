import { PromptInputRunAccountPoolControl } from "./prompt-input-run-account-pool";
import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Tooltip as AdsTooltip } from "@/components/ads/components/Tooltip";
import {
  Brain,
  Ellipsis,
  FileText,
  FolderOpen,
  Globe2,
  Info,
  Paperclip,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Target,
  Trash2,
  UserRound,
  MessagesSquare,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import {
  Fragment,
  type FormEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  ImageLightbox,
  Kbd,
  KbdGroup,
  Loader,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
  PopoverTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { UserInputCard } from "./user-input-card";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import {
  COMPOSER_CONTROL_LABELS,
  collectActiveComposerControls,
  composerControlIsIconOnly,
  partitionComposerFrameToolbar,
  resolveComposerControlLayout,
  type ComposerControlId,
} from "@/lib/composer-controls";
import { ComposerControlPlacementList } from "@/components/ai-elements/prompt-input-control-menu";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import { isAssignPaletteEntry } from "@/components/session/assign-palette-entry";
import { sx, cx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import {
  isShortcutEchoInsertion,
  NO_PROMPT_HISTORY_SELECTION,
} from "./prompt-input.utils";
import { type ModelShortcutEffort } from "@/lib/providers/model-shortcuts";
import { DEFAULT_PROMPT_COMMENT_SHORTCUT } from "@/lib/prompt-comment-shortcuts";
import {
  DEFAULT_STEER_QUEUE_ENTER_ACTION,
  formatSteerQueueEnterActionLabel,
} from "@/lib/steer-queue-shortcuts";
import { getLensCommentImageId } from "@/lib/lens/lens-annotation-attachment";
import { resolveLensAnnotationReview } from "@/lib/lens/lens-element-message";
import { ModelEffortSelector } from "./model-effort-selector";
import { PromptInputProviderModePill } from "./prompt-input-provider-mode";
import { PromptInputGoalStatusStrip } from "./prompt-input-goal-status";
import {
  getPromptInputRuntimeProfile,
  PromptInputRuntimeBar,
} from "./prompt-input-runtime-bar";
import { Suggestion, Suggestions } from "./suggestion";
import {
  PromptLexicalEditor,
  type PromptLexicalEditorHandle,
} from "./prompt-lexical-editor";
import { hasPromptSubmitPayload } from "./prompt-input-submit";
import { WorkspaceInformationReferenceChip } from "@/components/workspace-information-reference-chip";
import { TaskContextDraftChip } from "@/components/task-context-draft-chip";
import {
  DocumentContextChip,
  openAttachedDocument,
} from "@/components/document-context-chip";
import {
  documentMentionKey,
  readDroppedTask,
} from "./prompt-input-mentions";
import { TASK_DRAG_MIME } from "@/lib/task-context/attached-task-context";
import { isReviewTaskDelegationAvailable } from "@/store/review-task-runtime";
import { openAttachedTask } from "@/components/open-attached-task";
import { LocalChangeReviewDialog } from "./local-change-review-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  COMPOSER_CONTROL_MENU_CONTENT,
  ComposerControlMenuList,
} from "./composer-control-menu";
import {
  COMPOSER_CONTROL_BUTTON,
  COMPOSER_CONTROL_LANE,
  ComposerControlLabel,
  composerControlAttributes,
} from "./composer-control-density";
import { ComposerStatusTray } from "@/components/ai-elements/composer-status-tray";
import {
  ComposerFrame,
  ComposerFrameStatusBar,
  ComposerFrameWing,
} from "./composer-frame";
import type { PromptInputProps } from "./prompt-input.types";
import {
  PROMPT_EDITOR_TYPOGRAPHY_DEFAULT,
  PROMPT_EDITOR_TYPOGRAPHY_MINIMAL,
  PROMPT_ENHANCEMENT_EDITOR_INSET,
  PromptEnhancementRevealOverlay,
  usePromptEnhancementReveal,
  usePromptEnhancementScrollReset,
} from "./prompt-input-enhancement";
import {
  PROMPT_SURFACE_PRIMARY_FOCUS,
  PROMPT_TOOLBAR_ICON_BUTTON,
  PromptInputRuntimeTriggerIcon,
  getPromptToolbarAccentStyle,
  getRuntimeProfileToneStyle,
  tooltipTriggerButtonClassName,
} from "./prompt-input-toolbar-parts";
import {
  LensAnnotationFeedbackPopover,
  LensAnnotationStylePopover,
  formatLensFeedbackOption,
} from "./prompt-input-lens-annotation";
import { usePromptInputClipboardPaste } from "./prompt-input-paste";
import { usePromptInputAttachmentGroups } from "./prompt-input-attachment-groups";
import { usePromptInputCaret } from "./prompt-input-caret";
import { usePromptInputWindowShortcuts } from "./prompt-input-shortcuts";
import { usePromptInputHistory } from "./prompt-input-history";
import { usePromptInputPaletteState } from "./prompt-input-palette-state";
import { usePromptInputPaletteSelection } from "./prompt-input-palette-selection";
import { usePromptInputLensAnnotationActions } from "./prompt-input-lens-actions";
import { handlePromptEditorKeyDown } from "./prompt-input-keyboard";

export function PromptInput(args: PromptInputProps) {
  useTranslation();
  const {
    disabled,
    minimal = false,
    isTurnActive,
    submitMode = "send",
    promptBatch = [],
    promptCommentShortcut = DEFAULT_PROMPT_COMMENT_SHORTCUT,
    steerQueueEnterAction = DEFAULT_STEER_QUEUE_ENTER_ACTION,
    focusToken,
    value,
    selectedModel,
    modelOptions,
    modelCatalogs,
    onRefreshModelCatalogs,
    modelShortcutKeys,
    modelShortcutEfforts,
    windowShortcutsEnabled = true,
    attachedFilePaths,
    attachments,
    promptHistoryEntries,
    promptSuggestions,
    providerModeStatus,
    providerModePresets,
    activeProviderModePresetId,
    goalStatus,
    contextMeter,
    runAccountPool,
    framed = false,
    frameTop,
    frameBottom,
    runtimeStatusItems,
    commandPaletteItems,
    commandPaletteProviderNote,
    skillsEnabled,
    skillsAutoSuggest,
    skillPaletteItems,
    macros,
    onMacroSelect,
    workspaceInformationReferenceOptions,
    taskMentionOptions,
    onAttachTask,
    documentMentionOptions,
    onAttachDocument,
    onValueChange,
    onEnhancePrompt,
    promptEnhancementPending = false,
    promptEnhancementRevealing = false,
    promptEnhancementRevealVersion = 0,
    promptEnhancementSourceText = "",
    onPromptEnhancementRevealComplete,
    onSuggestionSelect,
    onFocus,
    onBlur,
    onModelSelect,
    onAttachFilesChange,
    onOpenAttachedFile,
    onOpenFileSelector,
    onAttachmentsChange,
    onPasteFiles,
    onProviderModeSelect,
    effortLabel,
    effortValue,
    fastMode,
    onFastModeChange,
    thinkingMode,
    onThinkingModeChange,
    pendingUserInput,
    onUserInputSubmit,
    onUserInputDeny,
    modelPickerAgents,
    assignOnSend,
    secretsControl,
    secretsActive,
    macroControl,
    macroQuickPicks,
    compareControl,
    composerControlPlacements,
    onComposerControlPlacementsChange,
    workspaceCwd,
    reviewModelOptions,
    preferredReviewModelKey,
    onLocalChangeReview,
    onSubmit,
    onStagePromptBatch,
    onRemovePromptBatchItem,
    onAbort,
  } = args;
  const isMobile = useIsMobile();
  const useComposerFrame = Boolean(framed && !minimal);
  const useComposerWings = useComposerFrame && !isMobile;
  /**
   * ADS `size` for an icon-only composer control, picked to land on the same
   * rung of the control ramp as the lane it will stand in: `md` (36) in the
   * classic in-card toolbar, `sm` (32) on the framed bottom shelf, in a wing,
   * and in either overflow menu. Passing the size (rather than overriding the
   * rendered box with a literal) keeps `controlSquares` — the one square-height
   * map — in charge of both axes.
   */
  const composerIconButtonSize = useComposerWings ? "icon-sm" : "icon";
  const promptEnhancementReveal = usePromptEnhancementReveal({
    active: promptEnhancementRevealing,
    revealVersion: promptEnhancementRevealVersion,
    sourceText: promptEnhancementSourceText,
    value,
    onComplete: onPromptEnhancementRevealComplete,
  });
  const { clipboardReadQueue, handlePaste } = usePromptInputClipboardPaste({
    attachmentScopeId: args.attachmentScopeId,
    workspaceCwd: args.workspaceCwd,
    onAttachmentsChange,
    onPasteFiles,
  });

  const {
    imageAttachments,
    standaloneImageAttachments,
    imageAttachmentsById,
    lensAnnotationAttachments,
    workspaceInformationAttachments,
    taskContextAttachments,
    documentContextAttachments,
    referenceAttachments,
    currentAttachmentCount,
    commentItemCount,
  } = usePromptInputAttachmentGroups({
    attachments,
    attachedFilePaths,
    promptBatch,
  });
  const [taskDropActive, setTaskDropActive] = useState(false);
  const [imagePreviewSrc, setImagePreviewSrc] = useState<{
    dataUrl: string;
    label: string;
  } | null>(null);
  const promptEditorRef = useRef<PromptLexicalEditorHandle | null>(null);
  usePromptEnhancementScrollReset({
    editorRef: promptEditorRef,
    revealing: promptEnhancementRevealing,
  });
  const valueRef = useRef(value);
  const [editorSyncNonce, setEditorSyncNonce] = useState(0);
  valueRef.current = value;
  const modelVisibility = useAppStore(
    (state) => state.settings.modelVisibility,
  );
  const interactionsDisabled = Boolean(disabled);
  const promptEnhancementBusy =
    promptEnhancementPending || promptEnhancementRevealing;
  const promptEnhancementState = promptEnhancementPending
    ? "enhancing"
    : promptEnhancementRevealing
      ? "applying"
      : "idle";
  const promptEnhancementLabel = promptEnhancementPending
    ? i18n.t("composer:promptInput.promptEnhancementLabel")
    : promptEnhancementRevealing
      ? i18n.t("composer:promptInput.promptEnhancementLabel2")
      : i18n.t("composer:promptInput.promptEnhancementLabel3");
  const hasDraftPayload =
    value.trim().length > 0 ||
    attachedFilePaths.length > 0 ||
    imageAttachments.length > 0 ||
    lensAnnotationAttachments.length > 0 ||
    referenceAttachments.length > 0 ||
    promptBatch.length > 0;
  const primaryActionDisabled = Boolean(disabled || !hasDraftPayload);
  const isQueueNextMode = submitMode === "queue-next";
  const isSteerOrQueueMode = submitMode === "steer-or-queue";
  const modifierLabel = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
        ? "Cmd"
        : "Ctrl",
    [],
  );
  const hasRuntimeContent = Boolean((runtimeStatusItems?.length ?? 0) > 0);
  const runtimeProfile = useMemo(
    () => getPromptInputRuntimeProfile(runtimeStatusItems ?? []),
    [runtimeStatusItems, i18n.language],
  );
  const [composerTrayOpen, setComposerTrayOpen] = useState(false);
  const [composerCustomizeOpen, setComposerCustomizeOpen] = useState(false);
  const shouldShowPromptEnhancement =
    !minimal &&
    Boolean(onEnhancePrompt) &&
    (promptEnhancementBusy || value.trim().length > 0);

  // Effects run in the order these hooks are called. Each hook keeps its
  // effects in the order the component declared them: focus, then window
  // shortcuts, then prompt history, then the palettes.
  const {
    caretIndex,
    promptEditorSelectionRange,
    isPromptInputFocused,
    focusComposer,
    syncComposerFocus,
    syncCaretPosition,
    restoreComposerSelection,
    getLiveCaretIndex,
  } = usePromptInputCaret({
    value,
    promptEditorRef,
    promptEnhancementRevealing,
    focusToken,
    interactionsDisabled,
    isTurnActive,
  });

  const {
    modelSelectorOpenNonce,
    modelSelectorOpenRequest,
    agentsOpenToken,
    shortcutEchoGuardRef,
    handleModelShortcut,
  } = usePromptInputWindowShortcuts({
    interactionsDisabled,
    windowShortcutsEnabled,
    modelOptions,
    modelShortcutKeys,
    modelShortcutEfforts,
    onModelSelect,
    focusComposer,
    valueRef,
    promptEditorRef,
  });

  const {
    setSelectedPromptHistoryIndex,
    setDraftBeforeHistory,
    applyPromptHistoryNavigation,
  } = usePromptInputHistory({
    promptHistoryEntries,
    focusToken,
    value,
    valueRef,
    promptEditorRef,
    onValueChange,
    restoreComposerSelection,
  });

  const palette = usePromptInputPaletteState({
    value,
    caretIndex,
    selectedModel,
    commandPaletteItems,
    commandPaletteProviderNote,
    skillsEnabled,
    skillsAutoSuggest,
    skillPaletteItems,
    macros,
    workspaceInformationReferenceOptions,
    taskMentionOptions,
    documentMentionOptions,
  });
  const {
    commandListRef,
    setDismissedCommandToken,
    setSelectedCommandIndex,
    setDismissedSkillToken,
    setSelectedSkillIndex,
    setDismissedMacroToken,
    setSelectedMacroIndex,
    setDismissedWorkspaceInformationToken,
    selectedWorkspaceInformationIndex,
    setSelectedWorkspaceInformationIndex,
    activeCommandToken,
    activeSkillToken,
    activeMacroToken,
    activeWorkspaceInformationToken,
    filteredCommandItems,
    filteredSkillItems,
    paletteMacros,
    filteredMacroItems,
    filteredWorkspaceInformationItems,
    indexedMacroItems,
    providerCommandItems,
    localSkillItems,
    userSkillItems,
    globalSkillItems,
    workspaceInformationSectionItems,
    taskMentionItems,
    documentMentionItems,
    workspaceInformationEntryItems,
    activePalette,
    paletteValue,
  } = palette;
  const paletteSelection = usePromptInputPaletteSelection({
    palette,
    valueRef,
    onValueChange,
    onMacroSelect,
    onAttachTask,
    onAttachDocument,
    getLiveCaretIndex,
    restoreComposerSelection,
  });
  const {
    rememberActivePaletteTokenSelection,
    applyCommandSelection,
    applySkillSelection,
    applyMacroSelection,
    applyMentionSelection,
    applyWorkspaceInformationSelection,
  } = paletteSelection;

  const {
    applyLensAnnotationFeedback,
    removeLensAnnotation,
    applyLensAnnotationStyle,
  } = usePromptInputLensAnnotationActions({
    attachments,
    onAttachmentsChange,
  });

  async function submitCurrentMessage(intent?: "steer" | "queue") {
    if (clipboardReadQueue.isPending()) {
      toast.info(
        i18n.t("composer:promptInput.submitCurrentMessage"),
      );
      return;
    }
    const nextText = value.trim();
    if (
      !hasPromptSubmitPayload({
        text: nextText,
        attachedFilePaths,
        imageAttachments,
        lensAnnotationAttachments,
        workspaceInformationAttachments: referenceAttachments,
        promptBatch,
      })
    ) {
      return;
    }
    await onSubmit({ text: nextText, filePaths: attachedFilePaths, intent });
    setSelectedPromptHistoryIndex(NO_PROMPT_HISTORY_SELECTION);
    setDraftBeforeHistory("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The submit button mirrors Enter's configured action; the secondary
    // in-composer action mirrors Tab.
    await submitCurrentMessage(
      isSteerOrQueueMode ? steerQueueEnterAction : undefined,
    );
  }

  function renderSkillScopeIcon(scope: SkillCatalogEntry["scope"]) {
    if (scope === "local") {
      return <FolderOpen className={sx(promptInputStyles.scopeIcon)} />;
    }
    if (scope === "user") {
      return <UserRound className={sx(promptInputStyles.scopeIcon)} />;
    }
    return <Globe2 className={sx(promptInputStyles.scopeIcon)} />;
  }

  if (pendingUserInput && onUserInputSubmit && onUserInputDeny) {
    return (
      <div
        className={cx("prompt-input-shell", sx(promptInputStyles.pendingShell))}
        data-testid="user-input-composer"
        data-turn-active={isTurnActive ? "true" : undefined}
        data-pending-interaction="true"
        data-pending-interaction-request-id={pendingUserInput.part.requestId}
        tabIndex={-1}
      >
        <UserInputCard
          toolName={pendingUserInput.part.toolName}
          questions={pendingUserInput.part.questions}
          state={pendingUserInput.part.state}
          presentation="composer"
          onSubmit={(answers) =>
            onUserInputSubmit({
              messageId: pendingUserInput.messageId,
              answers,
            })
          }
          onDeny={() =>
            onUserInputDeny({ messageId: pendingUserInput.messageId })
          }
        />
      </div>
    );
  }

  // A review that runs as its own task can start while this one is busy.
  const hasReviewControl = Boolean(
    reviewModelOptions?.length &&
      onLocalChangeReview &&
      (!isTurnActive || isReviewTaskDelegationAvailable()),
  );

  // A control with nothing to render this frame is excluded from every bucket,
  // so the tray never offers a row that would come up blank.
  const unavailableComposerControls: ComposerControlId[] = [];
  if (!providerModeStatus) unavailableComposerControls.push("providerMode");
  if (!onThinkingModeChange) unavailableComposerControls.push("thinking");
  if (!runAccountPool) unavailableComposerControls.push("runAccountPool");
  if (!hasReviewControl) unavailableComposerControls.push("review");
  if (!secretsControl) unavailableComposerControls.push("secrets");
  if (!macroControl) unavailableComposerControls.push("macro");
  if (!compareControl) unavailableComposerControls.push("compare");
  if (!hasRuntimeContent) unavailableComposerControls.push("runtime");

  const composerControlLayout = resolveComposerControlLayout({
    placements: composerControlPlacements ?? {},
    activeIds: collectActiveComposerControls({
      thinkingMode,
      fastMode,
      runAccountPoolEnabled: runAccountPool?.enabled,
      runtimeTone: runtimeProfile.tone,
      boundSecretCount: secretsActive ? 1 : 0,
    }),
    unavailableIds: unavailableComposerControls,
  });

  const composerControlNodes: Partial<Record<ComposerControlId, ReactNode>> = {
    runAccountPool: runAccountPool ? <PromptInputRunAccountPoolControl pool={runAccountPool} /> : null,
    providerMode: providerModeStatus ? (
      <PromptInputProviderModePill
        status={providerModeStatus}
        presets={providerModePresets ?? []}
        activePresetId={activeProviderModePresetId ?? null}
        onSelect={onProviderModeSelect}
        disabled={interactionsDisabled}
      />
    ) : null,
    thinking: onThinkingModeChange ? (
      <Tooltip>
        <TooltipTrigger
          type="button"
          disabled={interactionsDisabled}
          aria-label={i18n.t("composer:promptInput.ariaLabel7", { value1: thinkingMode ?? "adaptive" })}
          onClick={() => {
            const cycle = {
              adaptive: "enabled",
              enabled: "disabled",
              disabled: "adaptive",
            } as const;
            onThinkingModeChange(cycle[thinkingMode ?? "adaptive"]);
          }}
          {...composerControlAttributes}
          className={tooltipTriggerButtonClassName({
            className: cx(
              COMPOSER_CONTROL_BUTTON,
              sx(
                thinkingMode === "enabled"
                  ? getPromptToolbarAccentStyle("thinking")
                  : thinkingMode === "disabled"
                    ? promptInputStyles.toneMutedHalf
                    : undefined,
                interactionsDisabled && promptInputStyles.cursorDisabled,
              ),
            ),
          })}
        >
          <Brain
            className={sx(
              promptInputStyles.icon4,
              thinkingMode === "adaptive" && promptInputStyles.iconThinking,
            )}
          />
          <ComposerControlLabel>
            <span>{i18n.t("composer:promptInput.thinking")}</span>
          </ComposerControlLabel>
        </TooltipTrigger>
        <TooltipContent side="top">{i18n.t("composer:promptInput.thinking2", { value1: thinkingMode ?? "adaptive" })}</TooltipContent>
      </Tooltip>
    ) : null,
    review: hasReviewControl ? (
      <LocalChangeReviewDialog
        workspaceCwd={workspaceCwd}
        reviewerOptions={reviewModelOptions ?? []}
        preferredReviewerKey={preferredReviewModelKey}
        disabled={interactionsDisabled}
        onSubmit={onLocalChangeReview!}
      />
    ) : null,
    secrets: secretsControl,
    macro: macroControl,
    compare: compareControl,
    runtime: hasRuntimeContent ? (
      isMobile ? (
        <Drawer swipeDirection="down" showSwipeHandle>
          <DrawerTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size={composerIconButtonSize}
                disabled={interactionsDisabled}
                {...composerControlAttributes}
                className={PROMPT_TOOLBAR_ICON_BUTTON}
                aria-label={i18n.t("composer:promptInput.ariaLabel8", { value1: runtimeProfile.label })}
                title={i18n.t("composer:promptInput.title")}
              />
            }
          >
            <PromptInputRuntimeTriggerIcon profile={runtimeProfile} />
            <ComposerControlLabel wingOnly>{i18n.t("composer:promptInput.runtime")}</ComposerControlLabel>
          </DrawerTrigger>
          <DrawerContent className={sx(promptInputStyles.drawerContent)}>
            <DrawerHeader className={sx(promptInputStyles.drawerHeader)}>
              <div className={sx(promptInputStyles.rowBaseline)}>
                <DrawerTitle className={sx(promptInputStyles.titleBase)}>
                  {i18n.t("composer:promptInput.runtime2")}</DrawerTitle>
                <span
                  className={sx(
                    promptInputStyles.toneLabel,
                    getRuntimeProfileToneStyle(runtimeProfile.tone),
                  )}
                >
                  {runtimeProfile.label}
                </span>
              </div>
              <DrawerDescription>{i18n.t("composer:promptInput.sentence30", { value1: runtimeProfile.description })}</DrawerDescription>
            </DrawerHeader>
            <div className={sx(promptInputStyles.drawerScroll)}>
              <PromptInputRuntimeBar statusItems={runtimeStatusItems} />
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size={composerIconButtonSize}
                disabled={interactionsDisabled}
                {...composerControlAttributes}
                className={PROMPT_TOOLBAR_ICON_BUTTON}
                aria-label={i18n.t("composer:promptInput.ariaLabel9", { value1: runtimeProfile.label })}
                title={i18n.t("composer:promptInput.title2")}
              />
            }
          >
            <PromptInputRuntimeTriggerIcon profile={runtimeProfile} />
            <ComposerControlLabel wingOnly>{i18n.t("composer:promptInput.runtime4")}</ComposerControlLabel>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={10}
            // The panel is edge to edge by request, not by fighting the
            // surface's padding from the outside: the header and every runtime
            // section draw their own `space16` gutter and their rules run to
            // the border. `xstyle`, not `className`, because only `xstyle`
            // merges into the popover's own `stylex.props` call.
            density="flush"
            xstyle={promptInputStyles.runtimePopover}
          >
            <div className={sx(promptInputStyles.runtimePopoverHeader)}>
              <div className={sx(promptInputStyles.rowBaseline)}>
                <PopoverTitle className={sx(promptInputStyles.titleBase)}>
                  {i18n.t("composer:promptInput.runtime5")}</PopoverTitle>
                <span
                  className={sx(
                    promptInputStyles.toneLabel,
                    getRuntimeProfileToneStyle(runtimeProfile.tone),
                  )}
                >
                  {runtimeProfile.label}
                </span>
              </div>
              <PopoverDescription className={sx(promptInputStyles.mt1)}>{i18n.t("composer:promptInput.sentence31", { value1: runtimeProfile.description })}</PopoverDescription>
            </div>
            <PromptInputRuntimeBar statusItems={runtimeStatusItems} />
          </PopoverContent>
        </Popover>
      )
    ) : null,
  };

  const canCustomizeComposerControls = Boolean(
    onComposerControlPlacementsChange,
  );
  const composerFrameWings = partitionComposerFrameToolbar(
    composerControlLayout.toolbar,
  );
  const showMacroQuickPicks = useComposerWings && Boolean(macroQuickPicks);
  /*
   * A placement list is the *layout*, not the contents: `composerControlNodes`
   * renders `null` for every control this session cannot offer (no plan
   * callback, no provider mode, ...). Filtering on the ids alone therefore
   * mounted a wing whose children were all `null`, and a wing is a bordered,
   * shadowed surface in its own right — so the composer grew an empty column
   * beside it. Hide the container, not just the controls.
   */
  const leftWingControlIds = composerFrameWings.left.filter((id) =>
    Boolean(composerControlNodes[id]),
  );
  const rightWingControlIds = composerFrameWings.right.filter((id) =>
    Boolean(composerControlNodes[id]),
  );
  const leftWing =
    useComposerWings &&
    (showMacroQuickPicks || leftWingControlIds.length > 0) ? (
      <ComposerFrameWing side="left">
        {showMacroQuickPicks ? macroQuickPicks : null}
        {leftWingControlIds.map((id) => (
          <Fragment key={id}>{composerControlNodes[id]}</Fragment>
        ))}
      </ComposerFrameWing>
    ) : null;
  const rightWing =
    useComposerWings && rightWingControlIds.length > 0 ? (
      <ComposerFrameWing side="right">
        {rightWingControlIds.map((id) => (
          <Fragment key={id}>{composerControlNodes[id]}</Fragment>
        ))}
      </ComposerFrameWing>
    ) : null;
  // The bottom shelf is ambient session state, so it carries the readouts that
  // are checked rather than operated. It is drawn whenever the frame supplies
  // either half — a workspace line, a runtime readout, or both.
  const statusBarControlIds = useComposerWings ? composerFrameWings.status : [];
  // Stave's own tooling rides here rather than a wing: the wings are the
  // provider's surface (plan, permission, thinking), and these are ours.
  const statusTrayItems = statusBarControlIds
    .filter((id) => Boolean(composerControlNodes[id]))
    .map((id) => ({
      id,
      label: COMPOSER_CONTROL_LABELS[id],
      node: composerControlNodes[id],
      iconOnly: composerControlIsIconOnly(id),
    }));
  // Classic composer: the controls share the model row, and the tray takes the
  // same slot it has on the framed shelf — in front of Runtime, which stays
  // last — so the `⋯` is in one place no matter which layout is in effect.
  const toolbarControlIds = useComposerWings
    ? []
    : composerControlLayout.toolbar;
  const toolbarRuntimeIndex = toolbarControlIds.indexOf("runtime");
  const toolbarTrayIndex =
    toolbarRuntimeIndex === -1 ? toolbarControlIds.length : toolbarRuntimeIndex;
  // Demoted controls live behind one `⋯`. It is rendered by whichever row owns
  // the composer's controls this frame — the in-card toolbar when the composer
  // is classic, the bottom shelf beside Runtime when it is framed — so the
  // model row never becomes the place users hunt for a control.
  const overflowMenuItems = composerControlLayout.overflow
    .filter((id) => Boolean(composerControlNodes[id]))
    .map((id) => ({
      id,
      label: COMPOSER_CONTROL_LABELS[id],
      node: composerControlNodes[id],
      iconOnly: composerControlIsIconOnly(id),
    }));
  const composerCustomizeMenuFooter = canCustomizeComposerControls ? (
    <>
      <div className={sx(promptInputStyles.menuSeparator)} />
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className={sx(promptInputStyles.customizeButton)}
        onClick={() => {
          setComposerTrayOpen(false);
          setComposerCustomizeOpen(true);
        }}
      >
        <SlidersHorizontal className={sx(promptInputStyles.icon3)} />
        {i18n.t("composer:promptInput.composerCustomizeMenuFooter")}</Button>
    </>
  ) : null;
  const composerOverflowTray =
    overflowMenuItems.length > 0 ? (
      <Popover open={composerTrayOpen} onOpenChange={setComposerTrayOpen}>
        <AdsTooltip content={i18n.t("composer:promptInput.title3")}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                // Sized for the row it stands in rather than by a lane rule:
                // an ADS icon size owns both axes, and a glyph-only button has
                // to stay square in each of them.
                size={composerIconButtonSize}
                disabled={interactionsDisabled}
                className={PROMPT_TOOLBAR_ICON_BUTTON}
                aria-label={i18n.t("composer:promptInput.ariaLabel10", { value1: overflowMenuItems.length })}
                data-composer-tray-trigger="true"
              />
            }
          >
            <Ellipsis className={sx(promptInputStyles.icon4)} />
          </PopoverTrigger>
        </AdsTooltip>
        <PopoverContent
          align={useComposerWings ? "end" : "start"}
          side="top"
          sideOffset={10}
          // The tray hosts controls that open dialogs (Review,
          // Compare, ...). Base UI portals those dialogs into this popover's
          // portal node, so a tray on the popover band (`z-[90]`) would paint
          // over the dialog band (`z-[80]`) it just opened. Composer-anchored
          // chrome is the honest band for it anyway.
          layer="floatingChrome"
          xstyle={COMPOSER_CONTROL_MENU_CONTENT}
        >
          <ComposerControlMenuList items={overflowMenuItems} />
          {composerCustomizeMenuFooter}
        </PopoverContent>
      </Popover>
    ) : null;

  const frameStatusBar =
    useComposerFrame && (frameBottom || statusTrayItems.length > 0) ? (
      <ComposerFrameStatusBar
        trailing={
          statusTrayItems.length > 0 ? (
            <ComposerStatusTray
              items={statusTrayItems}
              overflowItems={overflowMenuItems}
              overflowTray={composerOverflowTray}
              overflowFooter={composerCustomizeMenuFooter}
              disabled={interactionsDisabled}
            />
          ) : null
        }
      >
        {frameBottom}
      </ComposerFrameStatusBar>
    ) : null;

  const composerCard = (
    <>
      {/*
        The shell wrapper owns the focus ring and the turn-active styling so
        the inner form keeps its own border radius.
      */}
      <div
        data-turn-active={!minimal && isTurnActive ? "true" : undefined}
        className={cx(
          // `relative z-10` is load-bearing: the turn activity shelf overlaps
          // the composer from above with a negative bottom margin, and this
          // keeps the composer painting on top of that tucked-under edge.
          !minimal && "prompt-input-shell",
          !minimal ? sx(promptInputStyles.composerShell) : undefined,
        )}
      >
        <form
          data-prompt-input-root
          data-task-drop={taskDropActive ? "" : undefined}
          onSubmit={handleSubmit}
          onDragOverCapture={(event) => {
            if (!onAttachTask || !event.dataTransfer.types.includes(TASK_DRAG_MIME)) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setTaskDropActive(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setTaskDropActive(false);
            }
          }}
          onDropCapture={(event) => {
            const task = onAttachTask ? readDroppedTask(event.dataTransfer) : null;
            setTaskDropActive(false);
            if (!task) {
              return;
            }
            // The editor would otherwise insert the payload as text.
            event.preventDefault();
            event.stopPropagation();
            onAttachTask?.(task);
          }}
          onFocusCapture={syncComposerFocus}
          onBlurCapture={() => {
            window.requestAnimationFrame(syncComposerFocus);
          }}
          className={sx(
            promptInputStyles.formBase,
            minimal ? promptInputStyles.formMinimal : promptInputStyles.formDefault,
            taskDropActive && promptInputStyles.formTaskDrop,
          )}
        >
          {goalStatus ? (
            <PromptInputGoalStatusStrip status={goalStatus} compact={minimal} />
          ) : null}
          {!minimal && promptSuggestions && promptSuggestions.length > 0 ? (
            <Suggestions aria-label={i18n.t("composer:promptInput.ariaLabel11")} className={sx(promptInputStyles.suggestions)}>
              {promptSuggestions.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  suggestion={suggestion}
                  onClick={onSuggestionSelect}
                  title={suggestion}
                  variant="ghost"
                  className={sx(promptInputStyles.suggestionChip)}
                />
              ))}
            </Suggestions>
          ) : null}
          <Popover
            open={activePalette !== null}
            modal={false}
            onOpenChange={(nextOpen, eventDetails) => {
              if (nextOpen) {
                return;
              }
              if (eventDetails.reason === "focus-out") {
                eventDetails.cancel();
                return;
              }
              if (eventDetails.reason !== "outside-press") {
                return;
              }
              if (activePalette === "info") {
                setDismissedWorkspaceInformationToken(
                  activeWorkspaceInformationToken?.token ?? null,
                );
                return;
              }
              if (activePalette === "skill") {
                setDismissedSkillToken(activeSkillToken?.token ?? null);
                return;
              }
              if (activePalette === "macro") {
                setDismissedMacroToken(activeMacroToken?.token ?? null);
                return;
              }
              setDismissedCommandToken(activeCommandToken?.token ?? null);
            }}
          >
            <PopoverAnchor
              render={
                <div
                  className={sx(
                    minimal ? promptInputStyles.stackMd : promptInputStyles.stackSm,
                  )}
                />
              }
            >
              <div
                className={
                  minimal ? sx(promptInputStyles.minimalBox) : undefined
                }
              >
                <div
                  className={sx(
                    minimal ? promptInputStyles.minimalRow : promptInputStyles.stackSm,
                  )}
                >
                  {minimal ? (
                    <span className={sx(promptInputStyles.promptCaretGlyph)}>
                      {i18n.t("composer:promptInput.composerCard")}</span>
                  ) : null}
                  <div
                    className={sx(promptInputStyles.editorArea)}
                    data-prompt-enhancement-surface={promptEnhancementState}
                  >
                    {shouldShowPromptEnhancement ? (
                      <div
                        data-prompt-enhancement-state={promptEnhancementState}
                        className={cx(
                          sx(promptInputStyles.enhanceOverlay),
                          UI_LAYER_CLASS.floatingChrome,
                          promptEnhancementBusy
                            ? sx(
                                minimal
                                  ? promptInputStyles.enhanceGradientMinimal
                                  : promptInputStyles.enhanceGradientDefault,
                              )
                            : undefined,
                        )}
                      >
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size={promptEnhancementBusy ? "sm" : "icon-sm"}
                                disabled={
                                  interactionsDisabled || promptEnhancementBusy
                                }
                                aria-label={promptEnhancementLabel}
                                aria-busy={promptEnhancementBusy}
                                onClick={() => void onEnhancePrompt?.()}
                                className={cx(
                                  PROMPT_TOOLBAR_ICON_BUTTON,
                                  sx(
                                    promptInputStyles.enhanceButtonBase,
                                    promptEnhancementBusy
                                      ? minimal
                                        ? promptInputStyles.enhanceBusyMinimal
                                        : promptInputStyles.enhanceBusyDefault
                                      : promptInputStyles.enhanceIdle,
                                  ),
                                )}
                              />
                            }
                          >
                            {promptEnhancementPending ? (
                              <Loader
                                aria-hidden
                                className={sx(promptInputStyles.loaderPrimary)}
                                size="xs"
                                variant="orbit"
                              />
                            ) : (
                              <WandSparkles
                                aria-hidden="true"
                                className={sx(
                                  promptInputStyles.icon35Shrink,
                                  promptEnhancementRevealing &&
                                    promptInputStyles.pulseAnimation,
                                )}
                              />
                            )}
                            {promptEnhancementBusy ? (
                              <span aria-hidden="true">
                                {promptEnhancementPending
                                  ? i18n.t("composer:promptInput.composerCard2")
                                  : i18n.t("composer:promptInput.composerCard3")}
                              </span>
                            ) : null}
                          </TooltipTrigger>
                          <TooltipContent side="top" className={sx(promptInputStyles.maxW64)}>
                            {promptEnhancementBusy
                              ? promptEnhancementLabel
                              : i18n.t("composer:promptInput.composerCard4")}
                          </TooltipContent>
                        </Tooltip>
                        {promptEnhancementBusy ? (
                          <span
                            className={sx(promptInputStyles.srOnly)}
                            role="status"
                            aria-live="polite"
                          >
                            {promptEnhancementPending
                              ? i18n.t("composer:promptInput.composerCard5")
                              : i18n.t("composer:promptInput.composerCard6")}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <PromptLexicalEditor
                      ref={promptEditorRef}
                      value={value}
                      selectionRange={promptEditorSelectionRange}
                      disabled={interactionsDisabled || promptEnhancementBusy}
                      minimal={minimal}
                      commandPaletteItems={commandPaletteItems}
                      skillPaletteItems={skillPaletteItems}
                      workspaceInformationReferenceOptions={
                        workspaceInformationReferenceOptions
                      }
                      syncNonce={editorSyncNonce}
                      onChange={(nextValue) => {
                        const guard = shortcutEchoGuardRef.current;
                        if (guard) {
                          shortcutEchoGuardRef.current = null;
                          if (
                            Date.now() <= guard.expiresAt &&
                            isShortcutEchoInsertion({
                              previous: guard.value,
                              next: nextValue,
                            })
                          ) {
                            // Drop the echo and roll the editor back to `value`.
                            setEditorSyncNonce((current) => current + 1);
                            return;
                          }
                        }
                        onValueChange(nextValue);
                      }}
                      onSelectionChange={syncCaretPosition}
                      onFocus={() => {
                        syncCaretPosition(
                          promptEditorRef.current?.getSelectionRange(),
                        );
                        onFocus?.();
                      }}
                      onBlur={() => onBlur?.()}
                      onPaste={handlePaste}
                      onKeyDown={(event) =>
                        handlePromptEditorKeyDown(event, {
                          palette,
                          selection: paletteSelection,
                          handleModelShortcut,
                          applyPromptHistoryNavigation,
                          submitCurrentMessage,
                          isTurnActive,
                          isSteerOrQueueMode,
                          steerQueueEnterAction,
                          promptCommentShortcut,
                          onAbort,
                          onStagePromptBatch,
                        })
                      }
                      placeholder={
                        minimal && isPromptInputFocused
                          ? ""
                          : minimal
                            ? isSteerOrQueueMode
                              ? formatSteerQueueEnterActionLabel(
                                  steerQueueEnterAction,
                                )
                              : isQueueNextMode
                                ? i18n.t("composer:promptInput.placeholder")
                                : i18n.t("composer:promptInput.placeholder2")
                            : isSteerOrQueueMode
                              ? formatSteerQueueEnterActionLabel(
                                  steerQueueEnterAction,
                                )
                              : isQueueNextMode
                                ? i18n.t("composer:promptInput.placeholder3")
                                : i18n.t("composer:promptInput.placeholder4")
                      }
                      className={sx(
                        // Height and overflow belong to these classes alone.
                        // The editor is a `contenteditable` div, not a
                        // `<textarea>`, so it grows with its content natively.
                        promptInputStyles.editorReset,
                        minimal
                          ? promptInputStyles.editorSizeMinimal
                          : promptInputStyles.editorSizeDefault,
                        minimal
                          ? PROMPT_EDITOR_TYPOGRAPHY_MINIMAL
                          : PROMPT_EDITOR_TYPOGRAPHY_DEFAULT,
                        shouldShowPromptEnhancement &&
                          PROMPT_ENHANCEMENT_EDITOR_INSET,
                        // The editable is held non-editable for the whole
                        // enhancement, so it has to *look* non-editable too.
                        promptEnhancementPending && promptInputStyles.editorProgress,
                        promptEnhancementPending && promptInputStyles.pulseAnimation,
                        promptEnhancementRevealing &&
                          promptInputStyles.editorRevealing,
                        // The reveal overlay stands in for the editor while the
                        // diff animates, so the editor itself has to get out of
                        // the way.
                        promptEnhancementReveal !== null &&
                          promptInputStyles.editorHidden,
                      )}
                    />
                    {promptEnhancementReveal ? (
                      <PromptEnhancementRevealOverlay
                        segments={promptEnhancementReveal.segments}
                        stepMs={promptEnhancementReveal.stepMs}
                        className={sx(
                          minimal
                            ? PROMPT_EDITOR_TYPOGRAPHY_MINIMAL
                            : PROMPT_EDITOR_TYPOGRAPHY_DEFAULT,
                          shouldShowPromptEnhancement &&
                            PROMPT_ENHANCEMENT_EDITOR_INSET,
                        )}
                      />
                    ) : null}
                    {minimal && isPromptInputFocused && value.length === 0 ? (
                      <span
                        aria-hidden="true"
                        className={sx(promptInputStyles.terminalCaret)}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </PopoverAnchor>
            <PopoverContent
              align="start"
              side="top"
              sideOffset={8}
              initialFocus={false}
              xstyle={promptInputStyles.commandPopover}
            >
              <Command
                shouldFilter={false}
                value={paletteValue}
                onValueChange={() => {}}
                className={sx(promptInputStyles.commandRoot)}
              >
                <CommandList
                  ref={commandListRef}
                  className={sx(promptInputStyles.commandList)}
                >
                  {activePalette === "info" &&
                  filteredWorkspaceInformationItems.length === 0 ? (
                    <CommandEmpty>
                      {taskMentionOptions && taskMentionOptions.length > 0
                        ? i18n.t("composer:promptInput.composerCard7")
                        : i18n.t("composer:promptInput.composerCard8")}
                    </CommandEmpty>
                  ) : activePalette === "skill" &&
                    filteredSkillItems.length === 0 ? (
                    <CommandEmpty>{i18n.t("composer:promptInput.composerCard9")}</CommandEmpty>
                  ) : activePalette === "macro" &&
                    filteredMacroItems.length === 0 ? (
                    <CommandEmpty>
                      {paletteMacros.length > 0
                        ? i18n.t("composer:promptInput.composerCard10")
                        : i18n.t("composer:promptInput.composerCard11")}
                    </CommandEmpty>
                  ) : activePalette === "command" &&
                    filteredCommandItems.length === 0 ? (
                    <CommandEmpty>{i18n.t("composer:promptInput.composerCard12")}</CommandEmpty>
                  ) : (
                    <>
                      {activePalette === "info" &&
                      workspaceInformationSectionItems.length > 0 ? (
                        <CommandGroup heading={i18n.t("composer:promptInput.heading")}>
                          {workspaceInformationSectionItems.map(
                            ({ item, index }) => (
                              <CommandItem
                                key={item.reference.token}
                                value={item.reference.token}
                                className={sx(promptInputStyles.itemStandard)}
                                data-palette-index={index}
                                onMouseEnter={() =>
                                  setSelectedWorkspaceInformationIndex(index)
                                }
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  rememberActivePaletteTokenSelection();
                                }}
                                onSelect={() =>
                                  applyWorkspaceInformationSelection(item)
                                }
                              >
                                <div className={sx(promptInputStyles.iconWrapPrimary)}>
                                  <Info className={sx(promptInputStyles.icon4)} />
                                </div>
                                <div className={sx(promptInputStyles.flex1Min)}>
                                  <div className={sx(promptInputStyles.rowCenter)}>
                                    <span className={sx(promptInputStyles.fontMedium)}>
                                      {item.title}
                                    </span>
                                    <Badge
                                      variant="secondary"
                                      className={sx(promptInputStyles.badgeUpper)}
                                    >
                                      {i18n.t("composer:promptInput.copy5")}</Badge>
                                  </div>
                                  <p className={sx(promptInputStyles.itemDesc)}>
                                    {item.description}
                                  </p>
                                </div>
                              </CommandItem>
                            ),
                          )}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "info" &&
                      taskMentionItems.length > 0 ? (
                        <CommandGroup heading={i18n.t("composer:promptInput.heading2")}>
                          {taskMentionItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.taskId}
                              value={`@task:${item.taskId}`}
                              className={sx(promptInputStyles.itemStandard)}
                              data-palette-index={index}
                              onMouseEnter={() =>
                                setSelectedWorkspaceInformationIndex(index)
                              }
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberActivePaletteTokenSelection();
                              }}
                              onSelect={() =>
                                applyMentionSelection({
                                  kind: "task",
                                  key: `@task:${item.taskId}`,
                                  option: item,
                                })
                              }
                            >
                              <div className={sx(promptInputStyles.iconWrapPrimary)}>
                                <MessagesSquare className={sx(promptInputStyles.icon4)} />
                              </div>
                              <div className={sx(promptInputStyles.flex1Min)}>
                                <div className={sx(promptInputStyles.rowCenter)}>
                                  <span className={sx(promptInputStyles.fontMedium)}>
                                    {item.title}
                                  </span>
                                </div>
                                <p className={sx(promptInputStyles.itemDesc)}>
                                  {i18n.t("composer:promptInput.copy6")}</p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "info" &&
                      documentMentionItems.length > 0 ? (
                        <CommandGroup heading={i18n.t("composer:promptInput.documentsHeading")}>
                          {documentMentionItems.map(({ item, index }) => (
                            <CommandItem
                              key={documentMentionKey(item)}
                              value={documentMentionKey(item)}
                              className={sx(promptInputStyles.itemStandard)}
                              data-palette-index={index}
                              onMouseEnter={() =>
                                setSelectedWorkspaceInformationIndex(index)
                              }
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberActivePaletteTokenSelection();
                              }}
                              onSelect={() =>
                                applyMentionSelection({
                                  kind: "document",
                                  key: documentMentionKey(item),
                                  option: item,
                                })
                              }
                            >
                              <div className={sx(promptInputStyles.iconWrapPrimary)}>
                                <FileText className={sx(promptInputStyles.icon4)} />
                              </div>
                              <div className={sx(promptInputStyles.flex1Min)}>
                                <div className={sx(promptInputStyles.rowCenter)}>
                                  <span className={sx(promptInputStyles.fontMedium)}>
                                    {item.title}
                                  </span>
                                </div>
                                <p className={sx(promptInputStyles.itemDesc)}>
                                  {item.workspaceDeleted
                                    ? i18n.t("composer:promptInput.documentFromDeletedWorkspace", { workspace: item.workspaceName })
                                    : i18n.t("composer:promptInput.documentFromWorkspace", { workspace: item.workspaceName })}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "info" &&
                      workspaceInformationEntryItems.length > 0 ? (
                        <CommandGroup heading={i18n.t("composer:promptInput.heading3")}>
                          {workspaceInformationEntryItems.map(
                            ({ item, index }) => (
                              <CommandItem
                                key={item.reference.token}
                                value={item.reference.token}
                                className={sx(promptInputStyles.itemStandard)}
                                data-palette-index={index}
                                onMouseEnter={() =>
                                  setSelectedWorkspaceInformationIndex(index)
                                }
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  rememberActivePaletteTokenSelection();
                                }}
                                onSelect={() =>
                                  applyWorkspaceInformationSelection(item)
                                }
                              >
                                <div className={sx(promptInputStyles.iconWrapPrimary)}>
                                  <Info className={sx(promptInputStyles.icon4)} />
                                </div>
                                <div className={sx(promptInputStyles.flex1Min)}>
                                  <div className={sx(promptInputStyles.rowCenter)}>
                                    <span className={sx(promptInputStyles.fontMedium)}>
                                      {item.title}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className={sx(promptInputStyles.badgeUpper)}
                                    >
                                      {i18n.t("composer:promptInput.copy7")}</Badge>
                                  </div>
                                  <p className={sx(promptInputStyles.itemDesc)}>
                                    {item.description}
                                  </p>
                                </div>
                              </CommandItem>
                            ),
                          )}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "skill" &&
                      localSkillItems.length > 0 ? (
                        <CommandGroup heading={i18n.t("composer:promptInput.heading4")}>
                          {localSkillItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.id}
                              value={item.slug}
                              className={sx(promptInputStyles.itemTall)}
                              data-palette-index={index}
                              onMouseEnter={() => setSelectedSkillIndex(index)}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberActivePaletteTokenSelection();
                              }}
                              onSelect={() => applySkillSelection(item)}
                            >
                              <div className={sx(promptInputStyles.iconWrap)}>
                                {renderSkillScopeIcon(item.scope)}
                              </div>
                              <div className={sx(promptInputStyles.flex1Min)}>
                                <div className={sx(promptInputStyles.rowCenterMin)}>
                                  <span className={sx(promptInputStyles.truncMedium)}>
                                    {item.name}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className={sx(promptInputStyles.badgeUpperShrink)}
                                  >
                                    {item.provider === "shared"
                                      ? i18n.t("composer:promptInput.copy8")
                                      : item.provider === "claude-code"
                                        ? "Claude"
                                        : "Codex"}
                                  </Badge>
                                </div>
                                <p
                                  className={sx(promptInputStyles.itemDescClamp)}
                                  title={item.description}
                                >
                                  {item.description}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "skill" &&
                      userSkillItems.length > 0 ? (
                        <CommandGroup heading={i18n.t("composer:promptInput.heading5")}>
                          {userSkillItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.id}
                              value={item.slug}
                              className={sx(promptInputStyles.itemTall)}
                              data-palette-index={index}
                              onMouseEnter={() => setSelectedSkillIndex(index)}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberActivePaletteTokenSelection();
                              }}
                              onSelect={() => applySkillSelection(item)}
                            >
                              <div className={sx(promptInputStyles.iconWrap)}>
                                {renderSkillScopeIcon(item.scope)}
                              </div>
                              <div className={sx(promptInputStyles.flex1Min)}>
                                <div className={sx(promptInputStyles.rowCenterMin)}>
                                  <span className={sx(promptInputStyles.truncMedium)}>
                                    {item.name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={sx(promptInputStyles.badgeUpperShrink)}
                                  >
                                    {item.provider === "shared"
                                      ? i18n.t("composer:promptInput.copy9")
                                      : item.provider === "claude-code"
                                        ? "Claude"
                                        : "Codex"}
                                  </Badge>
                                </div>
                                <p
                                  className={sx(promptInputStyles.itemDescClamp)}
                                  title={item.description}
                                >
                                  {item.description}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "skill" &&
                      globalSkillItems.length > 0 ? (
                        <CommandGroup heading={i18n.t("composer:promptInput.heading6")}>
                          {globalSkillItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.id}
                              value={item.slug}
                              className={sx(promptInputStyles.itemTall)}
                              data-palette-index={index}
                              onMouseEnter={() => setSelectedSkillIndex(index)}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberActivePaletteTokenSelection();
                              }}
                              onSelect={() => applySkillSelection(item)}
                            >
                              <div className={sx(promptInputStyles.iconWrap)}>
                                {renderSkillScopeIcon(item.scope)}
                              </div>
                              <div className={sx(promptInputStyles.flex1Min)}>
                                <div className={sx(promptInputStyles.rowCenterMin)}>
                                  <span className={sx(promptInputStyles.truncMedium)}>
                                    {item.name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={sx(promptInputStyles.badgeUpperShrink)}
                                  >
                                    {item.provider === "shared"
                                      ? i18n.t("composer:promptInput.copy10")
                                      : item.provider === "claude-code"
                                        ? "Claude"
                                        : "Codex"}
                                  </Badge>
                                </div>
                                <p
                                  className={sx(promptInputStyles.itemDescClamp)}
                                  title={item.description}
                                >
                                  {item.description}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "macro" &&
                      indexedMacroItems.length > 0 ? (
                        <CommandGroup
                          heading={i18n.t("composer:promptInput.heading7")}
                        >
                          {indexedMacroItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.id}
                              value={item.slug}
                              className={sx(promptInputStyles.itemTall)}
                              data-palette-index={index}
                              onMouseEnter={() => setSelectedMacroIndex(index)}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberActivePaletteTokenSelection();
                              }}
                              onSelect={() => applyMacroSelection(item)}
                            >
                              <div className={sx(promptInputStyles.iconWrap)}>
                                {isAssignPaletteEntry(item) ? (
                                  <Target className={sx(promptInputStyles.iconMuted)} />
                                ) : (
                                  <Zap className={sx(promptInputStyles.iconMuted)} />
                                )}
                              </div>
                              <div className={sx(promptInputStyles.flex1Min)}>
                                <div className={sx(promptInputStyles.rowCenterMin)}>
                                  <span className={sx(promptInputStyles.truncMedium)}>
                                    {item.label}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={sx(promptInputStyles.badgeMonoShrink)}
                                  >
                                    !{item.slug}
                                  </Badge>
                                </div>
                                <p
                                  className={sx(promptInputStyles.itemDescClamp)}
                                  title={item.description ?? item.body}
                                >
                                  {item.description || item.body}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {activePalette === "command" &&
                      providerCommandItems.length > 0 ? (
                        <CommandGroup
                          heading={
                            selectedModel.providerId === "claude-code"
                              ? i18n.t("composer:promptInput.heading8")
                              : selectedModel.providerId === "codex"
                                ? i18n.t("composer:promptInput.heading9")
                                : i18n.t("composer:promptInput.heading10")
                          }
                        >
                          {providerCommandItems.map(({ item, index }) => (
                            <CommandItem
                              key={item.id}
                              value={item.command}
                              className={sx(promptInputStyles.itemStandard)}
                              data-palette-index={index}
                              onMouseEnter={() =>
                                setSelectedCommandIndex(index)
                              }
                              onMouseDown={(event) => {
                                event.preventDefault();
                                rememberActivePaletteTokenSelection();
                              }}
                              onSelect={() => applyCommandSelection(item)}
                            >
                              <div className={sx(promptInputStyles.flex1Min)}>
                                <div className={sx(promptInputStyles.rowCenter)}>
                                  <span className={sx(promptInputStyles.fontMedium)}>
                                    {item.command}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={sx(promptInputStyles.badgeUpper)}
                                  >
                                    {selectedModel.providerId === "claude-code"
                                      ? "Claude"
                                      : selectedModel.providerId === "codex"
                                        ? "Codex"
                                        : i18n.t("composer:promptInput.copy11")}
                                  </Badge>
                                </div>
                                <p className={sx(promptInputStyles.itemDesc)}>
                                  {item.description}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                    </>
                  )}
                </CommandList>
                {activePalette === "info" ? (
                  <div className={sx(promptInputStyles.paletteFooter)}>
                    <p className={sx(promptInputStyles.paletteFooterTitle)}>
                      <Info className={sx(promptInputStyles.icon35)} />
                      {filteredWorkspaceInformationItems[
                        selectedWorkspaceInformationIndex
                      ]?.kind === "task"
                        ? i18n.t("composer:promptInput.composerCard13")
                        : filteredWorkspaceInformationItems[
                              selectedWorkspaceInformationIndex
                            ]?.kind === "document"
                          ? i18n.t("composer:promptInput.documentPaletteHint")
                          : i18n.t("composer:promptInput.composerCard14")}
                    </p>
                    <p className={sx(promptInputStyles.mt2)}>
                      {i18n.t("composer:promptInput.composerCard15")}</p>
                  </div>
                ) : activePalette === "skill" ? (
                  <div className={sx(promptInputStyles.paletteFooter)}>
                    <p className={sx(promptInputStyles.paletteFooterTitle)}>
                      <Sparkles className={sx(promptInputStyles.icon35)} />
                      {i18n.t("composer:promptInput.composerCard16")}</p>
                    <p className={sx(promptInputStyles.mt2)}>
                      {i18n.t("composer:promptInput.composerCard17")}</p>
                  </div>
                ) : activePalette === "macro" ? (
                  <div className={sx(promptInputStyles.paletteFooter)}>
                    <p className={sx(promptInputStyles.paletteFooterTitle)}>
                      <Zap className={sx(promptInputStyles.icon35)} />
                      {i18n.t("composer:promptInput.composerCard18")}</p>
                    <p className={sx(promptInputStyles.mt2)}>
                      {i18n.t("composer:promptInput.composerCard19")}</p>
                  </div>
                ) : activePalette === "command" ? (
                  <div className={sx(promptInputStyles.paletteFooter)}>
                    <p className={sx(promptInputStyles.paletteFooterTitlePlain)}>
                      {i18n.t("composer:promptInput.composerCard20")}</p>
                    {commandPaletteProviderNote ? (
                      <>
                        <p className={sx(promptInputStyles.mt2Title)}>
                          {commandPaletteProviderNote.title}
                        </p>
                        <p className={sx(promptInputStyles.mt1Pre)}>
                          {commandPaletteProviderNote.description}
                        </p>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </Command>
            </PopoverContent>
          </Popover>
          {commentItemCount > 0 ? (
            <div className={sx(promptInputStyles.commentBox)}>
              <div className={sx(promptInputStyles.rowCenter)}>
                <Badge
                  variant="outline"
                  className={sx(promptInputStyles.badgeUpper)}
                >
                  {i18n.t("composer:promptInput.composerCard21")}</Badge>
                <span className={sx(promptInputStyles.captionMuted)}>{i18n.t("composer:promptInput.sentence32", { value1: commentItemCount, count: commentItemCount })}</span>
              </div>
              <div className={sx(promptInputStyles.flexWrapGap)}>
                {promptBatch.map((item, index) => {
                  const summary = item.content.replace(/\s+/g, " ").trim();
                  const attachmentCount =
                    (item.attachedFilePaths?.length ?? 0) +
                    (item.attachments?.filter(
                      (attachment) => attachment.kind === "image",
                    ).length ?? 0);
                  return (
                    <div
                      key={item.id}
                      className={sx(promptInputStyles.commentChip)}
                      title={item.content}
                    >
                      <span className={sx(promptInputStyles.chipIndex)}>
                        {index + 1}
                      </span>
                      <span className={sx(promptInputStyles.chipTrunc)}>
                        {summary}
                      </span>
                      {attachmentCount > 0 ? (
                        <span
                          className={sx(promptInputStyles.chipAttachCount)}
                          title={i18n.t("composer:promptInput.title4", { value1: attachmentCount, count: attachmentCount })}
                        >
                          <Paperclip className={sx(promptInputStyles.icon3)} />
                          {attachmentCount}
                        </span>
                      ) : null}
                      <AdsTooltip content={i18n.t("composer:promptInput.ariaLabel12", { value1: index + 1 })}>
                        <AdsButton layout="host"
                          type="button"
                          disabled={interactionsDisabled}
                          onClick={() =>
                            onRemovePromptBatchItem?.({ itemId: item.id })
                          }
                          xstyle={promptInputStyles.chipRemove}
                          aria-label={i18n.t("composer:promptInput.ariaLabel12", { value1: index + 1 })}
                        >
                          <X className={sx(promptInputStyles.icon3)} />
                        </AdsButton>
                      </AdsTooltip>
                    </div>
                  );
                })}
                {lensAnnotationAttachments.map((attachment) => {
                  const annotationItems = attachment.annotations ?? [];
                  if (annotationItems.length === 0) {
                    return (
                      <div
                        key={attachment.id}
                        className={sx(promptInputStyles.lensChip)}
                      >
                        <Popover modal={false}>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <PopoverTrigger
                                  render={
                                    <AdsButton layout="host"
                                      type="button"
                                      title={
                                        attachment.displayContent ??
                                        attachment.content
                                      }
                                      xstyle={promptInputStyles.lensChipTrigger}
                                    />
                                  }
                                />
                              }
                            >
                              <FileText className={sx(promptInputStyles.icon35Shrink)} />
                              <span className={sx(promptInputStyles.truncPlain)}>
                                {attachment.label}
                              </span>
                              <Badge
                                variant="outline"
                                className={sx(promptInputStyles.badgePlain)}
                              >
                                {attachment.count}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className={sx(promptInputStyles.maxW80)}>
                              {attachment.summary}
                            </TooltipContent>
                          </Tooltip>
                          <PopoverContent
                            side="top"
                            align="start"
                            xstyle={promptInputStyles.lensPopoverContent}
                          >
                            <pre className={sx(promptInputStyles.lensPre)}>
                              {attachment.displayContent ?? attachment.content}
                            </pre>
                          </PopoverContent>
                        </Popover>
                        <AdsTooltip content={i18n.t("composer:promptInput.ariaLabel13", { value1: attachment.label })}>
                          <AdsButton layout="host"
                            type="button"
                            disabled={interactionsDisabled}
                            onClick={() =>
                              onAttachmentsChange?.({
                                attachments: (attachments ?? []).filter(
                                  (candidate) =>
                                    !(
                                      candidate.kind === "lens-annotations" &&
                                      candidate.id === attachment.id
                                    ),
                                ),
                              })
                            }
                            xstyle={promptInputStyles.lensChipRemove}
                            aria-label={i18n.t("composer:promptInput.ariaLabel13", { value1: attachment.label })}
                          >
                            <X className={sx(promptInputStyles.icon3)} />
                          </AdsButton>
                        </AdsTooltip>
                      </div>
                    );
                  }
                  return annotationItems.map((annotation) => {
                    const feedback =
                      resolveLensAnnotationReview(annotation).feedback;
                    const screenshot = attachment.workspaceId
                      ? imageAttachmentsById.get(
                          getLensCommentImageId({
                            workspaceId: attachment.workspaceId,
                            lensSessionId: attachment.lensSessionId,
                            annotationId: annotation.id,
                          }),
                        )
                      : null;
                    return (
                      <div
                        key={`${attachment.id}:${annotation.id}`}
                        className={sx(promptInputStyles.annotationChip)}
                      >
                        <span className={sx(promptInputStyles.annotationPin)}>
                          {annotation.pin}
                        </span>
                        {screenshot ? (
                          <AdsButton layout="host"
                            type="button"
                            xstyle={promptInputStyles.screenshotButton}
                            title={i18n.t("composer:promptInput.title5")}
                            onClick={() =>
                              setImagePreviewSrc({
                                dataUrl: screenshot.dataUrl,
                                label: screenshot.label,
                              })
                            }
                          >
                            <img
                              src={screenshot.dataUrl}
                              alt={screenshot.label}
                              className={sx(promptInputStyles.screenshotImage)}
                            />
                          </AdsButton>
                        ) : null}
                        <Popover modal={false}>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <PopoverTrigger
                                  render={
                                    <AdsButton layout="host"
                                      type="button"
                                      title={annotation.comment}
                                      xstyle={promptInputStyles.annotationTextButton}
                                    />
                                  }
                                />
                              }
                            >
                              <span className={sx(promptInputStyles.annotationComment)}>
                                {annotation.comment}
                              </span>
                              <span className={sx(promptInputStyles.annotationMeta)}>
                                {formatLensFeedbackOption(feedback.intent)} ·{" "}
                                {formatLensFeedbackOption(feedback.priority)}
                                {" · "}
                                {annotation.kind === "area"
                                  ? i18n.t("composer:promptInput.copy12")
                                  : annotation.selector}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className={sx(promptInputStyles.maxW80)}>
                              {annotation.comment}
                            </TooltipContent>
                          </Tooltip>
                          <PopoverContent
                            side="top"
                            align="start"
                            xstyle={promptInputStyles.lensPopoverContent}
                          >
                            <pre className={sx(promptInputStyles.lensPre)}>
                              {attachment.displayContent ?? attachment.content}
                            </pre>
                          </PopoverContent>
                        </Popover>
                        <LensAnnotationFeedbackPopover
                          annotation={annotation}
                          disabled={interactionsDisabled}
                          onApply={(targetAnnotation, nextFeedback) =>
                            applyLensAnnotationFeedback(
                              attachment,
                              targetAnnotation,
                              nextFeedback,
                            )
                          }
                        />
                        <LensAnnotationStylePopover
                          annotation={annotation}
                          disabled={
                            interactionsDisabled ||
                            !attachment.workspaceId ||
                            annotation.kind !== "element"
                          }
                          onApply={(targetAnnotation, patch) =>
                            applyLensAnnotationStyle(
                              attachment,
                              targetAnnotation,
                              patch,
                            )
                          }
                        />
                        <AdsTooltip content={i18n.t("composer:promptInput.ariaLabel14", { value1: annotation.pin })}>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            disabled={interactionsDisabled}
                            aria-label={i18n.t("composer:promptInput.ariaLabel14", { value1: annotation.pin })}
                            onClick={() => {
                              void removeLensAnnotation(attachment, annotation);
                            }}
                          >
                            <Trash2 className={sx(promptInputStyles.icon3)} />
                          </Button>
                        </AdsTooltip>
                      </div>
                    );
                  });
                })}
              </div>
            </div>
          ) : null}
          {attachedFilePaths.length > 0 ||
          standaloneImageAttachments.length > 0 ||
          referenceAttachments.length > 0 ? (
            <div
              role="group"
              aria-label={i18n.t("composer:promptInput.ariaLabel15")}
              className={sx(promptInputStyles.attachmentsRow)}
            >
              <span className={sx(promptInputStyles.attachmentsCount)}>
                <Paperclip className={sx(promptInputStyles.icon3)} aria-hidden="true" />
                {currentAttachmentCount} {i18n.t("composer:promptInput.composerCard24")}</span>
              {workspaceInformationAttachments.map((attachment) => (
                <WorkspaceInformationReferenceChip
                  key={attachment.id}
                  reference={attachment.reference}
                  disabled={interactionsDisabled}
                  compact={minimal}
                  onRemove={() =>
                    onAttachmentsChange?.({
                      attachments: (attachments ?? []).filter(
                        (candidate) =>
                          !(
                            candidate.kind === "workspace-information" &&
                            candidate.id === attachment.id
                          ),
                      ),
                    })
                  }
                />
              ))}
              {taskContextAttachments.map((attachment) => (
                <TaskContextDraftChip
                  key={attachment.id}
                  attachment={attachment}
                  disabled={interactionsDisabled}
                  compact={minimal}
                  onOpen={() =>
                    void openAttachedTask({
                      taskId: attachment.taskId,
                      workspaceId: attachment.workspaceId,
                    })
                  }
                  onScopeChange={(scope) =>
                    onAttachmentsChange?.({
                      attachments: (attachments ?? []).map((candidate) =>
                        candidate.kind === "task-context" &&
                        candidate.id === attachment.id
                          ? { ...candidate, scope }
                          : candidate,
                      ),
                    })
                  }
                  onRemove={() =>
                    onAttachmentsChange?.({
                      attachments: (attachments ?? []).filter(
                        (candidate) =>
                          !(
                            candidate.kind === "task-context" &&
                            candidate.id === attachment.id
                          ),
                      ),
                    })
                  }
                />
              ))}
              {documentContextAttachments.map((attachment) => (
                <DocumentContextChip
                  key={attachment.id}
                  title={attachment.title}
                  workspaceName={attachment.workspaceName}
                  revision={attachment.revision}
                  disabled={interactionsDisabled}
                  compact={minimal}
                  onOpen={() => openAttachedDocument(attachment)}
                  onRemove={() =>
                    onAttachmentsChange?.({
                      attachments: (attachments ?? []).filter(
                        (candidate) =>
                          !(
                            candidate.kind === "document-context" &&
                            candidate.id === attachment.id
                          ),
                      ),
                    })
                  }
                />
              ))}
              {attachedFilePaths.map((filePath) => (
                <div
                  key={filePath}
                  className={sx(
                    promptInputStyles.fileChip,
                    minimal
                      ? promptInputStyles.fileChipMinimal
                      : promptInputStyles.fileChipDefault,
                  )}
                >
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={interactionsDisabled || !onOpenAttachedFile}
                    aria-label={i18n.t("composer:promptInput.ariaLabel16", { value1: filePath })}
                    title={i18n.t("composer:promptInput.title6")}
                    className={sx(promptInputStyles.fileOpenButton)}
                    onClick={() => void onOpenAttachedFile?.({ filePath })}
                  >
                    <FileText
                      className={sx(promptInputStyles.icon35Shrink)}
                      aria-hidden="true"
                    />
                    <span className={sx(promptInputStyles.truncMedium)}>{filePath}</span>
                  </Button>
                  <AdsTooltip content={i18n.t("composer:promptInput.title7")}>
                    <Button
                      type="button"
                      size="xs"
                      iconOnly
                      variant="ghost"
                      disabled={interactionsDisabled}
                      aria-label={i18n.t("composer:promptInput.ariaLabel17", { value1: filePath })}
                      onClick={() =>
                        onAttachFilesChange({
                          filePaths: attachedFilePaths.filter(
                            (p) => p !== filePath,
                          ),
                        })
                      }
                      xstyle={promptInputStyles.fileRemoveButton}
                    >
                      <X />
                    </Button>
                  </AdsTooltip>
                </div>
              ))}
              {standaloneImageAttachments.map((img) => (
                <div
                  key={img.id}
                  className={sx(
                    promptInputStyles.imageChip,
                    minimal
                      ? promptInputStyles.imageChipMinimal
                      : promptInputStyles.imageChipDefault,
                  )}
                >
                  <AdsButton layout="host"
                    type="button"
                    disabled={interactionsDisabled}
                    aria-label={i18n.t("composer:promptInput.ariaLabel18", { value1: img.label })}
                    title={i18n.t("composer:promptInput.title8")}
                    xstyle={promptInputStyles.imagePreviewButton}
                    onClick={() =>
                      setImagePreviewSrc({
                        dataUrl: img.dataUrl,
                        label: img.label,
                      })
                    }
                  >
                    <img
                      src={img.dataUrl}
                      alt={img.label}
                      className={sx(promptInputStyles.imagePreview)}
                    />
                  </AdsButton>
                  <AdsTooltip content={i18n.t("composer:promptInput.title9")}>
                    <Button
                      type="button"
                      size="xs"
                      iconOnly
                      variant="floating"
                      disabled={interactionsDisabled}
                      aria-label={i18n.t("composer:promptInput.ariaLabel19", { value1: img.label })}
                      onClick={() =>
                        onAttachmentsChange?.({
                          attachments: (attachments ?? []).filter(
                            (a) => !(a.kind === "image" && a.id === img.id),
                          ),
                        })
                      }
                      xstyle={promptInputStyles.imageRemoveButton}
                    >
                      <X />
                    </Button>
                  </AdsTooltip>
                </div>
              ))}
            </div>
          ) : null}
          <div
            className={sx(
              promptInputStyles.toolbarRow,
              minimal && promptInputStyles.toolbarRowEnd,
            )}
          >
            {!minimal ? (
              <div
                className={cx(
                  sx(promptInputStyles.controlLane),
                  COMPOSER_CONTROL_LANE.toolbar,
                )}
                data-composer-toolbar="true"
                onContextMenu={
                  canCustomizeComposerControls
                    ? (event) => {
                        // Only claim the row's own background and the controls'
                        // gaps; a right-click inside a text field keeps the
                        // native menu.
                        if (
                          event.target instanceof HTMLElement &&
                          event.target.closest("input, textarea")
                        ) {
                          return;
                        }
                        event.preventDefault();
                        setComposerCustomizeOpen(true);
                      }
                    : undefined
                }
              >
                {canCustomizeComposerControls ? (
                  <Popover
                    open={composerCustomizeOpen}
                    onOpenChange={setComposerCustomizeOpen}
                  >
                    <PopoverAnchor className={sx(promptInputStyles.customizeAnchor)} />
                    <PopoverContent
                      align="start"
                      side="top"
                      sideOffset={10}
                      xstyle={promptInputStyles.customizePopover}
                    >
                      <PopoverTitle className={sx(promptInputStyles.customizeTitle)}>
                        {i18n.t("composer:promptInput.composerCard25")}</PopoverTitle>
                      <ComposerControlPlacementList
                        placements={composerControlPlacements ?? {}}
                        forcedIds={composerControlLayout.forced}
                        onChange={(next) =>
                          onComposerControlPlacementsChange?.(next)
                        }
                      />
                    </PopoverContent>
                  </Popover>
                ) : null}
                <ModelEffortSelector
                  value={selectedModel}
                  options={modelOptions}
                  catalogs={modelCatalogs}
                  modelVisibility={modelVisibility}
                  onRefreshCatalogs={onRefreshModelCatalogs}
                  {...(modelPickerAgents ? { agents: modelPickerAgents } : {})}
                  effortValue={
                    effortValue as Exclude<ModelShortcutEffort, ""> | undefined
                  }
                  effortLabel={effortLabel}
                  fastMode={fastMode}
                  showFastMode={composerControlLayout.toolbar.includes("fast")}
                  disabled={interactionsDisabled}
                  openToken={
                    modelSelectorOpenNonce > 0
                      ? modelSelectorOpenNonce
                      : undefined
                  }
                  {...(modelSelectorOpenRequest ? { openRequest: modelSelectorOpenRequest } : {})}
                  accountActions
                  openAgentsToken={agentsOpenToken}
                  onFastModeChange={onFastModeChange}
                  onSelect={({ selection, effort, fastMode: nextFastMode }) => {
                    onModelSelect({
                      selection,
                      effort,
                      fastMode: nextFastMode,
                    });
                  }}
                />
                {toolbarControlIds.slice(0, toolbarTrayIndex).map((id) => (
                  <Fragment key={id}>{composerControlNodes[id]}</Fragment>
                ))}
                {useComposerWings ? null : composerOverflowTray}
                {toolbarControlIds.slice(toolbarTrayIndex).map((id) => (
                  <Fragment key={id}>{composerControlNodes[id]}</Fragment>
                ))}
              </div>
            ) : null}
            <div className={sx(promptInputStyles.actionsRow)}>
              {contextMeter}
              {minimal && hasReviewControl && onLocalChangeReview ? (
                <LocalChangeReviewDialog
                  workspaceCwd={workspaceCwd}
                  reviewerOptions={reviewModelOptions ?? []}
                  preferredReviewerKey={preferredReviewModelKey}
                  disabled={interactionsDisabled}
                  onSubmit={onLocalChangeReview}
                />
              ) : null}
              {minimal ? (
                <>
                  {secretsControl}
                  {compareControl}
                </>
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  disabled={interactionsDisabled || !onOpenFileSelector}
                  onClick={() => {
                    void onOpenFileSelector?.();
                  }}
                  className={tooltipTriggerButtonClassName({
                    size: "icon-sm",
                    className: cx(
                      PROMPT_TOOLBAR_ICON_BUTTON,
                      minimal
                        ? sx(promptInputStyles.attachButtonMinimal)
                        : undefined,
                    ),
                  })}
                  aria-label={i18n.t("composer:promptInput.ariaLabel20")}
                >
                  <Paperclip className={sx(promptInputStyles.icon35)} />
                </TooltipTrigger>
                <TooltipContent side="top">{i18n.t("composer:promptInput.composerCard26")}</TooltipContent>
              </Tooltip>
              {isTurnActive && !hasDraftPayload ? (
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    className={tooltipTriggerButtonClassName({
                      size: "icon-sm",
                      className: cx(
                        PROMPT_TOOLBAR_ICON_BUTTON,
                        sx(
                          promptInputStyles.stopButton,
                          minimal && promptInputStyles.stopButtonMinimal,
                        ),
                      ),
                    })}
                    aria-label={i18n.t("composer:promptInput.ariaLabel21")}
                    onClick={() => onAbort?.()}
                  >
                    <Square className={sx(promptInputStyles.iconSquare)} />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <span className={sx(promptInputStyles.inlineGap1)}>
                      {i18n.t("composer:promptInput.composerCard27")}<KbdGroup>
                        <Kbd>Esc</Kbd>
                      </KbdGroup>
                    </span>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    type="submit"
                    className={tooltipTriggerButtonClassName({
                      variant: "default",
                      size: "icon-sm",
                      className: cx(
                        sx(promptInputStyles.roundedMd),
                        PROMPT_SURFACE_PRIMARY_FOCUS,
                        minimal
                          ? sx(promptInputStyles.sendButtonMinimal)
                          : undefined,
                      ),
                    })}
                    disabled={primaryActionDisabled}
                    aria-label={
                      isSteerOrQueueMode
                        ? steerQueueEnterAction === "steer"
                          ? i18n.t("composer:promptInput.ariaLabel22")
                          : i18n.t("composer:promptInput.ariaLabel23")
                        : isQueueNextMode
                          ? i18n.t("composer:promptInput.ariaLabel24")
                          : assignOnSend
                            ? i18n.t("composer:promptInput.ariaLabel25")
                            : i18n.t("composer:promptInput.ariaLabel26")
                    }
                  >
                    <Send className={sx(promptInputStyles.icon35)} />
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className={
                      isSteerOrQueueMode
                        ? sx(promptInputStyles.tooltipColStart)
                        : undefined
                    }
                  >
                    <span className={sx(promptInputStyles.inlineGap1)}>
                      {isSteerOrQueueMode
                        ? steerQueueEnterAction === "steer"
                          ? i18n.t("composer:promptInput.composerCard28")
                          : i18n.t("composer:promptInput.composerCard29")
                        : isQueueNextMode
                          ? i18n.t("composer:promptInput.composerCard30")
                          : assignOnSend
                            ? i18n.t("composer:promptInput.composerCard31")
                            : i18n.t("composer:promptInput.composerCard32")}
                      <KbdGroup>
                        <Kbd>↵</Kbd>
                      </KbdGroup>
                    </span>
                    {isSteerOrQueueMode ? (
                      <span className={sx(promptInputStyles.inlineGapBg70)}>
                        {steerQueueEnterAction === "steer" ? i18n.t("composer:promptInput.composerCard33") : i18n.t("composer:promptInput.composerCard34")}
                        <KbdGroup>
                          <Kbd>Tab</Kbd>
                        </KbdGroup>
                      </span>
                    ) : null}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </form>
      </div>
      <ImageLightbox
        open={Boolean(imagePreviewSrc)}
        imageSrc={imagePreviewSrc?.dataUrl ?? ""}
        alt={imagePreviewSrc?.label ?? i18n.t("composer:promptInput.alt")}
        imageTitle={i18n.t("composer:promptInput.imageTitle")}
        onClose={() => setImagePreviewSrc(null)}
      />
    </>
  );

  if (!useComposerFrame) {
    return composerCard;
  }

  return (
    <ComposerFrame
      top={frameTop}
      bottom={frameStatusBar}
      left={leftWing}
      right={rightWing}
    >
      {composerCard}
    </ComposerFrame>
  );
}
