import { Database } from "bun:sqlite";
import { AgentRunStore } from "../../electron/persistence/agent-run-store";
import { AgentAssignmentStore } from "../../electron/persistence/agent-assignment-store";
import { TarsStore } from "../../electron/persistence/tars-store";
import { DelegationPolicyStore } from "../../electron/persistence/delegation-policy-store";
import { createAssignRuntime } from "../../electron/host-service/supervision/assign-runtime";
import { createHostConstrainedRouter, createHostResourceFreezer } from "../../electron/host-service/supervision/agent-run-routing-host";
import { getBuiltinAgent } from "../../src/lib/agents/starters";
import { buildAgentRouteSettings } from "../../src/store/agent-route-settings-sync";
import { buildStarterProfile } from "../../src/lib/providers/auto-routing-profile";
import { defaultSettings } from "../../src/store/app-settings";
import type { AgentRunStartInput } from "../../src/lib/agent-runs/domain";
import { buildTarsExecutionResources } from "../../src/lib/tars/execution-resources";

/** Real host wiring and SQLite; only the external classifier and provider dispatch are fixtures. */
export function createRoutingHostHarness(db = new Database(":memory:")) {
  const runs = new AgentRunStore(db), assignmentStore = new AgentAssignmentStore(db), tars = new TarsStore(db);
  const assignments = createAssignRuntime({ store: assignmentStore });
  db.run("CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)");
  const settings = new DelegationPolicyStore(db);
  const saveSettings = (enabled: boolean, profile = "starter-quality-first") => settings.saveRouteSettings(buildAgentRouteSettings({
    ...defaultSettings, autoRoutingEnabled: enabled, autoRoutingProfile: buildStarterProfile(profile),
  }));
  saveSettings(false);
  const freezeResources = createHostResourceFreezer({ assignments: assignmentStore, tars,
    taskAgent: assignments.agentForTask, draft: () => undefined, settings: () => settings.loadRouteSettings(), profiles: () => [] });
  let classified = 0;
  const router = createHostConstrainedRouter({ runs, assignment: assignments.assignmentForTask,
    settings: () => new DelegationPolicyStore(db).loadRouteSettings(), profiles: () => [], history: () => [], cwd: async () => "/tmp/workspace",
    classify: async () => { classified++; return { ok: true, classification: { version: 2, intent: "implement", complexity: "low",
      risk: "normal", continuity: "new", domain: "logic", evidenceCodes: [] } }; } });
  function admitTars(input: AgentRunStartInput, providerId: "codex" | "claude-code", model: string | null = null) {
    const at = "2026-09-26T10:00:00.000Z";
    const created = tars.create({ requestId: `fixture-${input.leadTaskId}`, title: "Work", instruction: input.assignment,
      acceptanceCriteria: ["Verified"], workspaceId: "source", repositoryPath: "/tmp/repo", providerId, model }, at);
    const row = tars.patch(created.id, created.revision, { executionWorkspaceId: input.workspaceId, taskId: input.leadTaskId }, at);
    assignments.recordTaskAgent({ requestId: `tars-${row.id}`, taskId: input.leadTaskId, workspaceId: input.workspaceId,
      repositoryPath: row.repositoryPath, providerId, model, assignment: row.instruction, agent: getBuiltinAgent("implementer")! });
    return { input: { ...input, workflow: { ...input.workflow, id: `tars-${row.id}` }, ...buildTarsExecutionResources(row) },
      admission: { tarsResponsibilityId: row.id }, row };
  }
  return { db, runs, tars, assignments, settings, freezeResources, router, saveSettings, admitTars,
    get classified() { return classified; } };
}
