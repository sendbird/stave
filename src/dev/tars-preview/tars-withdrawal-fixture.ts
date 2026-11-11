import type { TarsConversation } from "@/lib/tars/conversation";
import type { TarsSnapshot } from "@/lib/tars/types";

/** UI-only saved request for the existing Undo bridge; it never starts provider work. */
export function addTarsWithdrawalFixture(snapshot: TarsSnapshot, conversation: Pick<TarsConversation, "settings" | "records">,
  at: string, korean: boolean) {
  const id = "withdraw-work", requestId = "withdraw-request";
  if (!snapshot.responsibilities.some(row => row.id === id)) snapshot.responsibilities.push({ ...snapshot.responsibilities[0]!, id,
    requestId: "original-work", title: korean ? "기존 결과의 오류 표시 보완" : "Add error states to the existing result",
    instruction: "Preserve the original completed scope", acceptanceCriteria: ["Original result remains intact"],
    state: "completed", revision: 1, taskId: "withdraw-task", agentRunId: "withdraw-old-run", executionWorkspaceId: "withdraw-execution" });
  conversation.settings ??= { providerId: "codex", model: "preview", maxTurns: 30 };
  if (!conversation.records.some(record => record.requestId === requestId)) conversation.records.push({
    requestId, requestHash: "a".repeat(64), source: "click", action: { kind: "control", responsibilityId: id,
      expectedRevision: 1, operation: "message", input: { text: korean ? "그 작업의 오류 표시를 보완해 주세요." : "Add and verify error states in that work." } },
    status: "applied", error: null, reason: null, revision: 2, createdAt: at, updatedAt: at,
    undo: { kind: "delivery" }, delivery: { status: "queued", agentRunId: "withdraw-old-run", reason: null, error: null, queuedAt: at, updatedAt: at },
  });
}
