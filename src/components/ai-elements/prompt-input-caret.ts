import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  PromptLexicalEditorHandle,
  PromptLexicalEditorSelectionRange,
} from "./prompt-lexical-editor";

/**
 * Tracks the composer caret and focus: the caret index the palettes read, the
 * selection range handed to the editor, whether focus is inside the editor,
 * and the effects that focus the editor on a new `focusToken` or when the turn
 * ends.
 */
export function usePromptInputCaret(args: {
  value: string;
  promptEditorRef: RefObject<PromptLexicalEditorHandle | null>;
  promptEnhancementRevealing: boolean;
  focusToken?: string;
  interactionsDisabled: boolean;
  isTurnActive?: boolean;
}) {
  const {
    value,
    promptEditorRef,
    promptEnhancementRevealing,
    focusToken,
    interactionsDisabled,
    isTurnActive,
  } = args;
  const [caretIndex, setCaretIndex] = useState(value.length);
  const editorSelectionRange = useMemo(
    () => ({ start: caretIndex, end: caretIndex }),
    [caretIndex],
  );
  // The enhanced draft replaces the whole document, so the caret the composer
  // was tracking no longer points anywhere meaningful; park it at the end,
  // which is where the user resumes typing once the reveal unlocks the editor.
  const promptEditorSelectionRange = useMemo(
    () =>
      promptEnhancementRevealing
        ? { start: value.length, end: value.length }
        : editorSelectionRange,
    [editorSelectionRange, promptEnhancementRevealing, value.length],
  );
  const [isPromptInputFocused, setIsPromptInputFocused] = useState(false);
  const caretIndexRef = useRef(caretIndex);
  const wasTurnActiveRef = useRef(Boolean(isTurnActive));
  caretIndexRef.current = caretIndex;

  useEffect(() => {
    if (interactionsDisabled) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      promptEditorRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusToken, interactionsDisabled]);

  useEffect(() => {
    const wasTurnActive = wasTurnActiveRef.current;
    const isTurnNowActive = Boolean(isTurnActive);
    if (wasTurnActive && !isTurnNowActive) {
      promptEditorRef.current?.focus();
    }
    wasTurnActiveRef.current = isTurnNowActive;
  }, [isTurnActive]);

  const focusComposer = useCallback(() => {
    const editor = promptEditorRef.current;
    if (!editor) {
      return;
    }
    editor.focus();
    const nextCaretIndex = value.length;
    editor.setSelectionRange(nextCaretIndex, nextCaretIndex);
    caretIndexRef.current = nextCaretIndex;
    setCaretIndex(nextCaretIndex);
  }, [value.length]);

  const syncComposerFocus = useCallback(() => {
    const rootElement = promptEditorRef.current?.getRootElement();
    setIsPromptInputFocused(
      typeof document !== "undefined" &&
        Boolean(
          rootElement &&
          document.activeElement &&
          rootElement.contains(document.activeElement),
        ),
    );
  }, []);

  function syncCaretPosition(
    nextRange?: PromptLexicalEditorSelectionRange | null,
  ) {
    const nextCaretIndex = nextRange?.end ?? 0;
    caretIndexRef.current = nextCaretIndex;
    setCaretIndex(nextCaretIndex);
  }

  function restoreComposerSelection(nextCaretIndex: number) {
    caretIndexRef.current = nextCaretIndex;
    setCaretIndex(nextCaretIndex);
    window.requestAnimationFrame(() => {
      const editor = promptEditorRef.current;
      if (!editor) {
        return;
      }
      editor.focus();
      editor.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });
  }

  function getLiveCaretIndex(currentValue: string) {
    const liveRange = promptEditorRef.current?.getSelectionRange();
    const nextCaretIndex = liveRange?.end ?? caretIndexRef.current;
    return Math.max(0, Math.min(nextCaretIndex, currentValue.length));
  }

  return {
    caretIndex,
    promptEditorSelectionRange,
    isPromptInputFocused,
    focusComposer,
    syncComposerFocus,
    syncCaretPosition,
    restoreComposerSelection,
    getLiveCaretIndex,
  };
}
