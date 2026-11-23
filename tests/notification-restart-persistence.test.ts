import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

test("desktop startup settles interrupted requests across workspaces and retains their history", () => {
  mkdirSync("test-results", { recursive: true });
  const root = mkdtempSync(path.resolve("test-results/notification-restart-"));
  try {
    const entry = path.join(root, "check.ts");
    const bundle = path.join(root, "check.cjs");
    writeFileSync(entry, `
      import assert from "node:assert/strict";
      import { SqliteStore } from ${JSON.stringify(path.resolve("electron/persistence/sqlite-store.ts"))};

      const options = { dbPath: ${JSON.stringify(path.join(root, "stave.sqlite"))}, runMaintenance: false, contentSearchOwner: false };
      const createdAt = "2026-11-22T00:00:00.000Z";
      const approval = { type: "approval", requestId: "request", state: "approval-requested", toolName: "Bash", description: "Run tests" };
      const question = { type: "user_input", requestId: "request", state: "input-requested", toolName: "AskUserQuestion", questions: [] };
      const runQuestion = { ...question, requestId: "run-question:run:stage:1:request" };
      const before = new SqliteStore(options);
      const cases = [
        ["cold-approval", approval, {}, false],
        ["cold-question", question, {}, false],
        ["missing-message", null, {}, false],
        ["answered-async", { ...question, delivery: "async", state: "input-responded" }, {}, false],
        ["async", { ...question, delivery: "async" }, {}, true],
        ["async-before-message-save", null, {}, true],
        ["run-question", runQuestion, {}, true],
        ["managed", approval, { controlMode: "managed" }, true],
        ["managed-answered", { ...approval, state: "approval-responded" }, { controlMode: "managed" }, false],
        ["delegated", approval, { parentTaskId: "parent" }, true],
      ];
      for (const [workspaceId, part, ownership] of cases) {
        const task = { id: "task", title: "Task", provider: "codex", updatedAt: createdAt, unread: false, ...ownership };
        const turnId = workspaceId + "-turn";
        const message = { id: "anchor", role: "assistant", model: "system", providerId: "codex", content: "", turnId, parts: [part] };
        // The newer message must not stand in for an older notification anchor.
        const later = { ...message, id: "later", parts: [] };
        before.upsertWorkspace({
          id: workspaceId, name: workspaceId, snapshot: {
            activeTaskId: task.id, tasks: [task], messagesByTask: { task: part ? [message, later] : [later] },
          },
        });
        before.beginTurn({ id: turnId, workspaceId, taskId: task.id, providerId: "codex", createdAt });
        const requestId = part?.requestId ?? "request";
        const isApproval = part?.type === "approval";
        before.createNotification({ notification: {
          id: workspaceId, kind: isApproval ? "task.approval_requested" : "task.user_input_requested",
          title: "Needs you", body: "Test", workspaceId, taskId: task.id, turnId, createdAt,
          action: isApproval ? { type: "approval", requestId, messageId: "anchor" } : null,
          payload: isApproval ? {} : {
            requestId, messageId: "anchor",
            delivery: workspaceId === "async-before-message-save" ? "async" : part?.delivery,
          },
        } });
      }
      before.createNotification({ notification: { id: "result", kind: "task.turn_completed", title: "Done", body: "Test", createdAt } });
      before.createNotification({ notification: { id: "agent-run", kind: "agent_run.blocked", title: "Blocked", body: "Test", createdAt } });
      before.close();

      // Restart with only persisted state. Incomplete turn rows are not live provider resolvers.
      const after = new SqliteStore({ ...options, recoverInterruptedTaskNotifications: true });
      const rows = new Map(after.listNotifications().map((row) => [row.id, row]));
      assert.equal(rows.size, cases.length + 2);
      for (const [id, , , stillAnswerable] of cases) {
        const row = rows.get(id);
        assert.equal(Boolean(row.resolvedAt), !stillAnswerable, id + " resolution");
        assert.equal(Boolean(row.readAt), !stillAnswerable, id + " unread badge");
      }
      assert.equal(rows.get("result").readAt, null);
      assert.equal(rows.get("agent-run").resolvedAt, null);
      after.close();

      // Other store connections must not sweep requests written since startup.
      const host = new SqliteStore(options);
      host.createNotification({ notification: {
        id: "new-approval", kind: "task.approval_requested", title: "Needs you", body: "Test",
        workspaceId: "cold-approval", taskId: "task", turnId: "new-turn",
      } });
      host.close();
      const reader = new SqliteStore(options);
      assert.equal(reader.listNotifications().find((row) => row.id === "new-approval").resolvedAt, null);
      reader.close();
    `);
    const build = spawnSync(process.execPath, [
      "build", entry, "--outfile", bundle, "--target=node", "--format=cjs",
      "--external=better-sqlite3", '--define=import.meta.env.BASE_URL="/"',
    ], { encoding: "utf8" });
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const run = spawnSync(createRequire(import.meta.url)("electron"), [bundle], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8",
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
