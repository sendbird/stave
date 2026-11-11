import { expect, test } from "bun:test";
import path from "node:path";

test("tars:get-usage validates the period before reading, reads only through the stores and returns a checked report", () => {
  // Isolate Electron module mocks from other boundary tests in the shared Bun process.
  const source = `
    import { mock } from "bun:test";
    const handlers = new Map();
    const reads = [];
    mock.module("electron", () => ({ webContents: { getAllWebContents: () => [] }, ipcMain: { handle: (key, callback) => handlers.set(key, callback) } }));
    mock.module("./electron/main/host-service-client", () => ({ onHostServiceEvent: () => () => {}, invokeHostService: async () => { throw new Error("Usage must not reach the host service"); } }));
    mock.module("./electron/main/tars-conversation-instance", () => ({ getTarsConversationService: async () => { throw new Error("Unexpected conversation service access"); } }));
    const row = { id: "work-a", title: "Fix the export", state: "completed", repositoryPath: "/tmp/repo", workspaceId: "source", executionWorkspaceId: "exec-a", taskId: "task-a", updatedAt: "2026-11-09T00:00:00.000Z" };
    mock.module("./electron/main/state", () => ({ ensurePersistenceReady: async () => ({
      tars: { snapshot: () => ({ responsibilities: [row, { ...row, id: "queued", taskId: null }] }) },
      usageStatistics: { readTaskTurns: (args) => { reads.push(args); return { truncated: false, turns: [
        { key: "work-a", providerId: "codex", modelId: "gpt-codex", createdAt: "2026-11-10T01:00:00.000Z", completedAt: "2026-11-10T01:02:00.000Z", usage: { inputTokens: 1000, outputTokens: 100 } },
      ] }; } },
      tarsConversations: { answeredTimes: () => ["2026-11-10T02:00:00.000Z"] },
    }) }));
    const { registerTarsHandlers } = await import("./electron/main/ipc/tars");
    registerTarsHandlers();
    const period = { todayStart: "2026-11-10T00:00:00.000Z", sevenDaysStart: "2026-11-04T00:00:00.000Z", thirtyDaysStart: "2026-10-12T00:00:00.000Z", until: "2026-11-10T12:00:00.000Z" };
    const report = await handlers.get("tars:get-usage")(null, period);
    let refused = 0;
    for (const invalid of [undefined, {}, { ...period, taskId: "task-a" }, { ...period, repositoryPath: "/" }, { ...period, thirtyDaysStart: "2020-01-01T00:00:00.000Z" },
      { ...period, todayStart: "2026-11-11T00:00:00.000Z" }, { ...period, until: 5 }]) {
      try { await handlers.get("tars:get-usage")(null, invalid); } catch { refused++; }
    }
    console.log(JSON.stringify({ report, refused, reads }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const output = JSON.parse(result.stdout.toString());
  expect(output.refused).toBe(7);
  // One bounded read for the one valid request: only work that has a task, in its execution workspace, over the 30-day period.
  expect(output.reads).toEqual([{ tasks: [{ key: "work-a", workspaceId: "exec-a", taskId: "task-a" }], from: "2026-10-12T00:00:00.000Z", until: "2026-11-10T12:00:00.000Z", limit: 20_000 }]);
  expect(output.report.totals.today).toEqual({ turns: 1, measuredTurns: 1, tokens: 1_100, costUsd: null, costReportedTurns: 0, durationMs: 120_000 });
  expect(output.report.works.map((work: { responsibilityId: string }) => work.responsibilityId)).toEqual(["work-a"]);
  expect(output.report.replies).toEqual({ today: 1, sevenDays: 1, thirtyDays: 1 });
});
