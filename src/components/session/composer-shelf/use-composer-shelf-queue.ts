import { useLayoutEffect, useMemo, useRef } from "react";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";
import type { QueuePauseReason } from "@/store/task-work-pause";
import type {
  PromptDraftQueuedNextTurn,
  PromptDraftQueuedTurn,
} from "@/types/chat";
import {
  resolveQueuedTurnActions,
  resolveVisibleQueuedTurns,
} from "./composer-shelf.utils";
import type { ComposerShelfQueueProps, QueuedTurnMove } from "./ShelfQueue";

interface QueueHandlers {
  onSteer: (itemId: string) => void;
  onSend: (itemId: string) => void;
  onUpdate: (args: { itemId: string; content: string }) => void;
  onRemove: (itemId: string) => void;
  onClearAll: () => void;
  onReorder: (move: QueuedTurnMove) => void;
  onResume: () => void;
}

/**
 * The shelf's queue props, stable while the queue itself is unchanged.
 *
 * The composer re-renders on every keystroke and every provider flush, and its
 * queue handlers are recreated each time. They are read through a ref here, so
 * the memoized shelf only re-renders when the queue, its actions or the model
 * selection change.
 */
export function useComposerShelfQueue(
  args: QueueHandlers & {
    listId: string;
    queuedTurns: readonly PromptDraftQueuedTurn[];
    queuedNextTurn: PromptDraftQueuedNextTurn | null;
    submitMode: "send" | "queue-next" | "steer-or-queue";
    disabled: boolean;
    isTurnActive: boolean;
    canSteerQueuedTurn: boolean;
    selectedModel: ModelSelectorOption;
    modelOptions: readonly ModelSelectorOption[];
    pause: QueuePauseReason | null;
  },
): ComposerShelfQueueProps | null {
  const handlersRef = useRef<QueueHandlers>(args);
  useLayoutEffect(() => {
    handlersRef.current = args;
  });
  const handlers = useMemo<QueueHandlers>(
    () => ({
      onSteer: (itemId) => handlersRef.current.onSteer(itemId),
      onSend: (itemId) => handlersRef.current.onSend(itemId),
      onUpdate: (update) => handlersRef.current.onUpdate(update),
      onRemove: (itemId) => handlersRef.current.onRemove(itemId),
      onClearAll: () => handlersRef.current.onClearAll(),
      onReorder: (move) => handlersRef.current.onReorder(move),
      onResume: () => handlersRef.current.onResume(),
    }),
    [],
  );
  const items = useMemo(
    () =>
      resolveVisibleQueuedTurns({
        queuedTurns: args.queuedTurns,
        queuedNextTurn: args.queuedNextTurn,
      }),
    [args.queuedNextTurn, args.queuedTurns],
  );
  const { canSteer, canSend } = resolveQueuedTurnActions({
    submitMode: args.submitMode,
    disabled: args.disabled,
    isTurnActive: args.isTurnActive,
    canSteerQueuedTurn: args.canSteerQueuedTurn,
    storedCount: args.queuedTurns.length,
    hasSteerHandler: true,
    hasSendHandler: true,
  });
  const { listId, selectedModel, modelOptions, isTurnActive, pause } = args;
  return useMemo(
    () =>
      items.length === 0
        ? null
        : {
            listId,
            items,
            actions: { canSteer, canSend },
            isTurnActive,
            selectedModel,
            modelOptions,
            pause,
            ...handlers,
          },
    [canSend, canSteer, handlers, isTurnActive, items, listId, modelOptions, pause, selectedModel],
  );
}
