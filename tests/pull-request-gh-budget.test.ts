import { afterEach, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentPrAutoWatch } from "../electron/host-service/agent-pr-auto-watch";
import { createTurnPullRequestEvidence } from "../electron/host-service/turn-pr-evidence";
import { getPullRequestStack } from "../electron/host-service/pull-request-stack-runtime";
import { resetPullRequestRepoCache } from "../electron/host-service/pull-request-repo-cache";
import { createWakeUpRuntime } from "../electron/host-service/wake-up-runtime";
import { WakeUpStore } from "../electron/persistence/wake-up-store";
import { invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
import { createFakeGh, fakePr, gitRepository } from "./fixtures/fake-gh";

let root = "";
beforeEach(() => { resetPullRequestRepoCache(); invalidateGhAuthCache(); root = mkdtempSync(join(tmpdir(), "gh-budget-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("ten workspaces of one repository share a handful of gh reads for stacks and auto-watch", async () => {
  const main = join(root, "repository"); mkdirSync(main);
  const repo = gitRepository(main);
  const state = { repo: { owner: "example", name: "repo", defaultBranch: "main" }, viewer: "me" };
  const workspaces = Array.from({ length: 10 }, (_, index) => ({ id: `ws${index}`, branch: `b${index}`, cwd: repo.worktree(`ws${index}`, `b${index}`) }));
  const gh = createFakeGh(root, { ...state, prs: workspaces.map((workspace, index) => fakePr({
    number: index + 1, headRefName: workspace.branch, baseRefName: index === 1 ? "b0" : "main", createdAt: "2026-11-17T00:00:30Z",
  }, state)) });

  const stacks = await Promise.all(workspaces.map(workspace => getPullRequestStack({ cwd: workspace.cwd }, gh.run)));
  expect(stacks.every(result => result.ok)).toBe(true);
  expect(stacks[1]?.stack).toMatchObject({ position: 2, total: 2 });
  const stackCalls = gh.calls().length;
  expect(stackCalls).toBeLessThanOrEqual(4);

  const db = new Database(":memory:"); const store = new WakeUpStore(db);
  const at = Date.parse("2026-11-17T00:01:00Z");
  const snapshot = (workspaceId: string, taskId: string): TaskSupervisionSnapshot => ({ workspaceId, taskId, repositoryPath: main, exists: true, archived: false, providerId: "claude-code", model: "model", activeTurnId: null, pendingApprovalCount: 0, pendingUserInputCount: 0 });
  const persistence = { listWakeUps: () => store.list(), listActiveWakeUps: () => store.listActive(), listWakeUpsForWorkspace: (id: string) => store.listForWorkspace(id), getWakeUp: (id: string) => store.get(id), getWakeUpByTaskId: (id: string) => store.getByTaskId(id), upsertWakeUp: (w: Parameters<typeof store.upsert>[0]) => store.upsert(w), removeWakeUp: (id: string) => store.remove(id), recordWakeUpOccurrence: (o: Parameters<typeof store.recordOccurrence>[0]) => store.recordOccurrence(o), attachWakeUpOccurrenceTurn: (a: Parameters<typeof store.attachOccurrenceTurn>[0]) => store.attachOccurrenceTurn(a), listWakeUpOccurrences: (a: Parameters<typeof store.listOccurrences>[0]) => store.listOccurrences(a), pruneWakeUpOccurrences: (a: Parameters<typeof store.pruneOccurrences>[0]) => store.pruneOccurrences(a), completeInterruptedTurn: () => true };
  const runtime = createWakeUpRuntime({ persistence, getTaskSupervisionSnapshot: async ({ workspaceId, taskId }) => snapshot(workspaceId, taskId), runSupervisedTurn: async () => ({ turnId: "wake" }), now: () => new Date(at), readPullRequestWatch: async () => ({ ok: true, pullRequest: null }), setInterval: (() => 1) as unknown as typeof setInterval, clearInterval: (() => {}) as typeof clearInterval });
  const evidence = createTurnPullRequestEvidence({ now: () => at - 30_000 });
  const watcher = createAgentPrAutoWatch({
    wakeUps: runtime, evidence, run: gh.run, now: () => at, owned: () => false,
    context: async (candidate) => ({ cwd: workspaces.find(workspace => workspace.id === candidate.workspaceId)!.cwd, enabled: true, managed: false, snapshot: snapshot(candidate.workspaceId, candidate.taskId) }),
    setTimer: () => 0, clearTimer: () => {},
  });
  try {
    for (const workspace of workspaces) {
      evidence.observe({ turnId: `turn-${workspace.id}`, workspaceId: workspace.id, taskId: `task-${workspace.id}`, event: { type: "tool", toolName: "Bash", input: "gh pr create --fill", state: "output-available" } as never });
      evidence.complete(`turn-${workspace.id}`);
      watcher.notify({ workspaceId: workspace.id, taskId: `task-${workspace.id}`, turnId: `turn-${workspace.id}`, startedAt: "2026-11-17T00:00:00Z", completedAt: "2026-11-17T00:01:00Z" });
    }
    await watcher.tick();
    expect(store.list()).toHaveLength(10);
    const total = gh.calls();
    expect(total.length - stackCalls).toBeLessThanOrEqual(1);
    expect(total.flat().some(arg => arg.includes("statusCheckRollup"))).toBe(false);
  } finally { watcher.stop(); runtime.stop(); db.close(); }
});
