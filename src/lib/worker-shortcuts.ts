export type WorkerShortcutAction = "toggle" | "picker";

/**
 * Alt is the composer's modifier for model-adjacent controls (`Alt+P` opens the
 * model selector, `Alt+A` arms the Advisor, `Alt+1..0` pick a slot), so Worker
 * mode joins that family on `Alt+W`.
 *
 * Matching on `code` matters more than usual: on macOS `Option+W` produces "∑"
 * in `event.key`, so a key-only check would miss the binding on exactly the
 * platform where the composer is used most.
 */
export function resolveWorkerShortcutAction(event: {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): WorkerShortcutAction | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }
  const isWKey = event.code === "KeyW" || event.key.toLowerCase() === "w";
  if (!isWKey) {
    return null;
  }
  // Shift escalates from "just flip it" to "let me choose", the same split the
  // pill draws between its toggle half and its chevron.
  return event.shiftKey ? "picker" : "toggle";
}

export const WORKER_TOGGLE_SHORTCUT_LABEL = "Alt+W";
export const WORKER_PICKER_SHORTCUT_LABEL = "Alt+Shift+W";
