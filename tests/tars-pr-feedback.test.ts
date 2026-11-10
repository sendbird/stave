import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsPrWatcher } from "../electron/host-service/tars-pr-watch";
import { admitTarsFollowUps } from "../electron/main/tars-follow-up";
import { tarsFollowUpRefusal } from "../electron/host-service/tars-follow-up-admission";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import { tarsActionMode } from "../src/lib/tars/autonomy";
import { applyAppLocale } from "../src/i18n";
import { REGISTRY, SETTINGS } from "./tars-test-context";

const SHA = "a".repeat(40), NEXT = "b".repeat(40);
const cleanup: Array<() => void> = [];
afterEach(() => { for (const fn of cleanup.splice(0)) fn(); });
function fixture(filename = ":memory:") {
  let at = Date.parse("2026-11-12T00:00:00.000Z");
  const now = () => new Date(at).toISOString();
  const db = new Database(filename); cleanup.push(() => { if (!db.closed) db.close(); });
  const conversations = new TarsConversationStore(db); conversations.configure(SETTINGS);
  const responsibilities = new TarsStore(db, { now });
  const { id } = responsibilities.create({ requestId: "review", title: "Fix review findings", instruction: "Verify the change.",
    acceptanceCriteria: ["Verified"], completionGoal: "pullRequest", workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, now());
  const get = () => responsibilities.get(id)!;
  if (!get().publication) responsibilities.patch(id, get().revision, { state: "completed", taskId: "task", executionWorkspaceId: "execution", agentRunId: "run",
    publication: { state: "opened", agentRunId: "run", failedStep: null, commit: SHA, branch: "tars/work", base: "main", commitMessage: "fix: work", title: "fix: work",
      url: "https://github.com/example/repo/pull/7", number: 7, error: null, reason: null, updatedAt: now() } }, now());
  const live = { state: "OPEN", isDraft: true, headRefName: "tars/work", headRefOid: SHA, statusCheckRollup: [] };
  const reviews: Array<Record<string, unknown>> = [];
  const threads: Array<Record<string, unknown>> = [];
  let failRead = false;
  const calls: string[][] = [];
  const run = async (_command: "git" | "gh", args: readonly string[]) => {
    calls.push([...args]);
    const pr = args.some(a => a.includes("reviewThreads")) ? { headRefOid: live.headRefOid, reviewThreads: { nodes: threads, totalCount: threads.length } }
      : { reviews: { nodes: reviews } };
    return args[0] === "api" && failRead ? { ok: false, code: 1, stdout: "", stderr: "network unavailable" }
      : { ok: true, code: 0, stderr: "", stdout: JSON.stringify(args[0] === "pr" ? live : { data: { repository: { pullRequest: pr } } }) };
  };
  const ports = { responsibilities, conversations, run, now, resolveWorkspace: async () => ({ path: "/tmp/execution", base: "main", repositoryName: "repo" }) };
  const poll = async () => { await createTarsPrWatcher(ports).tick(); at += 300_000; };
  const admit = () => admitTarsFollowUps({ responsibilities, conversations, events: responsibilities.events, now, reaskable: () => new Map() });
  const review = (id: string, state = "CHANGES_REQUESTED", head = live.headRefOid) => reviews.push({ id, state, commit: { oid: head }, body: "Handle the null case.", submittedAt: now(), author: { login: "reviewer" } });
  const comment = (id = "c1", reviewId = "r1") => threads.push({ id: `thread-${id}`, isResolved: false, isOutdated: false, path: "src/work.ts", line: 4,
    comments: { totalCount: 1, nodes: [{ id, body: "Check the empty case.", author: { login: "reviewer" }, createdAt: now(), url: "",
      pullRequestReview: { id: reviewId, commit: { oid: live.headRefOid } } }] } });
  return { db, ports, get, now, responsibilities, conversations, calls, live, reviews, threads, poll, admit, review, comment,
    fail: (value: boolean) => { failRead = value; } };
}

test("one wake per review round/head, coalescing inline comments and review including late comments", async () => {
  const f = fixture(); f.review("r1"); f.comment(); await f.poll(); expect(f.admit().created).toBe(1);
  const message = f.conversations.list(50)[0]!;
  expect(message.text).toContain("Check the empty case");
  expect(message.text).toContain("Handle the null case");
  expect(message.text).toContain("untrusted");
  expect(f.get().publication?.watch?.reviewRounds).toBe(1);
  f.comment("c2"); await f.poll(); expect(f.admit().created).toBe(0);
  expect(f.conversations.list(50)).toHaveLength(1);
  expect(f.calls.every(args => args[0] === "auth" || args[0] === "api" || args[0] === "pr" && args[1] === "view")).toBe(true);
});

test("two rounds survive SQLite reopen and new heads; the third produces a visible user question", async () => {
  await applyAppLocale("en");
  const dir = mkdtempSync(path.join(tmpdir(), "tars-review-")); cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, "state.sqlite");
  const first = fixture(filename); first.review("r1"); await first.poll(); first.admit(); first.db.close();
  const f = fixture(filename); f.review("r1"); await f.poll(); expect(f.admit().created).toBe(0);
  f.live.headRefOid = NEXT;
  f.responsibilities.patch(f.get().id, f.get().revision, { publication: { ...f.get().publication!, commit: NEXT } }, f.now());
  f.review("r2"); await f.poll(); f.admit();
  expect(f.get().publication?.watch?.reviewRounds).toBe(2);
  f.review("r3"); await f.poll(); f.admit();
  const messages = f.conversations.list(50);
  expect(messages.filter(m => m.state === "queued")).toHaveLength(2);
  expect(messages.at(-1)?.reply).toContain("two automatic attempts");
  const decisions = projectTarsDecisions({ messages, receipts: messages.flatMap(m => f.conversations.listReceipts(m.id)), answers: [], records: [],
    activity: f.responsibilities.listActivity(), responsibilities: [f.get()] });
  expect(decisions.some(d => d.state === "waiting" && d.question?.includes("review feedback"))).toBe(true);
  expect(f.responsibilities.snapshot().pendingDecisions).not.toHaveLength(0);
  await f.poll(); expect(f.admit().created).toBe(0);
});

