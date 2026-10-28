import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import type { ApprovalPart } from "@/types/chat";
import {
  shouldHandleApprovalEnterShortcut,
  shouldHandleApprovalTabShortcut,
} from "./chat-input.utils";

/**
 * Keys for the latest pending approval of the composer's task: Enter allows it
 * and Tab opens its guidance draft.
 *
 * They work window-wide, except in an editor or a control, and are off with
 * the composer's other window keys (another task is active, or Review hides
 * it). The returned handler gives the composer's own editor the same keys
 * while it is empty; it is `null` when no approval is pending.
 */
export function useApprovalWindowShortcuts(args: {
  taskId: string;
  enabled: boolean;
  pendingApproval: { messageId: string; part: ApprovalPart } | null;
  resolveApproval: AppState["resolveApproval"];
  /** The composer's guidance-focus counter; Tab bumps it to open the draft. */
  setGuidanceFocusNonce: Dispatch<SetStateAction<number>>;
}): ((key: "Enter" | "Tab") => boolean) | null {
  const { taskId, enabled, pendingApproval, resolveApproval, setGuidanceFocusNonce } =
    args;
  const handleApprovalKey = useCallback(
    (key: "Enter" | "Tab") => {
      if (!pendingApproval) {
        return false;
      }
      if (key === "Tab") {
        setGuidanceFocusNonce((current) => current + 1);
        return true;
      }
      void resolveApproval({
        taskId,
        messageId: pendingApproval.messageId,
        requestId: pendingApproval.part.requestId,
        approved: true,
      });
      return true;
    },
    [taskId, pendingApproval, resolveApproval, setGuidanceFocusNonce],
  );

  useEffect(() => {
    if (!pendingApproval || !enabled) {
      return;
    }

    const handleApprovalShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      // Window-level Enter/Tab approval shortcuts act on the GLOBAL active
      // task; other visible split panels with their own pending approvals
      // must not also resolve them.
      if (useAppStore.getState().activeTaskId !== taskId) {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const shortcutArgs = {
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isComposing: event.isComposing,
        targetTagName: target?.tagName,
        targetRole: target?.getAttribute("role"),
        targetIsContentEditable: target?.isContentEditable,
      };
      const key = shouldHandleApprovalTabShortcut(shortcutArgs)
        ? "Tab"
        : shouldHandleApprovalEnterShortcut(shortcutArgs)
          ? "Enter"
          : null;
      if (key && handleApprovalKey(key)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleApprovalShortcut);
    return () => window.removeEventListener("keydown", handleApprovalShortcut);
  }, [taskId, enabled, pendingApproval, handleApprovalKey]);

  return pendingApproval ? handleApprovalKey : null;
}
