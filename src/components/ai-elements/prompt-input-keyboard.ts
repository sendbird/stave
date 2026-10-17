import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { isPromptCommentShortcut, type PromptCommentShortcut } from "@/lib/prompt-comment-shortcuts";
import {
  tabActionForSteerQueueEnterAction,
  type SteerQueueEnterAction,
} from "@/lib/steer-queue-shortcuts";
import {
  getAcceptedCommandPaletteItem,
  getAcceptedPaletteItem,
  getNextCommandSelectionIndex,
} from "./prompt-input.utils";
import type { PromptInputPaletteState } from "./prompt-input-palette-state";
import type { PromptInputPaletteSelection } from "./prompt-input-palette-selection";

export interface PromptEditorKeyDownContext {
  palette: PromptInputPaletteState;
  selection: PromptInputPaletteSelection;
  handleModelShortcut: (event: ReactKeyboardEvent<HTMLElement>) => boolean;
  applyPromptHistoryNavigation: (direction: "previous" | "next") => boolean;
  submitCurrentMessage: (intent?: "steer" | "queue") => Promise<void>;
  isTurnActive?: boolean;
  isSteerOrQueueMode: boolean;
  steerQueueEnterAction: SteerQueueEnterAction;
  promptCommentShortcut: PromptCommentShortcut;
  onAbort?: () => void;
  onStagePromptBatch?: () => void;
}

/**
 * The prompt editor's keydown handling, in priority order: model shortcuts,
 * palette navigation and acceptance, Escape (dismiss a palette or stop the
 * turn), prompt history, Tab to steer or queue, the comment shortcut, and
 * Enter to send.
 */
