import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { describeTarsNotifications, readTarsNotificationTarget } from "../src/lib/tars/notifications";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsPrWatcher, TARS_PR_WATCH_MS } from "../electron/host-service/tars-pr-watch";
import { admitTarsFollowUps } from "../electron/main/tars-follow-up";
import { tarsGoalReached } from "../src/lib/tars/completion";
import { parseTarsPrChecks } from "../src/lib/tars/pr-checks";
import { projectTarsDecisions, bindTarsShortAnswer } from "../src/lib/tars/decisions";
import { tarsActionMode } from "../src/lib/tars/autonomy";
import { tarsFollowUpRefusal } from "../electron/host-service/tars-follow-up-admission";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { createTarsConversationService } from "../electron/main/tars-conversation-service";
import { createTarsInspectionReader } from "../electron/main/tars-inspection-readers";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { applyAppLocale } from "../src/i18n";
import { SETTINGS, REGISTRY } from "./tars-test-context";
import type { TarsResponsibility } from "../src/lib/tars/types";

const START = "2026-11-12T00:00:00.000Z", SHA = "a".repeat(40), SHA2 = "b".repeat(40), SHA3 = "c".repeat(40);
const cleanup: Array<() => void> = [];
afterEach(() => { for (const clean of cleanup.splice(0)) clean(); });
const checks = (conclusion = "SUCCESS", name = "unit") => [{ name, status: "COMPLETED", conclusion }];
function fixture(filename = ":memory:", completionGoal: "pullRequest" | "merge" = "pullRequest") {
  let at = Date.parse(START);
  const now = () => new Date(at).toISOString();
  const db = new Database(filename); cleanup.push(() => { if (!db.closed) db.close(); });
  const conversations = new TarsConversationStore(db); conversations.configure(SETTINGS);
  const responsibilities = new TarsStore(db, { now });
  const created = responsibilities.create({ requestId: "work", title: "Repair checks", instruction: "Repair and verify.",
    acceptanceCriteria: ["Checks pass"], completionGoal, workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, now());
  let row = responsibilities.get(created.id)!;
  if (!row.publication) row = responsibilities.patch(row.id, row.revision, { state: "completed", agentRunId: "run", taskId: "task",
    executionWorkspaceId: "execution", publication: { agentRunId: "run", state: "opened", failedStep: null, commit: SHA, branch: "tars/work", base: "main",
      commitMessage: "fix: checks", title: "fix: checks", url: "https://github.com/example/repo/pull/7", number: 7, error: null, reason: null, updatedAt: now() } }, now());
  const live = { state: "OPEN", isDraft: true, headRefName: "tars/work", headRefOid: SHA, statusCheckRollup: checks() };
  let unavailable = false;
  const calls: string[][] = [];
  const ports = { responsibilities, conversations, now, resolveWorkspace: async () => ({ path: "/tmp/execution", base: "main", repositoryName: "repo" }),
    run: async (command: "gh" | "git", args: readonly string[]) => {
      expect(command).toBe("gh"); calls.push([...args]);
      if (unavailable) return { ok: false, code: 1, stdout: "", stderr: "gh auth login" };
      if (args[1] === "ready") live.isDraft = false;
      return { ok: true, code: 0, stdout: JSON.stringify(live), stderr: "" };
    } };
  const watcher = createTarsPrWatcher(ports);
  const get = () => responsibilities.get(row.id)!;
  const patch = (value: Partial<TarsResponsibility>) => { const current = get(); return responsibilities.patch(row.id, current.revision, value, now()); };
  const admit = () => admitTarsFollowUps({ events: responsibilities.events, conversations, responsibilities, now, reaskable: () => new Map() });
  const view = () => projectTarsDecisions({ messages: conversations.list(200), receipts: conversations.list(200).flatMap((m) => conversations.listReceipts(m.id)),
    answers: conversations.listAnswers(200), records: [], activity: responsibilities.listActivity(), responsibilities: [get()] });
  const answer = (optionIndex = 0, source: "click" | "words" = "click") => {
    const question = view().find((v) => v.state === "waiting")!;
    const option = question.options[optionIndex]!;
    if (option.kind !== "prReview") throw new Error("Expected PR review option");
    return conversations.recordAnswer({ decisionId: question.id, optionIndex, source, effect: option.effect, label: option.label, actRequestId: null }, now()).answer;
  };
  return { db, ports, row, get, patch, live, calls, watcher, responsibilities, conversations, now, admit, view, answer,
    advance: (ms = 300_000) => { at += ms; }, unavailable: () => { unavailable = true; } };
}

test("gh rollup parsing distinguishes pending, absent, failed, unknown and bounded names", () => {
  const base = { state: "OPEN", isDraft: true, headRefName: "work", headRefOid: SHA };
  for (const [rollup, state] of [[[], "none"], [checks(), "passed"], [checks("", "pending"), "pending"],
    [[{ context: "legacy", state: "ERROR" }], "failed"], [checks("NEW_STATUS"), "pending"],
    [checks("CANCELLED"), "failed"], [[{ context: "legacy", state: "SUCCESS" }], "passed"]] as const) {
    expect(parseTarsPrChecks({ ...base, statusCheckRollup: rollup }, START).checks.state).toBe(state);
  }
  const bounded = parseTarsPrChecks({ ...base, statusCheckRollup: Array.from({ length: 15 }, (_, i) => checks("FAILURE", `${i}\n${"x".repeat(300)}`)[0]) }, START).checks;
  expect(bounded.failing).toHaveLength(10);
  expect(bounded.failing.every((name) => name.length <= 120 && !name.includes("\n"))).toBe(true);
  expect(() => parseTarsPrChecks({}, START)).toThrow();
});

test("polling is read-only, backs off, records one event per head, and stops after three hours", async () => {
  const f = fixture(); f.live.statusCheckRollup = checks("FAILURE");
  await f.watcher.tick();
  expect(f.get().publication?.checks).toMatchObject({ state: "failed", headSha: SHA, failing: ["unit"] });
  expect(f.get().publication?.watch?.nextAt).toBe("2026-11-12T00:01:00.000Z");
  await f.watcher.tick(); expect(f.calls).toHaveLength(1);
  f.advance(60_000); await f.watcher.tick();
  expect(f.get().publication?.watch?.nextAt).toBe("2026-11-12T00:03:00.000Z");
  f.live.statusCheckRollup = checks(); f.advance(); await f.watcher.tick();
  f.live.statusCheckRollup = checks("FAILURE"); f.advance(); await f.watcher.tick();
  const failed = f.responsibilities.events.listPending().filter((event) => event.kind === "ciFailed");
  expect(failed).toHaveLength(1);
  expect(f.responsibilities.listActivity().some((event) => event.prChecks?.state === "failed")).toBe(true);
  expect(f.calls.every((args) => args[1] === "view")).toBe(true);
  f.advance(TARS_PR_WATCH_MS); await f.watcher.tick();
  expect(f.get().publication?.watch?.stopped).toBe("expired");
  const count = f.calls.length; f.advance(); await f.watcher.tick(); expect(f.calls).toHaveLength(count);
});

test("file-backed restart preserves the schedule, failure episode and round reservation", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tars-pr-watch-")); cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, "tars.sqlite");
  const first = fixture(filename); first.live.statusCheckRollup = checks("FAILURE");
  await first.watcher.tick(); first.admit(); first.db.close();
  const next = fixture(filename); await next.watcher.tick();
  expect(next.calls).toHaveLength(0);
  expect(next.get().publication?.watch?.fixRounds).toBe(1);
  expect(next.admit().created).toBe(0);
  expect(next.conversations.list(200).filter((m) => m.origin?.kind === "followUp")).toHaveLength(1);
});

