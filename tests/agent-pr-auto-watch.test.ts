import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentPrAutoWatch, type AutoWatchHint } from "../electron/host-service/agent-pr-auto-watch";
import { createTurnPullRequestEvidence, pullRequestEvidenceOf } from "../electron/host-service/turn-pr-evidence";
import { resetPullRequestRepoCache } from "../electron/host-service/pull-request-repo-cache";
import { createWakeUpRuntime } from "../electron/host-service/wake-up-runtime";
import { WakeUpStore } from "../electron/persistence/wake-up-store";
import { invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
import { isPullRequestWatchEnabled, DEFAULT_PULL_REQUEST_WATCH_ENABLED } from "../src/lib/supervision/pull-request-watch";
import { defaultSettings } from "../src/store/app-settings";
import { createFakeGh, fakePr, gitRepository, type FakeGhPr } from "./fixtures/fake-gh";

const cleanups: (() => void)[] = [];
beforeEach(() => { resetPullRequestRepoCache(); invalidateGhAuthCache(); });
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

const repoState = { repo: { owner: "example", name: "repo", defaultBranch: "main" }, viewer: "me" } as const;
const START = Date.parse("2026-11-17T00:00:00Z");
const iso = (seconds: number) => new Date(START + seconds * 1_000).toISOString().replace(".000Z", "Z");
const createCommand = { type: "tool", toolName: "Bash", input: JSON.stringify({ command: "gh pr create --fill" }), state: "output-available" } as const;

function harness(options: { branch?: string; prs?: (branch: string) => FakeGhPr[]; tasks?: string[] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "agent-pr-watch-"));
  const main = join(root, "repository"); mkdirSync(main);
  const repo = gitRepository(main);
  const branch = options.branch ?? "feature";
  const cwd = branch === "main" ? main : repo.worktree("ws", branch);
  const prs = options.prs?.(branch) ?? [fakePr({ number: 17, headRefName: branch, baseRefName: "main", createdAt: iso(30) }, repoState)];
  const gh = createFakeGh(root, { ...repoState, prs });
  const db = new Database(":memory:"); const store = new WakeUpStore(db);
  let at = START + 60_000; let enabled = true; let managed = false;
  const snapshots = new Map<string, TaskSupervisionSnapshot>();
  for (const taskId of options.tasks ?? ["task"]) snapshots.set(taskId, { workspaceId: "ws", taskId, repositoryPath: main, exists: true, archived: false, providerId: "codex", model: "model", activeTurnId: null, pendingApprovalCount: 0, pendingUserInputCount: 0 });
  const persistence = { listWakeUps: () => store.list(), listActiveWakeUps: () => store.listActive(), listWakeUpsForWorkspace: (id: string) => store.listForWorkspace(id), getWakeUp: (id: string) => store.get(id), getWakeUpByTaskId: (id: string) => store.getByTaskId(id), upsertWakeUp: (w: Parameters<typeof store.upsert>[0]) => store.upsert(w), removeWakeUp: (id: string) => store.remove(id), recordWakeUpOccurrence: (o: Parameters<typeof store.recordOccurrence>[0]) => store.recordOccurrence(o), attachWakeUpOccurrenceTurn: (a: Parameters<typeof store.attachOccurrenceTurn>[0]) => store.attachOccurrenceTurn(a), listWakeUpOccurrences: (a: Parameters<typeof store.listOccurrences>[0]) => store.listOccurrences(a), pruneWakeUpOccurrences: (a: Parameters<typeof store.pruneOccurrences>[0]) => store.pruneOccurrences(a), completeInterruptedTurn: () => true };
  const runtime = createWakeUpRuntime({ persistence, getTaskSupervisionSnapshot: async ({ taskId }) => snapshots.get(taskId)!, runSupervisedTurn: async () => ({ turnId: "wake" }), now: () => new Date(at), readPullRequestWatch: async () => ({ ok: true, pullRequest: null }), setInterval: (() => 1) as unknown as typeof setInterval, clearInterval: (() => {}) as typeof clearInterval });
  const evidence = createTurnPullRequestEvidence({ now: () => at });
  const errors: unknown[] = []; const hints: AutoWatchHint[] = []; const delays: number[] = [];
  const watcher = createAgentPrAutoWatch({
    wakeUps: runtime, evidence, run: gh.run, now: () => at,
    context: async (candidate) => ({ cwd, enabled, managed, snapshot: snapshots.get(candidate.taskId)! }),
    owned: () => false, onError: e => errors.push(e), onHint: hint => hints.push(hint),
    setTimer: (_fn, ms) => { delays.push(ms); return 0; }, clearTimer: () => {},
  });
  cleanups.push(() => { watcher.stop(); runtime.stop(); db.close(); rmSync(root, { recursive: true, force: true }); });
  /** One task turn from 0s to 60s; `events` stream through the recorder like the host's provider path. */
  const turn = (taskId = "task", turnId = `turn-${taskId}`, events: object[] = [createCommand], window: [number, number] = [0, 60]) => {
    at = START + window[0] * 1_000;
    for (const event of events) evidence.observe({ turnId, workspaceId: "ws", taskId, event: event as never });
    at = START + window[1] * 1_000;
    evidence.complete(turnId);
    return { workspaceId: "ws", taskId, turnId, startedAt: iso(window[0]), completedAt: iso(window[1]) };
  };
  return { watcher, runtime, store, gh, snapshots, errors, hints, delays, turn, cwd,
    setEnabled: (value: boolean) => { enabled = value; }, setManaged: (value: boolean) => { managed = value; }, advance: (ms: number) => { at += ms; } };
}

