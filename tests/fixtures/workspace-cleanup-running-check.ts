import assert from "node:assert/strict";
import { createAgentRun } from "../../src/lib/agent-runs/domain";
import { AGENT_RUN_NOW, starterWorkflow } from "./agent-run-fixtures";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import { createWorkspaceCleanupRuntime } from "../../electron/host-service/workspace-cleanup-runtime";
import { workspaceExecutionGate } from "../../electron/shared/workspace-execution-gate";

async function main() {
  const root = mkdtempSync(join(tmpdir(), "cleanup-running-"));
  const repo = join(root, "repository"), path = join(root, "feature");
  mkdirSync(repo); mkdirSync(path);
  const store = new SqliteStore({ dbPath: join(root, "state.sqlite"), runMaintenance: false });
  const db = (store as unknown as { db: Database.Database }).db;
  try {
    store.saveRepositoryRegistry({ repositories: [{
      repositoryPath: repo, repositoryName: "Repository", lastOpenedAt: "2026-01-01", defaultBranch: "main",
      workspaces: [{ id: "base", name: "Default", updatedAt: "2026-01-01" }, { id: "feature", name: "Feature", updatedAt: "2026-01-01" }],
      activeWorkspaceId: "base", workspacePathById: { base: repo, feature: path },
      workspaceBranchById: { base: "main", feature: "feature" }, workspaceDefaultById: { base: true, feature: false },
    }] });
    store.upsertWorkspace({ id: "feature", name: "Feature", snapshot: {
      activeTaskId: "parent", tasks: [{ id: "parent", title: "Parent", provider: "codex", updatedAt: "2026-01-01", unread: false }],
      messagesByTask: { parent: [] },
    } });
    const runtime = createWorkspaceCleanupRuntime({
      store: () => store, hasTerminals: () => false,
      git: async () => ({ ok: true, stdout: "", stderr: "" }),
      pr: async () => ({ ok: true, pr: null, stderr: "" }),
    });
    async function refuses(field: "turns" | "children" | "runs", blocker: string) {
      assert.equal(workspaceExecutionGate.isBusy({ workspaceId: "feature", workspacePath: path }), false);
      const preview = store.previewFleetStop({ targets: [{ workspaceId: "feature", taskId: "parent" }] });
      assert.equal(preview[field], 1);
      const row = (await runtime.list()).rows.find(row => row.id === "feature")!;
      assert.ok(row.blockers.includes(blocker), `${field} missing from cleanup: ${JSON.stringify(row.blockers)}`);
      const result = await runtime.act({ action: "archive", workspaceId: "feature", repositoryPath: repo });
      assert.equal(result.ok, false);
      assert.ok(result.reason?.includes(blocker));
      assert.equal(store.listArchivedWorkspacesPersistence().length, 0);
    }
    if (process.argv[2] === "turn") {
      store.beginTurn({ id: "turn", workspaceId: "feature", taskId: "parent", providerId: "codex" });
      await refuses("turns", "runningTurn");
      db.prepare("UPDATE turns SET completed_at = 'now'").run();
    }
    if (process.argv[2] === "child") {
      db.exec("INSERT INTO runs VALUES ('child-run','delegated-task','task','parent','/tmp/project','elsewhere','child','running','{}','{}','now','now','now',NULL)");
      await refuses("children", "runningRun");
      db.prepare("UPDATE runs SET status = 'completed'").run();
    }
    if (process.argv[2] === "run") {
      const change = createAgentRun({
        id: "paused", repositoryPath: repo, now: AGENT_RUN_NOW,
        fingerprint: { providerId: "codex", model: "test-model" },
        input: { workspaceId: "feature", leadTaskId: "parent", assignment: "Inspect work",
          workflow: starterWorkflow("request-to-pr"), consent: { checkIns: "plan-and-publishing", permissionMode: "guided", authorizedEffectStageIds: [] } },
      });
      change.agentRun.state = "paused";
      change.agentRun.pauseReason = "paused-by-user";
      store.agentRuns.create(change, AGENT_RUN_NOW);
      await refuses("runs", "runningRun");
      db.prepare("UPDATE agent_runs SET state = 'completed'").run();
    }
    const row = (await runtime.list()).rows.find(row => row.id === "feature")!;
    assert.ok(!row.blockers.some(reason => ["runningTurn", "runningRun"].includes(reason)), JSON.stringify(row.blockers));
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
