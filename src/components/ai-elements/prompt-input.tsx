import { i18n, useTranslation } from "@/i18n";
import {
  type FormEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ImageLightbox,
  Popover,
  PopoverAnchor,
  PopoverContent,
  toast,
} from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { UserInputCard } from "./user-input-card";
import {
  collectActiveComposerControls,
  resolveComposerControlLayout,
  type ComposerControlId,
} from "@/lib/composer-controls";
import { sx, cx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import {
  isShortcutEchoInsertion,
  NO_PROMPT_HISTORY_SELECTION,
  resolvePromptPlaceholder,
} from "./prompt-input.utils";
import { DEFAULT_PROMPT_COMMENT_SHORTCUT } from "@/lib/prompt-comment-shortcuts";
import {
  DEFAULT_STEER_QUEUE_ENTER_ACTION,
  formatSteerQueueEnterActionLabel,
} from "@/lib/steer-queue-shortcuts";
import { PromptInputGoalStatusStrip } from "./prompt-input-goal-status";
import { getPromptInputRuntimeProfile } from "./prompt-input-runtime-bar";
import { Suggestion, Suggestions } from "./suggestion";
import {
  PromptLexicalEditor,
  type PromptLexicalEditorHandle,
} from "./prompt-lexical-editor";
import { hasPromptSubmitPayload } from "./prompt-input-submit";
import { readDroppedTask } from "./prompt-input-mentions";
import { TASK_DRAG_MIME } from "@/lib/task-context/attached-task-context";
import { isReviewTaskDelegationAvailable } from "@/store/review-task-runtime";
import { useIsMobile } from "@/hooks/use-mobile";
import { ComposerFrame } from "./composer-frame";
import type { PromptInputProps } from "./prompt-input.types";
import {
  PROMPT_EDITOR_TYPOGRAPHY_DEFAULT,
  PROMPT_EDITOR_TYPOGRAPHY_MINIMAL,
  PROMPT_ENHANCEMENT_EDITOR_INSET,
  PromptEnhancementControl,
  PromptEnhancementRevealOverlay,
  usePromptEnhancementReveal,
  usePromptEnhancementScrollReset,
} from "./prompt-input-enhancement";
import { usePromptInputClipboardPaste } from "./prompt-input-paste";
import { usePromptInputAttachmentGroups } from "./prompt-input-attachment-groups";
import { usePromptInputCaret } from "./prompt-input-caret";
import { usePromptInputWindowShortcuts } from "./prompt-input-shortcuts";
import { usePromptInputHistory } from "./prompt-input-history";
import { usePromptInputPaletteState } from "./prompt-input-palette-state";
import { usePromptInputPaletteSelection } from "./prompt-input-palette-selection";
import { usePromptInputLensAnnotationActions } from "./prompt-input-lens-actions";
import { handlePromptEditorKeyDown } from "./prompt-input-keyboard";
import { renderComposerControlNodes } from "./prompt-input-composer-controls";
import { PromptInputPaletteMenu } from "./prompt-input-palette";
import { PromptInputCommentBatch } from "./prompt-input-comment-batch";
import { PromptInputAttachmentsRow } from "./prompt-input-attachments";
import { PromptInputActions } from "./prompt-input-actions";
import { buildComposerFrameChrome } from "./prompt-input-frame-chrome";
import { PromptInputControlLane } from "./prompt-input-control-lane";

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
    onEmptyEditorKey,
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
  const isSteerOrQueueMode = submitMode === "steer-or-queue";
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
  const placeholder = resolvePromptPlaceholder({
    minimal,
    focused: isPromptInputFocused,
    steerOrQueue: isSteerOrQueueMode,
    queueNext: submitMode === "queue-next",
    approvalRedirect: submitMode === "redirect-steer" ? "steer" : submitMode === "redirect-queue" ? "queue" : null,
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
    setDismissedCommandToken,
    setDismissedSkillToken,
    setDismissedMacroToken,
    setDismissedWorkspaceInformationToken,
    activeCommandToken,
    activeSkillToken,
    activeMacroToken,
    activeWorkspaceInformationToken,
    activePalette,
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
              requestId: pendingUserInput.part.requestId,
              answers,
            })
          }
          onDeny={() =>
            onUserInputDeny({
              messageId: pendingUserInput.messageId,
              requestId: pendingUserInput.part.requestId,
            })
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

  const composerControlNodes = renderComposerControlNodes({
    runAccountPool,
    providerModeStatus,
    providerModePresets,
    activeProviderModePresetId,
    onProviderModeSelect,
    interactionsDisabled,
    thinkingMode,
    onThinkingModeChange,
    hasReviewControl,
    workspaceCwd,
    reviewModelOptions,
    preferredReviewModelKey,
    onLocalChangeReview,
    secretsControl,
    macroControl,
    compareControl,
    hasRuntimeContent,
    isMobile,
    composerIconButtonSize,
    runtimeProfile,
    runtimeStatusItems,
  });

  const {
    canCustomizeComposerControls,
    leftWing,
    rightWing,
    toolbarControlIds,
    toolbarTrayIndex,
    composerOverflowTray,
    frameStatusBar,
  } = buildComposerFrameChrome({
    composerControlLayout,
    composerControlNodes,
    onComposerControlPlacementsChange,
    useComposerFrame,
    useComposerWings,
    macroQuickPicks,
    frameBottom,
    composerTrayOpen,
    setComposerTrayOpen,
    setComposerCustomizeOpen,
    composerIconButtonSize,
    interactionsDisabled,
  });

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
                      <PromptEnhancementControl
                        promptEnhancementState={promptEnhancementState}
                        promptEnhancementBusy={promptEnhancementBusy}
                        promptEnhancementPending={promptEnhancementPending}
                        promptEnhancementRevealing={promptEnhancementRevealing}
                        promptEnhancementLabel={promptEnhancementLabel}
                        minimal={minimal}
                        interactionsDisabled={interactionsDisabled}
                        onEnhancePrompt={onEnhancePrompt}
                      />
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
                          onEmptyEditorKey: hasDraftPayload ? undefined : onEmptyEditorKey,
                        })
                      }
                      placeholder={
                        placeholder.kind === "none"
                          ? ""
                          : placeholder.kind === "steer-queue"
                            ? formatSteerQueueEnterActionLabel(
                                steerQueueEnterAction,
                              )
                            : i18n.t(placeholder.key)
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
              <PromptInputPaletteMenu
                palette={palette}
                selection={paletteSelection}
                selectedModel={selectedModel}
                taskMentionOptions={taskMentionOptions}
                commandPaletteProviderNote={commandPaletteProviderNote}
              />
            </PopoverContent>
          </Popover>
          {commentItemCount > 0 ? (
            <PromptInputCommentBatch
              promptBatch={promptBatch}
              commentItemCount={commentItemCount}
              lensAnnotationAttachments={lensAnnotationAttachments}
              imageAttachmentsById={imageAttachmentsById}
              attachments={attachments}
              interactionsDisabled={interactionsDisabled}
              onRemovePromptBatchItem={onRemovePromptBatchItem}
              onAttachmentsChange={onAttachmentsChange}
              setImagePreviewSrc={setImagePreviewSrc}
              applyLensAnnotationFeedback={applyLensAnnotationFeedback}
              applyLensAnnotationStyle={applyLensAnnotationStyle}
              removeLensAnnotation={removeLensAnnotation}
            />
          ) : null}
          {attachedFilePaths.length > 0 ||
          standaloneImageAttachments.length > 0 ||
          referenceAttachments.length > 0 ? (
            <PromptInputAttachmentsRow
              currentAttachmentCount={currentAttachmentCount}
              workspaceInformationAttachments={workspaceInformationAttachments}
              taskContextAttachments={taskContextAttachments}
              documentContextAttachments={documentContextAttachments}
              attachedFilePaths={attachedFilePaths}
              standaloneImageAttachments={standaloneImageAttachments}
              attachments={attachments}
              interactionsDisabled={interactionsDisabled}
              minimal={minimal}
              onAttachmentsChange={onAttachmentsChange}
              onAttachFilesChange={onAttachFilesChange}
              onOpenAttachedFile={onOpenAttachedFile}
              setImagePreviewSrc={setImagePreviewSrc}
            />
          ) : null}
          <div
            className={sx(
              promptInputStyles.toolbarRow,
              minimal && promptInputStyles.toolbarRowEnd,
            )}
          >
            {!minimal ? (
              <PromptInputControlLane
                canCustomizeComposerControls={canCustomizeComposerControls}
                composerCustomizeOpen={composerCustomizeOpen}
                setComposerCustomizeOpen={setComposerCustomizeOpen}
                composerControlPlacements={composerControlPlacements}
                onComposerControlPlacementsChange={onComposerControlPlacementsChange}
                composerControlLayout={composerControlLayout}
                composerControlNodes={composerControlNodes}
                toolbarControlIds={toolbarControlIds}
                toolbarTrayIndex={toolbarTrayIndex}
                useComposerWings={useComposerWings}
                composerOverflowTray={composerOverflowTray}
                selectedModel={selectedModel}
                modelOptions={modelOptions}
                modelCatalogs={modelCatalogs}
                modelVisibility={modelVisibility}
                onRefreshModelCatalogs={onRefreshModelCatalogs}
                modelPickerAgents={modelPickerAgents}
                effortValue={effortValue}
                effortLabel={effortLabel}
                fastMode={fastMode}
                onFastModeChange={onFastModeChange}
                onModelSelect={onModelSelect}
                interactionsDisabled={interactionsDisabled}
                modelSelectorOpenNonce={modelSelectorOpenNonce}
                modelSelectorOpenRequest={modelSelectorOpenRequest}
                agentsOpenToken={agentsOpenToken}
              />
            ) : null}
            <PromptInputActions
              contextMeter={contextMeter}
              minimal={minimal}
              hasReviewControl={hasReviewControl}
              workspaceCwd={workspaceCwd}
              reviewModelOptions={reviewModelOptions}
              preferredReviewModelKey={preferredReviewModelKey}
              onLocalChangeReview={onLocalChangeReview}
              interactionsDisabled={interactionsDisabled}
              secretsControl={secretsControl}
              compareControl={compareControl}
              onOpenFileSelector={onOpenFileSelector}
              isTurnActive={isTurnActive}
              hasDraftPayload={hasDraftPayload}
              onAbort={onAbort}
              primaryActionDisabled={primaryActionDisabled}
              submitMode={submitMode}
              steerQueueEnterAction={steerQueueEnterAction}
              assignOnSend={assignOnSend}
            />
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
