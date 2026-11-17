import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import { createAgentPrAutoWatch } from "../../electron/host-service/agent-pr-auto-watch";
import { createWakeUpRuntime } from "../../electron/host-service/wake-up-runtime";
import { createWorkspaceCleanupRuntime } from "../../electron/host-service/workspace-cleanup-runtime";
import { fetchGitHubPrStatus } from "../../electron/host-service/scm-runtime";
import { createPullRequestWatchReader } from "../../electron/host-service/pull-request-watch-reader";
import { runCommandArgs } from "../../electron/main/utils/command";
import type { TaskSupervisionSnapshot } from "../../electron/host-service/local-mcp-runtime";
async function main() {
  const root = mkdtempSync(join(tmpdir(), "agent-pr-watch-native-"));
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
  let store: SqliteStore | null = null;
  let watch: ReturnType<typeof createAgentPrAutoWatch> | null = null;
  let supervisor: ReturnType<typeof createWakeUpRuntime> | null = null;
  try {
    git(root, "init", "-b", "main"); git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "test: initial");
    const checkout = join(root, "child"); git(root, "worktree", "add", "-b", "child", checkout);
    const fake = join(root, "gh");
    writeFileSync(fake, '#!/bin/sh\nif [ "$1" = auth ]; then exit 0; fi\nif [ "$4" = --json ] && [ "$5" = createdAt ]; then printf \'{"createdAt":"2026-11-17T00:00:30Z"}\'; elif [ "$2" = list ]; then printf "["; cat "' + root + '/pr.json"; printf "]"; else cat "' + root + '/pr.json"; fi\n'); chmodSync(fake, 0o755);
    const pr = { number: 17, title: "feat: child", url: "https://github.com/example/repo/pull/17", state: "OPEN", isDraft: false, baseRefName: "main", headRefName: "child", headRefOid: "abc", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", statusCheckRollup: [], mergedAt: null as string | null };
    const savePr = () => writeFileSync(join(root, "pr.json"), JSON.stringify(pr)); savePr();
    const run: typeof runCommandArgs = args => runCommandArgs({ ...args, ...(args.command === "gh" ? { command: fake } : {}) });
    store = new SqliteStore({ dbPath: join(root, "state.sqlite"), runMaintenance: false });
    store.saveRepositoryRegistry({ repositories: [{ repositoryPath: root, repositoryName: "Fixture", lastOpenedAt: "2026-01-01", defaultBranch: "main", workspaces: [{ id: "base", name: "Base", updatedAt: "2026-01-01" }, { id: "child", name: "Child", updatedAt: "2026-01-01" }], activeWorkspaceId: "base", workspacePathById: { base: root, child: checkout }, workspaceBranchById: { base: "main", child: "child" }, workspaceDefaultById: { base: true, child: false } }] });
    store.upsertWorkspace({ id: "child", name: "Child", snapshot: { activeTaskId: "task", tasks: [{ id: "task", title: "Task", provider: "codex", updatedAt: "2026-01-01", unread: false }], messagesByTask: {} } });
    const snapshot: TaskSupervisionSnapshot = { workspaceId: "child", taskId: "task", repositoryPath: root, exists: true, archived: false, providerId: "codex", model: "model", activeTurnId: null, pendingApprovalCount: 0, pendingUserInputCount: 0 };
    supervisor = createWakeUpRuntime({ persistence: store, getTaskSupervisionSnapshot: async () => snapshot, runSupervisedTurn: async () => { throw new Error("No failing checks should wake a task"); }, readPullRequestWatch: createPullRequestWatchReader({ resolveWorkspacePath: async () => checkout, runCommand: run }), now: () => new Date("2026-11-17T01:00:00Z") });
    watch = createAgentPrAutoWatch({ wakeUps: supervisor, context: async () => ({ cwd: checkout, enabled: true, managed: false, snapshot }), owned: () => false, run });
    watch.notify({ workspaceId: "child", taskId: "task", turnId: "turn", startedAt: "2026-11-17T00:00:00Z" }); await watch.tick();
    assert.equal(store.listWakeUps().length, 1); assert.equal(store.listWakeUps()[0]!.pullRequestWatch!.pullRequest!.number, 17);
    pr.state = "MERGED"; pr.mergedAt = "2026-11-17T00:30:00Z"; savePr();
    supervisor.start(); await supervisor.whenIdle();
    assert.equal(store.listWakeUps()[0]!.state, "stopped");
    const cleanup = createWorkspaceCleanupRuntime({ store: () => store!, hasTerminals: () => false, pr: args => fetchGitHubPrStatus({ ...args, runCommand: run }) });
    const listed = await cleanup.list(false, true);
    assert.ok(listed.rows.find(row => row.id === "child")?.reasons.includes("prMerged"), "Merged auto-watched branch must be listed by cleanup");
    assert.equal(store.loadWorkspaceSnapshot({ workspaceId: "child" })!.tasks.length, 1);
  } finally { watch?.stop(); supervisor?.stop(); store?.close(); rmSync(root, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
