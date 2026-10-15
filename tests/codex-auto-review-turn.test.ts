import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disposeAllCodexAppServerClients, streamCodexWithAppServer } from "../electron/providers/codex-app-server-runtime";
import type { BridgeEvent, ProviderResponderResult } from "../electron/providers/types";
import type { ProviderRuntimeOptions } from "../src/lib/providers/provider.types";

const directories: string[] = [];
const originalApprovalTimeout = process.env.STAVE_CODEX_APPROVAL_TIMEOUT_MS;
beforeEach(() => { process.env.STAVE_CODEX_APPROVAL_TIMEOUT_MS = "25"; });
afterEach(() => {
  if (originalApprovalTimeout === undefined) delete process.env.STAVE_CODEX_APPROVAL_TIMEOUT_MS;
  else process.env.STAVE_CODEX_APPROVAL_TIMEOUT_MS = originalApprovalTimeout;
  disposeAllCodexAppServerClients();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

type ServerOptions = {
  /** `configRequirements/read` answer. */
  requirements?: unknown;
  /** The reviewer `thread/start` reports; defaults to the one requested. */
  threadReviewer?: string;
  /** What the server asks after `turn/start`; `none` completes the turn, `fail` fails it. */
  request?: "approval" | "user_input" | "none" | "fail";
  /** Answer this method with a JSON-RPC error: only while it asks for auto-review, or always. */
  refuse?: { method: "thread/start" | "thread/resume" | "turn/start"; when: "auto_review" | "always" };
  /** Before refusing `turn/start`, announce that turn as started (or completed) first. */
  notifyBeforeRefuse?: "turn/started" | "turn/completed";
};

// A real child process exercises JSON-RPC transport, pending approvals,
// responders and cancellation. It never calls a model or executes a tool.
function fakeServer(version: string, options: ServerOptions = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "stave-reviewer-test-"));
  directories.push(cwd);
  const executable = join(cwd, "codex");
  const receipts = join(cwd, "receipts.jsonl");
  writeFileSync(executable, `#!${process.execPath}
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
if (process.argv.includes("--version")) { console.log("codex-cli ${version}"); process.exit(0); }
const options = ${JSON.stringify(options)};
const send = (message) => console.log(JSON.stringify({ jsonrpc: "2.0", ...message }));
const record = (entry) => appendFileSync(${JSON.stringify(receipts)}, JSON.stringify(entry) + "\\n");
const complete = (status, error) => send({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status, ...(error ? { error } : {}) } } });
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (m.id === "request-1" && !m.method) { record({ response: m.result }); complete("completed"); return; }
  if (!m.method || m.id == null) return;
  if (m.method === "configRequirements/read") record({ method: m.method });
  const refused = options.refuse?.method === m.method &&
    (options.refuse.when === "always" || m.params.approvalsReviewer === "auto_review");
  if (m.method === "thread/start" || m.method === "thread/resume" || m.method === "turn/start") {
    record({ method: m.method, approvalPolicy: m.params.approvalPolicy, approvalsReviewer: m.params.approvalsReviewer,
      ...(m.method === "turn/start" ? { sandboxPolicy: m.params.sandboxPolicy } : {}), ...(refused ? { refused: true } : {}) });
  }
  if (refused && m.method === "turn/start" && options.notifyBeforeRefuse === "turn/started") send({ method: "turn/started", params: { threadId: "thread-1", turn: { id: "turn-1" } } });
  if (refused && m.method === "turn/start" && options.notifyBeforeRefuse === "turn/completed") complete("completed");
  if (refused) return send({ id: m.id, error: { code: -32602, message: "Invalid request: approvalsReviewer is not allowed" } });
  let result = {};
  if (m.method === "config/read") result = { config: {}, layers: [] };
  if (m.method === "configRequirements/read") result = { requirements: options.requirements ?? null };
  if (m.method === "account/read") result = { account: null, requiresOpenaiAuth: false };
  if (m.method === "thread/start" || m.method === "thread/resume") {
    result = { thread: { id: "thread-1" }, approvalsReviewer: options.threadReviewer ?? m.params.approvalsReviewer };
  }
  if (m.method === "turn/start") result = { turn: { id: "turn-1" } };
  send({ id: m.id, result });
  if (m.method === "turn/start") setTimeout(() => {
    if (options.request === "none") return complete("completed");
    if (options.request === "fail") return complete("failed", { message: "Model stream failed" });
    if (options.request === "user_input") return send({ id: "request-1", method: "item/tool/requestUserInput", params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1", questions: [{ id: "q1", header: "Choice", question: "Which one?", options: null }] } });
    send({ id: "request-1", method: "item/commandExecution/requestApproval", params: { threadId: "thread-1", turnId: "turn-1", command: "test command", reason: "Human review required" } });
  }, 10);
  if (m.method === "turn/interrupt") complete("interrupted");
});
`);
  chmodSync(executable, 0o755);
  const read = () => existsSync(receipts)
    ? readFileSync(receipts, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>)
    : [];
  const requests = () => read().filter((entry) => entry.method);
  return { cwd, executable, read, requests, turnStarts: () => read().filter((entry) => entry.method === "turn/start") };
}

