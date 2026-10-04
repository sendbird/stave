import { useMemo } from "react";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { resolveAgentRunPlan } from "@/lib/agent-runs/progress";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const EMPTY_MESSAGES: ChatMessage[] = [];

export function useAgentRunProgress(detail: AgentRunDetail | null | undefined) {
  const taskId = detail?.agentRun.leadTaskId ?? "";
  const workspaceId = detail?.agentRun.workspaceId ?? "";
  const messages = useAppStore((state) => state.messagesByTask[taskId] ?? state.workspaceRuntimeCacheById[workspaceId]?.messagesByTask[taskId] ?? EMPTY_MESSAGES);
  return useMemo(() => detail ? resolveAgentRunPlan(detail, messages) : null, [detail, messages]);
}