test("CI continuation uses the existing run-control ledger once and retains the PR", async () => {
  const f = fixture(); f.live.statusCheckRollup = checks("FAILURE"); await f.watcher.tick(); f.admit();
  const followup = f.conversations.list(100).find((m) => m.origin?.kind === "followUp")!;
  expect(followup.text).toContain('CI failed: ["unit"]');
  const requests: string[] = [];
  const runtime = createTarsRuntime({ store: f.responsibilities, now: f.now, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null, startRun: async () => "run",
    observe: async () => ({ state: "running", detail: null }), controlRun: async () => {}, respondTask: async () => {},
    messages: f.conversations, hasUserTurn: () => false, deliverMessage: async () => "sent",
    continueWork: async (row, continuation) => { requests.push(`${row.executionWorkspaceId}:${continuation.text}`); return "ci-run"; } });
  cleanup.push(() => runtime.stop());
  const row = f.get();
  const action = { kind: "control" as const, responsibilityId: row.id, expectedRevision: row.revision, operation: "message" as const,
    input: { text: "CI failed: unit. Fix and keep the branch." } };
  expect(tarsFollowUpRefusal(action, followup.origin as never, f.responsibilities)).toBeNull();
  const claimed = f.conversations.claim(followup.id, followup.revision, f.now());
  const message = f.conversations.answer(claimed.id, claimed.revision, { reply: "Fixing CI.", actions: [action, action] }, f.now());
  const ports = { conversations: f.conversations, responsibilities: f.responsibilities, now: f.now, readRegistry: () => REGISTRY,
    requestTick: () => {}, control: runtime.act };
  const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, ports);
  expect(receipts.map((r) => r.status)).toEqual(["applied", "rejected"]);
  await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, ports);
  await runtime.drain();
  expect(requests).toHaveLength(1);
  expect(f.get()).toMatchObject({ agentRunId: "ci-run", executionWorkspaceId: "execution", taskId: "task",
    publication: { number: 7, branch: "tars/work", watch: { fixRounds: 1 } } });
  expect(tarsActionMode("publish", "balanced", "automatic", { responsibility: f.get() })).toBe("confirm");
  const verified = f.patch({ state: "resultReady", resultVerifiedRunId: "ci-run" });
  expect(tarsActionMode("publish", "balanced", "automatic", { responsibility: verified })).toBe("auto");
  expect(tarsActionMode("publish", "careful", "automatic", { responsibility: verified })).toBe("confirm");
});

