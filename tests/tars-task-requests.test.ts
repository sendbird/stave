import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime, type TarsExecutionObservation } from "../electron/host-service/tars-runtime";
import { actTars, type TarsControlRequest } from "../electron/host-service/tars-control";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { tarsFollowUpRefusal } from "../electron/host-service/tars-follow-up-admission";
import { boundApprovalSummary, describePendingRequests, PENDING_REQUEST_SUMMARY_MAX } from "../electron/host-service/local-mcp-pending";
import {
  TARS_CONFIRMED_OPERATIONS, TARS_IRREVERSIBLE_OPERATIONS, TarsDecisionActionSchema, tarsConfirmationRequestId,
  type TarsControlOperation, type TarsDecisionAction,
} from "../src/lib/tars/conversation";
import { describeTarsControlInput } from "../src/lib/tars/decisions";
import { TarsPendingRequestSchema, type TarsControlInput, type TarsPendingRequest, type TarsResponsibility } from "../src/lib/tars/types";
import type { ChatMessage } from "../src/types/chat";

const NOW = "2026-11-09T00:00:00.000Z";
const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

const APPROVAL: TarsPendingRequest = { kind: "approval", ref: "ref-approval-1", requestId: "approval-1", messageId: "m1", taskId: "exec-task", workspaceId: "execution",
  toolName: "Bash", summary: "Run the test suite — bun test" };
const QUESTION: TarsPendingRequest = { kind: "question", ref: "ref-question-1", requestId: "question-1", messageId: "m2", taskId: "exec-task", workspaceId: "execution",
  toolName: "AskUserQuestion", summary: "Which index?", questions: [{ key: "index", question: "Which index?", options: ["existing", "new"] }] };