const autoReview = { codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review",
  codexFileAccess: "workspace-write", codexNetworkAccess: false, codexAutoApproveStaveLocalMcpTools: true } as const;
/** The Auto from before auto-review, which every fallback must equal. */
const autoBefore = { approvalPolicy: "never", approvalsReviewer: "user" };

function startTurn(server: ReturnType<typeof fakeServer>, args: {
  taskId: string;
  agentRunId?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}) {
  const events: BridgeEvent[] = [];
  const responders: {
    approval?: (input: { requestId: string; approved: boolean }) => ProviderResponderResult;
    userInput?: (input: { requestId: string; answers?: Record<string, string>; denied?: boolean }) => ProviderResponderResult;
    abort?: () => void;
  } = {};
  let asked!: () => void;
  const waiting = new Promise<void>((resolve) => { asked = resolve; });
  const work = streamCodexWithAppServer({
    providerId: "codex", cwd: server.cwd, taskId: args.taskId, prompt: "Work",
    ...(args.agentRunId ? { agentRunStage: { agentRunId: args.agentRunId, stageId: "work", attempt: 1 } } : {}),
    runtimeOptions: { codexBinaryPath: server.executable, ...(args.runtimeOptions ?? autoReview) },
    registerAbort: (fn) => { responders.abort = fn; },
    registerApprovalResponder: (fn) => { responders.approval = fn; },
    registerUserInputResponder: (fn) => { responders.userInput = fn; },
    onEvent: (event) => { events.push(event); if (event.type === "approval" || event.type === "user_input") asked(); },
  });
  return {
    events, responders, work,
    asked: () => Promise.race([waiting, work.then(() => { throw new Error("Turn completed before asking"); })]),
  };
}

const fallbackNotices = (events: BridgeEvent[]) =>
  events.filter((event) => event.type === "system" && event.content.includes("auto-review is not available"));
const errors = (events: BridgeEvent[]) =>
  events.flatMap((event) => (event.type === "error" ? [event.message] : []));
const stopReason = (events: BridgeEvent[]) =>
  events.flatMap((event) => (event.type === "done" ? [event.stop_reason] : [])).at(-1);