test("two failure heads wake Tars, the third asks the user without another automatic round", async () => {
  const f = fixture(); f.live.statusCheckRollup = checks("FAILURE");
  for (const [index, head] of [SHA, SHA2, SHA3].entries()) {
    f.live.headRefOid = head;
    f.patch({ publication: { ...f.get().publication!, commit: head } });
    f.advance(); await f.watcher.tick(); expect(f.admit().created).toBe(1);
    expect(f.get().publication?.watch?.fixRounds).toBe(Math.min(index + 1, 2));
  }
  const messages = f.conversations.list(200).filter((m) => m.origin?.kind === "followUp");
  expect(messages.filter((m) => m.state === "queued")).toHaveLength(2);
  expect(messages.at(-1)?.state).toBe("answered");
  expect(messages.at(-1)?.reply).toContain("two automatic CI-fix attempts");
  expect(messages.at(-1)?.decision?.actions[0]?.kind).toBe("ask");
  expect(describeTarsNotifications(f.responsibilities.snapshot())).toMatchObject([{ kind: "tars.decision_requested" }]);
  expect(f.admit().created).toBe(0);
});

for (const choice of ["ready", "keepDraft"] as const) test(`${choice}: only an explicit saved choice can change draft status`, async () => {
  await applyAppLocale("en");
  const f = fixture(); await f.watcher.tick(); f.admit();
  expect(f.calls.every((args) => args[1] === "view")).toBe(true);
  const decision = f.view().find((v) => v.state === "waiting")!;
  expect(decision.question).toContain("Mark it ready for review");
  const notifications = describeTarsNotifications(f.responsibilities.snapshot());
  expect(notifications).toHaveLength(1);
  expect(readTarsNotificationTarget(notifications[0]!)).toEqual({ responsibilityId: f.row.id, decisionId: decision.id });
  expect(bindTarsShortAnswer("yes", [decision])).toBeNull();
  await expect(f.watcher.confirm({ decisionId: decision.id })).rejects.toThrow("explicit saved");
  const answer = f.answer(choice === "ready" ? 0 : 1);
  await Promise.all([f.watcher.confirm({ decisionId: answer.decisionId }), f.watcher.confirm({ decisionId: answer.decisionId })]);
  await f.watcher.confirm({ decisionId: answer.decisionId });
  expect(describeTarsNotifications(f.responsibilities.snapshot())).toEqual([]);
  expect(f.calls.filter((args) => args[1] === "ready")).toHaveLength(choice === "ready" ? 1 : 0);
  f.advance(); await f.watcher.tick(); expect(f.admit().created).toBe(0);
  expect(f.conversations.list(200).filter((m) => m.reply === "PR #7: all checks passed")).toHaveLength(1);
});