export function handlePromptEditorKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  context: PromptEditorKeyDownContext,
) {
  const {
    handleModelShortcut,
    applyPromptHistoryNavigation,
    submitCurrentMessage,
    isTurnActive,
    isSteerOrQueueMode,
    steerQueueEnterAction,
    promptCommentShortcut,
    onAbort,
    onStagePromptBatch,
  } = context;
  const {
    activePalette,
    activeCommandToken,
    activeSkillToken,
    activeMacroToken,
    activeWorkspaceInformationToken,
    filteredCommandItems,
    filteredSkillItems,
    filteredMacroItems,
    filteredWorkspaceInformationItems,
    selectedCommandIndex,
    selectedSkillIndex,
    selectedMacroIndex,
    selectedWorkspaceInformationIndex,
    setSelectedCommandIndex,
    setSelectedSkillIndex,
    setSelectedMacroIndex,
    setSelectedWorkspaceInformationIndex,
    setDismissedCommandToken,
    setDismissedSkillToken,
    setDismissedMacroToken,
    setDismissedWorkspaceInformationToken,
  } = context.palette;
  const {
    applyCommandSelection,
    applySkillSelection,
    applyMacroSelection,
    applyMentionSelection,
  } = context.selection;
  if (handleModelShortcut(event)) {
    return;
  }
  if (
    activePalette === "info" &&
    filteredWorkspaceInformationItems.length > 0 &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedWorkspaceInformationIndex((current) =>
        getNextCommandSelectionIndex({
          currentIndex: current,
          itemCount:
            filteredWorkspaceInformationItems.length,
          direction: "next",
        }),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedWorkspaceInformationIndex((current) =>
        getNextCommandSelectionIndex({
          currentIndex: current,
          itemCount:
            filteredWorkspaceInformationItems.length,
          direction: "previous",
        }),
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      if (event.nativeEvent.isComposing) {
        return;
      }
      const selectedItem = getAcceptedPaletteItem({
        items: filteredWorkspaceInformationItems,
        selectedIndex: selectedWorkspaceInformationIndex,
        triggerKey: event.key,
      });
      if (selectedItem) {
        event.preventDefault();
        applyMentionSelection(selectedItem);
        return;
      }
    }
  }
  if (
    activePalette === "skill" &&
    filteredSkillItems.length > 0 &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedSkillIndex((current) =>
        getNextCommandSelectionIndex({
          currentIndex: current,
          itemCount: filteredSkillItems.length,
          direction: "next",
        }),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedSkillIndex((current) =>
        getNextCommandSelectionIndex({
          currentIndex: current,
          itemCount: filteredSkillItems.length,
          direction: "previous",
        }),
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      if (event.nativeEvent.isComposing) {
        return;
      }
      const selectedItem = getAcceptedPaletteItem({
        items: filteredSkillItems,
        selectedIndex: selectedSkillIndex,
        triggerKey: event.key,
      });
      if (selectedItem) {
        event.preventDefault();
        applySkillSelection(selectedItem);
        return;
      }
    }
  }
  if (
    activePalette === "macro" &&
    filteredMacroItems.length > 0 &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedMacroIndex((current) =>
        getNextCommandSelectionIndex({
          currentIndex: current,
          itemCount: filteredMacroItems.length,
          direction: "next",
        }),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedMacroIndex((current) =>
        getNextCommandSelectionIndex({
          currentIndex: current,
          itemCount: filteredMacroItems.length,
          direction: "previous",
        }),
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      if (event.nativeEvent.isComposing) {
        return;
      }
      const selectedItem = getAcceptedPaletteItem({
        items: filteredMacroItems,
        selectedIndex: selectedMacroIndex,
        triggerKey: event.key,
      });
      if (selectedItem) {
        event.preventDefault();
        applyMacroSelection(selectedItem);
        return;
      }
    }
  }
  if (
    activePalette === "command" &&
    filteredCommandItems.length > 0 &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedCommandIndex((current) =>
        getNextCommandSelectionIndex({
          currentIndex: current,
          itemCount: filteredCommandItems.length,
          direction: "next",
        }),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedCommandIndex((current) =>
        getNextCommandSelectionIndex({
          currentIndex: current,
          itemCount: filteredCommandItems.length,
          direction: "previous",
        }),
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      if (event.nativeEvent.isComposing) {
        return;
      }
      const selectedItem = getAcceptedCommandPaletteItem({
        items: filteredCommandItems,
        selectedIndex: selectedCommandIndex,
        triggerKey: event.key,
      });
      if (selectedItem) {
        event.preventDefault();
        applyCommandSelection(selectedItem);
        return;
      }
    }
  }
  if (
    activePalette === "info" &&
    event.key === "Escape"
  ) {
    event.preventDefault();
    setDismissedWorkspaceInformationToken(
      activeWorkspaceInformationToken?.token ?? null,
    );
    return;
  }
  if (
    activePalette === "skill" &&
    event.key === "Escape"
  ) {
    event.preventDefault();
    setDismissedSkillToken(
      activeSkillToken?.token ?? null,
    );
    return;
  }
  if (
    activePalette === "macro" &&
    event.key === "Escape"
  ) {
    event.preventDefault();
    setDismissedMacroToken(
      activeMacroToken?.token ?? null,
    );
    return;
  }
  if (
    activePalette === "command" &&
    event.key === "Escape"
  ) {
    event.preventDefault();
    setDismissedCommandToken(
      activeCommandToken?.token ?? null,
    );
    return;
  }
  if (
    activePalette === null &&
    isTurnActive &&
    event.key === "Escape" &&
    !event.nativeEvent.isComposing
  ) {
    event.preventDefault();
    onAbort?.();
    return;
  }
  if (
    activePalette === null &&
    (event.key === "ArrowUp" ||
      event.key === "ArrowDown") &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.nativeEvent.isComposing
  ) {
    const consumed = applyPromptHistoryNavigation(
      event.key === "ArrowUp" ? "previous" : "next",
    );
    if (consumed) {
      event.preventDefault();
      return;
    }
  }
  if (
    isSteerOrQueueMode &&
    activePalette === null &&
    event.key === "Tab" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.nativeEvent.isComposing
  ) {
    event.preventDefault();
    void submitCurrentMessage(
      tabActionForSteerQueueEnterAction(
        steerQueueEnterAction,
      ),
    );
    return;
  }
  if (event.key !== "Enter") {
    return;
  }
  if (
    isPromptCommentShortcut({
      shortcut: promptCommentShortcut,
      key: event.key,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      isComposing: event.nativeEvent.isComposing,
    })
  ) {
    event.preventDefault();
    onStagePromptBatch?.();
    return;
  }
  if (
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return;
  }
  if (event.nativeEvent.isComposing) {
    return;
  }
  const paletteHasAcceptedItems =
    activePalette === "info"
      ? filteredWorkspaceInformationItems.length > 0
      : activePalette === "skill"
        ? filteredSkillItems.length > 0
        : activePalette === "macro"
          ? filteredMacroItems.length > 0
          : activePalette === "command"
            ? filteredCommandItems.length > 0
            : false;
  if (paletteHasAcceptedItems) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  void submitCurrentMessage(
    isSteerOrQueueMode
      ? steerQueueEnterAction
      : undefined,
  );
}
