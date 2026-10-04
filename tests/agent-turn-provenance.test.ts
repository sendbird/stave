import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { AgentAssignmentStore } from "../electron/persistence/agent-assignment-store";
import { SqliteStore } from "../electron/persistence/sqlite-store";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAssignRuntime } from "../electron/host-service/supervision/assign-runtime";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { AgentTurnProvenanceSchema } from "../src/lib/agents/turn-provenance";
import { replayProviderEventsToTaskState } from "../src/lib/session/provider-event-replay";
import { ChatMessageSchema } from "../src/lib/task-context/schemas";
import type { StreamTurnArgs } from "../electron/providers/types";

function harness() {
  const db = new Database(":memory:");
  const store = new AgentAssignmentStore(db);
  let sequence = 0;
  const runtime = createAssignRuntime({ store, newId: () => `assignment-${++sequence}` });
  const record = (agent = getBuiltinAgent("implementer")!, role: "primary" | "delegate" = "primary") => runtime.recordTaskAgent({
    requestId: `request-${sequence}`, taskId: "task", workspaceId: "workspace", repositoryPath: "/tmp/repo",
    agent, role, providerId: "codex", model: null, assignment: "Do the work.",
  });
  const prepare = (providerId: StreamTurnArgs["providerId"] = "codex") => runtime.prepareTurn({
    turnId: `turn-${sequence}`, taskId: "task", providerId, prompt: "Do the work.",
    runtimeOptions: { model: "selected-model", codexReasoningEffort: "low",
      codexFileAccess: "danger-full-access", codexApprovalPolicy: "never", boundSecretIds: ["secret-id"] },
  })!;
  return { db, store, runtime, record, prepare };
}

test("seals a saved Agent version across reassignment and release, excluding secrets and prose", () => {
  const h = harness();
  const row = h.record(getBuiltinAgent("researcher")!);
  const turn = h.prepare();
  h.record();
  h.runtime.releaseTaskAgent("task");
  expect(turn.provenance).toMatchObject({ assignmentId: row.id, agentName: "Researcher", model: "selected-model", effort: "low",
    permission: { source: "agent-autonomy", agentLimit: "read-only",
      applied: { codexFileAccess: "read-only", codexApprovalPolicy: "never", codexNetworkAccess: false } } });
  expect(turn.runtimeOptions.agentInstructions).toContain("Researcher");
  expect(JSON.stringify(turn.provenance)).not.toContain("secret-id");
  expect(JSON.stringify(turn.provenance)).not.toContain(row.agent.instructions);
  expect(turn.observe({ type: "error", recoverable: false, message: "Startup failed" })).toBeNull();
  expect(turn.observe({ type: "text", text: "Answer" })).toMatchObject({ provenance: { instructions: { status: "delivered" } } });
  expect(h.runtime.prepareTurn({ taskId: "task", providerId: "codex", prompt: "Direct" })).toBeNull();
  h.db.close();
});

test("delivery is keyed by provider and actual session, never by the old global consumed flag", () => {
  const h = harness();
  const row = h.record();
  h.store.update(Object.assign({ ...row }, { preambleDue: false }));
  const failed = h.prepare("cursor");
  expect(failed.prepareSessionPrompt("new-session", false)).toContain("Implementer");
  // No accepted prompt: retry still owes delivery.
  const retry = h.prepare("cursor");
  expect(retry.prepareSessionPrompt("new-session", false)).toContain("Implementer");
  expect(retry.acknowledgeSessionPrompt()).toMatchObject({ provenance: { instructions: { status: "delivered" } } });
  const resumed = h.prepare("cursor");
  expect(resumed.prepareSessionPrompt("new-session", true)).toBeNull();
  expect(resumed.acknowledgeSessionPrompt()).toMatchObject({ provenance: { instructions: { status: "retained-session" } } });
  expect(h.prepare("cursor").prepareSessionPrompt("new-session", false)).toContain("Implementer");
  expect(h.prepare("cursor").prepareSessionPrompt("fresh-after-resume-fallback", false)).toContain("Implementer");
  expect(h.prepare("kiro").prepareSessionPrompt("new-session", true)).toContain("Implementer");
  const old = h.prepare("cursor");
  old.prepareSessionPrompt("delayed", false);
  h.record(getBuiltinAgent("researcher")!);
  old.acknowledgeSessionPrompt();
  expect(h.prepare("cursor").prepareSessionPrompt("delayed", true)).toContain("Researcher");
  h.db.close();
});

