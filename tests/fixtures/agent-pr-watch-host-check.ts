import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import { createAgentPrAutoWatch } from "../../electron/host-service/agent-pr-auto-watch";
import { createTurnPullRequestEvidence } from "../../electron/host-service/turn-pr-evidence";
import { createWakeUpRuntime } from "../../electron/host-service/wake-up-runtime";
import { createWorkspaceCleanupRuntime } from "../../electron/host-service/workspace-cleanup-runtime";
import { fetchGitHubPrStatus } from "../../electron/host-service/scm-runtime";
import { createPullRequestWatchReader } from "../../electron/host-service/pull-request-watch-reader";
import type { TaskSupervisionSnapshot } from "../../electron/host-service/local-mcp-runtime";
import { createFakeGh, fakePr } from "./fake-gh";

/** Native host check: real SQLite, real git, an executable fake `gh`. */
async function main() {
  const root = mkdtempSync(join(tmpdir(), "agent-pr-watch-native-"));
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
  let store: SqliteStore | null = null;
  let watch: ReturnType<typeof createAgentPrAutoWatch> | null = null;
  let supervisor: ReturnType<typeof createWakeUpRuntime> | null = null;
  try {
    const repository = join(root, "repository");
    execFileSync("mkdir", ["-p", repository]);
    git(repository, "init", "-b", "main"); git(repository, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "test: initial");
    const checkout = join(root, "child"); git(repository, "worktree", "add", "-b", "child", checkout);
    const state = { repo: { owner: "example", name: "repo", defaultBranch: "main" }, viewer: "me" };
    const gh = createFakeGh(root, { ...state, prs: [fakePr({ number: 17, headRefName: "child", baseRefName: "main", createdAt: "2026-11-17T00:00:30Z" }, state)] });
    store = new SqliteStore({ dbPath: join(root, "state.sqlite"), runMaintenance: false });
    store.saveRepositoryRegistry({ repositories: [{ repositoryPath: repository, repositoryName: "Fixture", lastOpenedAt: "2026-01-01", defaultBranch: "main", workspaces: [{ id: "base", name: "Base", updatedAt: "2026-01-01" }, { id: "child", name: "Child", updatedAt: "2026-01-01" }], activeWorkspaceId: "base", workspacePathById: { base: repository, child: checkout }, workspaceBranchById: { base: "main", child: "child" }, workspaceDefaultById: { base: true, child: false } }] });
    store.upsertWorkspace({ id: "child", name: "Child", snapshot: { activeTaskId: "task", tasks: [{ id: "task", title: "Task", provider: "codex", updatedAt: "2026-01-01", unread: false }], messagesByTask: {} } });
    const snapshot: TaskSupervisionSnapshot = { workspaceId: "child", taskId: "task", repositoryPath: repository, exists: true, archived: false, providerId: "codex", model: "model", activeTurnId: null, pendingApprovalCount: 0, pendingUserInputCount: 0 };
    supervisor = createWakeUpRuntime({ persistence: store, getTaskSupervisionSnapshot: async () => snapshot, runSupervisedTurn: async () => { throw new Error("No failing checks should wake a task"); }, readPullRequestWatch: createPullRequestWatchReader({ resolveWorkspacePath: async () => checkout, runCommand: gh.run }), now: () => new Date("2026-11-17T01:00:00Z") });
    const at = Date.parse("2026-11-17T00:01:00Z");
    const evidence = createTurnPullRequestEvidence({ now: () => at - 60_000 });
    evidence.observe({ turnId: "turn", workspaceId: "child", taskId: "task", event: { type: "tool", toolName: "Bash", input: JSON.stringify({ command: "gh pr create --fill" }), state: "output-available" } });
    evidence.complete("turn");
    watch = createAgentPrAutoWatch({ wakeUps: supervisor, evidence, context: async () => ({ cwd: checkout, enabled: true, managed: false, snapshot }), owned: () => false, run: gh.run, now: () => at });
    watch.notify({ workspaceId: "child", taskId: "task", turnId: "turn", startedAt: "2026-11-17T00:00:00Z", completedAt: "2026-11-17T00:01:00Z" }); await watch.tick();
    assert.equal(store.listWakeUps().length, 1);
    assert.equal(store.listWakeUps()[0]!.pullRequestWatch!.pullRequest!.number, 17);
    assert.equal(store.listWakeUps()[0]!.pullRequestWatch!.automatic, true, "Discovered watches are saved as automatic");
    assert.ok(!gh.calls().flat().some(arg => arg.includes("statusCheckRollup")), "Discovery must not read check rollups");
    gh.update(next => { next.prs[0]!.state = "MERGED"; next.prs[0]!.mergedAt = "2026-11-17T00:30:00Z"; });
    supervisor.start(); await supervisor.whenIdle();
    assert.equal(store.listWakeUps()[0]!.state, "stopped");
    assert.equal(store.listWakeUps()[0]!.pullRequestWatch!.automatic, true, "The automatic marker survives watch reads");
    const cleanup = createWorkspaceCleanupRuntime({ store: () => store!, hasTerminals: () => false, pr: args => fetchGitHubPrStatus({ ...args, runCommand: gh.run }) });
    const listed = await cleanup.list(false, true);
    assert.ok(listed.rows.find(row => row.id === "child")?.reasons.includes("prMerged"), "Merged auto-watched branch must be listed by cleanup");
    assert.equal(store.loadWorkspaceSnapshot({ workspaceId: "child" })!.tasks.length, 1);
  } finally { watch?.stop(); supervisor?.stop(); store?.close(); rmSync(root, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