test("ready refuses changed or failing heads and a words-only answer", async () => {
  for (const failure of ["head", "checks", "words"]) {
    const f = fixture(); await f.watcher.tick(); f.admit();
    const answer = f.answer(0, failure === "words" ? "words" : "click");
    if (failure === "head") f.live.headRefOid = SHA2;
    if (failure === "checks") f.live.statusCheckRollup = checks("FAILURE");
    await expect(f.watcher.confirm({ decisionId: answer.decisionId })).rejects.toThrow();
    expect(f.calls.filter((args) => args[1] === "ready")).toHaveLength(0);
  }
});

test("PR decision notifications disappear when checks or the published head move on", async () => {
  const f = fixture(); await f.watcher.tick(); f.admit();
  expect(describeTarsNotifications(f.responsibilities.snapshot())).toHaveLength(1);
  f.live.headRefOid = SHA2;
  f.patch({ publication: { ...f.get().publication!, commit: SHA2 } });
  f.advance(); await f.watcher.tick();
  expect(describeTarsNotifications(f.responsibilities.snapshot())).toEqual([]);
});

test("unavailable gh stops once, persists one notice, and never issues another read after restart", async () => {
  const f = fixture(); f.unavailable(); await f.watcher.tick(); f.admit();
  expect(f.get().publication?.checks?.state).toBe("unavailable");
  expect(f.get().publication?.watch?.stopped).toBe("unavailable");
  f.advance(); await createTarsPrWatcher(f.ports).tick(); f.admit();
  expect(f.calls).toHaveLength(1);
  expect(f.conversations.list(200).filter((m) => m.reply?.includes("checks are unavailable"))).toHaveLength(1);
});

test("closed PRs, no checks, and an unpublished head never trigger a ready card or CI continuation", async () => {
  for (const mode of ["closed", "none", "otherHead"]) {
    const f = fixture();
    if (mode === "closed") f.live.state = "MERGED";
    if (mode === "none") f.live.statusCheckRollup = [];
    if (mode === "otherHead") { f.live.headRefOid = SHA2; f.live.statusCheckRollup = checks("FAILURE"); }
    await f.watcher.tick(); expect(f.admit().created).toBe(0);
    if (mode === "closed") { f.advance(); await f.watcher.tick(); expect(f.calls).toHaveLength(1); }
  }
});


test("the conversation service records the chosen review option before calling the host", async () => {
  const f = fixture(); await f.watcher.tick(); f.admit();
  let confirmed = 0;
  const service = createTarsConversationService({ conversations: f.conversations, responsibilities: f.responsibilities, now: f.now,
    coordinator: {} as never, context: async () => { throw new Error("No planner turn expected"); },
    applyDecision: async () => { throw new Error("No model decision expected"); },
    confirmPrReview: async (decisionId) => { confirmed++; await f.watcher.confirm({ decisionId }); } });
  service.start();
  try {
    await service.whenIdle();
    const decision = f.view().find((v) => v.state === "waiting")!;
    expect((await service.answerDecision({ decisionId: decision.id, optionIndex: 0, source: "words" })).refusal).toBe("invalidOption");
    expect(confirmed).toBe(0);
    const result = await service.answerDecision({ decisionId: decision.id, optionIndex: 0, source: "click" });
    expect(result.answer).toMatchObject({ status: "applied", effect: { kind: "prReview", choice: "ready" } });
    expect(f.calls.filter((args) => args[1] === "ready")).toHaveLength(1);
    const repeat = await service.answerDecision({ decisionId: decision.id, optionIndex: 0, source: "click" });
    expect(repeat.answer?.status).toBe("applied"); expect(confirmed).toBe(1);
  } finally { await service.stop(); }
});

