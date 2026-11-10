import type { AgentRunDetail } from "@/lib/agent-runs/api";
import {
  TARS_MESSAGE_FAILURE_TEXT, type TarsActionReason, type TarsActionReceipt, type TarsActionRecord, type TarsConversation, type TarsDecisionAction,
  type TarsDecisionAnswer, type TarsMessage, type TarsMessageDelivery,
} from "@/lib/tars/conversation";
import type { TarsEvent } from "@/lib/tars/events";
import type { TarsPublication, TarsPublishRecord } from "@/lib/tars/publication";
import type { TarsActivity, TarsControlOperation, TarsFollowUpState, TarsPendingDecision, TarsPendingRequest, TarsResponsibility } from "@/lib/tars/types";
import type { buildTarsTrayFixtures } from "./tars-fixtures";
import type { buildTarsSideViewFixtures } from "./tars-side-fixtures";
import { TARS_PREVIEW_RICH_REPLY } from "./tars-rich-reply-fixture";
import { tarsGalleryCodeReply } from "./tars-code-languages-fixture";
import { buildTarsResultFixtures } from "./tars-result-fixtures";

type ControlAction = Extract<TarsDecisionAction, { kind: "control" }>;
type ReceiptOutcome = { status: "applied"; responsibilityId: string } | { status: "proposed" | "pending" } | { status: "rejected"; reason: TarsActionReason };
/** The host keeps full attachment snapshots; a window reads summaries (`tarsMessageView`). */
type GalleryConversation = Omit<TarsConversation, "messages"> & { messages: TarsMessage[] };

/**
 * `spreadUntil`: each family of cases is one run of two-minute slots on its
 * own day and hour, so the transcript shows several days (one of them more
 * than two days back, which names its date) and several runs within a day.
 * Today's runs count back from that moment, so nothing lands in the future;
 * opened in the small hours, they fall on yesterday instead.
 */
const GALLERY_DAYS = [
  { match: /^A/, daysAgo: 6, clock: [9, 30] }, { match: /^B/, daysAgo: 6, clock: [14, 10] },
  { match: /^C/, daysAgo: 2, clock: [10, 0] }, { match: /^D/, daysAgo: 2, clock: [16, 20] },
  { match: /^E/, daysAgo: 1, clock: [9, 5] }, { match: /^F/, daysAgo: 1, clock: [13, 40] }, { match: /^G/, daysAgo: 1, clock: [18, 15] },
  { match: /^[HIJ]$/, minutesBefore: 240 }, { match: /^K/, minutesBefore: 120 }, { match: /^[LM]/, minutesBefore: 40 },
] as const satisfies ReadonlyArray<{ match: RegExp } & ({ daysAgo: number; clock: readonly [number, number] } | { minutesBefore: number })>;

/** A 1×1 PNG: the transcript shows an attachment's name, never its pixels. */
const PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const DIAGNOSTIC = "Preview diagnostic: the host refused this.";

/**
 * `gallery=true`: every case the Tars conversation renders, on one screen,
 * for design review. Each case (or family of lines) starts with a user
 * message that names it. Everything is built from the real saved shapes and
 * the real projection decides each card's state, so the order is deliberate:
 * - an unanswered question folds as soon as anything is said after it, so the
 *   one question still waiting is the last message;
 * - a newer control proposal for the same work supersedes an older one, so
 *   each waiting confirmation targets work no later message proposes a
 *   control for, and the folded outcomes come before the waiting cards.
 * Work comes from the tray and side-view fixtures plus a few rows of its own,
 * so the tray beside the conversation shows the work each card names.
 * Times count from an hour after `start`, two minutes per case; with
 * `spreadUntil` they spread over the week before it instead (`GALLERY_DAYS`).
 */
