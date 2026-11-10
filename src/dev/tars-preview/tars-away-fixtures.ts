import { TARS_AWAY_INITIAL_STATE, TarsAwayStateSchema, mergeTarsAwayState, type TarsAwayState } from "@/lib/tars/away-state";
import type { TarsActionReceipt, TarsConversation, TarsMessage } from "@/lib/tars/conversation";
import type { TarsEvent } from "@/lib/tars/events";
import type { TarsPublishRecord } from "@/lib/tars/publication";
import type { TarsActivity, TarsResponsibility, TarsSnapshot, TarsState } from "@/lib/tars/types";

/** How long before the page opened the user "left", with `away=true`: every fixture change has happened by then. */
export const TARS_AWAY_PREVIEW_GAP_MS = 45 * 60_000;

type Step = { minute: number; state: TarsState; detail?: string | null; detailCode?: TarsResponsibility["detailCode"] };

/**
 * Work that goes on while the user is away, for the preview and its e2e:
 * `anchor` is the moment the user left. Before it, a request and one finished
 * piece of work whose draft pull request is still being opened; after it, work
 * that finishes, one piece that is blocked, one that ends unfinished, a
 * question from Tars that waits for the user, and the draft pull request
 * opening. `at(now)` is the saved state as of `now`, so with a moving clock
 * the changes arrive one by one. Nothing here runs.
 */
