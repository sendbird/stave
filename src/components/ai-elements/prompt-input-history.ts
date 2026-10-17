import { type RefObject, useEffect, useMemo, useState } from "react";
import {
  isPromptHistoryBoundaryReached,
  navigatePromptHistory,
  NO_PROMPT_HISTORY_SELECTION,
} from "./prompt-input.utils";
import type { PromptLexicalEditorHandle } from "./prompt-lexical-editor";

/**
 * Arrow-key prompt history: the selected entry, the draft it replaced, and
 * the navigation that swaps the draft for an entry once the caret is at the
 * first or last line.
 */
export function usePromptInputHistory(args: {
  promptHistoryEntries?: readonly string[];
  focusToken?: string;
  value: string;
  valueRef: RefObject<string>;
  promptEditorRef: RefObject<PromptLexicalEditorHandle | null>;
  onValueChange: (value: string) => void;
  restoreComposerSelection: (nextCaretIndex: number) => void;
}) {
  const {
    promptHistoryEntries,
    focusToken,
    value,
    valueRef,
    promptEditorRef,
    onValueChange,
    restoreComposerSelection,
  } = args;
  const [selectedPromptHistoryIndex, setSelectedPromptHistoryIndex] = useState(
    NO_PROMPT_HISTORY_SELECTION,
  );
  const [draftBeforeHistory, setDraftBeforeHistory] = useState("");
  const normalizedPromptHistoryEntries = useMemo(
    () =>
      (promptHistoryEntries ?? []).filter((entry) => entry.trim().length > 0),
    [promptHistoryEntries],
  );

  useEffect(() => {
    setSelectedPromptHistoryIndex(NO_PROMPT_HISTORY_SELECTION);
    setDraftBeforeHistory("");
  }, [focusToken]);

  useEffect(() => {
    if (selectedPromptHistoryIndex === NO_PROMPT_HISTORY_SELECTION) {
      return;
    }
    if (normalizedPromptHistoryEntries.length === 0) {
      setSelectedPromptHistoryIndex(NO_PROMPT_HISTORY_SELECTION);
      setDraftBeforeHistory("");
      return;
    }
    if (selectedPromptHistoryIndex >= normalizedPromptHistoryEntries.length) {
      setSelectedPromptHistoryIndex(normalizedPromptHistoryEntries.length - 1);
    }
  }, [normalizedPromptHistoryEntries.length, selectedPromptHistoryIndex]);

  function applyPromptHistoryNavigation(direction: "previous" | "next") {
    const editor = promptEditorRef.current;
    const shouldUseBoundaryCheck =
      selectedPromptHistoryIndex === NO_PROMPT_HISTORY_SELECTION;

    if (shouldUseBoundaryCheck) {
      if (!editor) {
        return false;
      }
      const selection = editor.getSelectionRange();
      const boundaryReached = isPromptHistoryBoundaryReached({
        value,
        selectionStart: selection.start,
        selectionEnd: selection.end,
        direction,
      });
      if (!boundaryReached) {
        return false;
      }
    }

    const navigation = navigatePromptHistory({
      entries: normalizedPromptHistoryEntries,
      selectedIndex: selectedPromptHistoryIndex,
      direction,
      draftBeforeHistory,
      currentValue: value,
    });
    if (!navigation) {
      return false;
    }

    onValueChange(navigation.value);
    valueRef.current = navigation.value;
    setSelectedPromptHistoryIndex(navigation.selectedIndex);
    setDraftBeforeHistory(navigation.draftBeforeHistory);
    const nextCaretIndex = navigation.value.length;
    restoreComposerSelection(nextCaretIndex);
    return true;
  }

  return {
    setSelectedPromptHistoryIndex,
    setDraftBeforeHistory,
    applyPromptHistoryNavigation,
  };
}
