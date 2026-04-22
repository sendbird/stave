import type { CommandPaletteItem } from "@/lib/commands";

export const NO_COMMAND_SELECTION = -1;
export const NO_PROMPT_HISTORY_SELECTION = -1;

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