export function buildTarsAwayFixtures(anchor: Date, korean: boolean) {
  const at = (minute: number) => new Date(anchor.getTime() + minute * 60_000).toISOString();
  const start = -30;
  const work = (id: string, en: string, ko: string, steps: Step[]) => ({ id, title: korean ? ko : en, steps: [{ minute: start + 1, state: "running" as const }, ...steps] });
  const plan = [
    work("away-checkout", "Show the saved card first at checkout", "결제 화면에서 저장한 카드 먼저 보여 주기", [{ minute: -20, state: "completed" }]),
    work("away-export", "Add CSV export to the billing page", "청구 페이지에 CSV 내보내기 추가", [{ minute: 3, state: "completed" }]),
    work("away-upload", "Fix the flaky upload test", "간헐적으로 실패하는 업로드 테스트 고치기",
      [{ minute: 6, state: "blocked", detail: korean ? "실행이 멈췄습니다. 업로드 테스트가 CI에서 계속 실패합니다." : "The run stopped: the upload test still fails on CI." }]),
    work("away-release", "Verify the release candidate", "릴리스 후보 확인",
      [{ minute: 8, state: "waiting", detail: korean ? "실행 작업이 입력이나 승인을 기다립니다." : "The execution task is waiting for your input or approval.", detailCode: "waitingForUser" }]),
    work("away-docs", "Refresh the API reference examples", "API 레퍼런스 예제 새로 고치기", [{ minute: 12, state: "completed" }]),
    work("away-queue", "Move the export queue to the new worker", "내보내기 큐를 새 워커로 옮기기",
      [{ minute: 15, state: "cancelled", detail: korean ? "워커 이미지를 쓸 수 없었습니다." : "The worker image was not available." }]),
    work("away-keys", "Rotate the staging auth keys", "스테이징 인증 키 교체", [{ minute: 20, state: "completed" }]),
    work("away-webhook", "Add retries to the webhook sender", "웹훅 전송에 재시도 추가", [{ minute: 22, state: "completed" }]),
  ];
  const settings = { providerId: "codex" as const, model: "gpt-5.5", maxTurns: 30 };
  const request: TarsMessage = { id: "away-message-request", requestId: "away-request", ...settings, revision: 2, state: "answered", error: null,
    text: korean ? "회의 들어가 있는 동안 청구, 업로드, 릴리스 작업을 계속 진행해 줘." : "Keep the billing, upload and release work going while I am in meetings.",
    reply: korean ? "계속 진행하겠습니다. 결정이 필요한 일이 생기면 여기에 남겨 둘게요." : "I will keep them moving and leave anything that needs your decision here.",
    decision: { reply: korean ? "계속 진행하겠습니다. 결정이 필요한 일이 생기면 여기에 남겨 둘게요." : "I will keep them moving and leave anything that needs your decision here.", actions: [] },
    createdAt: at(start), updatedAt: at(start) };
  const askReply = korean ? "릴리스 후보 확인이 스테이징 배포 승인에서 멈췄습니다. 어떻게 할지 골라 주세요."
    : "The release check stopped at the staging deploy approval. Choose how to continue.";
  const ask = { kind: "ask" as const, recommended: 0,
    question: korean ? "스테이징 배포를 승인하고 릴리스 확인을 이어갈까요?" : "Should I approve the staging deploy and continue the release check?",
    options: [
      { label: korean ? "승인하고 계속" : "Approve and continue", rationale: korean ? "배포가 끝나면 확인을 이어갑니다." : "The check continues once the deploy finishes.", effect: { kind: "reply" as const } },
      { label: korean ? "지금 멈추기" : "Pause it now", rationale: korean ? "돌아와서 직접 확인합니다." : "You look at it yourself first.",
        effect: { kind: "control" as const, responsibilityId: "away-release", expectedRevision: 3, operation: "pause" as const } },
    ] };
  const askAt = 9;
  const askMessage: TarsMessage = { id: "away-message-ask", requestId: "followup:stageAsksUser:away-release:3", ...settings, revision: 3, state: "answered", error: null,
    // i18n-ignore: model-facing text of the preview's automatic follow-up, never shown
    text: "Automatic follow-up: delegated work waits for an approval. Judge what it needs next.",
    reply: askReply, decision: { reply: askReply, actions: [ask] },
    origin: { kind: "followUp", eventKey: "stageAsksUser:away-release:3", responsibilityId: "away-release", reason: "stageAsksUser", observedRevision: 3,
      // i18n-ignore: model-facing summary, never shown
      summary: "Verify the release candidate waits for an approval." },
    createdAt: at(askAt), updatedAt: at(askAt) };
  const askReceipt: TarsActionReceipt = { messageId: askMessage.id, actionIndex: 0, requestHash: "a".repeat(64), action: ask, status: "proposed",
    responsibilityId: null, error: null, reason: null, revision: 1, createdAt: at(askAt), updatedAt: at(askAt) };
  const askEvent: TarsEvent = { key: "stageAsksUser:away-release:3", responsibilityId: "away-release", kind: "stageAsksUser", episode: "3", observedRevision: 3,
    observedState: "waiting", attempt: null, status: "followedUp", messageId: askMessage.id, createdAt: at(8), processedAt: at(askAt) };
  // The user confirmed the draft pull request just before leaving; it opened while they were away.
  const publishStart = -2;
  const publishEnd = 18;
  const pullRequest = { url: "https://github.com/example/web/pull/128", number: 128 };
  const publishWords = { commitMessage: "fix: show the saved card first at checkout", title: "fix: show the saved card first at checkout" };

  return {
    settings,
    /** The saved state as of `now`: only what has happened by then. */
    at(now: number) {
      const reached = (minute: number) => anchor.getTime() + minute * 60_000 <= now;
      const published = reached(publishEnd);
      const activity: TarsActivity[] = [];
      const responsibilities: TarsResponsibility[] = plan.map((entry) => {
        const steps = entry.steps.filter((step) => reached(step.minute));
        steps.forEach((step, index) => activity.push({ id: `${entry.id}-activity-${index + 2}`, responsibilityId: entry.id, revision: index + 2, title: entry.title,
          state: step.state, detail: step.detail ?? null, ...(step.detailCode ? { detailCode: step.detailCode } : {}), createdAt: at(step.minute) }));
        const last = steps.at(-1);
        const publication = entry.id !== "away-checkout" || !reached(publishStart) ? undefined
          : { state: published ? "opened" as const : "committing" as const, failedStep: null, commit: published ? "9e2b7c1" : null, branch: "tars/away-checkout", base: "main",
            ...publishWords, url: published ? pullRequest.url : null, number: published ? pullRequest.number : null, error: null, reason: null,
            updatedAt: at(published ? publishEnd : publishStart) };
        return { id: entry.id, requestId: `request-${entry.id}`, title: entry.title, instruction: "Carry the work to a verified result.",
          acceptanceCriteria: ["The required checks pass on the reviewed revision."], workspaceId: "preview-workspace", executionWorkspaceId: `exec-${entry.id}`,
          repositoryPath: "/tmp/preview", providerId: "codex", model: null, agentId: null, priority: 50, maxTurns: 30, revision: steps.length + 1,
          state: last?.state ?? "queued", detail: last?.detail ?? null, ...(last?.detailCode ? { detailCode: last.detailCode } : {}), taskId: null, agentRunId: null,
          reverifyAfter: null, createdAt: at(start), updatedAt: at(last?.minute ?? start), ...(publication ? { publication } : {}) };
      });
      const asked = reached(askAt);
      const publications: TarsPublishRecord[] = reached(publishStart) ? [{ requestId: "away-publish", source: "click", requestHash: "f".repeat(64),
        responsibilityId: "away-checkout", expectedRevision: 3, ...publishWords, proposal: null, reason: null, error: null,
        ...(published ? { status: "applied" as const, ...pullRequest } : { status: "pending" as const, url: null, number: null }),
        revision: published ? 2 : 1, createdAt: at(publishStart), updatedAt: at(published ? publishEnd : publishStart) }] : [];
      const pendingDecisions: NonNullable<TarsSnapshot["pendingDecisions"]> = asked ? [{ kind: "ask", responsibilityId: "away-release", messageId: askMessage.id, actionIndex: 0,
        operation: null, expectedRevision: 3, proposedAt: at(askAt), question: ask.question, optionCount: ask.options.length }] : [];
      return { responsibilities, activity, messages: asked ? [request, askMessage] : [request], receipts: asked ? [askReceipt] : [],
        events: reached(8) ? [{ ...askEvent, ...(asked ? {} : { status: "pending" as const, messageId: null, processedAt: null }) }] : [], publications, pendingDecisions };
    },
  };
}

