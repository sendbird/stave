import { useMemo } from "react";
import type { CompareRunVariant } from "@/lib/compare-runs";
import { describeCompareVariantProgress } from "@/lib/compare-run-progress";
import { buildTaskExecutionSummary } from "@/lib/fleet/task-execution-summary";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const NO_MESSAGES: ChatMessage[] = [];

export function useCompareVariantProgress(variant: CompareRunVariant) {
  const taskId = variant.taskId ?? null;
  const messages = useAppStore((state) => {
    if (!taskId || !variant.workspaceId) return undefined;
    return state.activeWorkspaceId === variant.workspaceId
      ? state.messagesByTask[taskId]
      : state.workspaceRuntimeCacheById[variant.workspaceId]?.messagesByTask[taskId];
  });
  const activity = useAppStore((state) => (taskId ? state.providerTurnActivityByTask[taskId] ?? null : null));
  return useMemo(() => {
    if (!taskId || (!messages && !activity)) return null;
    const summary = buildTaskExecutionSummary({ taskId, providerId: variant.provider, messages: messages ?? NO_MESSAGES, activity });
    const usage = summary.usage.value;
    return {
      ...describeCompareVariantProgress({ summary, activityStartedAt: activity?.completedAt == null ? activity?.startedAt : null }),
      usage: usage ? { inputTokens: usage.promptTokens, outputTokens: usage.outputTokens, totalCostUsd: usage.totalCostUsd ?? undefined } : undefined,
    };
  }, [activity, messages, taskId, variant.provider]);
}