describe("agent PR auto-watch", () => {
  test("a turn that ran gh pr create watches its same-repository PR exactly once", async () => {
    const h = harness();
    h.watcher.notify(h.turn()); await h.watcher.tick();
    expect(h.errors).toEqual([]);
    const [watch] = h.store.list();
    expect(watch?.pullRequestWatch?.pullRequest?.number).toBe(17);
    expect(watch?.pullRequestWatch?.automatic).toBe(true);
    expect(watch?.trigger).toEqual({ kind: "pull_request", events: ["checks_failed", "merge_conflict"] });
    h.watcher.notify(h.turn("task", "second")); await h.watcher.tick();
    expect(h.store.list()).toHaveLength(1);
  });
  test("an agent that only reported the PR link also counts", async () => {
    const h = harness();
    h.watcher.notify(h.turn("task", "turn", [{ type: "text", text: "Opened https://github.com/example/repo/pull/17." }])); await h.watcher.tick();
    expect(h.store.list()).toHaveLength(1);
  });
  test("removing a watch is not undone by a later turn, and managed tasks never acquire one", async () => {
    const h = harness();
    h.watcher.notify(h.turn()); await h.watcher.tick();
    await h.runtime.remove({ id: h.store.list()[0]!.id });
    h.watcher.notify(h.turn("task", "later", [createCommand], [120, 180])); await h.watcher.tick();
    expect(h.store.list()).toHaveLength(0);
    const managed = harness(); managed.setManaged(true);
    managed.watcher.notify(managed.turn()); await managed.watcher.tick();
    expect(managed.store.list()).toHaveLength(0);
  });
  test("automatic registration rechecks busy state and an existing watcher atomically", async () => {
    const h = harness();
    const input = { workspaceId: "ws", taskId: "task", prompt: "Watch checks", trigger: { kind: "pull_request" as const, events: ["checks_failed" as const, "merge_conflict" as const] }, maxOccurrences: null, expiresAt: null };
    const pullRequest = { number: 17, url: "https://github.com/example/repo/pull/17", title: "Change 17" };
    h.snapshots.get("task")!.pendingApprovalCount = 1;
    await expect(h.runtime.create(input, { automatic: true, pullRequest })).rejects.toThrow("must wait");
    h.snapshots.get("task")!.pendingApprovalCount = 0;
    await h.runtime.create({ ...input, taskId: "task" }, { automatic: true, pullRequest });
    expect(h.store.list()).toHaveLength(1);
    h.watcher.notify(h.turn()); await h.watcher.tick();
    expect(h.store.list()).toHaveLength(1);
  });
});

describe("eligible PRs only (suggestion 2)", () => {
  test("the repository default branch is never watched", async () => {
    const h = harness({ branch: "main", prs: () => [fakePr({ number: 17, headRefName: "main", baseRefName: "release", createdAt: iso(30) }, repoState)] });
    h.watcher.notify(h.turn()); await h.watcher.tick();
    expect(h.store.list()).toHaveLength(0);
  });
  test("fork PRs and PRs by another author are never watched", async () => {
    const fork = harness({ prs: branch => [fakePr({ number: 17, headRefName: branch, baseRefName: "main", createdAt: iso(30), isCrossRepository: true, headRepositoryOwner: { id: "f", login: "fork" } }, repoState)] });
    fork.watcher.notify(fork.turn()); await fork.watcher.tick();
    expect(fork.store.list()).toHaveLength(0);
    resetPullRequestRepoCache();
    const other = harness({ prs: branch => [fakePr({ number: 17, headRefName: branch, baseRefName: "main", createdAt: iso(30), author: { id: "o", login: "other", is_bot: false } }, repoState)] });
    other.watcher.notify(other.turn()); await other.watcher.tick();
    expect(other.store.list()).toHaveLength(0);
  });
});

