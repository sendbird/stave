import type { CommandPaletteItem } from "@/lib/commands";

export const NO_COMMAND_SELECTION = -1;
export const NO_PROMPT_HISTORY_SELECTION = -1;
const PROMPT_ENHANCEMENT_REVEAL_MIN_DURATION_MS = 220;
const PROMPT_ENHANCEMENT_REVEAL_MAX_DURATION_MS = 560;
const PROMPT_ENHANCEMENT_REVEAL_MS_PER_CHARACTER = 10;

export function getPromptEnhancementRevealDurationMs(characterCount: number) {
  return Math.min(
    PROMPT_ENHANCEMENT_REVEAL_MAX_DURATION_MS,
    Math.max(
      PROMPT_ENHANCEMENT_REVEAL_MIN_DURATION_MS,
      characterCount * PROMPT_ENHANCEMENT_REVEAL_MS_PER_CHARACTER,
    ),
  );
}

export function getPromptEnhancementRevealText(
  text: string,
  progress: number,
) {
  if (progress <= 0 || !text) {
    return "";
  }
  if (progress >= 1) {
    return text;
  }

  const characters = Array.from(text);
  const visibleCharacterCount = Math.max(
    1,
    Math.floor(characters.length * progress),
  );
  return characters.slice(0, visibleCharacterCount).join("");
}

/**
 * Picks the text the prompt editor should render.
 *
 * The editor is a controlled component, so this must return the live `value`
 * verbatim whenever an enhancement reveal is not running. Returning a value
 * that lags behind the user's keystrokes makes the editor rewrite its own
 * content mid-input, which breaks IME (e.g. Hangul) composition and moves the
 * caret to the end of the draft.
 */
export function resolvePromptEnhancementDisplayText(args: {
  revealing: boolean;
  revealedText: string | null;
  value: string;
}) {
  if (!args.revealing || args.revealedText === null) {
    return args.value;
  }
  return args.revealedText;
}

/**
 * Returns the `scrollTop` that keeps the tail of the prompt in view.
 *
 * Lexical only reconciles the DOM selection - and therefore only scrolls the
 * caret into view - while `editor.isEditable()` is true. The editor is held
 * non-editable for the whole enhancement reveal, so nothing scrolls the
 * growing text into view and a long enhanced prompt types itself off the
 * bottom of the box. Pinning the scroll offset manually restores that.
 */
export function getPromptRevealScrollTop(args: {
  scrollHeight: number;
  clientHeight: number;
}) {
  return Math.max(0, args.scrollHeight - args.clientHeight);
}

export function getNextCommandSelectionIndex(args: {
  currentIndex: number;
  itemCount: number;
  direction: "next" | "previous";
}) {
  const { currentIndex, itemCount, direction } = args;
  if (itemCount <= 0) {
    return NO_COMMAND_SELECTION;
  }
  if (currentIndex === NO_COMMAND_SELECTION) {
    return direction === "next" ? 0 : itemCount - 1;
  }
  if (direction === "next") {
    return (currentIndex + 1) % itemCount;
  }
  return (currentIndex - 1 + itemCount) % itemCount;
}

export function getAcceptedCommandPaletteItem(args: {
  items: readonly CommandPaletteItem[];
  selectedIndex: number;
  triggerKey: "Enter" | "Tab";
}) {
  return getAcceptedPaletteItem(args);
}

export function getAcceptedPaletteItem<T>(args: {
  items: readonly T[];
  selectedIndex: number;
  triggerKey: "Enter" | "Tab";
}) {
  const { items, selectedIndex } = args;
  if (items.length === 0) {
    return null;
  }
  return items[selectedIndex] ?? items[0] ?? null;
}

export function isPromptHistoryBoundaryReached(args: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  direction: "previous" | "next";
}) {
  if (args.selectionStart !== args.selectionEnd) {
    return false;
  }
  if (args.direction === "previous") {
    return !args.value.slice(0, args.selectionStart).includes("\n");
  }
  return !args.value.slice(args.selectionEnd).includes("\n");
}

export function navigatePromptHistory(args: {
  entries: readonly string[];
  selectedIndex: number;
  direction: "previous" | "next";
  draftBeforeHistory: string;
  currentValue: string;
}) {
  const { entries, selectedIndex, direction, draftBeforeHistory, currentValue } = args;
  if (entries.length === 0) {
    return null;
  }

  if (direction === "previous") {
    if (selectedIndex === NO_PROMPT_HISTORY_SELECTION) {
      const nextIndex = entries.length - 1;
      return {
        selectedIndex: nextIndex,
        value: entries[nextIndex] ?? currentValue,
        draftBeforeHistory: currentValue,
      };
    }
    if (selectedIndex <= 0) {
      return null;
    }
    const nextIndex = selectedIndex - 1;
    return {
      selectedIndex: nextIndex,
      value: entries[nextIndex] ?? currentValue,
      draftBeforeHistory,
    };
  }

  if (selectedIndex === NO_PROMPT_HISTORY_SELECTION) {
    return null;
  }
  if (selectedIndex >= entries.length - 1) {
    return {
      selectedIndex: NO_PROMPT_HISTORY_SELECTION,
      value: draftBeforeHistory,
      draftBeforeHistory: "",
    };
  }
  const nextIndex = selectedIndex + 1;
  return {
    selectedIndex: nextIndex,
    value: entries[nextIndex] ?? currentValue,
    draftBeforeHistory,
  };
}