test("pullRequest inspection keeps the saved check summary when the live read fails", async () => {
  const f = fixture(); await f.watcher.tick();
  const reader = createTarsInspectionReader({ tars: f.responsibilities, loadRepositoryRegistry: () => REGISTRY,
    loadTaskMessagesPage: () => null } as never, (async () => { throw new Error("offline"); }) as never);
  const result = await reader(f.get(), "pullRequest");
  expect(result).toMatchObject({ checks: { state: "passed", headSha: SHA }, liveChecks: "unavailable" });
});

test("CI observations never wake paused, taken-over, or cancelled responsibilities", async () => {
  for (const state of ["paused", "takenOver", "cancelled"] as const) {
    const f = fixture(); f.patch({ state }); f.live.statusCheckRollup = checks("FAILURE");
    await f.watcher.tick(); expect(f.admit().created).toBe(0);
    expect(f.get().publication?.watch?.fixRounds).toBe(0);
  }
});

test("a read that races a new publication cannot overwrite the new head", async () => {
  const f = fixture();
  const run = f.ports.run;
  const watcher = createTarsPrWatcher({ ...f.ports, run: async (command, args) => {
    const result = await run(command, args);
    f.patch({ publication: { ...f.get().publication!, commit: SHA2 } });
    return result;
  } });
  await watcher.tick();
  expect(f.get().publication?.commit).toBe(SHA2);
  expect(f.get().publication?.checks).toBeUndefined();
});


test("a passing-check notice is still delivered after an unrelated user message", async () => {
  const f = fixture(); await f.watcher.tick(); f.advance(1_000);
  f.conversations.create({ requestId: "unrelated", text: "Show my other work." }, f.now());
  expect(f.admit().created).toBe(1);
  expect(f.conversations.list(200).some((m) => m.reply === "PR #7: all checks passed")).toBe(true);
});


test("expiry stops automatic reads but an explicit review choice still verifies the head", async () => {
  const f = fixture(); await f.watcher.tick(); f.admit();
  f.advance(TARS_PR_WATCH_MS); await f.watcher.tick();
  expect(f.get().publication?.watch?.stopped).toBe("expired");
  const answer = f.answer();
  await f.watcher.confirm({ decisionId: answer.decisionId });
  expect(f.calls.filter((args) => args[1] === "ready")).toHaveLength(1);
});


test("a closure observed while marking ready is preserved when its outcome is saved", async () => {
  const f = fixture(); await f.watcher.tick(); f.admit(); const answer = f.answer();
  const watcher = createTarsPrWatcher({ ...f.ports, run: async (command, args) => {
    const result = await f.ports.run(command, args);
    if (args[1] === "ready") f.patch({ publication: { ...f.get().publication!, watch: { ...f.get().publication!.watch!, stopped: "closed", polls: 10 } } });
    return result;
  } });
  await watcher.confirm({ decisionId: answer.decisionId });
  expect(f.get().publication?.watch).toMatchObject({ stopped: "closed", polls: 10, reviewChoice: "ready" });
});


test("a transient network failure retries with backoff and recovers across watcher reconstruction", async () => {
  const f = fixture(); let attempts = 0;
  const ports = { ...f.ports, run: async (...args: Parameters<typeof f.ports.run>) => {
    if (attempts++ === 0) return { ok: false, code: 1, stdout: "", stderr: "network timeout" };
    return f.ports.run(...args);
  } };
  await createTarsPrWatcher(ports).tick();
  expect(f.get().publication?.watch).toMatchObject({ stopped: null, polls: 1, nextAt: "2026-11-12T00:01:00.000Z" });
  await createTarsPrWatcher(ports).tick(); expect(attempts).toBe(1);
  f.advance(60_000); await createTarsPrWatcher(ports).tick();
  expect(f.get().publication?.checks?.state).toBe("passed");
});

