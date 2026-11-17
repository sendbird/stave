import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentPrAutoWatch } from "../electron/host-service/agent-pr-auto-watch";
import { createWakeUpRuntime } from "../electron/host-service/wake-up-runtime";
import { WakeUpStore } from "../electron/persistence/wake-up-store";
import { runCommandArgs } from "../electron/main/utils/command";
import { invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
function harness(providerId: "codex" | "claude-code" = "codex") {
  invalidateGhAuthCache();
  const dir = mkdtempSync(join(tmpdir(), "agent-pr-watch-"));
  const db = new Database(":memory:"); const store = new WakeUpStore(db);
  let at = Date.parse("2026-11-17T00:01:00Z"); let enabled = true; let owned = false; let managed = false;
  const snapshot: TaskSupervisionSnapshot = { workspaceId: "ws", taskId: "task", repositoryPath: dir, exists: true, archived: false,
    providerId, model: "model", activeTurnId: null, pendingApprovalCount: 0, pendingUserInputCount: 0 };
  const pr = { number: 17, url: "https://github.com/example/repo/pull/17", title: "feat: branch", state: "OPEN", headRefName: "feature", baseRefName: "main", headRefOid: "abc", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", statusCheckRollup: [] };
  let reads = 0; let missing = false; let createdAt = "2026-11-17T00:00:30Z";
  const fake = join(dir, "gh");
  writeFileSync(fake, '#!/bin/sh\nif [ "$1" = auth ]; then exit 0; fi\nif [ "$4" = --json ] && [ "$5" = createdAt ]; then cat "' + dir + '/created.json"; else cat "' + dir + '/pr.json"; fi\n'); chmodSync(fake, 0o755);
  const run: typeof runCommandArgs = async args => {
    if (args.command === "git") return { ok: true, code: 0, stdout: "feature\n", stderr: "" };
    reads++; writeFileSync(join(dir, "pr.json"), JSON.stringify(args.commandArgs?.[1] === "list" ? missing ? [] : [pr] : missing ? null : pr));
    writeFileSync(join(dir, "created.json"), JSON.stringify({ createdAt }));
    const result = Bun.spawnSync([fake, ...(args.commandArgs ?? [])], { cwd: args.cwd, stdout: "pipe", stderr: "pipe" });
    return { ok: result.exitCode === 0, code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  };
  const persistence = { listWakeUps: () => store.list(), listActiveWakeUps: () => store.listActive(), listWakeUpsForWorkspace: (id: string) => store.listForWorkspace(id), getWakeUp: (id: string) => store.get(id), getWakeUpByTaskId: (id: string) => store.getByTaskId(id), upsertWakeUp: (w: Parameters<typeof store.upsert>[0]) => store.upsert(w), removeWakeUp: (id: string) => store.remove(id), recordWakeUpOccurrence: (o: Parameters<typeof store.recordOccurrence>[0]) => store.recordOccurrence(o), attachWakeUpOccurrenceTurn: (a: Parameters<typeof store.attachOccurrenceTurn>[0]) => store.attachOccurrenceTurn(a), listWakeUpOccurrences: (a: Parameters<typeof store.listOccurrences>[0]) => store.listOccurrences(a), pruneWakeUpOccurrences: (a: Parameters<typeof store.pruneOccurrences>[0]) => store.pruneOccurrences(a), completeInterruptedTurn: () => true };
  let tick: (() => void) | undefined;
  const runtime = createWakeUpRuntime({ persistence, getTaskSupervisionSnapshot: async () => snapshot, runSupervisedTurn: async () => ({ turnId: "wake" }), now: () => new Date(at), readPullRequestWatch: async () => ({ ok: true, pullRequest: { number: 17, url: pr.url, title: pr.title, state: pr.state as "OPEN" | "MERGED", headRefOid: "abc", baseRefName: "main", conflicting: false, failingChecks: [], reviewComments: [], checksPending: false } }), setInterval: ((fn: () => void) => { tick = fn; return 1; }) as unknown as typeof setInterval, clearInterval: (() => {}) as typeof clearInterval });
  const errors: unknown[] = [];
  const watcher = createAgentPrAutoWatch({ wakeUps: runtime, context: async () => ({ cwd: dir, enabled, managed, snapshot }), owned: () => owned, run, now: () => at, onError: e => errors.push(e) });
  cleanups.push(() => { watcher.stop(); runtime.stop(); db.close(); rmSync(dir, { recursive: true }); });
  const notify = (turnId = "turn") => watcher.notify({ workspaceId: "ws", taskId: "task", turnId, startedAt: "2026-11-17T00:00:00Z" });
  return { watcher, runtime, store, snapshot, pr, errors, notify, reads: () => reads, setEnabled: (v: boolean) => enabled = v, setOwned: (v: boolean) => owned = v, setManaged: (v: boolean) => managed = v, setMissing: (v: boolean) => missing = v, setCreated: (v: string) => createdAt = v, advance: () => at += 120_000, wakeTick: async () => { tick?.(); await runtime.whenIdle(); } };
}
for (const provider of ["codex", "claude-code"] as const) test(`completed ${provider} task discovers a PR and uses the default watch policy exactly once`, async () => {
  const h = harness(provider); h.notify(); await h.watcher.tick();
  expect(h.errors).toEqual([]); const [w] = h.store.list(); expect(w?.pullRequestWatch?.pullRequest?.number).toBe(17); expect(w?.trigger).toEqual({ kind: "pull_request", events: ["checks_failed", "merge_conflict"] });
  h.notify(); h.notify("second"); await h.watcher.tick(); expect(h.store.list()).toHaveLength(1);
});
test("does not replace a task schedule, including a stopped record", async () => {
  const h = harness(); await h.runtime.create({ workspaceId: "ws", taskId: "task", prompt: "Check later", trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } }, maxOccurrences: null, expiresAt: null });
  const original = h.store.list()[0]; h.notify(); await h.watcher.tick(); expect(h.store.list()).toEqual([original]); expect(h.reads()).toBe(0);
});
test("defers for active turns, approvals and questions without spending network attempts", async () => {
  const h = harness(); h.snapshot.activeTurnId = "active"; h.notify(); await h.watcher.tick(); expect(h.reads()).toBe(0);
  h.snapshot.activeTurnId = null; h.snapshot.pendingApprovalCount = 1; await h.watcher.tick(); expect(h.reads()).toBe(0);
  h.snapshot.pendingApprovalCount = 0; h.snapshot.pendingUserInputCount = 1; await h.watcher.tick(); expect(h.reads()).toBe(0);
  h.snapshot.pendingUserInputCount = 0; await h.watcher.tick(); expect(h.store.list()).toHaveLength(1);
});
test("disabled repositories, managed tasks and run-owned PRs never acquire a second watcher", async () => {
  for (const kind of ["disabled", "managed", "owned"]) {
    const h = harness(); if (kind === "disabled") h.setEnabled(false); if (kind === "managed") h.setManaged(true); if (kind === "owned") h.setOwned(true);
    h.notify(); await h.watcher.tick(); expect(h.store.list()).toHaveLength(0);
  }
});
test("old PRs are not newly opened PRs and missing PR polling is bounded", async () => {
  const old = harness(); old.setCreated("2026-11-16T00:00:00Z"); old.notify(); await old.watcher.tick(); expect(old.store.list()).toHaveLength(0);
  const h = harness(); h.setMissing(true); h.notify(); await h.watcher.tick();
  for (let i = 0; i < 6; i++) { h.advance(); await h.watcher.tick(); }
  expect(h.watcher.pendingCount()).toBe(0); expect(h.reads()).toBeLessThanOrEqual(10); expect(h.store.list()).toHaveLength(0);
});
test("the real supervisor stops the discovered watch when its PR merges", async () => {
  const h = harness(); h.notify(); await h.watcher.tick(); h.pr.state = "MERGED"; h.runtime.start(); await h.runtime.whenIdle(); await h.wakeTick();
  expect(h.store.list()[0]?.state).toBe("stopped");
});

test("removing a watch is not undone by a later turn on the same PR", async () => {
  const h = harness(); h.notify(); await h.watcher.tick();
  await h.runtime.remove({ id: h.store.list()[0]!.id });
  h.watcher.notify({ workspaceId: "ws", taskId: "task", turnId: "later", startedAt: "2026-11-17T00:02:00Z" });
  await h.watcher.tick(); expect(h.store.list()).toHaveLength(0);
});
test("automatic registration rechecks busy state atomically before saving", async () => {
  const h = harness(); h.snapshot.pendingApprovalCount = 1;
  await expect(h.runtime.create({ workspaceId: "ws", taskId: "task", prompt: "Watch checks", trigger: { kind: "pull_request", events: ["checks_failed", "merge_conflict"] }, maxOccurrences: null, expiresAt: null }, { number: 17, url: h.pr.url, title: h.pr.title })).rejects.toThrow("must wait");
  expect(h.store.list()).toHaveLength(0);
});
test("the same PR already watched in another workspace has exactly one watcher", async () => {
  const h = harness();
  await h.runtime.create({ workspaceId: "other", taskId: "other-task", prompt: "Watch checks", trigger: { kind: "pull_request", events: ["checks_failed", "merge_conflict"] }, maxOccurrences: null, expiresAt: null }, { number: 17, url: h.pr.url, title: h.pr.title });
  h.notify(); await h.watcher.tick();
  expect(h.store.list()).toHaveLength(1);
});