describe("only PRs the agent opened, under one setting (suggestion 3)", () => {
  test("a PR a human opened while the agent chatted is not adopted and costs no gh call", async () => {
    const h = harness();
    h.watcher.notify(h.turn("task", "turn", [{ type: "text", text: "I reviewed the branch." }])); await h.watcher.tick();
    expect(h.store.list()).toHaveLength(0);
    expect(h.gh.calls()).toEqual([]);
  });
  test("a PR created outside the turn window is not adopted", async () => {
    const h = harness({ prs: branch => [fakePr({ number: 17, headRefName: branch, baseRefName: "main", createdAt: iso(600) }, repoState)] });
    h.watcher.notify(h.turn()); await h.watcher.tick();
    expect(h.store.list()).toHaveLength(0);
  });
  test("the global switch and the repository override form one contract with one default", async () => {
    expect(DEFAULT_PULL_REQUEST_WATCH_ENABLED).toBe(defaultSettings.createPrWatchEnabled);
    expect(isPullRequestWatchEnabled({ globalSetting: null })).toBe(defaultSettings.createPrWatchEnabled);
    expect(isPullRequestWatchEnabled({ globalSetting: false })).toBe(false);
    expect(isPullRequestWatchEnabled({ globalSetting: false, repositoryOverride: true })).toBe(true);
    expect(isPullRequestWatchEnabled({ globalSetting: true, repositoryOverride: false })).toBe(false);
    const h = harness(); h.setEnabled(false);
    h.watcher.notify(h.turn()); await h.watcher.tick();
    expect(h.store.list()).toHaveLength(0);
  });
});

describe("the task that opened the PR owns its watch (suggestion 4)", () => {
  test("the completion of another task's turn attaches the watch to the creating task", async () => {
    const h = harness({ tasks: ["creator", "reviewer"] });
    h.turn("creator", "turn-creator");
    h.watcher.notify(h.turn("reviewer", "turn-reviewer", [{ type: "text", text: "Looks fine." }], [10, 70]));
    h.watcher.notify({ workspaceId: "ws", taskId: "creator", turnId: "turn-creator", startedAt: iso(0), completedAt: iso(60) });
    await h.watcher.tick();
    expect(h.store.list().map(row => row.taskId)).toEqual(["creator"]);
  });
  test("two tasks that both ran gh pr create get no watch and a hint", async () => {
    const h = harness({ tasks: ["a", "b"] });
    const a = h.turn("a", "turn-a"); const b = h.turn("b", "turn-b", [createCommand], [5, 65]);
    h.watcher.notify(a); h.watcher.notify(b); await h.watcher.tick();
    expect(h.store.list()).toHaveLength(0);
    expect(h.hints).toEqual([{ workspaceId: "ws", taskIds: ["a", "b"], pullRequest: { number: 17, url: "https://github.com/example/repo/pull/17" }, reason: "ambiguous-task" }]);
    expect(h.watcher.hints("ws")).toHaveLength(1);
  });
});

describe("detection stays light (suggestion 5)", () => {
  test("a running turn defers with timers, not one-second polling or gh calls", async () => {
    const h = harness();
    h.snapshots.get("task")!.activeTurnId = "active";
    h.watcher.notify(h.turn()); await h.watcher.tick();
    expect(h.gh.calls()).toEqual([]);
    expect(h.delays.length).toBeGreaterThan(0);
    expect(h.delays.every(ms => ms >= 5_000)).toBe(true);
  });
  test("detection never requests statusCheckRollup and gives up after a few backed-off attempts", async () => {
    const h = harness({ prs: () => [] });
    h.watcher.notify(h.turn());
    for (let i = 0; i < 10; i++) { await h.watcher.tick(); h.advance(120_000); resetPullRequestRepoCache(); }
    expect(h.watcher.pendingCount()).toBe(0);
    const reads = h.gh.calls().filter(args => args[0] === "pr");
    expect(reads.length).toBeLessThanOrEqual(4);
    expect(h.gh.calls().flat().some(arg => arg.includes("statusCheckRollup"))).toBe(false);
  });
});

describe("turn evidence", () => {
  test("recognizes PR-creating commands and reported links", () => {
    expect(pullRequestEvidenceOf(createCommand as never).createCommand).toBe(true);
    expect(pullRequestEvidenceOf({ type: "tool", toolName: "command_execution", input: "gh api repos/o/r/pulls -X POST -f title=x", state: "output-available" } as never).createCommand).toBe(true);
    expect(pullRequestEvidenceOf({ type: "tool", toolName: "mcp__github__create_pull_request", input: "{}", state: "output-available" } as never).createCommand).toBe(true);
    expect(pullRequestEvidenceOf({ type: "tool", toolName: "Bash", input: JSON.stringify({ command: "gh pr view 17" }), state: "output-available" } as never).createCommand).toBe(false);
    expect(pullRequestEvidenceOf({ type: "text", text: "See https://github.com/Example/Repo/pull/17)." } as never).urls).toEqual(["https://github.com/example/repo/pull/17"]);
  });
});