test("expiry posts one persisted notice with an explicit rearm preserving the fix budget", async () => {
  const f = fixture(); f.live.statusCheckRollup = checks("");
  await f.watcher.tick(); f.advance(TARS_PR_WATCH_MS); await f.watcher.tick(); f.admit();
  await createTarsPrWatcher(f.ports).tick(); f.admit();
  expect(f.conversations.list(200).filter(m => m.reply?.includes("monitoring stopped after three hours"))).toHaveLength(1);
  const question = f.view().find(v => v.state === "waiting")!;
  expect(question.options[0]).toMatchObject({ kind: "prReview", effect: { choice: "watch" } });
  const answer = f.answer(); await f.watcher.confirm({ decisionId: answer.decisionId });
  expect(f.get().publication?.watch).toMatchObject({ stopped: null, polls: 0, fixRounds: 0, startedAt: f.now() });
  await f.watcher.confirm({ decisionId: answer.decisionId });
  await f.watcher.tick(); expect(f.calls).toHaveLength(2);
  f.advance(TARS_PR_WATCH_MS); await createTarsPrWatcher(f.ports).tick(); f.admit();
  expect(f.conversations.list(200).filter(m => m.reply?.includes("monitoring stopped after three hours"))).toHaveLength(2);
});

test("terminal authentication failure offers rearm and preserves exhausted CI rounds", async () => {
  const f = fixture(); f.unavailable(); await f.watcher.tick(); f.admit();
  const current = f.get(); f.patch({ publication: { ...current.publication!, watch: { ...current.publication!.watch!, fixRounds: 2 } } });
  const answer = f.answer(); await f.watcher.confirm({ decisionId: answer.decisionId });
  expect(f.get().publication?.watch).toMatchObject({ stopped: null, fixRounds: 2 });
});

test("observed merge completes only the verified matching execution's merge goal", async () => {
  for (const merged of [false, true]) {
    const f = fixture(":memory:", "merge"); f.patch({ state: "resultReady", resultVerifiedRunId: "run" });
    f.live.state = merged ? "MERGED" : "CLOSED";
    await f.watcher.tick();
    expect(f.get().publication?.watch?.stopped).toBe(merged ? "merged" : "closed");
    expect(f.get().state).toBe(merged ? "completed" : "resultReady");
    expect(tarsGoalReached(f.get())).toBe(merged);
    expect(f.calls.every(args => args[1] === "view")).toBe(true);
  }
});


test("a legacy stopped watch gains one actionable notice after restart", async () => {
  const f = fixture();
  f.patch({ publication: { ...f.get().publication!, checks: { state: "unavailable", failing: [], checkedAt: START, headSha: SHA },
    watch: { startedAt: START, nextAt: START, polls: 1, stopped: "unavailable", fixRounds: 2 } } });
  await createTarsPrWatcher(f.ports).tick(); f.admit();
  await createTarsPrWatcher(f.ports).tick(); f.admit();
  expect(f.view().filter(v => v.state === "waiting" && v.options.some(o => o.kind === "prReview" && o.effect.choice === "watch"))).toHaveLength(1);
  expect(f.calls).toHaveLength(0);
});


test("GitHub rate limiting retries instead of stopping as an authorization failure", async () => {
  const f = fixture();
  await createTarsPrWatcher({ ...f.ports, run: async () => ({ ok: false, code: 1, stdout: "", stderr: "HTTP 403: API rate limit exceeded" }) }).tick();
  expect(f.get().publication?.watch).toMatchObject({ stopped: null, polls: 1 });
  f.advance(60_000); await createTarsPrWatcher(f.ports).tick();
  expect(f.get().publication?.checks?.state).toBe("passed");
});