test("delegated snapshots use their own role, keep host permissions and nested Can call identity", () => {
  const h = harness();
  const agent = { ...getBuiltinAgent("researcher")!, usableAs: ["delegate"] as const, canCall: ["implementer"] };
  h.record({ ...agent, usableAs: [...agent.usableAs] }, "delegate");
  const turn = h.prepare();
  expect(turn.runtimeOptions).toMatchObject({ codexFileAccess: "danger-full-access", codexApprovalPolicy: "never" });
  expect(turn.runtimeOptions.agentInstructions).toContain("Researcher");
  expect(turn.provenance).toMatchObject({ role: "delegate", permission: { source: "delegation-policy" } });
  expect(h.runtime.agentForTask("task")?.canCall).toEqual(["implementer"]);
  expect(h.runtime.prepareTurn({ taskId: "task", providerId: "codex", prompt: "Aux", executionPolicy: "secondary-read-only" })).toBeNull();
  h.db.close();
});

test("malformed saved assignment and unavailable fixed-provider constraints refuse execution", () => {
  const h = harness();
  h.record();
  h.db.run("UPDATE agent_assignments SET body_json = 'null'");
  expect(() => h.prepare()).toThrow("could not be read");
  h.db.close();
  const fixed = harness();
  fixed.record({ ...getBuiltinAgent("implementer")!, model: { mode: "fixed", providerId: "codex", model: "fixed" } });
  expect(() => fixed.prepare("claude-code")).toThrow();
  fixed.db.close();
});

test("replay pins exact-turn identity, advances delivery only, and leaves historical absence unknown", () => {
  const h = harness();
  h.record();
  const provenance = h.prepare().provenance;
  const result = replayProviderEventsToTaskState({ taskId: "task", provider: "codex", model: "model", turnId: provenance.turnId,
    messages: [], events: [
      { type: "agent_provenance", provenance },
      { type: "plan_ready", planText: "Do the work." },
      { type: "text", text: "Answer" },
      { type: "agent_provenance", provenance: { ...provenance, agentName: "Forged rewrite", model: "wrong", instructions: { ...provenance.instructions, status: "delivered" } } },
      { type: "done" },
    ] });
  expect(result.messages.length).toBeGreaterThan(1);
  for (const message of result.messages) {
    expect(message.agentProvenance?.assignmentId).toBe(provenance.assignmentId);
    expect(message.agentProvenance?.agentName).toBe("Implementer");
    expect(ChatMessageSchema.parse(JSON.parse(JSON.stringify(message))).agentProvenance).toBeDefined();
  }
  expect(AgentTurnProvenanceSchema.safeParse({ ...provenance, secretEnv: { SECRET: "value" } }).success).toBe(false);
  const historical = replayProviderEventsToTaskState({ taskId: "old", provider: "codex", model: "model", turnId: "historical", messages: [], events: [{ type: "text", text: "Old reply" }, { type: "done" }] });
  expect(historical.messages[0]?.agentProvenance).toBeUndefined();
  h.db.close();
});

test("Agent evidence survives production SQL compaction and reopening, without restoring transcript text", () => {
  const h = harness();
  h.record();
  const provenance = h.prepare().provenance;
  const directory = mkdtempSync(path.join(tmpdir(), "stave-agent-evidence-"));
  const databasePath = path.join(directory, "history.sqlite");
  const db = new Database(databasePath);
  db.exec(`CREATE TABLE turns (id TEXT PRIMARY KEY, workspace_id TEXT, task_id TEXT, provider_id TEXT, created_at TEXT, completed_at TEXT, usage_json TEXT, receipt_json TEXT);
    CREATE TABLE turn_events (id TEXT PRIMARY KEY, turn_id TEXT, sequence INTEGER, event_type TEXT, payload_json TEXT, created_at TEXT);`);
  const store = Object.create(SqliteStore.prototype) as SqliteStore;
  Object.assign(store, { db, _closed: false, usageStatistics: new UsageStatisticsStore(db) });
  store.beginTurn({ id: provenance.turnId, workspaceId: "workspace", taskId: "task", providerId: "codex" });
  store.saveStreamEvents({ turnId: provenance.turnId, events: [
    { sequence: 1, event: { type: "agent_provenance", provenance } },
    { sequence: 2, event: { type: "text", text: "Completed reply" } },
    { sequence: 3, event: { type: "done" } },
  ] });
  store.completeTurn({ id: provenance.turnId });
  db.close();
  const reopened = new Database(databasePath);
  Object.assign(store, { db: reopened, usageStatistics: new UsageStatisticsStore(reopened) });
  const events = store.getStreamEvents({ turnId: provenance.turnId });
  expect(events.map((event) => event.eventType)).toEqual(["agent_provenance", "done"]);
  expect(events[0]?.event).toMatchObject({ type: "agent_provenance", provenance });
  reopened.close();
  h.db.close();
  rmSync(directory, { recursive: true, force: true });
});
