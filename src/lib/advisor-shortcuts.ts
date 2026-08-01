/**
 * Keyboard shortcuts for the composer's Advisor control.
 *
 * Pure resolver so the binding is testable without a DOM, matching the other
 * `*-shortcuts` modules. The control itself owns the listener rather than
 * `PromptInput`, which keeps the Advisor out of that component's prop surface.
 */

export type AdvisorShortcutAction = "toggle" | "picker";

/**
 * Alt is the composer's modifier for model-adjacent controls (`Alt+P` opens the
 * model selector, `Alt+1..0` pick a slot), so the Advisor joins that family.
 *
 * Matching on `code` matters more than usual here: on macOS `Option+A` produces
 * "å" in `event.key`, so a key-only check would miss the binding on exactly the
 * platform where the composer is used most.
 */
export function resolveAdvisorShortcutAction(event: {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): AdvisorShortcutAction | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }
  const isAKey = event.code === "KeyA" || event.key.toLowerCase() === "a";
  if (!isAKey) {
    return null;
  }
  // Shift escalates from "just flip it" to "let me choose", the same split the
  // pill draws between its toggle half and its chevron.
  return event.shiftKey ? "picker" : "toggle";
}

export const ADVISOR_TOGGLE_SHORTCUT_LABEL = "Alt+A";
export const ADVISOR_PICKER_SHORTCUT_LABEL = "Alt+Shift+A";