for (const state of ["APPROVED", "COMMENTED"]) test(`${state} is a short notice without a planner turn`, async () => {
  const f = fixture(); f.review("r1", state); await f.poll(); f.admit();
  expect(f.get().publication?.watch?.reviewRounds ?? 0).toBe(0);
  const messages = f.conversations.list(50);
  expect(messages).toHaveLength(1); expect(messages[0]?.state).toBe("answered");
  expect(messages[0]?.decision?.actions).toEqual([]);
  await f.poll(); expect(f.admit().created).toBe(0);
});

test("old heads, resolved/outdated threads, read failures and changed branches never wake work", async () => {
  const f = fixture(); f.review("old", "CHANGES_REQUESTED", NEXT); f.comment(); f.threads[0]!.isResolved = true;
  f.comment("outdated"); f.threads[1]!.isOutdated = true;
  await f.poll(); expect(f.admit().created).toBe(0);
  f.review("current"); f.fail(true); await f.poll(); expect(f.admit().created).toBe(0);
  f.fail(false); await f.poll(); expect(f.admit().created).toBe(1);
  const row = f.get(); f.live.headRefOid = NEXT;
  await f.poll();
  const message = f.conversations.list(50).find(m => m.state === "queued")!;
  expect(tarsFollowUpRefusal({ kind: "control", responsibilityId: row.id, expectedRevision: f.get().revision, operation: "message", input: { text: "Fix review." } }, message.origin as never, f.responsibilities)).not.toBeNull();
});

test("review continuation applies once through the same work control; republication requires fresh verification", async () => {
  const f = fixture(); f.comment(); await f.poll(); f.admit();
  const message = f.conversations.list(50)[0]!;
  const requests: string[] = [];
  const runtime = createTarsRuntime({ store: f.responsibilities, messages: f.conversations, now: f.now, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null, startRun: async () => "run",
    observe: async () => ({ state: "running", detail: null }), controlRun: async () => {}, respondTask: async () => {}, hasUserTurn: () => false,
    deliverMessage: async () => "sent", continueWork: async (row, input) => { requests.push(`${row.executionWorkspaceId}:${input.text}`); return "review-run"; } });
  cleanup.push(() => runtime.stop());
  const action = { kind: "control" as const, responsibilityId: f.get().id, expectedRevision: f.get().revision, operation: "message" as const, input: { text: "Fix the review findings on the same branch and verify." } };
  expect(tarsFollowUpRefusal(action, message.origin as never, f.responsibilities)).toBeNull();
  expect(tarsActionMode("message", "balanced", "automatic")).toBe("auto");
  expect(tarsActionMode("message", "careful", "automatic")).toBe("confirm");
  const claimed = f.conversations.claim(message.id, message.revision, f.now());
  const answered = f.conversations.answer(message.id, claimed.revision, { reply: "Fixing review findings.", actions: [action, action] }, f.now());
  const ports = { conversations: f.conversations, responsibilities: f.responsibilities, now: f.now, readRegistry: () => REGISTRY, requestTick: () => {}, control: runtime.act };
  const receipts = await applyTarsDecision({ messageId: answered.id, expectedRevision: answered.revision }, ports);
  expect(receipts.map(r => r.status)).toEqual(["applied", "rejected"]);
  await applyTarsDecision({ messageId: answered.id, expectedRevision: answered.revision }, ports); await runtime.drain();
  expect(requests).toHaveLength(1);
  expect(f.get()).toMatchObject({ agentRunId: "review-run", taskId: "task", executionWorkspaceId: "execution", publication: { number: 7, branch: "tars/work", watch: { reviewRounds: 1 } } });
  expect(tarsActionMode("publish", "balanced", "automatic", { responsibility: f.get() })).toBe("confirm");
  const verified = f.responsibilities.patch(f.get().id, f.get().revision, { state: "resultReady", resultVerifiedRunId: "review-run" }, f.now());
  expect(tarsActionMode("publish", "balanced", "automatic", { responsibility: verified })).toBe("auto");
});


test("a busy responsibility leaves new review feedback unread until it can continue", async () => {
  const f = fixture(); f.review("r1");
  f.responsibilities.patch(f.get().id, f.get().revision, { state: "running" }, f.now());
  await f.poll(); expect(f.admit().created).toBe(0);
  expect(f.get().publication?.watch?.feedback).toBeUndefined();
  f.responsibilities.patch(f.get().id, f.get().revision, { state: "completed" }, f.now());
  await f.poll(); expect(f.admit().created).toBe(1);
});