for (const version of ["0.162.1", "0.162.0"]) {
  for (const decision of ["approve", "deny", "cancel"] as const) {
    test(`agent run ${version} approval ${decision} reaches Codex when answered in time`, async () => {
      process.env.STAVE_CODEX_APPROVAL_TIMEOUT_MS = "60000";
      const server = fakeServer(version);
      const turn = startTurn(server, { taskId: `task-${version}-${decision}`, agentRunId: `run-${version}-${decision}` });
      await turn.asked();
      expect(turn.events.filter((event) => event.type === "approval")).toHaveLength(1);
      const sent = server.turnStarts()[0]!;
      expect(sent.approvalPolicy).toBe(version === "0.162.1" ? "on-request" : "never");
      expect(sent.approvalsReviewer).toBe(version === "0.162.1" ? "auto_review" : undefined);
      expect(sent.sandboxPolicy).toMatchObject({ type: "workspaceWrite", networkAccess: false, writableRoots: [server.cwd] });
      expect(fallbackNotices(turn.events)).toHaveLength(version === "0.162.1" ? 0 : 1);
      expect(turn.responders.approval?.({ requestId: "wrong-request", approved: true }).ok).toBe(false);
      if (decision === "cancel") turn.responders.abort?.();
      else expect(turn.responders.approval?.({ requestId: "request-1", approved: decision === "approve" }).ok).toBe(true);
      await turn.work;
      expect(turn.events.some((event) => event.type === "done")).toBe(true);
      expect(errors(turn.events)).toEqual([]);
      expect(turn.responders.approval?.({ requestId: "request-1", approved: true }).ok).toBe(false);
      const response = server.read().find((entry) => entry.response)?.response as { decision?: string } | undefined;
      if (decision !== "cancel") expect(response?.decision).toBe(decision === "approve" ? "accept" : "decline");
    }, 10_000);
  }
}

// Native provider callbacks are synchronous requests: an agent run's
// unanswered approval or question times out exactly like any other turn's.
for (const agentRunId of ["run-timeout", undefined]) {
  const label = agentRunId ? "an agent run" : "an ordinary turn";
  test(`${label}: an unanswered approval is declined after the decision timeout`, async () => {
    const server = fakeServer("0.162.1");
    const turn = startTurn(server, { taskId: `task-approval-${label}`, agentRunId });
    await turn.asked();
    await turn.work;
    expect(server.read().find((entry) => entry.response)?.response).toEqual({ decision: "decline" });
    expect(errors(turn.events)).toEqual([expect.stringContaining("did not receive an approval decision")]);
    expect(stopReason(turn.events)).toBeUndefined();
  }, 10_000);

  test(`${label}: an unanswered question is declined after the decision timeout`, async () => {
    const server = fakeServer("0.162.1", { request: "user_input" });
    const turn = startTurn(server, { taskId: `task-question-${label}`, agentRunId });
    await turn.asked();
    await turn.work;
    expect(server.read().find((entry) => entry.response)?.response).toEqual({ answers: {} });
    expect(errors(turn.events)).toEqual([expect.stringContaining("did not receive an answer decision")]);
  }, 10_000);
}

test("an agent run question answered in time reaches Codex", async () => {
  process.env.STAVE_CODEX_APPROVAL_TIMEOUT_MS = "60000";
  const server = fakeServer("0.162.1", { request: "user_input" });
  const turn = startTurn(server, { taskId: "task-question", agentRunId: "run-question" });
  await turn.asked();
  expect(turn.responders.userInput?.({ requestId: "request-1", answers: { q1: "first" } }).ok).toBe(true);
  await turn.work;
  expect(server.read().find((entry) => entry.response)?.response).toEqual({ answers: { q1: { answers: ["first"] } } });
}, 10_000);

test("managed requirements without auto-review run the turn as Auto did before, with one notice", async () => {
  const server = fakeServer("0.162.1", { request: "none", requirements: { allowedApprovalsReviewers: ["user"] } });
  const turn = startTurn(server, { taskId: "task-managed", agentRunId: "run-managed" });
  await turn.work;
  expect(server.requests()).toEqual([
    { method: "configRequirements/read" },
    { method: "thread/start", ...autoBefore },
    { method: "turn/start", ...autoBefore, sandboxPolicy: expect.objectContaining({ type: "workspaceWrite", networkAccess: false }) },
  ]);
  expect(fallbackNotices(turn.events)).toHaveLength(1);
}, 10_000);

test("a thread that reports another reviewer runs the turn as Auto did before", async () => {
  const server = fakeServer("0.162.1", { request: "none", threadReviewer: "user" });
  const turn = startTurn(server, { taskId: "task-coerced", agentRunId: "run-coerced" });
  await turn.work;
  expect(server.turnStarts()[0]).toMatchObject(autoBefore);
  expect(fallbackNotices(turn.events)).toHaveLength(1);
}, 10_000);

