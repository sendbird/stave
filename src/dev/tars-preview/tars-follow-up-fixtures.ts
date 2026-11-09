import type { TarsMessage } from "@/lib/tars/conversation";
import type { TarsEvent } from "@/lib/tars/events";
import type { TarsFollowUpState, TarsResponsibility } from "@/lib/tars/types";

/**
 * Automatic follow-up for the preview and its e2e: blocked work Tars followed
 * up once, waiting work with its next check, and blocked work it did not
 * follow up because automatic turns reached the turn limit. Times count from `start`.
 */
export function buildTarsFollowUpFixtures(start: Date, korean: boolean) {
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  const base = (patch: Partial<TarsResponsibility> & Pick<TarsResponsibility, "id" | "title" | "state">): TarsResponsibility => ({
    requestId: `request-${patch.id}`, instruction: "Inspect the actual result.", acceptanceCriteria: ["The required checks pass on the reviewed revision."],
    workspaceId: "preview-workspace", executionWorkspaceId: `exec-${patch.id}`, repositoryPath: "/tmp/preview", providerId: "codex", model: null,
    agentId: null, priority: 50, maxTurns: 30, revision: 2, detail: null, taskId: `task-${patch.id}`, agentRunId: `run-${patch.id}`,
    reverifyAfter: null, createdAt: at(0), updatedAt: at(0), ...patch,
  });
  const blocked = base({ id: "follow-blocked", title: "Fix the flaky upload test", state: "blocked", revision: 3, updatedAt: at(2),
    detail: "The run stopped: the upload test still fails on CI." });
  const waiting = base({ id: "follow-waiting", title: "Migrate the settings store", state: "waiting", updatedAt: at(5),
    detail: "The execution task is waiting for your input or approval.", detailCode: "waitingForUser" });
  const exhausted = base({ id: "follow-exhausted", title: "Refresh the API reference", state: "blocked", revision: 4, updatedAt: at(6),
    detail: "The run stopped: the generator needs a newer schema." });
  const reply = korean
    ? "업로드 테스트가 CI에서 계속 실패해 작업이 멈췄습니다. 실패 로그를 먼저 확인한 뒤 다시 시도하길 권합니다. 이어갈지 정해 주세요."
    : "The upload test still fails on CI, so the work stopped. I suggest checking the failure log before trying again. Tell me whether to continue.";
  // i18n-ignore: model-facing text of the preview's automatic follow-up, never shown
  const text = "Automatic follow-up: a responsibility became blocked. Judge what it needs next.";
  const message: TarsMessage = { id: "message-follow-up", requestId: `followup:blocked:${blocked.id}:3`, text, providerId: "codex", model: "gpt-5.5",
    maxTurns: 30, revision: 3, state: "answered", reply, decision: { reply, actions: [] }, error: null,
    origin: { kind: "followUp", eventKey: `blocked:${blocked.id}:3`, responsibilityId: blocked.id, reason: "blocked", observedRevision: 3,
      summary: `${blocked.title} is blocked: ${blocked.detail}` },
    createdAt: at(3), updatedAt: at(3) };
  const events: TarsEvent[] = [
    { key: `blocked:${blocked.id}:3`, responsibilityId: blocked.id, kind: "blocked", episode: "3", observedRevision: 3, observedState: "blocked",
      attempt: blocked.agentRunId, status: "followedUp", messageId: message.id, createdAt: at(2), processedAt: at(3) },
    { key: `blocked:${exhausted.id}:4`, responsibilityId: exhausted.id, kind: "blocked", episode: "4", observedRevision: 4, observedState: "blocked",
      attempt: exhausted.agentRunId, status: "exhausted", messageId: null, createdAt: at(6), processedAt: at(7) },
  ];
  // The host reports the next check only while it is ahead; the preview keeps it an hour from opening.
  const nextCheck = new Date(Math.max(Date.now(), start.getTime()) + 55 * 60_000).toISOString();
  const followUps: TarsFollowUpState[] = [{ responsibilityId: exhausted.id, kind: "blocked", status: "exhausted", at: null },
    { responsibilityId: waiting.id, kind: "waitExpired", status: "nextCheck", at: nextCheck }];
  return { responsibilities: [blocked, waiting, exhausted], message, events, followUps };
}
