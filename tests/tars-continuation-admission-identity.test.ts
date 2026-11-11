import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { admitWorkspaceCheck } from "../electron/host-service/supervision/workspace-check-admission";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { tarsWorkflow } from "../electron/host-service/tars-execution";
import { AgentRunStartInputSchema, createAgentRun } from "../src/lib/agent-runs/domain";
import { BUILTIN_AGENTS } from "../src/lib/agents/starters";
import { tarsResponsibility } from "./fixtures/tars-host-bridge";

for (const withScripts of [false, true]) {
  test(`workspace-check admission preserves continuation identity through schema and persistence (scripts=${withScripts})`, () => {
    const at = "2026-11-12T00:00:00.000Z", db = new Database(":memory:");
    try {
      const row = tarsResponsibility({ instruction: "Follow-up current scope", acceptanceCriteria: ["New result verified"] });
      const workflow = tarsWorkflow(row, at);
      workflow.purpose += "\nContinuation request: exact-request";
      const identity = { id: workflow.id, purpose: workflow.purpose, createdAt: workflow.createdAt };
      const admitted = admitWorkspaceCheck({ workflow, agent: BUILTIN_AGENTS.find(agent => agent.id === "implementer")!,
        scripts: withScripts ? [{ scriptId: "check", definitionHash: "a".repeat(64) }] : [] }).workflow;
      const input = AgentRunStartInputSchema.parse({ workspaceId: "execution", leadTaskId: "task", origin: "agent", workflow: admitted,
        assignment: row.instruction, consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } });
      const change = createAgentRun({ id: "continued", input, repositoryPath: "/tmp/project",
        fingerprint: { providerId: "codex", model: "test-model" }, now: new Date("2026-11-12T01:00:00.000Z") });
      const store = new AgentRunStore(db);
      expect(store.create(change, new Date(at)).ok).toBe(true);
      const saved = store.getAgentRun("continued")!;
      expect(saved.workflow).toMatchObject(identity);
      expect(saved.assignment).toBe(row.instruction);
      expect(saved.workflow.stages.at(-1)?.acceptanceCriteria?.some(criterion => criterion.verification === "stave-check") ?? false).toBe(withScripts);
    } finally { db.close(); }
  });
}
