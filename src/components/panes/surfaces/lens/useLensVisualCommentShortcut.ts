import { useEffect, useRef, type RefObject } from "react";
import { isEditableShortcutTarget } from "@/components/layout/app-shell.shortcuts";
import {
  DEFAULT_VISUAL_COMMENT_SHORTCUT,
  isVisualCommentShortcut,
  type VisualCommentShortcut,
} from "@/lib/visual-comment-shortcuts";
import { useAppStore } from "@/store/app.store";

/**
 * Lens sessions whose surface panel is currently on screen.
 *
 * Dockview keeps every Lens tab mounted, so a window-level key event is seen by
 * every panel at once. This is the tiebreak set: the active Lens panel claims
 * the shortcut, and with no active one it goes to the first *visible* tab in
 * store order.
 */
const visibleLensSessionIds = new Set<string>();

/**
 * The visual-comment shortcut, arbitrated across mounted Lens panels.
 *
 * Two independent paths reach the same action, and both survive the move to a
 * DOM-hosted guest:
 *
 * - The app holds focus: a window `keydown` listener, one per mounted panel,
 *   which is why exactly one of them has to claim the event.
 * - The page holds focus: main's `before-input-event` on the guest relays it
 *   with a session id already attached. A `<webview>` guest is a separate frame
 *   tree with its own focus, so keys pressed in the page are never delivered to
 *   the host document — the relay is a property of embedding a page, not of the
 *   old compositing model.
 */
export function useLensVisualCommentShortcut(args: {
  lensSessionId: string;
  enabled: boolean;
  isPanelVisible: boolean;
  isPanelActiveRef: RefObject<boolean>;
  visualCommentShortcut: VisualCommentShortcut;
  onTrigger: () => void;
}): void {
  const {
    lensSessionId,
    enabled,
    isPanelVisible,
    isPanelActiveRef,
    visualCommentShortcut,
    onTrigger,
  } = args;

  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  useEffect(() => {
    if (isPanelVisible) {
      visibleLensSessionIds.add(lensSessionId);
    } else {
      visibleLensSessionIds.delete(lensSessionId);
    }
    return () => {
      visibleLensSessionIds.delete(lensSessionId);
    };
  }, [isPanelVisible, lensSessionId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) {
        return;
      }
      if (
        !isVisualCommentShortcut({
          shortcut: visualCommentShortcut ?? DEFAULT_VISUAL_COMMENT_SHORTCUT,
          key: event.key,
          code: event.code,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          isComposing: event.isComposing,
        })
      ) {
        return;
      }
      if (!isPanelActiveRef.current) {
        const state = useAppStore.getState();
        const activePanelSessionId =
          state.activeSurface.kind === "lens"
            ? state.activeSurface.lensSessionId
            : null;
        if (activePanelSessionId) {
          if (activePanelSessionId !== lensSessionId) {
            return;
          }
        } else {
          const firstVisible = state.lensTabs.find((tab) =>
            visibleLensSessionIds.has(tab.id),
          );
          if (firstVisible?.id !== lensSessionId) {
            return;
          }
        }
      }
      event.preventDefault();
      onTriggerRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, isPanelActiveRef, lensSessionId, visualCommentShortcut]);
}
