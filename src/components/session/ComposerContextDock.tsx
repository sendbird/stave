import { i18n, useTranslation } from "@/i18n";
import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { PromptInputContextMeter } from "@/components/ai-elements/prompt-input-context-meter";
import {
  providerOffersConversationCompact,
  resolveLatestConversationContextUsage,
} from "@/components/ai-elements/prompt-input.utils";
import { toast } from "@/components/ui";
import type { ChatMessage } from "@/types/chat";
import { readClaudeContextUsageCached } from "@/lib/providers/claude-context-breakdown";
import type { ClaudeContextUsageResponse } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import { resolveTaskWorkspaceContext } from "@/store/repository.utils";

const EMPTY_MESSAGES: readonly ChatMessage[] = [];

/**
 * Reads the fixed parts of a Claude conversation's context for the meter's
 * popover. Called only when the popover opens. The read starts a short-lived
 * Claude process in the task's folder, on the model and account the measured
 * turn used, and is cached per task, model, account and folder.
 */
function loadClaudeContextBreakdown(args: {
  taskId: string;
  messageId: string;
}): Promise<ClaudeContextUsageResponse> {
  const state = useAppStore.getState();
  const getClaudeContextUsage = window.api?.provider?.getClaudeContextUsage;
  if (!getClaudeContextUsage) {
    // i18n-ignore: diagnostic detail; the popover shows its own copy
    return Promise.resolve({ ok: false, detail: "unavailable" });
  }
  const message = state.messagesByTask[args.taskId]?.find((entry) => entry.id === args.messageId);
  const model = message?.model || state.settings.modelClaude;
  const accountProfileId = message?.nativeAccountProfileId ?? state.settings.claudeAccountProfileId;
  const { cwd } = resolveTaskWorkspaceContext({
    taskId: args.taskId,
    activeWorkspaceId: state.activeWorkspaceId,
    taskWorkspaceIdById: state.taskWorkspaceIdById,
    workspacePathById: state.workspacePathById,
    workspaceDefaultById: state.workspaceDefaultById,
    repositoryPath: state.repositoryPath,
  });
  if (!cwd) {
    // i18n-ignore: diagnostic detail; the popover shows its own copy
    return Promise.resolve({ ok: false, detail: "no workspace folder" });
  }
  const runtimeOptions = buildProviderRuntimeOptions({
    provider: "claude-code",
    model,
    settings: { ...state.settings, claudeAccountProfileId: accountProfileId },
    // A new session: the read must never resume or touch the task's own.
    providerSession: null,
  });
  return readClaudeContextUsageCached(
    [args.taskId, model, accountProfileId ?? "", cwd].join("\u0000"),
    () => getClaudeContextUsage({ cwd, runtimeOptions }),
  );
}

export function ComposerContextDock() {
  useTranslation();
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
        toast.error(i18n.t("session:composerContextDock.copy"), {
          description: i18n.t("session:composerContextDock.description"),
        });
      }
    } finally {
      setCompactPending(false);
    }
  }, [activeTaskId, compactPending, sendUserMessage, i18n.language]);

  const usageMessageId = usage?.messageId;
  const loadBreakdown = useMemo(
    () =>
      activeTaskId && usageMessageId && providerId === "claude-code"
        ? () => loadClaudeContextBreakdown({ taskId: activeTaskId, messageId: usageMessageId })
        : undefined,
    [activeTaskId, providerId, usageMessageId],
  );

  if (!usage) {
    return null;
  }

  return (
    <PromptInputContextMeter
      /* One meter per conversation, so switching tasks is not a boundary
         crossing and a measured composition never leaks across tasks. */
      key={activeTaskId ?? "draft"}
      providerId={providerId}
      loadBreakdown={loadBreakdown}
      usage={usage}
      compactAvailable={compactAvailable}
      compactDisabled={isTurnActive}
      compactPending={compactPending}
      compactDisabledReason={
        isTurnActive ? i18n.t("session:composerContextDock.extraCopy90") : undefined
      }
      onCompact={() => {
        void onCompact();
      }}
    />
  );
}
