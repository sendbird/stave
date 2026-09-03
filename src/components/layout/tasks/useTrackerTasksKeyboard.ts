import { useEffect } from "react";

import { isEditableShortcutTarget } from "@/components/layout/app-shell.shortcuts";

export interface TrackerTasksKeyboardArgs {
  /** Visible row keys in display order. Empty disables movement. */
  orderedKeys: readonly string[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onKickoff: (key: string) => void;
  onOpenExternal: (key: string) => void;
  onRefresh: () => void;
  onFocusSearch: () => void;
  /** False while a sheet or dialog owns the keyboard. */
  enabled: boolean;
}

/**
 * List keyboard handling for the Tasks surface.
 *
 * Bound on `window` rather than on a focused container: the surface has no
 * single focusable owner (the toolbar, the list and the detail pane all take
 * focus), and requiring a click on the list first is the thing that makes
 * keyboard navigation feel broken. Editable targets are excluded first, so
 * typing `r` in the search box never triggers a refresh.
 */
export function useTrackerTasksKeyboard(args: TrackerTasksKeyboardArgs) {
  const {
    enabled,
    onFocusSearch,
    onKickoff,
    onOpenExternal,
    onRefresh,
    onSelect,
    orderedKeys,
    selectedKey,
  } = args;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) {
        return;
      }
      // Anything with a modifier belongs to the app-level shortcut table,
      // except the one chord this surface owns.
      const kickoffChord = (event.metaKey || event.ctrlKey) && event.key === "Enter";
      if (!kickoffChord && (event.metaKey || event.ctrlKey || event.altKey)) {
        return;
      }

      const index = selectedKey ? orderedKeys.indexOf(selectedKey) : -1;
      const move = (delta: number) => {
        if (orderedKeys.length === 0) {
          return;
        }
        const next =
          index === -1
            ? delta > 0
              ? 0
              : orderedKeys.length - 1
            : Math.min(Math.max(index + delta, 0), orderedKeys.length - 1);
        const key = orderedKeys[next];
        if (key) {
          event.preventDefault();
          onSelect(key);
        }
      };

      if (kickoffChord) {
        if (selectedKey) {
          event.preventDefault();
          onKickoff(selectedKey);
        }
        return;
      }

      switch (event.key) {
        case "j":
        case "ArrowDown":
          move(1);
          return;
        case "k":
        case "ArrowUp":
          move(-1);
          return;
        case "Enter":
          if (selectedKey) {
            event.preventDefault();
            onKickoff(selectedKey);
          }
          return;
        case "o":
          if (selectedKey) {
            event.preventDefault();
            onOpenExternal(selectedKey);
          }
          return;
        case "r":
          event.preventDefault();
          onRefresh();
          return;
        case "/":
          event.preventDefault();
          onFocusSearch();
          return;
        default:
          return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    enabled,
    onFocusSearch,
    onKickoff,
    onOpenExternal,
    onRefresh,
    onSelect,
    orderedKeys,
    selectedKey,
  ]);
}
