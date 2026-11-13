import type { TarsActionRecord, TarsConversation, TarsMessage } from "../src/lib/tars/conversation";
import { tarsWorkspaceRecordId } from "../src/lib/tars/workspace-action";

export function workspaceConversationFixture(korean = false): TarsConversation {
  const at = "2026-11-12T00:00:00.000Z";
  const action = { kind: "workspace" as const, workspaceId: "source", operation: "addTodo" as const,
    text: korean ? "릴리스 검사 결과와 회귀 테스트를 확인하고 배포 준비 내용을 정리하기" : "Verify release checks and regression coverage, then organize the release preparation notes" };
  const message: TarsMessage = { id: "workspace-edit", requestId: "user-request", text: korean ? "할 일을 추가해줘" : "Track this todo", ...{ providerId: "codex", model: "test", maxTurns: 6 } as const,
    state: "answered", reply: korean ? "정보 패널에 기록했습니다." : "Recorded in the Information panel.",
    decision: { reply: korean ? "정보 패널에 기록했습니다." : "Recorded in the Information panel.", actions: [action] },
    error: null, revision: 3, createdAt: at, updatedAt: at };
  const record: TarsActionRecord = { requestId: tarsWorkspaceRecordId(message.id, 0), requestHash: "a".repeat(64), source: "words", action,
    status: "applied", error: null, reason: null, revision: 1, createdAt: at, updatedAt: at,
    undo: { kind: "workspace", workspaceName: korean ? "릴리스" : "Release", repositoryPath: "/tmp/project", before: "{}", after: "{}" } };
  return { settings: null, messages: [message], activity: [], records: [record], receipts: [{ messageId: message.id, actionIndex: 0,
    requestHash: record.requestHash, action, status: "applied", responsibilityId: null, error: null, reason: null,
    revision: 2, createdAt: at, updatedAt: at }] };
}