test("the fallback notice appears once per agent run, not on every turn", async () => {
  const server = fakeServer("0.162.1-alpha.2", { request: "none" });
  const first = startTurn(server, { taskId: "task-once", agentRunId: "run-once" });
  await first.work;
  const second = startTurn(server, { taskId: "task-once", agentRunId: "run-once" });
  await second.work;
  const other = startTurn(server, { taskId: "task-once", agentRunId: "run-other" });
  await other.work;
  expect(server.turnStarts().map((entry) => [entry.approvalPolicy, entry.approvalsReviewer]))
    .toEqual([["never", undefined], ["never", undefined], ["never", undefined]]);
  expect([first, second, other].map((turn) => fallbackNotices(turn.events).length)).toEqual([1, 0, 1]);
}, 10_000);

test("thread/start refusing auto-review is retried once as Auto was before, and the turn runs", async () => {
  const server = fakeServer("0.162.1", { request: "none", refuse: { method: "thread/start", when: "auto_review" } });
  const turn = startTurn(server, { taskId: "task-refused-start", agentRunId: "run-refused-start" });
  await turn.work;
  expect(server.requests()).toEqual([
    { method: "configRequirements/read" },
    { method: "thread/start", approvalPolicy: "on-request", approvalsReviewer: "auto_review", refused: true },
    { method: "thread/start", ...autoBefore },
    { method: "turn/start", ...autoBefore, sandboxPolicy: expect.objectContaining({ type: "workspaceWrite", networkAccess: false }) },
  ]);
  expect(errors(turn.events)).toEqual([]);
  expect(stopReason(turn.events)).toBeUndefined();
  expect(fallbackNotices(turn.events)).toHaveLength(1);

  // The rest of the process skips auto-review on this executable.
  const next = startTurn(server, { taskId: "task-refused-next", agentRunId: "run-refused-next" });
  await next.work;
  expect(server.requests().slice(4)).toEqual([
    { method: "thread/start", ...autoBefore },
    { method: "turn/start", ...autoBefore, sandboxPolicy: expect.objectContaining({ type: "workspaceWrite" }) },
  ]);
  expect(fallbackNotices(next.events)).toHaveLength(1);
}, 10_000);

test("thread/resume refusing auto-review is retried once as Auto was before", async () => {
  const server = fakeServer("0.162.1", { request: "none", refuse: { method: "thread/resume", when: "auto_review" } });
  const ordinary = startTurn(server, { taskId: "task-refused-resume", runtimeOptions: { codexApprovalPolicy: "never" } });
  await ordinary.work;
  const turn = startTurn(server, { taskId: "task-refused-resume", agentRunId: "run-refused-resume" });
  await turn.work;
  expect(server.requests().slice(2)).toEqual([
    { method: "configRequirements/read" },
    { method: "thread/resume", approvalPolicy: "on-request", approvalsReviewer: "auto_review", refused: true },
    { method: "thread/resume", ...autoBefore },
    { method: "turn/start", ...autoBefore, sandboxPolicy: expect.objectContaining({ type: "workspaceWrite" }) },
  ]);
  expect(errors(turn.events)).toEqual([]);
  expect(fallbackNotices(turn.events)).toHaveLength(1);
}, 10_000);

