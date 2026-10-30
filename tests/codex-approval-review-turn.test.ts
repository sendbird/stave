import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disposeAllCodexAppServerClients, streamCodexWithAppServer } from "../electron/providers/codex-app-server-runtime";
import type { BridgeEvent } from "../electron/providers/types";

const directories: string[] = [];
afterEach(() => {
  disposeAllCodexAppServerClients();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
const at = Date.parse("2026-10-29T09:00:00.000Z");
function review(reviewId: string, overrides: Record<string, unknown> = {}) {
  return { method: "item/autoApprovalReview/completed", params: {
    threadId: "thread-1", turnId: "turn-1", reviewId, targetItemId: "command-1", decisionSource: "agent",
    startedAtMs: at - 10, completedAtMs: at, action: { type: "command", command: "private-command", cwd: "/tmp/workspace", source: "shell" },
    review: { status: "approved", rationale: "private-rationale" }, ...overrides,
  } };
}
type Notification = ReturnType<typeof review>;
function fakeServer(options: { early?: Notification[]; notifications?: Notification[]; onInterrupt?: Notification[]; waitForInterrupt?: boolean }) {
  const cwd = mkdtempSync(join(tmpdir(), "stave-approval-review-"));
  directories.push(cwd);
  const executable = join(cwd, "codex");
  const receipts = join(cwd, "receipts.jsonl");
  writeFileSync(executable, `#!${process.execPath}
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
if (process.argv.includes("--version")) { console.log("codex-cli 0.165.0"); process.exit(0); }
const options = ${JSON.stringify(options)};
const send = (message) => console.log(JSON.stringify({ jsonrpc: "2.0", ...message }));
let turnCount = 0;
const nativeTurnId = () => "turn-" + turnCount;
const notify = (message) => send({ ...message, params: { ...message.params, ...(message.params.turnId === "turn-1" ? { turnId: nativeTurnId() } : {}) } });
const complete = (status = "completed") => send({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: nativeTurnId(), status } } });
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  appendFileSync(${JSON.stringify(receipts)}, JSON.stringify(m) + "\\n");
  if (!m.method || m.id == null) return;
  if (m.method === "turn/start") {
    turnCount += 1;
    for (const notification of options.early ?? []) notify(notification);
  }
  let result = {};
  if (m.method === "config/read") result = { config: {}, layers: [] };
  if (m.method === "configRequirements/read") result = { requirements: null };
  if (m.method === "account/read") result = { account: null, requiresOpenaiAuth: false };
  if (m.method === "thread/start" || m.method === "thread/resume") result = { thread: { id: "thread-1" }, approvalsReviewer: m.params.approvalsReviewer };
  if (m.method === "turn/start") result = { turn: { id: nativeTurnId() } };
  send({ id: m.id, result });
  if (m.method === "turn/start") setTimeout(() => {
    for (const notification of options.notifications ?? []) notify(notification);
    if (!options.waitForInterrupt) complete();
  }, 10);
  if (m.method === "turn/interrupt") {
    for (const notification of options.onInterrupt ?? []) notify(notification);
    complete("interrupted");
  }
});
`);
  chmodSync(executable, 0o755);
  return { cwd, executable, read: () => readFileSync(receipts, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>) };
}
function start(server: ReturnType<typeof fakeServer>, onEvent?: (event: BridgeEvent, abort: () => void) => void, taskId = "task-1") {
  const events: BridgeEvent[] = [];
  let abort = () => {};
  const work = streamCodexWithAppServer({
    providerId: "codex", turnId: "stave-turn-1", cwd: server.cwd, taskId, prompt: "Work",
    runtimeOptions: { codexBinaryPath: server.executable, approvalMode: "auto", codexApprovalsReviewer: "auto_review" },
    registerAbort: (fn) => { abort = fn; },
    onEvent: (event) => { events.push(event); onEvent?.(event, () => abort()); },
  });
  return { events, work };
}
const decisions = (events: BridgeEvent[]) => events.filter((event) => event.type === "approval_resolved");

test("native final decisions cross JSON-RPC once, including network and multiple reviews of one target", async () => {
  const allowed = review("review-1");
  const denied = review("review-2", { review: { status: "denied" } });
  const network = review("review-3", { targetItemId: null, action: { type: "networkAccess", host: "private-host", target: "private-target", protocol: "https", port: 443 } });
  const server = fakeServer({ notifications: [allowed, denied, allowed, network] });
  const turn = start(server);
  await turn.work;
  expect(decisions(turn.events).map((event) => event.decision)).toEqual(["allowed", "denied", "allowed"]);
  expect(new Set(decisions(turn.events).map((event) => event.requestId)).size).toBe(3);
  expect(turn.events.some((event) => event.type === "approval")).toBe(false);
  expect(server.read().some((message) => !message.method && message.result)).toBe(false);
  expect(JSON.stringify(decisions(turn.events))).not.toContain("private-");
});

test("pre-ack native decisions wait for the current turn; stale and child decisions are dropped", async () => {
  const current = review("current");
  const server = fakeServer({ early: [review("stale", { turnId: "previous-turn" }), current, review("child", { threadId: "child-thread" })], notifications: [current, review("wrong-thread", { threadId: "foreign-thread" }), review("wrong-turn", { turnId: "previous-turn" }), review("missing-turn", { turnId: null })] });
  const turn = start(server);
  await turn.work;
  expect(decisions(turn.events)).toHaveLength(1);
  expect(turn.events.findIndex((event) => event.type === "approval_resolved")).toBeGreaterThan(turn.events.findIndex((event) => event.type === "provider_turn"));
});

test("started, timeout, abort, non-native and unknown notifications never become decisions", async () => {
  const started = { ...review("started"), method: "item/autoApprovalReview/started" };
  const server = fakeServer({ notifications: [started, ...["timedOut", "aborted", "inProgress", "future"].map((status) => review(status, { review: { status } })), review("user", { decisionSource: "user" }), review("cache", { decisionSource: "cache" }), review("malformed", { review: null })] });
  const turn = start(server);
  await turn.work;
  expect(decisions(turn.events)).toEqual([]);
  expect(turn.events.some((event) => event.type === "done")).toBe(true);
});

test("Stop prevents subsequent native review notifications from changing the approval record", async () => {
  const server = fakeServer({ notifications: [review("before-stop")], onInterrupt: [review("after-stop")], waitForInterrupt: true });
  const turn = start(server, (event, abort) => { if (event.type === "approval_resolved") abort(); });
  await turn.work;
  expect(decisions(turn.events)).toHaveLength(1);
  expect(turn.events).toContainEqual({ type: "done", stop_reason: "user_abort" });
});

test("a resumed thread records the next turn independently even when the native review ID is reused", async () => {
  const server = fakeServer({ notifications: [review("same-review-id"), review("same-review-id")] });
  const first = start(server);
  await first.work;
  const second = start(server);
  await second.work;
  expect(server.read().filter((message) => message.method === "thread/resume")).toHaveLength(1);
  expect(decisions(first.events)).toHaveLength(1);
  expect(decisions(second.events)).toHaveLength(1);
  expect(decisions(first.events)[0]?.requestId).not.toBe(decisions(second.events)[0]?.requestId);
});
