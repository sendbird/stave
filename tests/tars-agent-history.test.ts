import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { AgentAssignmentStore } from "../electron/persistence/agent-assignment-store";
import { createAssignRuntime } from "../electron/host-service/supervision/assign-runtime";
import { getBuiltinAgent } from "../src/lib/agents/starters";

const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function fixture() {
  const database = new Database(":memory:"); databases.push(database);
  const store = new AgentAssignmentStore(database);
  const runtime = createAssignRuntime({ store });
  let tasks = 0;
  const record = (requestId: string) => runtime.recordTaskAgent({ requestId, taskId: `task-${tasks++}`, workspaceId: "workspace",
    repositoryPath: "/tmp/repository", agent: getBuiltinAgent("supervisor")!, providerId: "codex", model: null, assignment: requestId });
  return { store, runtime, record };
}

const TARS = "tars-123e4567-e89b-42d3-a456-426614174000";
const TARS_UPPER = "tars-123E4567-E89B-42D3-A456-426614174001";

describe("Supervisor history leaves out work Tars delegated", () => {
  test("only the strict tars-<uuid> request id is Tars's; similar user ids stay", () => {
    const f = fixture();
    for (const requestId of ["kickoff-1", TARS, "tars-notes", TARS_UPPER, "tars-123e4567"]) f.record(requestId);
    const ids = (rows: { requestId: string }[]) => rows.map((row) => row.requestId).sort();
    expect(ids(f.store.list({ agentConfigId: "supervisor" }))).toEqual(["kickoff-1", TARS, TARS_UPPER, "tars-123e4567", "tars-notes"].sort());
    expect(ids(f.store.list({ agentConfigId: "supervisor", excludeTars: true }))).toEqual(["kickoff-1", "tars-123e4567", "tars-notes"]);
    // Without an agent filter, and through the runtime the host calls.
    expect(ids(f.runtime.list({ excludeTars: true }))).toEqual(["kickoff-1", "tars-123e4567", "tars-notes"]);
  });

  test("the limit counts only the rows shown, so newer Tars work never pushes the user's work out", () => {
    const f = fixture();
    f.record("user-older");
    for (let index = 0; index < 3; index++) f.record(`tars-123e4567-e89b-42d3-a456-42661417400${index}`);
    expect(f.store.list({ agentConfigId: "supervisor", limit: 1, excludeTars: true }).map((row) => row.requestId)).toEqual(["user-older"]);
    expect(f.store.list({ agentConfigId: "supervisor", limit: 1 })[0]?.requestId).toMatch(/^tars-/);
  });

  test("main accepts the filter and still refuses unknown list fields", () => {
    const source = `
      import { mock } from "bun:test";
      const handlers = new Map(); const calls = [];
      mock.module("electron", () => ({ ipcMain: { handle: (key, callback) => handlers.set(key, callback) }, webContents: { getAllWebContents: () => [] } }));
      mock.module("./electron/main/host-service-client", () => ({ invokeHostService: async (...args) => { calls.push(args); return { ok: true, value: [] }; },
        onHostServiceEvent: () => () => {}, onHostServiceReady: () => () => {} }));
      mock.module("./electron/main/agents/agent-registry", () => ({ areCustomAgentsSynced: () => true, setCustomAgents: () => {}, setMyStandards: () => {}, setRouteSettings: () => {} }));
      mock.module("./electron/main/agents/agent-host-sync", () => ({ syncAgentsToHost: async () => {} }));
      mock.module("./electron/main/tars-conversation-instance", () => ({ wakeTarsConversationService: () => {} }));
      const { registerAgentHandlers } = await import("./electron/main/ipc/agents");
      registerAgentHandlers();
      const list = handlers.get("agents:list-assignments");
      const accepted = await list(null, { agentConfigId: "supervisor", limit: 10, excludeTars: true });
      const refused = await list(null, { agentConfigId: "supervisor", excludeTars: "yes" });
      const unknown = await list(null, { agentConfigId: "supervisor", onlyTars: true });
      console.log(JSON.stringify({ accepted, refused, unknown, calls }));
    `;
    const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    const output = JSON.parse(result.stdout.toString());
    expect(output.accepted).toEqual({ ok: true, value: [] });
    expect(output.refused).toMatchObject({ ok: false, code: "invalid" });
    expect(output.unknown).toMatchObject({ ok: false, code: "invalid" });
    expect(output.calls).toEqual([["agent.invoke", { action: "list-assignments", args: { agentConfigId: "supervisor", limit: 10, excludeTars: true } }]]);
  });
});