test("turn/start refusing auto-review is retried once as Auto was before, and the turn runs", async () => {
  const server = fakeServer("0.162.1", { request: "none", refuse: { method: "turn/start", when: "auto_review" } });
  const turn = startTurn(server, { taskId: "task-refused-turn", agentRunId: "run-refused-turn" });
  await turn.work;
  expect(server.requests()).toEqual([
    { method: "configRequirements/read" },
    { method: "thread/start", approvalPolicy: "on-request", approvalsReviewer: "auto_review" },
    { method: "turn/start", approvalPolicy: "on-request", approvalsReviewer: "auto_review", refused: true,
      sandboxPolicy: expect.objectContaining({ type: "workspaceWrite" }) },
    { method: "turn/start", ...autoBefore, sandboxPolicy: expect.objectContaining({ type: "workspaceWrite", networkAccess: false }) },
  ]);
  expect(errors(turn.events)).toEqual([]);
  expect(stopReason(turn.events)).toBeUndefined();
  expect(turn.events.filter((event) => event.type === "provider_turn")).toHaveLength(1);
  expect(fallbackNotices(turn.events)).toHaveLength(1);

  const next = startTurn(server, { taskId: "task-refused-turn", agentRunId: "run-refused-turn" });
  await next.work;
  expect(server.requests().slice(4).map((entry) => [entry.method, entry.approvalPolicy, entry.approvalsReviewer]))
    .toEqual([["thread/resume", "never", "user"], ["turn/start", "never", "user"]]);
  expect(fallbackNotices(next.events)).toHaveLength(0);
}, 10_000);

test("a refused request that did not ask for auto-review is not retried", async () => {
  const server = fakeServer("0.162.1", { request: "none", refuse: { method: "thread/start", when: "always" } });
  const turn = startTurn(server, { taskId: "task-refused-ordinary", runtimeOptions: { codexApprovalPolicy: "never" } });
  await turn.work;
  expect(server.requests()).toEqual([{ method: "thread/start", ...autoBefore, refused: true }]);
  expect(stopReason(turn.events)).toBe("runtime_failure");
  expect(fallbackNotices(turn.events)).toHaveLength(0);
}, 10_000);

test("a refusal that persists without auto-review fails the turn after the one retry", async () => {
  const server = fakeServer("0.162.1", { request: "none", refuse: { method: "turn/start", when: "always" } });
  const turn = startTurn(server, { taskId: "task-refused-always", agentRunId: "run-refused-always" });
  await turn.work;
  expect(server.turnStarts().map((entry) => [entry.approvalsReviewer, entry.refused])).toEqual([["auto_review", true], ["user", true]]);
  expect(stopReason(turn.events)).toBe("runtime_failure");
  // Not remembered: the refusal was not about auto-review.
  const next = startTurn(server, { taskId: "task-refused-always-next", agentRunId: "run-refused-always-next" });
  await next.work;
  expect(server.turnStarts()[2]?.approvalsReviewer).toBe("auto_review");
}, 10_000);

test("a turn that started and then failed is not retried", async () => {
  const server = fakeServer("0.162.1", { request: "fail" });
  const turn = startTurn(server, { taskId: "task-started-fail", agentRunId: "run-started-fail" });
  await turn.work;
  expect(server.turnStarts()).toHaveLength(1);
  expect(server.turnStarts()[0]?.approvalsReviewer).toBe("auto_review");
  expect(stopReason(turn.events)).toBe("failed");
  expect(fallbackNotices(turn.events)).toHaveLength(0);
}, 10_000);

for (const notification of ["turn/started", "turn/completed"] as const) {
  test(`a turn/start refused after ${notification} arrived is not sent again`, async () => {
    const server = fakeServer("0.162.1", {
      request: "none", refuse: { method: "turn/start", when: "auto_review" }, notifyBeforeRefuse: notification,
    });
    const turn = startTurn(server, { taskId: `task-notified-${notification}`, agentRunId: `run-notified-${notification}` });
    await turn.work;
    // A turn may be running: sending it again could run the work twice.
    expect(server.turnStarts()).toHaveLength(1);
    expect(stopReason(turn.events)).toBe("runtime_failure");
    expect(fallbackNotices(turn.events)).toHaveLength(0);
    // Not remembered: the next turn still asks for auto-review.
    const next = startTurn(server, { taskId: `task-notified-${notification}-next`, agentRunId: `run-notified-${notification}-next` });
    await next.work;
    expect(server.turnStarts()[1]?.approvalsReviewer).toBe("auto_review");
  }, 10_000);
}
