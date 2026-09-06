import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { PromptInputContextMeter } from "@/components/ai-elements/prompt-input-context-meter";
import {
  providerOffersConversationCompact,
  resolveLatestConversationContextUsage,
} from "@/components/ai-elements/prompt-input.utils";
import { toast } from "@/components/ui";
import type { ChatMessage } from "@/types/chat";
import { useAppStore } from "@/store/app.store";

const EMPTY_MESSAGES: readonly ChatMessage[] = [];

export function ComposerContextDock() {
  const [activeTaskId, messages, isTurnActive, providerId, sendUserMessage] =
    useAppStore(
      useShallow((state) => {
        const taskId = state.activeTaskId;
        const task = taskId
          ? state.tasks.find((entry) => entry.id === taskId)
          : null;
        return [
          taskId,
          taskId
            ? (state.messagesByTask[taskId] ?? EMPTY_MESSAGES)
            : EMPTY_MESSAGES,
          taskId ? Boolean(state.activeTurnIdsByTask[taskId]) : false,
          task?.provider ?? state.draftProvider,
          state.sendUserMessage,
        ] as const;
      }),
    );

  const usage = useMemo(
    () => resolveLatestConversationContextUsage(messages, providerId),
    [messages, providerId],
  );
  const compactAvailable = providerOffersConversationCompact({
    providerId,
  });
  const [compactPending, setCompactPending] = useState(false);

  const onCompact = useCallback(async () => {
    if (!activeTaskId || compactPending) {
      return;
    }
    setCompactPending(true);
    try {
      const result = await sendUserMessage({
        taskId: activeTaskId,
        content: "/compact",
        preservePromptDraft: true,
        turnOrigin: "utility",
      });
      if (result.status === "blocked") {
        toast.error("Could not compact context", {
          description: "Finish the pending task interaction and try again.",
        });
      }
    } finally {
      setCompactPending(false);
    }
  }, [activeTaskId, compactPending, sendUserMessage]);

  if (!usage) {
    return null;
  }

  return (
    <PromptInputContextMeter
      usage={usage}
      compactAvailable={compactAvailable}
      compactDisabled={isTurnActive}
      compactPending={compactPending}
      compactDisabledReason={
        isTurnActive ? "Wait for the current turn to finish." : undefined
      }
      onCompact={() => {
        void onCompact();
      }}
    />
  );
}
