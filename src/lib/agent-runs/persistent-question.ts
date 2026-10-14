import type { AgentRunStageIdentity } from "./domain";

/** Ending a native callback to wait is not a user Stop or stage completion. */
export const RUN_QUESTION_WAIT_STOP_REASON = "awaiting_user_input";

const PREFIX = "run-question:";

/** The native callback and persisted card share one Run-scoped identity. */
export function runQuestionRequestId(stage: AgentRunStageIdentity | undefined, requestId: string, turnId?: string): string {
  // App Server request ids may be reused by a new native process. A reply
  // must never accidentally answer a later question in the same stage.
  const nativeId = turnId ? `${turnId}:${requestId}` : requestId;
  return stage ? `${PREFIX}${stage.agentRunId}:${stage.stageId}:${stage.attempt}:${nativeId}` : requestId;
}

export function runQuestionStage(requestId: string): AgentRunStageIdentity | null {
  if (!requestId.startsWith(PREFIX)) return null;
  const [agentRunId, stageId, ordinal] = requestId.slice(PREFIX.length).split(":", 3);
  const attempt = Number(ordinal);
  return agentRunId && stageId && Number.isSafeInteger(attempt) && attempt > 0
    ? { agentRunId, stageId, attempt } : null;
}