export function buildTarsGalleryFixtures({ start, korean, tray, side, spreadUntil }: {
  start: Date;
  korean: boolean;
  tray: ReturnType<typeof buildTarsTrayFixtures>;
  side: ReturnType<typeof buildTarsSideViewFixtures>;
  /** Spread the cases over the days before this moment, so the transcript's day rules show. */
  spreadUntil?: Date;
}) {
  const l = (en: string, ko: string) => korean ? ko : en;
  const history = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  const galleryStart = start.getTime() + 60 * 60_000;
  const settings = { providerId: "codex" as const, model: "gpt-5.5", maxTurns: 30 };

  // --- Work the cases point to -------------------------------------------------------------------------------------------
  const row = (patch: Partial<TarsResponsibility> & Pick<TarsResponsibility, "id" | "title" | "state">): TarsResponsibility => ({
    requestId: `request-${patch.id}`, instruction: "Inspect the actual result.", acceptanceCriteria: ["The required checks pass on the reviewed revision."],
    workspaceId: "preview-workspace", executionWorkspaceId: `exec-${patch.id}`, repositoryPath: "/tmp/preview", providerId: "codex", model: null,
    agentId: null, priority: 50, maxTurns: 30, revision: 2, detail: null, taskId: `task-${patch.id}`, agentRunId: null,
    reverifyAfter: null, createdAt: history(10), updatedAt: history(30), ...patch,
  });
  const byId = new Map([...tray.responsibilities, ...side.responsibilities].map((entry) => [entry.id, entry]));
  const release = byId.get(tray.ids.release)!;
  const billing = byId.get(tray.ids.billing)!;
  const migration = byId.get(tray.ids.migration)!;
  const checkout = byId.get(side.ids.checkout)!;
  const search = byId.get(side.ids.search)!;
  const docsUrl = "https://github.com/example/web/pull/12";
  const docsOpened: TarsPublication = { state: "opened", failedStep: null, commit: "7e3a91c", branch: "tars/docs", base: "main",
    commitMessage: "docs: update the setup guide", title: "docs: update the setup guide", url: docsUrl, number: 12, error: null, reason: null, updatedAt: history(150) };
  const docs = { ...byId.get(tray.ids.docs)!, publication: docsOpened };
  const waitingDetail = { detail: "The execution task is waiting for your input or approval.", detailCode: "waitingForUser" as const };
  const approval = (id: string, summary: string, truncated = false): TarsPendingRequest => ({ kind: "approval", ref: `${id}-approval`, requestId: `${id}-approval-request`,
    messageId: `${id}-task-message`, taskId: `task-${id}`, workspaceId: `exec-${id}`, toolName: "Bash", summary, ...(truncated ? { truncated: true as const } : {}) });
  const upload = row({ id: "gallery-upload", title: "Fix the flaky upload test", state: "running" });
  const audit = row({ id: "gallery-audit", title: "Add pagination to the audit log", state: "blocked", revision: 3,
    detail: "Completion was reported without a Stave-verified check.", detailCode: "unverifiedCompletion" });
  const settingsStore = row({ id: "gallery-settings", title: "Migrate the settings store", state: "waiting", ...waitingDetail,
    stageAsksUser: true, stageWait: { kind: "signOff" } });
  const runtime = row({ id: "gallery-runtime", title: "Upgrade the Node runtime to 24", state: "waiting", ...waitingDetail, pendingRequests: [
    approval("gallery-runtime", "Install the upgraded toolchain — bunx --bun npm-check-updates -u && bun install"),
    { kind: "question", ref: "gallery-runtime-question", requestId: "gallery-runtime-question-request", messageId: "gallery-runtime-task-message",
      taskId: "task-gallery-runtime", workspaceId: "exec-gallery-runtime", toolName: "AskUserQuestion", summary: "Which Node 24 release should CI use?",
      questions: [{ key: "node-version", question: "Which Node 24 release should CI use?", options: ["24.11 LTS", "Latest 24.x"] }] },
  ] });
  const releaseScript = `Run the release script — set -euo pipefail\n${Array.from({ length: 12 }, (_, index) => `bun run build:package-${index} --out dist/${index}`).join(" && ")}`;
  const packages = row({ id: "gallery-packages", title: "Publish the release packages", state: "waiting", ...waitingDetail,
    pendingRequests: [approval("gallery-packages", `${releaseScript.slice(0, 499)}…`, true)] });
  const webhook = row({ id: "gallery-webhook", title: "Add retries to the webhook sender", state: "running", revision: 3 });
  // Their publication steps are saved in L, at the time of the attempt they belong to.
  const onboarding = row({ id: "gallery-onboarding", title: "Polish the onboarding checklist", state: "completed", revision: 4, branchName: "feat/onboarding-checklist-7c1d2e3f" });
  const landing = row({ id: "gallery-landing", title: "Refresh the pricing page copy", state: "completed", revision: 3, branchName: "copy/pricing-page-2b9f0a1c" });

  // --- Saved conversation, in order ---------------------------------------------------------------------------------------
  const cases: string[] = [];
  const messages: TarsMessage[] = [];
  const receipts: TarsActionReceipt[] = [];
  const records: TarsActionRecord[] = [];
  const answers: TarsDecisionAnswer[] = [];
  const activity: TarsActivity[] = [];
  const events: TarsEvent[] = [];
  const publications: TarsPublishRecord[] = [];
  const pendingDecisions: TarsPendingDecision[] = [];
  let section = 0;
  const spreadCount = new Map<(typeof GALLERY_DAYS)[number], number>();
  /** Where a case starts: its two-minute slot after the last, or with `spreadUntil` the next slot in its family's run. */
  function slotOf(code: string) {
    const group = spreadUntil ? GALLERY_DAYS.find((entry) => entry.match.test(code)) : undefined;
    if (!spreadUntil || !group) return galleryStart + section * 120_000;
    const nth = spreadCount.get(group) ?? 0;
    spreadCount.set(group, nth + 1);
    const day = new Date(spreadUntil);
    if ("minutesBefore" in group) return spreadUntil.getTime() - (group.minutesBefore - nth * 2) * 60_000;
    day.setDate(day.getDate() - group.daysAgo);
    day.setHours(group.clock[0], group.clock[1] + nth * 2, 0, 0);
    return day.getTime();
  }
  /** The next case: its two-minute slot and the label its user message starts with. */
  function begin(code: string, en: string, ko: string) {
    section += 1;
    cases.push(`${code} · ${en}`);
    const slot = slotOf(code);
    return { at: (second = 0) => new Date(slot + second * 1000).toISOString(), label: `${code} · ${l(en, ko)}` };
  }
  function said(id: string, at: string, text: string, reply: string, actions: TarsDecisionAction[] = [], extra: Partial<TarsMessage> = {}) {
    const message: TarsMessage = { id, requestId: `request-${id}`, text, ...settings, state: "answered", revision: 2, reply, decision: { reply, actions },
      error: null, createdAt: at, updatedAt: at, ...extra };
    messages.push(message);
    return message;
  }
  function unanswered(id: string, at: string, text: string, state: "queued" | "reasoning" | "cancelled", extra: Partial<TarsMessage> = {}) {
    const message: TarsMessage = { id, requestId: `request-${id}`, text, ...settings, state, revision: state === "cancelled" ? 2 : 1, reply: null, decision: null,
      error: null, createdAt: at, updatedAt: at, ...extra };
    messages.push(message);
    return message;
  }
  function receipt(message: TarsMessage, actionIndex: number, outcome: ReceiptOutcome) {
    const value: TarsActionReceipt = { messageId: message.id, actionIndex, requestHash: "a".repeat(64), action: message.decision!.actions[actionIndex]!,
      status: outcome.status, responsibilityId: outcome.status === "applied" ? outcome.responsibilityId : null,
      error: outcome.status === "rejected" ? DIAGNOSTIC : null, reason: outcome.status === "rejected" ? outcome.reason : null,
      revision: outcome.status === "proposed" || outcome.status === "pending" ? 1 : 2, createdAt: message.createdAt, updatedAt: message.createdAt };
    receipts.push(value);
    return value;
  }
  function record(requestId: string, at: string, source: TarsActionRecord["source"], action: TarsActionRecord["action"],
    outcome: { status: "applied" | "pending" } | { status: "rejected"; reason: NonNullable<TarsActionRecord["reason"]> }, extra: Partial<TarsActionRecord> = {}) {
    const value: TarsActionRecord = { requestId, source, requestHash: "b".repeat(64), action, status: outcome.status,
      error: outcome.status === "rejected" ? DIAGNOSTIC : null, reason: outcome.status === "rejected" ? outcome.reason : null,
      revision: 2, createdAt: at, updatedAt: at, ...extra };
    records.push(value);
    return value;
  }
  const control = (target: TarsResponsibility, operation: TarsControlOperation, expectedRevision = target.revision, input?: ControlAction["input"]): ControlAction =>
    ({ kind: "control", responsibilityId: target.id, expectedRevision, operation, ...(input ? { input } : {}) });
  const waitingFor = (message: TarsMessage, actionIndex: number, action: ControlAction) => pendingDecisions.push({ responsibilityId: action.responsibilityId,
    messageId: message.id, actionIndex, operation: action.operation, expectedRevision: action.expectedRevision, proposedAt: message.createdAt });

  // A · The user's own messages.
  {
    const c = begin("A1", "Short message", "짧은 메시지");
    said("g-a1", c.at(), `${c.label}: ${l("how is the release check going?", "릴리스 확인은 어떻게 되고 있어?")}`,
      l("The release check is paused while the staging deploy finishes. Nothing has failed; it continues once you confirm the resume below.",
        "스테이징 배포가 끝날 때까지 릴리스 확인을 멈춰 두었습니다. 실패한 것은 없고, 아래에서 재개를 확인하시면 이어서 진행합니다."));
  }
  {
    const c = begin("A2", "Long multi-paragraph message", "여러 문단의 긴 메시지");
    const body = l([
      "Before Friday's release I want three things settled, in this order.",
      "First, the billing export: when an account has no invoices the nightly job writes a file with no header, and the finance import rejects it. It should write the header row and nothing else. Please reproduce it on the staging data before changing anything, because last time the fix only worked locally.",
      "Second, the flaky upload test. It fails roughly one run in five on CI and never on my machine, so I suspect a timing assumption around the multipart upload. If the cause is the test itself, fix the test; if it is the uploader, tell me before you change the retry policy.",
      "Third, keep the release check paused until staging is green. Do not resume it on your own, and do not touch production at any point.",
    ].join("\n\n"), [
      "금요일 릴리스 전에 세 가지를 이 순서대로 정리하고 싶어.",
      "첫째, 결제 내보내기. 인보이스가 없는 계정이면 야간 작업이 헤더 없는 파일을 만들고, 재무 쪽 가져오기가 그 파일을 거부해. 헤더 행만 있는 파일을 만들어야 해. 지난번에는 로컬에서만 고쳐졌으니 바꾸기 전에 스테이징 데이터로 먼저 재현해 줘.",
      "둘째, 불안정한 업로드 테스트. CI에서 다섯 번에 한 번꼴로 실패하고 내 컴퓨터에서는 한 번도 실패하지 않아서, 멀티파트 업로드 주변의 타이밍 가정이 문제 같아. 테스트 자체가 원인이면 테스트를 고치고, 업로더가 원인이면 재시도 정책을 바꾸기 전에 먼저 알려 줘.",
      "셋째, 스테이징이 정상이 될 때까지 릴리스 확인은 멈춰 둬. 스스로 재개하지 말고, 프로덕션은 절대 건드리지 마.",
    ].join("\n\n"));
    said("g-a2", c.at(), `${c.label}\n\n${body}`, l("Understood: billing export first, then the upload test, and the release check stays paused until you say so.",
      "알겠습니다. 결제 내보내기부터, 그다음 업로드 테스트를 보고, 릴리스 확인은 말씀하실 때까지 멈춰 두겠습니다."));
  }
  {
    const c = begin("A3", "Korean message", "한국어 메시지");
    said("g-a3", c.at(), `${c.label}\n\n결제 내보내기에서 인보이스 목록이 비어 있을 때 CSV 헤더만 내려받아지는지 확인해 줘. 확인되면 그 경우를 다루는 테스트도 추가해 줘.`,
      "확인하겠습니다. 빈 목록에서 헤더 행만 있는 파일이 내려받아지는지 스테이징 데이터로 재현한 뒤, 같은 경우를 다루는 테스트를 추가하겠습니다.");
  }
  {
    const c = begin("A4", "Message with an image and a file", "이미지와 파일을 붙인 메시지");
    said("g-a4", c.at(), `${c.label}: ${l("the staging login fails with this error. The deploy config is attached.", "스테이징 로그인이 이 오류로 실패해. 배포 설정을 붙였어.")}`,
      l("The screenshot shows a 401 from /auth/session, and the attached config still lists the previous signing key first. Rotating the key order should fix it.",
        "스크린숏에는 /auth/session의 401 응답이 보이고, 붙여 주신 설정은 아직 이전 서명 키를 먼저 쓰고 있습니다. 키 순서를 바꾸면 해결될 것 같습니다."),
      [], { attachments: [
        { type: "image_context", label: "staging-login-error.png", dataUrl: PIXEL_PNG, mimeType: "image/png" },
        { type: "file_context", filePath: "staging-deploy.yaml", language: "yaml", content: "auth:\n  signingKey: ${AUTH_SIGNING_KEY_PREVIOUS}\n  previousKeys:\n    - ${AUTH_SIGNING_KEY}\n" },
      ] });
  }
  {
    const c = begin("A5", "Message that includes my working changes", "작업 중인 변경을 포함한 메시지");
    said("g-a5", c.at(), `${c.label}: ${l("continue from my uncommitted fix to the upload retry.", "업로드 재시도에 대해 커밋하지 않은 수정에서 이어서 해 줘.")}`,
      l("I will start from a snapshot of your uncommitted changes instead of the branch.", "브랜치 대신 커밋하지 않은 변경의 스냅숏에서 시작하겠습니다."),
      [], { includeWorkingChanges: true });
  }

  // B · Tars's replies.
  {
    const c = begin("B1", "Rich Markdown reply", "서식이 풍부한 Markdown 답변");
    const reply = l([
      "## Export plan", "", "The nightly export restarts from the first account after any failure. Three changes fix it.", "",
      "### What changes", "", "1. Keep a **cursor per account** so a retry resumes after the last written invoice.", "   - Store it next to the export record.", "   - Clear it once the file is complete.",
      "2. Cap each account at *five minutes* and move a slow one to the end of the queue.", "3. List skipped accounts in the job summary.", "",
      "### Accounts in the last run", "", "| Account | Invoices | Duration | Result |", "| --- | ---: | ---: | --- |",
      "| acct_7f3c | 18,204 | 4m 58s | Complete |", "| acct_1b2c | 42,977 | 5m 00s | Moved to the end |", "",
      "### The change", "", "```ts", "export async function exportAccount(account: BillingAccount, cursor: ExportCursor | null) {",
      "  const invoices = await listInvoices(account.id, { after: cursor?.lastInvoiceId });", "  return writer.append(account.id, invoices);", "}", "```", "",
      "> The finance import still needs the header row when an account has no invoices.", "", "Run `bun test tests/billing-export.test.ts` to check it.",
    ].join("\n"), [
      "## 내보내기 계획", "", "야간 내보내기는 실패가 한 번이라도 나면 첫 계정부터 다시 시작합니다. 세 가지를 바꾸면 해결됩니다.", "",
      "### 바꿀 점", "", "1. **계정마다 커서**를 두어 재시도가 마지막으로 쓴 인보이스 다음부터 이어지게 합니다.", "   - 내보내기 기록 옆에 저장합니다.", "   - 파일이 완성되면 지웁니다.",
      "2. 계정마다 *5분* 제한을 두고, 느린 계정은 큐 끝으로 보냅니다.", "3. 건너뛴 계정을 작업 요약에 적습니다.", "",
      "### 지난 실행의 계정", "", "| 계정 | 인보이스 | 소요 시간 | 결과 |", "| --- | ---: | ---: | --- |",
      "| acct_7f3c | 18,204 | 4분 58초 | 완료 |", "| acct_1b2c | 42,977 | 5분 00초 | 큐 끝으로 이동 |", "",
      "### 변경 코드", "", "```ts", "export async function exportAccount(account: BillingAccount, cursor: ExportCursor | null) {",
      "  const invoices = await listInvoices(account.id, { after: cursor?.lastInvoiceId });", "  return writer.append(account.id, invoices);", "}", "```", "",
      "> 인보이스가 없는 계정이어도 재무 가져오기에는 헤더 행이 필요합니다.", "", "`bun test tests/billing-export.test.ts`로 확인하세요.",
    ].join("\n"));
    said("g-b1", c.at(), `${c.label}: ${l("summarize the export plan with headings, a table and the code.", "제목, 표, 코드로 내보내기 계획을 정리해 줘.")}`, reply);
  }
  {
    const c = begin("B2", "Reply with file and documentation links", "파일·문서 링크가 있는 답변");
    said("g-b2", c.at(), `${c.label}: ${l("where is the saved-card ordering?", "저장된 카드 순서는 어디서 정해져?")}`,
      l("It is in [cards.ts](src/checkout/cards.ts), tested in `src/checkout/cards.test.ts`. The rule is described in the [checkout guide](https://example.com/docs/checkout#saved-cards).",
        "[cards.ts](src/checkout/cards.ts)에 있고, `src/checkout/cards.test.ts`에서 테스트합니다. 규칙은 [결제 가이드](https://example.com/docs/checkout#saved-cards)에 설명되어 있습니다."));
  }
  {
    const c = begin("B3", "Reply that overflows the column", "열 너비를 넘는 답변");
    said("g-b3", c.at(), `${c.label}: ${l("long URL, wide code and a wide table.", "긴 URL, 넓은 코드와 넓은 표.")}`, TARS_PREVIEW_RICH_REPLY);
  }
  {
    const c = begin("B4", "Code in every language", "언어별 코드");
    said("g-b4", c.at(), `${c.label}: ${l("show the retry change in each language we use.", "우리가 쓰는 언어마다 재시도 변경을 보여 줘.")}`,
      tarsGalleryCodeReply(l("Each block is highlighted with its own grammar; aliases use the grammar they stand for.", "블록마다 해당 언어 문법으로 강조합니다. 별칭은 가리키는 언어의 문법을 씁니다.")));
  }

  // C · A message's own states.
  {
    const c = begin("C1", "Tars is thinking", "Tars가 생각하는 중");
    unanswered("g-c1", c.at(), `${c.label}: ${l("compare the two retry policies before I choose.", "고르기 전에 두 재시도 정책을 비교해 줘.")}`, "reasoning");
  }
  {
    const c = begin("C2", "Queued behind another message", "다른 메시지 뒤에서 대기");
    unanswered("g-c2", c.at(), `${c.label}: ${l("and check the export on an empty account too.", "빈 계정에서도 내보내기를 확인해 줘.")}`, "queued");
  }
  {
    const c = begin("C3", "Message I cancelled", "내가 취소한 메시지");
    unanswered("g-c3", c.at(), `${c.label}: ${l("never mind the benchmark.", "벤치마크는 신경 쓰지 마.")}`, "cancelled");
  }
  {
    const c = begin("C4", "Failed: reasoning failed (coded)", "실패: 추론 실패(코드 있음)");
    messages.push({ id: "g-c4", requestId: "request-g-c4", text: `${c.label}: ${l("summarize yesterday's runs.", "어제 실행을 요약해 줘.")}`, ...settings, state: "failed",
      revision: 2, reply: null, decision: null, error: TARS_MESSAGE_FAILURE_TEXT.reasoningFailed, errorCode: "reasoningFailed", createdAt: c.at(), updatedAt: c.at() });
  }
  {
    const c = begin("C5", "Failed: interrupted (coded)", "실패: 중단됨(코드 있음)");
    messages.push({ id: "g-c5", requestId: "request-g-c5", text: `${c.label}: ${l("plan the search index work.", "검색 인덱스 작업을 계획해 줘.")}`, ...settings, state: "failed",
      revision: 2, reply: null, decision: null, error: TARS_MESSAGE_FAILURE_TEXT.interrupted, errorCode: "interrupted", createdAt: c.at(), updatedAt: c.at() });
  }
  {
    const c = begin("C6", "Failed: diagnostic without a code", "실패: 코드 없는 진단 문구");
    messages.push({ id: "g-c6", requestId: "request-g-c6", text: `${c.label}: ${l("what is blocking the migration?", "마이그레이션을 막는 게 뭐야?")}`, ...settings, state: "failed",
      revision: 2, reply: null, decision: null, error: "Codex App Server exited with code 1 before the turn completed.", createdAt: c.at(), updatedAt: c.at() });
  }

  // D · Delegation and the receipts of other actions.
  const delegate = (target: TarsResponsibility, extra: Partial<Extract<TarsDecisionAction, { kind: "delegate" }>> = {}): TarsDecisionAction =>
    ({ kind: "delegate", workspaceId: target.workspaceId, title: target.title, instruction: target.instruction, acceptanceCriteria: target.acceptanceCriteria,
      priority: target.priority, ...extra });
  {
    const c = begin("D1", "Delegation: flow completed and reviewed", "위임: 완료되고 리뷰된 흐름");
    const message = said("g-d1", c.at(), `${c.label}: ${l("show the saved card first at checkout.", "결제 화면에서 저장된 카드를 먼저 보여 줘.")}`,
      l("I delegated the checkout change. It is reviewed independently before it can complete.", "결제 화면 변경을 위임했습니다. 완료 전에 독립적으로 리뷰합니다."),
      [delegate(checkout, { agentId: "implementer", reason: "A small, well-specified change: the Implementer works, a Reviewer checks it." })]);
    receipt(message, 0, { status: "applied", responsibilityId: checkout.id });
  }
  {
    const c = begin("D2", "Delegation: flow running", "위임: 진행 중인 흐름");
    const message = said("g-d2", c.at(), `${c.label}: ${l("fix the billing export when the invoice list is empty.", "인보이스 목록이 비어 있을 때 결제 내보내기를 고쳐 줘.")}`,
      l("I delegated the fix to the Debugger agent. It reproduces the failure first, then finds the cause before changing code.",
        "수정을 Debugger 에이전트에게 위임했습니다. 먼저 실패를 재현하고, 코드를 바꾸기 전에 원인을 찾습니다."),
      [delegate(billing, { agentId: "debugger", reason: "The failure only shows on empty lists, so the Debugger reproduces it before changing code." })]);
    receipt(message, 0, { status: "applied", responsibilityId: billing.id });
  }
  {
    const c = begin("D3", "Delegation: flow blocked on unmet criteria", "위임: 충족되지 않은 기준으로 막힌 흐름");
    const message = said("g-d3", c.at(), `${c.label}: ${l("speed up the search index rebuild.", "검색 인덱스 재구성을 빠르게 해 줘.")}`,
      l("I delegated the rebuild speed-up. It must keep search results identical.", "인덱스 재구성 속도 개선을 위임했습니다. 검색 결과는 그대로 유지해야 합니다."), [delegate(search)]);
    receipt(message, 0, { status: "applied", responsibilityId: search.id });
  }
  {
    const c = begin("D4", "Delegation refused, and one awaiting execution", "거절된 위임과 실행 대기 중인 위임");
    const message = said("g-d4", c.at(), `${c.label}: ${l("ship the release notes and start from my working changes.", "릴리스 노트를 내보내고, 작업 중인 변경에서 시작해 줘.")}`,
      l("Two of these could not start, and one is waiting to be admitted.", "두 가지는 시작하지 못했고, 하나는 받아들여지기를 기다리고 있습니다."), [
        delegate(row({ id: "draft-notes", title: "Draft the release notes", state: "queued" }), { agentId: "release-manager" }),
        delegate(row({ id: "draft-snapshot", title: "Continue the upload fix from your working changes", state: "queued" })),
        delegate(row({ id: "draft-pending", title: "Check the staging smoke tests", state: "queued" })),
      ], { includeWorkingChanges: true });
    receipt(message, 0, { status: "rejected", reason: "agentNotAllowed" });
    receipt(message, 1, { status: "rejected", reason: "workingChangesUnavailable" });
    receipt(message, 2, { status: "pending" });
  }
  {
    const c = begin("D5", "Actions applied at once, and other receipts", "바로 적용된 동작과 다른 영수증");
    const message = said("g-d5", c.at(), `${c.label}: ${l("pause the upload fix, take over the migration notes, move the webhook work up and show me the checkout report.",
      "업로드 수정은 멈추고, 마이그레이션 노트는 내가 맡고, 웹훅 작업은 앞으로 당기고, 결제 보고서를 보여 줘.")}`,
    l("Done where I could. You already own the migration notes.", "가능한 것은 처리했습니다. 마이그레이션 노트는 이미 직접 맡고 계십니다."), [
      control(upload, "pause", 1), control(migration, "takeover", 3),
      { kind: "reprioritize", responsibilityId: webhook.id, expectedRevision: 2, priority: 70 }, { kind: "show", responsibilityId: checkout.id, view: "report" },
    ]);
    receipt(message, 0, { status: "applied", responsibilityId: upload.id });
    receipt(message, 1, { status: "rejected", reason: "alreadyTakenOver" });
    receipt(message, 2, { status: "applied", responsibilityId: webhook.id });
    receipt(message, 3, { status: "applied", responsibilityId: checkout.id });
  }

  // E · Confirmations that already settled. They come before the waiting cards, which a newer proposal would supersede.
  /** A control proposal waiting for Confirm, and its decision id. */
  function propose(id: string, at: string, text: string, reply: string, actions: ControlAction[]) {
    const message = said(id, at, text, reply, actions);
    actions.forEach((_, index) => receipt(message, index, { status: "proposed" }));
    return { message, decisionId: (index = 0) => `confirm:${id}:${index}` };
  }
  function confirmAnswer(decisionId: string, action: ControlAction, at: string, source: TarsDecisionAnswer["source"], outcome: "applied" | "pending" | { reason: NonNullable<TarsDecisionAnswer["reason"]> },
    delivery?: TarsMessageDelivery) {
    const rejected = typeof outcome === "object";
    answers.push({ decisionId, optionIndex: 0, source, effect: action, label: null, status: rejected ? "rejected" : outcome, reason: rejected ? outcome.reason : null,
      error: rejected ? DIAGNOSTIC : null, actRequestId: decisionId, messageId: null, revision: 2, createdAt: at, updatedAt: at });
    record(decisionId, at, source, action, rejected ? { status: "rejected", reason: outcome.reason } : { status: outcome }, delivery ? { delivery } : {});
    if (outcome !== "pending") settleProposal(decisionId, action, at, rejected ? { reason: outcome.reason } : "applied");
  }
  /** A confirmation settles the proposal it confirms in the same step, as the host does. */
  function settleProposal(decisionId: string, action: ControlAction, at: string, outcome: "applied" | { reason: NonNullable<TarsActionRecord["reason"]> }) {
    const [, messageId, index] = decisionId.split(":");
    const proposal = receipts.find((entry) => entry.messageId === messageId && entry.actionIndex === Number(index))!;
    Object.assign(proposal, outcome === "applied" ? { status: "applied", responsibilityId: action.responsibilityId }
      : { status: "rejected", error: DIAGNOSTIC, reason: outcome.reason }, { revision: 2, updatedAt: at });
  }
  {
    const c = begin("E1", "Confirmation: confirmed by click", "확인: 클릭으로 확인함");
    const action = control(release, "resume", 2);
    const { decisionId } = propose("g-e1", c.at(), `${c.label}: ${l("resume the release check.", "릴리스 확인을 재개해 줘.")}`,
      l("Confirm below to resume it.", "아래에서 확인하시면 재개합니다."), [action]);
    confirmAnswer(decisionId(), action, c.at(20), "click", "applied");
  }
  {
    const c = begin("E2", "Confirmation: confirmed in Fleet", "확인: Fleet에서 확인함");
    const action = control(migration, "handBack", 3);
    const { decisionId } = propose("g-e2", c.at(), `${c.label}: ${l("give the migration notes back to Tars.", "마이그레이션 노트를 Tars에게 다시 넘겨 줘.")}`,
      l("Confirm below to hand it back.", "아래에서 확인하시면 다시 넘겨받습니다."), [action]);
    record(decisionId(), c.at(20), "fleet", action, { status: "applied" });
    settleProposal(decisionId(), action, c.at(20), "applied");
  }
  {
    const c = begin("E3", "Confirmation: refused by the host", "확인: 호스트가 거절함");
    const action = control(billing, "extend", 1);
    const { decisionId } = propose("g-e3", c.at(), `${c.label}: ${l("give the billing fix more turns.", "결제 수정에 턴을 더 줘.")}`,
      l("Confirm below to add turns.", "아래에서 확인하시면 턴을 추가합니다."), [action]);
    confirmAnswer(decisionId(), action, c.at(20), "click", { reason: "runHeld" });
  }
  {
    const c = begin("E4", "Confirmation: still applying", "확인: 적용 중");
    const action = control(upload, "cancel", 1);
    const { decisionId } = propose("g-e4", c.at(), `${c.label}: ${l("cancel the upload fix.", "업로드 수정을 취소해 줘.")}`,
      l("Confirm below to cancel it. This cannot be undone.", "아래에서 확인하시면 취소합니다. 되돌릴 수 없습니다."), [action]);
    confirmAnswer(decisionId(), action, c.at(20), "click", "pending");
  }
  {
    const c = begin("E5", "Confirmation: superseded by a newer proposal", "확인: 더 새로운 제안으로 대체됨");
    propose("g-e5", c.at(), `${c.label}: ${l("resume the release check once staging is green.", "스테이징이 정상이 되면 릴리스 확인을 재개해 줘.")}`,
      l("Confirm below when staging is green.", "스테이징이 정상이 되면 아래에서 확인하세요."), [control(release, "resume")]);
  }
  {
    const c = begin("E6", "Proposal refused when it was made", "제안할 때 거절된 동작");
    const message = said("g-e6", c.at(), `${c.label}: ${l("accept the audit log work as done.", "감사 로그 작업을 완료로 받아들여 줘.")}`,
      l("I could not propose that: its completion was not waiting for a decision then.", "그때는 완료 결정이 필요한 상태가 아니어서 제안할 수 없었습니다."),
      [control(audit, "acceptCompletion", 2)]);
    receipt(message, 0, { status: "rejected", reason: "notAcceptable" });
  }
  {
    const c = begin("E7", "Confirmed words wait for the busy run", "확인한 말이 바쁜 실행을 기다림");
    const action = control(webhook, "message", 2, { text: l("Use the existing backoff helper instead of a new one.", "새로 만들지 말고 기존 backoff 도우미를 써.") });
    const { decisionId } = propose("g-e7", c.at(), `${c.label}: ${l("tell the webhook run to reuse the backoff helper.", "웹훅 실행에 기존 backoff 도우미를 쓰라고 전해 줘.")}`,
      l("Confirm below and I will say it in its task.", "아래에서 확인하시면 작업에 전하겠습니다."), [action]);
    confirmAnswer(decisionId(), action, c.at(20), "click", "applied",
      { status: "queued", agentRunId: "run-gallery-webhook", reason: null, error: null, queuedAt: c.at(20), updatedAt: c.at(20) });
  }

  // F · Confirmations waiting now: each is the newest control proposal for its work.
  function waiting(code: string, en: string, ko: string, ask: [string, string], reply: [string, string], actions: ControlAction[]) {
    const c = begin(code, en, ko);
    const { message } = propose(`g-${code.toLowerCase()}`, c.at(), `${c.label}: ${l(...ask)}`, l(...reply), actions);
    actions.forEach((action, index) => waitingFor(message, index, action));
  }
  waiting("F1", "Confirm card: resume", "확인 카드: 재개", ["staging is green, resume the release check.", "스테이징이 정상이야. 릴리스 확인을 재개해."],
    ["Staging is green. Confirm and the release check continues.", "스테이징이 정상입니다. 확인하시면 릴리스 확인을 이어갑니다."], [control(release, "resume")]);
  waiting("F2", "Confirm card: hand back", "확인 카드: 다시 넘기기", ["I'm done with the migration notes.", "마이그레이션 노트는 다 봤어."],
    ["Hand them back and I will verify them again before completing.", "다시 넘겨주시면 완료 전에 다시 검증하겠습니다."], [control(migration, "handBack")]);
  waiting("F3", "Confirm card: cancel (cannot be undone)", "확인 카드: 취소(되돌릴 수 없음)", ["stop the upload fix for good.", "업로드 수정은 완전히 그만둬."],
    ["Cancelling ends this work and its run.", "취소하면 이 작업과 실행이 끝납니다."], [control(upload, "cancel")]);
  waiting("F4", "Confirm cards: retry or skip the stuck stage", "확인 카드: 멈춘 단계 다시 시도 또는 건너뛰기", ["the search rebuild is stuck, what now?", "검색 재구성이 멈췄어. 이제 어떻게 해?"],
    ["Its work stage could not measure the rebuild time. Retry it, or skip it and go to review.", "작업 단계가 재구성 시간을 측정하지 못했습니다. 다시 시도하거나 건너뛰고 리뷰로 넘어갈 수 있습니다."],
    [control(search, "retryStage"), control(search, "skipStage")]);
  waiting("F5", "Confirm cards: sign off or request changes", "확인 카드: 승인 또는 변경 요청", ["the settings migration wants my sign-off.", "설정 마이그레이션이 내 승인을 기다려."],
    ["Its design stage waits for you. Sign it off, or ask for the change below.", "설계 단계가 기다리고 있습니다. 승인하거나 아래 변경을 요청하세요."],
    [control(settingsStore, "signOff"), control(settingsStore, "requestChanges", settingsStore.revision, { text: l("Keep the old keys readable for one release.", "이전 키는 한 릴리스 동안 읽을 수 있게 둬.") })]);
  waiting("F6", "Confirm card: add turns", "확인 카드: 턴 추가", ["the billing fix is near its turn limit.", "결제 수정이 턴 한도에 가까워."],
    ["It has used most of its turns on the cause. Add turns so it can finish.", "원인을 찾느라 턴을 거의 다 썼습니다. 턴을 추가하면 마무리할 수 있습니다."], [control(billing, "extend")]);
  waiting("F7", "Approval card and a question card from one task", "한 작업의 승인 카드와 질문 카드", ["the Node upgrade is waiting on me.", "Node 업그레이드가 나를 기다리고 있어."],
    ["Its task waits for an approval and an answer.", "작업이 승인 하나와 답변 하나를 기다리고 있습니다."],
    [control(runtime, "approve", runtime.revision, { requestRef: "gallery-runtime-approval" }),
      control(runtime, "answer", runtime.revision, { requestRef: "gallery-runtime-question", answers: { "node-version": "24.11 LTS" } })]);
  waiting("F8", "Approval card: request cut to fit", "승인 카드: 잘린 요청", ["approve the package release script.", "패키지 릴리스 스크립트를 승인해 줘."],
    ["The command is longer than the card. Open the task to read it whole before approving.", "명령이 카드보다 깁니다. 승인하기 전에 작업을 열어 전체를 읽어 보세요."],
    [control(packages, "approve", packages.revision, { requestRef: "gallery-packages-approval" })]);
  waiting("F9", "Confirm card: send my words to the run", "확인 카드: 실행에 내 말 전하기", ["tell the webhook run to cap retries at three.", "웹훅 실행에 재시도를 세 번으로 제한하라고 전해."],
    ["Confirm and I will say exactly this in its task.", "확인하시면 이 문장 그대로 작업에 전하겠습니다."],
    [control(webhook, "message", webhook.revision, { text: l("Cap retries at three attempts, then mark the delivery failed.", "재시도는 세 번까지만 하고, 그 뒤에는 전송을 실패로 표시해.") })]);
  waiting("F10", "Confirm card: accept as done (cannot be undone)", "확인 카드: 완료로 받아들이기(되돌릴 수 없음)", ["just accept the audit log work.", "감사 로그 작업은 그냥 받아들여."],
    ["Stave could not verify it. Accepting completes it without that check.", "Stave가 검증하지 못했습니다. 받아들이면 검증 없이 완료됩니다."], [control(audit, "acceptCompletion")]);

  // G · Questions that no longer wait. The one still waiting is the last message (M).
  {
    const c = begin("G1", "Question answered with a reply option", "답변 선택지로 답한 질문");
    const question = l("Should I pause the billing fix until finance confirms the file format?", "재무팀이 파일 형식을 확인할 때까지 결제 수정을 멈출까요?");
    const ask: TarsDecisionAction = { kind: "ask", question, recommended: 1, options: [
      { label: l("Pause it now", "지금 멈추기"), rationale: l("It resumes once finance answers.", "재무팀이 답하면 다시 시작합니다."), effect: control(billing, "pause", 1) },
      { label: l("Keep it running", "계속 실행"), rationale: l("The header row is needed either way.", "어느 쪽이든 헤더 행은 필요합니다."), effect: { kind: "reply" } },
      { label: l("Explain the risk", "위험 설명"), rationale: l("Tars explains before you decide.", "결정하기 전에 Tars가 설명합니다."), effect: { kind: "reply" } },
    ] };
    const message = said("g-g1", c.at(), `${c.label}: ${l("the finance team may change the format.", "재무팀이 형식을 바꿀 수도 있대.")}`,
      l("That may change what the fix writes.", "수정이 쓰는 내용이 바뀔 수 있습니다."), [ask]);
    receipt(message, 0, { status: "proposed" });
    const decisionId = "ask:g-g1:0";
    const reply = l("Understood. I will keep it running and report back when the check finishes.", "알겠습니다. 계속 실행하고 확인이 끝나면 알려 드리겠습니다.");
    const answerMessage = said("g-g1-answer", c.at(30), ask.options[1]!.label, reply, [], { requestId: `answer:${decisionId}`,
      origin: { kind: "answer", decisionId, optionIndex: 1, source: "click", question, rationale: ask.options[1]!.rationale } });
    answers.push({ decisionId, optionIndex: 1, source: "click", effect: { kind: "reply" }, label: ask.options[1]!.label, status: "applied", reason: null, error: null,
      actRequestId: null, messageId: answerMessage.id, revision: 2, createdAt: c.at(30), updatedAt: c.at(30) });
  }
  {
    const c = begin("G2", "Question answered in words with a control option", "말로 답한 질문(제어 선택지)");
    const pause = control(upload, "pause", 1);
    const ask: TarsDecisionAction = { kind: "ask", question: l("The upload test fails on CI again. Pause the fix while I read the log?", "업로드 테스트가 CI에서 또 실패했습니다. 로그를 읽는 동안 수정을 멈출까요?"),
      options: [{ label: l("Pause it", "멈추기"), rationale: l("Nothing changes until the log is read.", "로그를 읽을 때까지 아무것도 바뀌지 않습니다."), effect: pause },
        { label: l("Keep going", "계속하기"), rationale: l("The fix does not depend on that test.", "수정은 그 테스트와 관계없습니다."), effect: { kind: "reply" } }] };
    const message = said("g-g2", c.at(), `${c.label}: ${l("CI failed on the upload test again.", "업로드 테스트가 CI에서 또 실패했어.")}`,
      l("Choose how to continue.", "어떻게 할지 골라 주세요."), [ask]);
    receipt(message, 0, { status: "proposed" });
    const decisionId = "ask:g-g2:0";
    answers.push({ decisionId, optionIndex: 0, source: "words", effect: pause, label: ask.options[0]!.label, status: "applied", reason: null, error: null,
      actRequestId: `answer:${decisionId}`, messageId: null, revision: 2, createdAt: c.at(20), updatedAt: c.at(20) });
    record(`answer:${decisionId}`, c.at(20), "words", pause, { status: "applied" });
  }
  {
    const c = begin("G3", "Question passed: the conversation moved on", "지나간 질문: 대화가 넘어감");
    const message = said("g-g3", c.at(), `${c.label}: ${l("what should the retry limit be?", "재시도 한도는 얼마가 좋을까?")}`, l("Pick one:", "하나를 골라 주세요."), [{ kind: "ask",
      question: l("How many times should the webhook sender retry a failed delivery?", "웹훅 전송이 실패하면 몇 번까지 다시 시도할까요?"),
      options: [{ label: l("Three times", "세 번"), rationale: l("Matches the payment provider.", "결제 대행사와 같습니다."), effect: { kind: "reply" } },
        { label: l("Five times", "다섯 번"), rationale: l("Rides out longer outages.", "긴 장애도 버팁니다."), effect: { kind: "reply" } }] }]);
    receipt(message, 0, { status: "proposed" });
  }
  {
    const c = begin("G4", "Question no longer valid: the work changed; Tars asked again", "더는 유효하지 않은 질문: 작업이 바뀌어 다시 물음");
    const message = said("g-g4", c.at(), `${c.label}: ${l("keep the release check going?", "릴리스 확인을 계속할까?")}`, l("One question first.", "먼저 하나만 여쭤볼게요."), [{ kind: "ask",
      question: l("Pause the release check until the staging deploy finishes?", "스테이징 배포가 끝날 때까지 릴리스 확인을 멈출까요?"),
      options: [{ label: l("Pause it", "멈추기"), rationale: l("It resumes after staging.", "스테이징 뒤에 다시 시작합니다."), effect: control(release, "pause", 2) },
        { label: l("Keep it running", "계속 실행"), rationale: l("It does not depend on staging.", "스테이징과 관계없습니다."), effect: { kind: "reply" } }] }]);
    receipt(message, 0, { status: "proposed" });
    said("g-g4-reask", c.at(30), "Re-ask: the release check changed after the question.", l("The release check moved on since I asked: it is paused now. I will ask again once staging is green.",
      "질문한 뒤로 릴리스 확인이 바뀌었습니다. 지금은 멈춰 있습니다. 스테이징이 정상이 되면 다시 여쭙겠습니다."),
    [], { requestId: "reask:ask:g-g4:0", origin: { kind: "reask", decisionId: "ask:g-g4:0", reason: "targetMoved", summary: "Pause the release check at revision 2." } });
  }
  {
    const c = begin("G5", "Question no longer valid: the work ended", "더는 유효하지 않은 질문: 작업이 끝남");
    const message = said("g-g5", c.at(), `${c.label}: ${l("anything left on the setup guide?", "설정 가이드에 남은 게 있어?")}`, l("One choice:", "하나만 골라 주세요."), [{ kind: "ask",
      question: l("Ask for one more review of the setup guide?", "설정 가이드 리뷰를 한 번 더 요청할까요?"),
      options: [{ label: l("Pause for review", "리뷰를 위해 멈추기"), rationale: l("A reviewer reads it first.", "리뷰어가 먼저 읽습니다."), effect: control(docs, "pause", 4) },
        { label: l("Leave it", "그대로 두기"), rationale: l("It already passed review.", "이미 리뷰를 통과했습니다."), effect: { kind: "reply" } }] }]);
    receipt(message, 0, { status: "proposed" });
  }
  {
    const c = begin("G6", "Question settled another way", "다른 방법으로 정리된 질문");
    const accept = control(docs, "acceptCompletion", 4);
    const message = said("g-g6", c.at(), `${c.label}: ${l("the setup guide passed review without a Stave check.", "설정 가이드가 Stave 확인 없이 리뷰를 통과했어.")}`,
      l("Answer the question, or confirm the acceptance directly.", "질문에 답하거나, 바로 받아들이기를 확인하세요."), [
        { kind: "ask", question: l("Accept the setup guide without a Stave-verified check?", "Stave 검증 없이 설정 가이드를 받아들일까요?"),
          options: [{ label: l("Accept it", "받아들이기"), rationale: l("The review already covered it.", "리뷰에서 이미 확인했습니다."), effect: accept },
            { label: l("Wait for a check", "확인 기다리기"), rationale: l("Tars asks for a verification run.", "Tars가 검증 실행을 요청합니다."), effect: { kind: "reply" } }] },
        accept,
      ]);
    receipt(message, 0, { status: "proposed" });
    receipt(message, 1, { status: "proposed" });
    confirmAnswer("confirm:g-g6:1", accept, c.at(20), "key", "applied");
  }

  // H · Automatic follow-ups: Tars's own look after a change. Not the user's words, so they show a line instead of a bubble.
  {
    const c = begin("H", "Automatic follow-ups (every reason, a superseded one, and one past the turn limit)", "자동 후속 확인(모든 이유, 대체된 것, 턴 한도를 넘은 것)");
    said("g-h", c.at(), `${c.label}`, l("These are the looks I take by myself after a change.", "변경이 생기면 제가 스스로 살펴본 기록입니다."));
    let second = 10;
    const followUp = (target: TarsResponsibility, reason: "blocked" | "unverifiedCompletion" | "verificationFailed" | "stageAsksUser" | "waitExpired", reply: string | null,
      stage?: "question" | "signOff" | "gate", actions: TarsDecisionAction[] = []) => {
      const at = c.at(second);
      second += 8;
      const eventKey = `${reason}:${target.id}:${target.revision}`;
      const origin = { kind: "followUp" as const, eventKey, responsibilityId: target.id, reason, observedRevision: target.revision,
        summary: `${target.title} needs judgment (${reason}).`, ...(stage ? { stage } : {}) };
      // i18n-ignore: model-facing text of the automatic follow-up, never shown
      const text = `Automatic follow-up: ${reason}. Judge what it needs next.`;
      const message: TarsMessage = reply === null
        ? { id: `g-h-${reason}-${target.id}`, requestId: `followup:${eventKey}`, text, ...settings, state: "cancelled", revision: 2, reply: null, decision: null, error: null, origin, createdAt: at, updatedAt: at }
        : { id: `g-h-${reason}${stage ? `-${stage}` : ""}`, requestId: `followup:${eventKey}`, text, ...settings, state: "answered", revision: 2, reply, decision: { reply, actions }, error: null, origin, createdAt: at, updatedAt: at };
      messages.push(message);
      events.push({ key: eventKey, responsibilityId: target.id, kind: reason, episode: String(target.revision), observedRevision: target.revision, observedState: target.state,
        attempt: target.agentRunId, status: reply === null ? "superseded" : "followedUp", messageId: message.id, createdAt: at, processedAt: at });
      return message;
    };
    const blocked = followUp(search, "blocked", l("The rebuild stopped: its benchmark needs the production dataset. I suggest a smaller sample instead; I could not start that myself from a follow-up.",
      "벤치마크에 프로덕션 데이터가 필요해 재구성이 멈췄습니다. 더 작은 표본을 쓰길 권하지만, 자동 후속 확인에서는 제가 직접 시작할 수 없었습니다."), undefined,
    [delegate(row({ id: "draft-sample", title: "Benchmark the rebuild on a sampled dataset", state: "queued" }))]);
    receipt(blocked, 0, { status: "rejected", reason: "notByFollowUp" });
    followUp(audit, "unverifiedCompletion", l("The audit log run reported done, but no check Stave ran confirms it. Accept it below or ask for a verification run.",
      "감사 로그 실행은 완료를 보고했지만 Stave가 실행한 확인으로 입증되지 않았습니다. 아래에서 받아들이거나 검증 실행을 요청하세요."));
    followUp(upload, "verificationFailed", l("The upload fix ended with a required criterion unmet: the CI run still fails one time in five.",
      "업로드 수정이 필수 기준을 충족하지 못한 채 끝났습니다. CI는 여전히 다섯 번에 한 번 실패합니다."));
    followUp(runtime, "stageAsksUser", l("Its task asks which Node 24 release CI should use. Answer on the card above.", "작업이 CI에서 쓸 Node 24 릴리스를 묻고 있습니다. 위 카드에서 답하세요."), "question");
    followUp(packages, "stageAsksUser", l("A Stave check stopped the release stage; it asks nothing. It needs the full command reviewed before it can continue.",
      "Stave 확인이 릴리스 단계를 멈췄고, 질문은 없습니다. 이어가려면 전체 명령을 검토해야 합니다."), "gate");
    followUp(settingsStore, "stageAsksUser", l("The design stage waits for your sign-off.", "설계 단계가 승인을 기다립니다."), "signOff");
    followUp(release, "waitExpired", l("The release check has waited an hour without change. Staging is still deploying, so I will look again later.",
      "릴리스 확인이 한 시간 동안 변화 없이 기다렸습니다. 스테이징 배포가 아직 진행 중이라 나중에 다시 보겠습니다."));
    followUp(billing, "blocked", null);
    const exhaustedAt = c.at(second);
    events.push({ key: `blocked:${search.id}:5`, responsibilityId: search.id, kind: "blocked", episode: "5", observedRevision: 5, observedState: "blocked",
      attempt: search.agentRunId, status: "exhausted", messageId: null, createdAt: exhaustedAt, processedAt: exhaustedAt });
  }

  // I · What a click, Fleet, a task, a key, words or a drag leaves: one line each, never a user message.
  {
    const c = begin("I", "Control and queue records", "제어와 큐 기록");
    said("g-i", c.at(), `${c.label}`, l("Below are the records your direct controls leave.", "아래는 직접 제어하신 동작이 남긴 기록입니다."));
    let second = 10;
    const next = () => c.at(second += 3);
    const direct = (target: TarsResponsibility, operation: TarsControlOperation, source: TarsActionRecord["source"], outcome: Parameters<typeof record>[4] = { status: "applied" }) =>
      record(`gallery-record-${source}-${operation}-${second}`, next(), source, control(target, operation, target.revision - 1), outcome);
    direct(release, "pause", "click");
    direct(release, "resume", "click");
    direct(migration, "takeover", "click");
    direct(migration, "handBack", "fleet");
    direct(webhook, "startNow", "click");
    direct(billing, "extend", "task");
    direct(docs, "acceptCompletion", "key");
    direct(search, "retryStage", "words");
    direct(billing, "pause", "click", { status: "pending" });
    direct(migration, "resume", "click", { status: "rejected", reason: "takenOver" });
    const move = (target: TarsResponsibility, direction: "earlier" | "later", source: "click" | "drag", outcome: Parameters<typeof record>[4], priority?: number) =>
      record(`gallery-move-${source}-${direction}-${second}`, next(), source, { kind: "move", responsibilityId: target.id, expectedRevision: target.revision - 1,
        move: { direction } }, outcome, priority === undefined ? {} : { priority });
    move(webhook, "earlier", "click", { status: "applied" }, 60);
    move(upload, "later", "drag", { status: "applied" }, 40);
    move(webhook, "earlier", "click", { status: "rejected", reason: "queueEdge" });
  }

  // J · Words confirmed for a run whose turn was running: where their delivery stands.
  {
    const c = begin("J", "Words for a busy run, in every delivery state", "바쁜 실행에 보낼 말의 모든 전달 상태");
    said("g-j", c.at(), `${c.label}`, l("Words you confirm while a turn runs wait and are said once, after it.", "턴이 실행 중일 때 확인하신 말은 기다렸다가 턴이 끝난 뒤 한 번 전해집니다."));
    const statuses: Array<{ status: TarsMessageDelivery["status"]; reason: TarsMessageDelivery["reason"] }> = [
      { status: "queued", reason: null }, { status: "delivering", reason: null }, { status: "delivered", reason: null },
      { status: "failed", reason: "runRefused" }, { status: "cancelled", reason: "takenOver" },
    ];
    statuses.forEach(({ status, reason }, index) => {
      const at = c.at(10 + index * 4);
      record(`gallery-delivery-${status}`, at, "click", control(webhook, "message", 2, { text: l("Log every retry with its attempt number.", "재시도마다 시도 횟수를 함께 기록해.") }),
        { status: "applied" }, { delivery: { status, agentRunId: "run-gallery-webhook", ...(status === "delivering" ? { turnId: "turn-gallery-webhook" } : {}),
          reason, error: reason ? DIAGNOSTIC : null, queuedAt: at, updatedAt: at } });
    });
  }

  // K · Activity notices: only completion, a block and an unasked end reach the transcript.
  {
    const c = begin("K1", "Activity notices: completed, blocked, cancelled", "활동 알림: 완료, 막힘, 취소");
    said("g-k1", c.at(), `${c.label}`, l("Work that finished, stopped or ended shows a line where it happened.", "끝났거나 멈췄거나 종료된 작업은 그 시점에 한 줄로 표시됩니다."));
    activity.push(
      { id: "gallery-activity-docs", responsibilityId: docs.id, revision: docs.revision, title: docs.title, state: "completed", detail: null, createdAt: c.at(10) },
      { id: "gallery-activity-search", responsibilityId: search.id, revision: search.revision, title: search.title, state: "blocked", detail: search.detail,
        detailCode: search.detailCode, detailParams: search.detailParams, createdAt: c.at(14) },
      { id: "gallery-activity-export", responsibilityId: "export-queue", revision: 2, title: "Migrate the export queue to the new worker", state: "cancelled",
        detail: "The worker image was not available.", createdAt: c.at(18) },
    );
  }
  {
    const c = begin("K2", "Stave's own decision: completion not verified (after a refused click)", "Stave의 결정: 완료 미검증(거절된 클릭 이후)");
    said("g-k2", c.at(), `${c.label}`, l("When a run reports done without a check Stave ran, Stave asks you itself.", "Stave가 실행한 확인 없이 완료가 보고되면 Stave가 직접 묻습니다."));
    activity.push({ id: "gallery-activity-audit", responsibilityId: audit.id, revision: audit.revision, title: audit.title, state: "blocked", detail: audit.detail,
      detailCode: "unverifiedCompletion", createdAt: c.at(10) });
    const decisionId = `unverified:${audit.id}:${audit.revision}`;
    // A retryable refusal leaves Stave's decision open, showing the attempt on the card.
    answers.push({ decisionId, optionIndex: 0, source: "click", effect: control(audit, "acceptCompletion"), label: null, status: "rejected", reason: "unknown",
      error: DIAGNOSTIC, actRequestId: `answer:${decisionId}`, messageId: null, revision: 2, createdAt: c.at(20), updatedAt: c.at(20) });
    pendingDecisions.push({ kind: "unverifiedCompletion", responsibilityId: audit.id, messageId: null, actionIndex: null, operation: null,
      expectedRevision: audit.revision, proposedAt: c.at(10), optionCount: 3 });
  }

  // K3–K7 · Result cards: ended work the view still holds shows what it came to, where its notice would be one line.
  const result = buildTarsResultFixtures(start);
  for (const [code, id, en, ko, replyEn, replyKo] of [
    ["K3", result.ids.verified, "Result card: completed and verified", "결과 카드: 완료, 검증됨",
      "A check Stave ran or a passed review backs each criterion.", "Stave가 실행한 검사나 통과한 리뷰가 각 기준을 뒷받침합니다."],
    ["K4", result.ids.reported, "Result card: completed, agent's report only", "결과 카드: 완료, 에이전트 보고만 있음",
      "Nothing Stave ran or reviewed confirms these, so the card says so.", "Stave가 실행하거나 리뷰한 것이 없어 카드가 그렇게 표시합니다."],
    ["K5", result.ids.published, "Result card: completed with a draft PR", "결과 카드: 완료, Draft PR 있음",
      "The draft pull request is a link on the card.", "Draft PR은 카드에 링크로 표시됩니다."],
    ["K6", result.ids.stalled, "Result card: blocked, with the run's own words", "결과 카드: 진행 불가, 실행이 남긴 설명 포함",
      "The card says why, keeps the run's own words one click away and offers the next steps.", "카드가 이유를 말하고, 실행이 남긴 설명은 한 번 눌러 볼 수 있으며, 다음에 할 수 있는 일을 보여 줍니다."],
    ["K7", result.ids.failed, "Result card: failed to start", "결과 카드: 시작 실패",
      "A run that could not go on reads as failed, with the provider's diagnostic folded.", "더 진행할 수 없는 실행은 실패로 표시하고, 프로바이더의 진단은 접어 둡니다."],
  ] as const) {
    const c = begin(code, en, ko);
    const target = result.responsibilities.find((entry) => entry.id === id)!;
    said(`g-${code.toLowerCase()}`, c.at(), `${c.label}`, l(replyEn, replyKo));
    activity.push({ id: `gallery-activity-${target.id}`, responsibilityId: target.id, revision: target.revision, title: target.title, state: target.state, detail: target.detail,
      detailCode: target.detailCode, detailParams: target.detailParams, createdAt: c.at(10) });
  }

  // L · Publishing completed work as a draft pull request.
  const publishRecord = (patch: Pick<TarsPublishRecord, "requestId" | "responsibilityId" | "expectedRevision" | "status" | "createdAt"> & Partial<TarsPublishRecord>,
    target: TarsResponsibility): TarsPublishRecord => {
    const value: TarsPublishRecord = { source: "click", requestHash: "f".repeat(64), commitMessage: target.publication?.commitMessage ?? `chore: ${target.title.toLowerCase()}`,
      title: target.publication?.title ?? target.title, proposal: null, reason: null, error: null, url: null, number: null, revision: 2, updatedAt: patch.createdAt, ...patch };
    publications.push(value);
    return value;
  };
  {
    const c = begin("L1", "Publish card waiting for confirmation", "확인을 기다리는 게시 카드");
    const message = said("g-l1", c.at(), `${c.label}: ${l("open a draft PR for the checkout work.", "결제 화면 작업으로 Draft PR을 열어 줘.")}`,
      l("Check the card below. When you confirm it, Stave commits the work, pushes its branch and opens a draft pull request.",
        "아래 카드를 확인하세요. 확인하시면 Stave가 작업을 커밋하고 브랜치를 푸시한 뒤 Draft PR을 엽니다."),
      [{ kind: "publish", responsibilityId: checkout.id, expectedRevision: checkout.revision }]);
    receipt(message, 0, { status: "proposed" });
  }
  {
    const c = begin("L2", "Publish proposal no longer valid", "더는 유효하지 않은 게시 제안");
    const message = said("g-l2", c.at(), `${c.label}: ${l("publish the checkout work as it was this morning.", "오늘 아침 상태의 결제 화면 작업을 게시해 줘.")}`,
      l("Here is the card for that revision.", "그 리비전의 카드입니다."), [{ kind: "publish", responsibilityId: checkout.id, expectedRevision: checkout.revision - 1 }]);
    receipt(message, 0, { status: "proposed" });
  }
  {
    const c = begin("L3", "Publish refused when it was proposed", "제안할 때 거절된 게시");
    const message = said("g-l3", c.at(), `${c.label}: ${l("open a PR for the audit log work.", "감사 로그 작업으로 PR을 열어 줘.")}`,
      l("It has not completed, so there is nothing to publish yet.", "아직 완료되지 않아 게시할 것이 없습니다."), [{ kind: "publish", responsibilityId: audit.id, expectedRevision: audit.revision }]);
    receipt(message, 0, { status: "rejected", reason: "notCompleted" });
  }
  {
    const c = begin("L4", "Publish confirmed on its card: draft PR opened", "카드에서 확인한 게시: Draft PR 열림");
    const message = said("g-l4", c.at(), `${c.label}: ${l("publish the setup guide.", "설정 가이드를 게시해 줘.")}`,
      l("Confirm the card and I will open the draft pull request.", "카드를 확인하시면 Draft PR을 열겠습니다."), [{ kind: "publish", responsibilityId: docs.id, expectedRevision: docs.revision }]);
    receipt(message, 0, { status: "applied", responsibilityId: docs.id });
    publishRecord({ requestId: "publish:g-l4:0", responsibilityId: docs.id, expectedRevision: docs.revision, status: "applied", createdAt: c.at(20),
      proposal: { messageId: message.id, actionIndex: 0 }, url: docsUrl, number: 12 }, docs);
  }
  {
    const c = begin("L5", "Publish records from the tray: failed with Retry, and one still publishing", "트레이에서 연 게시 기록: 다시 시도가 있는 실패, 진행 중");
    said("g-l5", c.at(), `${c.label}`, l("Cards you open from the tray or a report leave their outcome here.", "트레이나 보고서에서 연 카드는 결과를 여기에 남깁니다."));
    onboarding.publication = { state: "failed", failedStep: "push", commit: "c41d9e2", branch: onboarding.branchName!, base: "main",
      commitMessage: "feat: polish the onboarding checklist", title: "feat: polish the onboarding checklist", url: null, number: null,
      error: "fatal: unable to access 'https://github.com/example/web.git/': Could not resolve host: github.com", reason: "publishFailed", updatedAt: c.at(12) };
    publishRecord({ requestId: "publish-click:gallery-onboarding", responsibilityId: onboarding.id, expectedRevision: onboarding.revision - 1, status: "rejected",
      reason: "publishFailed", error: onboarding.publication.error, createdAt: c.at(10) }, onboarding);
    landing.publication = { state: "committed", failedStep: null, commit: "5b2e8f0", branch: landing.branchName!, base: "main", commitMessage: "copy: refresh the pricing page",
      title: "copy: refresh the pricing page", url: null, number: null, error: null, reason: null, updatedAt: c.at(16) };
    publishRecord({ requestId: "publish-click:gallery-landing", responsibilityId: landing.id, expectedRevision: landing.revision, status: "pending", createdAt: c.at(14) }, landing);
  }

  // M · The one question still waiting: nothing is said after it.
  {
    const c = begin("M", "Question card waiting for an answer", "답을 기다리는 질문 카드");
    const question = l("Finance has not confirmed the file format yet. Pause the billing fix until they do?", "재무팀이 아직 파일 형식을 확인하지 않았습니다. 확인할 때까지 결제 수정을 멈출까요?");
    const ask: TarsDecisionAction = { kind: "ask", question, recommended: 1, options: [
      { label: l("Pause it now", "지금 멈추기"), rationale: l("It resumes once finance answers.", "재무팀이 답하면 다시 시작합니다."), effect: control(billing, "pause") },
      { label: l("Keep it running", "계속 실행"), rationale: l("The header row is needed either way.", "어느 쪽이든 헤더 행은 필요합니다."), effect: { kind: "reply" } },
      { label: l("Explain the risk", "위험 설명"), rationale: l("Tars explains before you decide.", "결정하기 전에 Tars가 설명합니다."), effect: { kind: "reply" } },
    ] };
    const message = said("g-m", c.at(), `${c.label}: ${l("should the billing fix wait for finance?", "결제 수정이 재무팀을 기다려야 할까?")}`,
      l("The fix is running. Choose how to continue.", "수정이 실행 중입니다. 어떻게 할지 골라 주세요."), [ask]);
    receipt(message, 0, { status: "proposed" });
    pendingDecisions.push({ kind: "ask", responsibilityId: billing.id, messageId: message.id, actionIndex: 0, operation: null, expectedRevision: billing.revision,
      proposedAt: message.createdAt, question, optionCount: 3 });
  }

  const responsibilities = [...byId.values()].map((entry) => entry.id === docs.id ? docs : entry)
    .concat([upload, audit, settingsStore, runtime, packages, webhook, onboarding, landing], result.responsibilities);
  const followUps: TarsFollowUpState[] = [{ responsibilityId: search.id, kind: "blocked", status: "exhausted", at: null },
    { responsibilityId: release.id, kind: "waitExpired", status: "nextCheck", at: new Date(Math.max(Date.now(), galleryStart) + 55 * 60_000).toISOString() }];
  const conversation: GalleryConversation = { settings, messages, receipts, records, answers, activity, events, publications };
  const runs: Record<string, AgentRunDetail> = { ...tray.runs, ...side.runs, ...result.runs };
  // Named so a confirmation card can say where the work runs.
  const workspaceNames = Object.fromEntries(responsibilities.flatMap((entry) => entry.executionWorkspaceId
    ? [[entry.executionWorkspaceId, entry.branchName ?? `tars/${entry.id}`]] : []));
  return { cases, responsibilities, pendingDecisions, followUps, conversation, runs, workspaceNames };
}