/** The real runtime, stores and decision admission; the host's task answers are recorded instead of sent. */
function fixture() {
  const database = new Database(":memory:"); databases.push(database);
  const store = new TarsStore(database);
  const conversations = new TarsConversationStore(database);
  let observation: TarsExecutionObservation = { state: "running", detail: null, activeStage: "work#1" };
  const responded: TarsControlRequest[] = [];
  let respond: (request: TarsControlRequest) => Promise<void> = async (request) => { responded.push(request); };
  const runtime = createTarsRuntime({
    store, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => "owned-run", startRun: async () => "owned-run",
    observe: async () => observation, controlRun: async () => {}, respondTask: (_row, request) => respond(request),
  });
  const created = store.create({ requestId: "owned", title: "Fix search", instruction: "Fix and verify search.",
    acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex" }, NOW);
  const row = store.patch(created.id, created.revision, { state: "running", taskId: "exec-task", executionWorkspaceId: "execution", agentRunId: "owned-run" }, NOW);
  const tick = async () => { runtime.requestTick(); await runtime.drain(); await runtime.drain(); };
  let messages = 0;
  /** The user's words become this decision, admitted by the host exactly as a planner reply would be. */
  const say = async (operation: TarsControlOperation, input?: TarsControlInput) => {
    conversations.configure({ providerId: "codex", model: "test-model", maxTurns: 6, autonomy: "careful" });
    const queued = conversations.create({ requestId: `message-${messages++}`, text: "승인해줘" }, NOW);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    const current = store.get(row.id)!;
    const actions: TarsDecisionAction[] = [{ kind: "control", responsibilityId: row.id, expectedRevision: current.revision, operation,
      ...(input ? { input } : {}) }];
    const message = conversations.answer(claimed.id, claimed.revision, { reply: "Confirm on the card.", actions }, NOW);
    const [receipt] = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, {
      conversations, responsibilities: store, readRegistry: () => [], now: () => NOW, requestTick: () => runtime.requestTick(), control: runtime.act });
    await runtime.drain();
    return { message, receipt: receipt!, revision: current.revision };
  };
  /** The card's Confirm: it names the proposal and its operation, never the input; the host takes that from the proposal. */
  const confirm = async (messageId: string, operation: TarsControlOperation, expectedRevision: number) =>
    (await actTars({ requestId: tarsConfirmationRequestId(messageId, 0), responsibilityId: row.id, expectedRevision, operation, source: "click" },
      { conversations, runtime, now: () => NOW })).record;
  return { store, row, runtime, tick, say, confirm, responded, current: () => store.get(row.id)!,
    observe: (value: TarsExecutionObservation) => { observation = value; }, failWith: (error: Error) => { respond = async () => { throw error; }; } };
}

const waitingOn = (...requests: TarsPendingRequest[]): TarsExecutionObservation => ({ state: "waiting", detail: "The execution task is waiting for your input or approval.",
  detailCode: "waitingForUser", detailParams: null, activeStage: "work#1", pendingRequests: requests });

describe("Answering the work's task through Tars", () => {
  test("Tars records what waits in the task, and clears it once the run goes on", async () => {
    const f = fixture();
    f.observe(waitingOn(APPROVAL, QUESTION));
    await f.tick();
    expect(f.current()).toMatchObject({ state: "waiting", pendingRequests: [APPROVAL, QUESTION] });
    f.observe({ state: "running", detail: null, activeStage: "work#1" });
    await f.tick();
    expect(f.current().pendingRequests).toBeUndefined();
    f.runtime.stop();
  });

  test("approving from words waits for Confirm, and Confirm answers exactly the request the card showed", async () => {
    const f = fixture();
    f.observe(waitingOn(APPROVAL, QUESTION));
    await f.tick();
    // Later looks are held so the result of the answer itself is what is checked.
    f.runtime.stop();
    const { message, receipt, revision } = await f.say("approve", { requestRef: "ref-approval-1" });
    expect(receipt.status).toBe("proposed");
    expect(f.responded).toEqual([]);
    expect(await f.confirm(message.id, "approve", revision)).toMatchObject({ status: "applied", action: { operation: "approve", input: { requestRef: "ref-approval-1" } } });
    expect(f.responded).toEqual([expect.objectContaining({ operation: "approve", input: { requestRef: "ref-approval-1" } })]);
    // The question still waits, so the work keeps waiting on it.
    expect(f.current()).toMatchObject({ state: "waiting", pendingRequests: [QUESTION] });
    f.runtime.stop();
  });

  test("deny applies at once from words; an answer is checked against the waiting questions", async () => {
    const f = fixture();
    f.observe(waitingOn(APPROVAL, QUESTION));
    await f.tick();
    f.runtime.stop();
    const denied = await f.say("deny", { requestRef: "ref-approval-1" });
    expect(denied.receipt.status).toBe("applied");
    expect(f.responded.map((request) => request.operation)).toEqual(["deny"]);
    // A key the question does not have is refused when it is proposed, never sent.
    const wrong = await f.say("answer", { requestRef: "ref-question-1", answers: { color: "blue" } });
    expect(wrong.receipt).toMatchObject({ status: "rejected", reason: "requestUnavailable" });
    const answered = await f.say("answer", { requestRef: "ref-question-1", answers: { index: "existing" } });
    expect(await f.confirm(answered.message.id, "answer", answered.revision)).toMatchObject({ status: "applied" });
    expect(f.responded.at(-1)).toMatchObject({ operation: "answer", input: { requestRef: "ref-question-1", answers: { index: "existing" } } });
    // Nothing waits any more: the run goes on.
    expect(f.current()).toMatchObject({ state: "running" });
    expect(f.current().pendingRequests).toBeUndefined();
    f.runtime.stop();
  });

  test("a request that is not waiting, or a set that changed since the user saw it, is refused", async () => {
    const f = fixture();
    f.observe(waitingOn(APPROVAL));
    await f.tick();
    expect((await f.say("approve", { requestRef: "unknown" })).receipt).toMatchObject({ status: "rejected", reason: "requestUnavailable" });
    const proposal = await f.say("approve", { requestRef: "ref-approval-1" });
    // A new request arrived before the user confirmed: the revision moved, so the card is stale.
    f.observe(waitingOn(APPROVAL, QUESTION));
    await f.tick();
    expect(await f.confirm(proposal.message.id, "approve", proposal.revision)).toMatchObject({ status: "rejected", reason: "stale" });
    expect(f.responded).toEqual([]);
    f.runtime.stop();
  });

  test("the user's words reach the run as a reply, and a busy task is refused with its reason", async () => {
    const f = fixture();
    f.observe({ state: "waiting", detail: "Which index should search use?", stageAsksUser: true, activeStage: "work#1" });
    await f.tick();
    f.runtime.stop();
    const sent = await f.say("message", { text: "Use the existing index." });
    expect(sent.receipt.status).toBe("proposed");
    expect(await f.confirm(sent.message.id, "message", sent.revision)).toMatchObject({ status: "applied", action: { input: { text: "Use the existing index." } } });
    expect(f.current()).toMatchObject({ state: "running" });
    const { TarsTaskBusyError } = await import("../electron/host-service/tars-ownership");
    f.failWith(new TarsTaskBusyError());
    const again = await f.say("message", { text: "Also add a test." });
    expect(await f.confirm(again.message.id, "message", again.revision)).toMatchObject({ status: "rejected", reason: "taskBusy" });
    f.runtime.stop();
  });

  test("nothing is answered for work the user holds or paused", async () => {
    const f = fixture();
    f.observe(waitingOn(APPROVAL));
    await f.tick();
    await f.runtime.act({ responsibilityId: f.row.id, expectedRevision: f.current().revision, operation: "pause" }, {
      key: "pause", settled: () => null, apply: (effect) => { effect(); return null; }, reject: () => null });
    expect((await f.say("deny", { requestRef: "ref-approval-1" })).receipt).toMatchObject({ status: "rejected", reason: "resumeFirst" });
    expect((await f.say("message", { text: "Go on." })).receipt).toMatchObject({ status: "rejected", reason: "resumeFirst" });
    expect(f.responded).toEqual([]);
    f.runtime.stop();
  });
});

describe("Task operation rules", () => {
  test("only task operations carry input, each exactly the fields it needs", () => {
    const parse = (operation: TarsControlOperation, input?: TarsControlInput) =>
      TarsDecisionActionSchema.safeParse({ kind: "control", responsibilityId: "r", expectedRevision: 1, operation, ...(input ? { input } : {}) }).success;
    expect(parse("approve", { requestRef: "a" })).toBe(true);
    expect(parse("approve")).toBe(false);
    expect(parse("approve", { requestRef: "a", text: "and also" })).toBe(false);
    expect(parse("answer", { requestRef: "q" })).toBe(false);
    expect(parse("message", { text: "hi" })).toBe(true);
    expect(parse("pause", { text: "hi" })).toBe(false);
  });

  test("approving is confirmed and never a default; denying applies at once", () => {
    for (const operation of ["approve", "answer", "message", "requestChanges"] as const) expect(TARS_CONFIRMED_OPERATIONS.has(operation)).toBe(true);
    expect(TARS_CONFIRMED_OPERATIONS.has("deny")).toBe(false);
    expect(TARS_IRREVERSIBLE_OPERATIONS.has("approve")).toBe(true);
  });

  test("an automatic follow-up never answers for the user, but may offer approve or deny for the user to choose", () => {
    const responsibilities = { get: () => ({ state: "waiting", detailCode: null }) as never };
    const origin = { kind: "followUp", responsibilityId: "r", observedRevision: 3, reason: "waitExpired", summary: "" } as never;
    const control = (operation: TarsControlOperation, input: TarsControlInput) => ({ kind: "control" as const, responsibilityId: "r", expectedRevision: 3, operation, input });
    for (const [operation, input] of [["approve", { requestRef: "a" }], ["deny", { requestRef: "a" }], ["answer", { requestRef: "q", answers: { index: "existing" } }]] as const)
      expect(tarsFollowUpRefusal(control(operation, input), origin, responsibilities)).not.toBeNull();
    expect(tarsFollowUpRefusal(control("message", { text: "Verify the fix" }), origin, responsibilities)).toBeNull();
    const ask = (operation: TarsControlOperation, input: TarsControlInput) => ({ kind: "ask" as const, question: "The run asks to run bun test. Allow it?", options: [
      { label: "Pick", rationale: "Answers it.", effect: control(operation, input) }, { label: "Later", rationale: "Keeps it waiting.", effect: { kind: "reply" as const } }] });
    expect(tarsFollowUpRefusal(ask("approve", { requestRef: "a" }), origin, responsibilities)).toBeNull();
    expect(tarsFollowUpRefusal(ask("deny", { requestRef: "a" }), origin, responsibilities)).toBeNull();
    expect(tarsFollowUpRefusal(ask("answer", { requestRef: "q", answers: { index: "new" } }), origin, responsibilities)).not.toBeNull();
  });

  test("the card shows the request, the answers or the words before anyone confirms", () => {
    const row = { pendingRequests: [APPROVAL, QUESTION] } as Pick<TarsResponsibility, "pendingRequests">;
    const control = (operation: TarsControlOperation, input: TarsControlInput) => ({ responsibilityId: "r", expectedRevision: 1, operation, input });
    expect(describeTarsControlInput(control("approve", { requestRef: "ref-approval-1" }), row)).toEqual({ key: "request", value: "Bash: Run the test suite — bun test",
      truncated: false, source: { taskId: "exec-task", workspaceId: "execution" } });
    expect(describeTarsControlInput(control("answer", { requestRef: "ref-question-1", answers: { index: "existing" } }), row))
      .toEqual({ key: "answers", value: "Which index? → existing" });
    expect(describeTarsControlInput(control("message", { text: "Use the existing index." }), row)).toEqual({ key: "words", value: "Use the existing index." });
  });

  test("pending requests are copied bounded from the task's messages", () => {
    const messages = [{ id: "m1", role: "assistant", parts: [
      { type: "approval", requestId: "approval-1", toolName: "Bash", description: "Run the test suite", input: "bun test", state: "approval-requested" },
    ] }, { id: "m2", role: "assistant", parts: [
      { type: "user_input", requestId: "question-1", toolName: "AskUserQuestion", state: "input-requested",
        questions: [{ question: "Which index?", header: "Index", options: [{ label: "existing", description: "" }, { label: "new", description: "" }] }] },
    ] }] as unknown as ChatMessage[];
    expect(describePendingRequests(messages, 6)).toEqual([
      { kind: "approval", requestId: "approval-1", messageId: "m1", toolName: "Bash", summary: "Run the test suite — bun test" },
      { kind: "question", requestId: "question-1", messageId: "m2", toolName: "AskUserQuestion", summary: "Which index?",
        questions: [{ key: "Which index?", question: "Which index?", options: ["existing", "new"] }] },
    ]);
    expect(describePendingRequests(messages, 1)).toHaveLength(1);
  });

  test("a long approval is cut with a visible mark and flagged, never shown as the whole command", () => {
    const command = `set -e\n${Array.from({ length: 40 }, (_, index) => `echo step-${index} >> /tmp/log`).join(" && ")}\nrm -rf ./build`;
    const messages = [{ id: "m1", role: "assistant", parts: [
      { type: "approval", requestId: "approval-1", toolName: "Bash", description: "Run the release script", input: command, state: "approval-requested" },
    ] }] as unknown as ChatMessage[];
    const [request] = describePendingRequests(messages, 6);
    expect(request).toMatchObject({ kind: "approval", truncated: true });
    expect(request!.summary.length).toBeLessThanOrEqual(PENDING_REQUEST_SUMMARY_MAX);
    expect(request!.summary.endsWith("…")).toBe(true);
    // The tail the user would be approving is not in the summary, and the summary does not pretend it is whole.
    expect(request!.summary).not.toContain("rm -rf ./build");
    // Line breaks stay: a multi-line command does not read as one line.
    expect(request!.summary.startsWith("Run the release script — set -e\necho step-0")).toBe(true);
    // The host's copy still fits the snapshot schema the window and the planner read.
    expect(TarsPendingRequestSchema.safeParse({ ...request, ref: "ref", taskId: "task", workspaceId: "workspace" }).success).toBe(true);
    // A short one stays whole and unflagged.
    expect(describePendingRequests([{ ...messages[0]!, parts: [{ ...messages[0]!.parts[0]!, input: "bun test" }] }] as ChatMessage[], 6)[0])
      .not.toHaveProperty("truncated");
  });

  test("bounding keeps lines, folds blank runs and never splits a surrogate pair", () => {
    expect(boundApprovalSummary("a  b\r\n\r\n\r\n\r\nc   \n  d")).toEqual({ summary: "a  b\n\nc\n  d", truncated: false });
    expect(boundApprovalSummary("x".repeat(500))).toEqual({ summary: "x".repeat(500), truncated: false });
    const cut = boundApprovalSummary(`${"x".repeat(498)}😀tail`);
    expect(cut).toEqual({ summary: `${"x".repeat(498)}…`, truncated: true });
    expect(cut.summary.length).toBeLessThanOrEqual(PENDING_REQUEST_SUMMARY_MAX);
  });

  test("the card marks a cut request and names the task that shows it whole", () => {
    const cut = { ...APPROVAL, summary: "Run the release script — set -e…", truncated: true as const, taskId: "helper-task", workspaceId: "helper-workspace" };
    const row = { pendingRequests: [cut] } as Pick<TarsResponsibility, "pendingRequests">;
    expect(describeTarsControlInput({ responsibilityId: "r", expectedRevision: 1, operation: "approve", input: { requestRef: cut.ref } }, row))
      .toEqual({ key: "request", value: "Bash: Run the release script — set -e…", truncated: true, source: { taskId: "helper-task", workspaceId: "helper-workspace" } });
    // A request the window no longer holds names only its ref, and offers no task.
    expect(describeTarsControlInput({ responsibilityId: "r", expectedRevision: 1, operation: "approve", input: { requestRef: "gone" } }, row))
      .toEqual({ key: "request", value: "gone", truncated: false, source: null });
  });
});

test("the tray never confirms an answer in the task: only the conversation card, which shows it, does", async () => {
  const { tarsCardActions } = await import("../src/lib/tars/tray-model");
  const decision = (operation: TarsControlOperation) => ({ responsibilityId: "r", messageId: "m", actionIndex: 0, operation, expectedRevision: 1, proposedAt: NOW });
  const card = (operation: TarsControlOperation) => ({ controls: ["pause", "takeover", "cancel"] as TarsControlOperation[], fleetTarget: null,
    attention: [{ item: { kind: "tars-decision" } as never, decision: decision(operation) }] });
  expect(tarsCardActions(card("approve")).primary).toEqual({ kind: "control", operation: "pause" });
  expect(tarsCardActions(card("message")).more.some((action) => action.kind === "confirm")).toBe(false);
  expect(tarsCardActions(card("resume")).primary).toMatchObject({ kind: "confirm" });
});


test("a retried confirmation whose outcome could not be saved answers the task once, never twice", async () => {
  const f = fixture();
  f.observe({ state: "waiting", detail: "Which index should search use?", stageAsksUser: true, activeStage: "work#1" });
  await f.tick();
  f.runtime.stop();
  const sent = await f.say("message", { text: "Use the existing index." });
  // The reply went out, then saving its outcome hit a lock wait.
  const { TarsStorageBusyError } = await import("../electron/persistence/tars-conversation-store");
  const store = f.store as unknown as { patch: (...args: unknown[]) => unknown };
  const realPatch = store.patch.bind(f.store);
  let busy = true;
  store.patch = (...args: unknown[]) => { if (busy) { busy = false; throw new TarsStorageBusyError(); } return realPatch(...args); };
  await expect(f.confirm(sent.message.id, "message", sent.revision)).rejects.toThrow();
  expect(f.responded).toHaveLength(1);
  // The same request again: its outcome is saved, and nothing is sent a second time.
  expect(await f.confirm(sent.message.id, "message", sent.revision)).toMatchObject({ status: "applied" });
  expect(f.responded).toHaveLength(1);
});

test("a question's answer key is kept whole, and a key too long to keep is left for the task", () => {
  const long = "Which of these should the search index use? ".repeat(10).trim();
  const messages = [{ id: "m1", role: "assistant", parts: [{ type: "user_input", requestId: "q", toolName: "AskUserQuestion", state: "input-requested",
    questions: [{ question: long, header: "Index", options: [] }, { question: "x".repeat(4_001), header: "Too long", options: [] }] }] }] as unknown as ChatMessage[];
  const [request] = describePendingRequests(messages, 6);
  expect(long.length).toBeGreaterThan(300);
  expect(request!.questions!.map((question) => question.key)).toEqual([long]);
});


for (const decided of ["pause", "takeover", "cancel"] as const) {
  test(`a retried confirmation records the answer it already gave and keeps a later ${decided}`, async () => {
    const f = fixture();
    f.observe({ state: "waiting", detail: "Which index should search use?", stageAsksUser: true, activeStage: "work#1" });
    await f.tick();
    f.runtime.stop();
    const sent = await f.say("message", { text: "Use the existing index." });
    const { TarsStorageBusyError } = await import("../electron/persistence/tars-conversation-store");
    const store = f.store as unknown as { patch: (...args: unknown[]) => unknown };
    const realPatch = store.patch.bind(f.store);
    let busy = true;
    store.patch = (...args: unknown[]) => { if (busy) { busy = false; throw new TarsStorageBusyError(); } return realPatch(...args); };
    await expect(f.confirm(sent.message.id, "message", sent.revision)).rejects.toThrow();
    // The user decided something else before the retry.
    await f.runtime.act({ responsibilityId: f.row.id, expectedRevision: f.current().revision, operation: decided }, {
      key: decided, settled: () => null, apply: (effect) => { effect(); return null; }, reject: () => null });
    const state = f.current().state;
    expect(state).toBe(decided === "pause" ? "paused" : decided === "takeover" ? "takenOver" : "cancelled");
    expect(await f.confirm(sent.message.id, "message", sent.revision)).toMatchObject({ status: "applied" });
    expect(f.current().state).toBe(state);
    expect(f.responded).toHaveLength(1);
  });
}