export type TarsAwayFixtures = ReturnType<typeof buildTarsAwayFixtures>;

/**
 * Brings the preview's saved conversation and snapshot up to the fixtures'
 * state as of now. What the user did in the preview since (an answer, a
 * control, a message) is kept: a fixture entry only adds itself or moves its
 * own entry forward.
 */
export function syncTarsAwayPreview(fixtures: TarsAwayFixtures, now: number, conversation: Omit<TarsConversation, "messages"> & { messages: TarsMessage[] },
  snapshot: TarsSnapshot): TarsSnapshot {
  const view = fixtures.at(now);
  conversation.settings ??= fixtures.settings;
  for (const message of view.messages) if (!conversation.messages.some((entry) => entry.id === message.id)) conversation.messages.push(structuredClone(message));
  for (const receipt of view.receipts) if (!conversation.receipts.some((entry) => entry.messageId === receipt.messageId && entry.actionIndex === receipt.actionIndex))
    conversation.receipts.push(structuredClone(receipt));
  for (const event of view.activity) if (!conversation.activity.some((entry) => entry.id === event.id)) conversation.activity.push(event);
  conversation.events = [...(conversation.events ?? []).filter((entry) => !view.events.some((event) => event.key === entry.key)), ...view.events];
  conversation.publications = [...(conversation.publications ?? []).filter((entry) => !view.publications.some((record) => record.requestId === entry.requestId)), ...view.publications];
  conversation.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const current = new Map(snapshot.responsibilities.map((row) => [row.id, row]));
  const answered = new Set((conversation.answers ?? []).map((answer) => answer.decisionId));
  // A control the user applied in the preview moved the work past the fixtures' revision; it stays as they left it.
  const responsibilities = view.responsibilities.map((row) => { const existing = current.get(row.id); return existing && existing.revision > row.revision ? existing : row; });
  return { ...snapshot, responsibilities, pendingDecisions: view.pendingDecisions.filter((decision) =>
    ![...answered].some((id) => decision.messageId !== null && id.includes(decision.messageId))
      && responsibilities.find((row) => row.id === decision.responsibilityId)?.revision === decision.expectedRevision) };
}

/** The host's away state against session storage, so a reload behaves like a restart. `seed` is what a first load starts from. */
export function createPreviewAwayBridge(storageKey: string, seed: TarsAwayState = TARS_AWAY_INITIAL_STATE) {
  const read = (): TarsAwayState => {
    const parsed = TarsAwayStateSchema.safeParse(JSON.parse(sessionStorage.getItem(storageKey) ?? "null"));
    return parsed.success ? parsed.data : seed;
  };
  return {
    async getAway(): Promise<TarsAwayState> { return read(); },
    async saveAway(input: TarsAwayState): Promise<TarsAwayState> {
      const next = mergeTarsAwayState(read(), TarsAwayStateSchema.parse(input));
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    },
  };
}
