import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import { createWorkspaceCleanupRuntime } from "../../electron/host-service/workspace-cleanup-runtime";
import { createWorkspaceDiskUsage } from "../../electron/host-service/workspace-disk-usage";
import { subAgentWorktreeDiskId } from "../../src/lib/workspace-cleanup-contract";
import { workspaceExecutionGate } from "../../electron/shared/workspace-execution-gate";

// The cleanup runtime with a real SQLite registry and real Git in a temporary repository.
async function main() {
  const root = mkdtempSync(join(tmpdir(), "subagent-worktree-runtime-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" };
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const calls: string[][] = [];
  try {
    const repo = join(root, "repository");
    git(root, "init", "-b", "main", repo);
    git(repo, "commit", "--allow-empty", "-m", "initial");
    const agent = (id: string) => { const path = join(repo, ".claude", "worktrees", `agent-${id}`); git(repo, "worktree", "add", "-b", `worktree-agent-${id}`, path); return realpathSync(path); };
    const leftover = agent("left");
    const linked = agent("linked");
    const workspace = agent("workspace");
    const store = new SqliteStore({ dbPath: join(root, "state.sqlite"), runMaintenance: false });
    store.saveRepositoryRegistry({ repositories: [{ repositoryPath: repo, repositoryName: "Repository", lastOpenedAt: "2026-01-01", defaultBranch: "main",
      workspaces: [{ id: "base", name: "Default", updatedAt: "2026-01-01" }, { id: "ws", name: "Workspace", updatedAt: "2026-01-01" }], activeWorkspaceId: "base",
      workspacePathById: { base: repo, ws: workspace }, workspaceBranchById: { base: "main", ws: "worktree-agent-workspace" }, workspaceDefaultById: { base: true, ws: false },
      linkedWorkspacePaths: [linked] }] });
    const later = Date.now() + 2 * 60 * 60_000;
    const runtime = createWorkspaceCleanupRuntime({ store: () => store, hasTerminals: () => false, now: () => later,
      diskUsage: createWorkspaceDiskUsage({ measure: async () => ({ bytes: 4096, partial: false, method: "du" }) }),
      git: async (cwd, args) => {
        calls.push(args);
        try { return { ok: true, code: 0, stdout: execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), stderr: "" }; }
        catch (error) { return { ok: false, code: 1, stdout: "", stderr: String(error) }; }
      } });

    // Stave's own workspace and linked worktree are never listed, even under `.claude/worktrees`.
    const listed = await runtime.listSubAgentWorktrees([], true);
    assert.deepEqual(listed.map(row => row.path), [leftover]);
    assert.equal(listed[0]!.bytes, 4096);
    assert.deepEqual(listed[0]!.blockers, []);
    assert.ok(!(await runtime.list()).rows.some(row => row.path === leftover), "Workspace rows never include sub-agent worktrees");
    const disk = await runtime.diskUsage(true);
    await new Promise(resolve => setTimeout(resolve, 20));
    const diskRows = (await runtime.diskUsage()).rows.filter(row => row.subAgentWorktree);
    assert.equal(disk.rows.filter(row => row.subAgentWorktree).length, 1);
    assert.deepEqual(diskRows.map(row => [row.workspaceId, row.measurement?.bytes]), [[subAgentWorktreeDiskId(leftover), 4096]]);

    // Automatic cleanup never touches them.
    await runtime.runNow();
    assert.equal(existsSync(leftover), true);

    // Activity's running agent blocks; a Stave workspace path is refused outright.
    assert.equal((await runtime.removeSubAgentWorktree({ repositoryPath: repo, path: leftover }, [leftover])).reason, "agentRunning");
    assert.equal((await runtime.removeSubAgentWorktree({ repositoryPath: repo, path: linked })).reason, "staveWorkspace");
    assert.equal((await runtime.removeSubAgentWorktree({ repositoryPath: repo, path: workspace })).reason, "staveWorkspace");
    assert.equal(existsSync(linked) && existsSync(workspace), true);

    // A file written after listing blocks; once it is committed the worktree is removed and its branch kept.
    writeFileSync(join(leftover, "late.txt"), "late");
    assert.equal((await runtime.removeSubAgentWorktree({ repositoryPath: repo, path: leftover })).reason, "changedFiles");
    git(leftover, "add", "late.txt");
    git(leftover, "commit", "-m", "keep");
    const removed = await runtime.removeSubAgentWorktree({ repositoryPath: repo, path: leftover });
    assert.deepEqual(removed, { ok: true, path: leftover, reason: null });
    assert.equal(existsSync(leftover), false);
    assert.equal(git(repo, "log", "-1", "--format=%s", "worktree-agent-left").trim(), "keep", "The branch and its commit stay");
    assert.deepEqual(calls.flat().filter(arg => arg === "--force" || arg === "-f"), []);
    assert.equal((await runtime.diskUsage()).rows.some(row => row.subAgentWorktree), false, "A removed worktree leaves the disk report at once");
    store.close();
  } finally {
    workspaceExecutionGate.setArchiveReader(() => []);
    rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
