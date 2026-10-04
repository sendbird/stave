import { useCallback, useMemo, useState } from "react";
import { toast } from "@/components/ui";
import { useDelegatedTasks } from "@/components/session/useDelegatedTasks";
import { useNow } from "@/components/agent-runs/useAgentRun";
import {
  isReviewDelegation,
  selectCarriedTaskContextKey,
  selectDraftTaskContextKey,
  selectReviewShelfItems,
  splitTaskIds,
  type ReviewShelfItem,
} from "@/lib/reviews/review-task";
import { isActiveDelegatedTaskPhase } from "@/lib/runs/delegated-task";
import { buildDelegatedTaskExpectedIdentity } from "@/lib/runs/delegated-task-view";
import { useAppStore } from "@/store/app.store";
import { useComposerShelfStore } from "@/store/composer-shelf-store";
import { attachReviewResultToDraft } from "@/store/review-task-runtime";

const NO_KEYS: readonly string[] = [];

export interface ShelfReviewActions {
  attach: (item: ReviewShelfItem) => void;
  open: (item: ReviewShelfItem) => void;
  stop: (item: ReviewShelfItem) => void;
  dismiss: (item: ReviewShelfItem) => void;
}

/**
 * The reviews a task started from its composer, as shelf rows, with the
 * controls each row offers. Rows come from the delegation ledger, so a review
 * that outlives a restart still shows; what the user dismissed lasts for the
 * session only. Every selector returns a primitive: the shelf must not
 * re-render on each keystroke or streamed token.
 */
export function useShelfReviews(taskId: string) {
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const listing = useDelegatedTasks({ parentTaskId: taskId });
  const historyLoaded = useAppStore((state) => state.messagesByTask[taskId] !== undefined);
  const carriedKey = useAppStore((state) =>
    selectCarriedTaskContextKey(state.messagesByTask[taskId] ?? []),
  );
  const attachedKey = useAppStore((state) =>
    selectDraftTaskContextKey(state.promptDraftByTask[taskId]),
  );
  const dismissedKeys = useComposerShelfStore(
    (state) => state.dismissedReviewKeysByTask[taskId] ?? NO_KEYS,
  );
  // A finished review leaves after a day even when nothing else changes; a
  // slow clock is enough for that, and it only runs while one is waiting.
  const hasSettledReview = listing.children.some(
    (child) => isReviewDelegation(child) && !isActiveDelegatedTaskPhase(child.phase),
  );
  const now = useNow(hasSettledReview, 5 * 60_000);
  const items = useMemo(
    () =>
      selectReviewShelfItems({
        children: listing.children,
        dismissedKeys: new Set(dismissedKeys),
        carriedTaskIds: splitTaskIds(carriedKey),
        now,
        historyLoaded,
      }),
    [carriedKey, dismissedKeys, historyLoaded, listing.children, now],
  );
  const attachedTaskIds = useMemo(() => splitTaskIds(attachedKey), [attachedKey]);
  // The review open in the dialog, per task. It follows its row while the row
  // is on the shelf, so a running review settles in place, and keeps the last
  // copy once the row leaves (sent, dismissed or expired).
  const [viewingState, setViewingState] = useState<{
    taskId: string;
    item: ReviewShelfItem;
  } | null>(null);
  const viewingSnapshot = viewingState?.taskId === taskId ? viewingState.item : null;
  const viewing = viewingSnapshot
    ? (items.find((item) => item.child.delegationKey === viewingSnapshot.child.delegationKey) ??
      viewingSnapshot)
    : null;
  const view = useCallback(
    (item: ReviewShelfItem) => setViewingState({ taskId, item }),
    [taskId],
  );
  const closeView = useCallback(() => setViewingState(null), []);

  const stopDelegation = listing.actions.stop;
  const attach = useCallback(
    (item: ReviewShelfItem) => {
      const result = attachReviewResultToDraft({
        getState: useAppStore.getState,
        taskId,
        child: item.child,
      });
      if (result === "unchanged") {
        toast.error("Could not attach the review", {
          description: "It is already attached, or the message already has five tasks attached.",
        });
        return;
      }
      // The findings are ready to send; put the cursor where the request is.
      useAppStore.setState((state) => ({ promptFocusNonce: state.promptFocusNonce + 1 }));
    },
    [taskId],
  );
  const open = useCallback(
    (item: ReviewShelfItem) => {
      void useAppStore.getState().focusTaskAttention({
        taskId: item.child.delegatedTaskId,
        workspaceId: item.child.delegatedWorkspaceId,
        repositoryPath: repositoryPath ?? undefined,
        refreshFromPersistence: true,
      });
    },
    [repositoryPath],
  );
  const stop = useCallback(
    (item: ReviewShelfItem) => {
      void stopDelegation({
        delegationKey: item.child.delegationKey,
        expected: buildDelegatedTaskExpectedIdentity(item.child),
      }).then((result) => {
        if (!result.ok && result.error) {
          toast.error("Could not stop the review", { description: result.error });
        }
      });
    },
    [stopDelegation],
  );
  const dismiss = useCallback(
    (item: ReviewShelfItem) =>
      useComposerShelfStore
        .getState()
        .dismissReview({ taskId, delegationKey: item.child.delegationKey }),
    [taskId],
  );
  const actions = useMemo<ShelfReviewActions>(
    () => ({ attach, open, stop, dismiss }),
    [attach, dismiss, open, stop],
  );
  return { items, attachedTaskIds, actions, viewing, view, closeView };
}
