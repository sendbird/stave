import { expect, test } from "bun:test";
import path from "node:path";

// Keep module mocks in a subprocess so other runtime tests retain the real host modules.
test("actual host continuation reuses execution identity, persists a separate workflow and refuses changed ownership or location", () => {
  const source = `
    import { mock } from "bun:test";
    import { Database } from "bun:sqlite";
    import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import { TarsStore } from "./electron/persistence/tars-store";
    import { TarsConversationStore } from "./electron/persistence/tars-conversation-store";
    import { AgentRunStore } from "./electron/persistence/agent-run-store";
    import { AgentAssignmentStore } from "./electron/persistence/agent-assignment-store";
    import { createAssignRuntime } from "./electron/host-service/supervision/assign-runtime";
    import { createAgentRun, AgentRunStartInputSchema } from "./src/lib/agent-runs/domain";
    import { BUILTIN_AGENTS } from "./src/lib/agents/starters";
    import { compileAgentRunStagePrompt } from "./src/lib/agent-runs/briefing";
    import { compileTaskAgentRole } from "./src/lib/agents/runtime-options";
    import { tarsWorkflow } from "./electron/host-service/tars-execution";
    const directory = mkdtempSync(path.join(tmpdir(), "stave-host-continuation-"));
    const db = new Database(path.join(directory, "store.sqlite"));
    const persistence = { tars: new TarsStore(db), tarsConversations: new TarsConversationStore(db),
      agentAssignments: new AgentAssignmentStore(db), agentRuns: new AgentRunStore(db) };
    const assignments = createAssignRuntime({ store: persistence.agentAssignments });
    const now = "2026-11-11T00:00:00.000Z";
    let readFailure = false;
    let missing = false, archived = false, inUse = false, beforeAdmission = null;
    const registry = [{ repositoryPath: directory, workspaces: [{ id: "source", path: "/tmp/source" }, { id: "execution", path: directory }] }];
    mock.module("./electron/host-service/persistence", () => ({ ensureHostServicePersistenceReady: () => persistence }));
    mock.module("./electron/host-service/supervision/assign-host", () => ({ hostAgents: () => BUILTIN_AGENTS }));
    mock.module("./electron/providers/runtime", () => ({ providerRuntime: {} }));
    mock.module("./electron/host-service/local-mcp-runtime", () => ({
      listKnownRepositories: async () => missing ? [] : registry,
      getTaskSupervisionSnapshot: async () => {
        if (readFailure) throw new Error("Task metadata cannot be read before start");
        return { exists: true, archived, repositoryPath: directory, providerId: provider, activeTurnId: inUse ? "manual-turn" : null };
      },
    }));
    mock.module("./electron/host-service/tars-runtime", () => ({ createTarsRuntime: ports => ports }));
    const { createHostTarsRuntime } = await import("./electron/host-service/tars-host");
    let starts = 0, provider = "codex";
    const ports = createHostTarsRuntime({ assignments, agentRuns: { get: async ({ agentRunId }) => ({ ...persistence.agentRuns.getAggregate(agentRunId),
      report: { outcome: "completed", acceptanceCriteria: [{ text: "Original criterion", status: "met" }],
        links: [{ label: "Artifact", url: "https://example.test/artifact" }], leftBehind: [] } }), startAgentRun: async (raw, guard) => {
      beforeAdmission?.(); guard(); const input = AgentRunStartInputSchema.parse(raw);
      const change = createAgentRun({ id: "continued-" + ++starts, input, repositoryPath: directory,
        fingerprint: { providerId: provider, model: "test-model" }, now: new Date(now) });
      const result = persistence.agentRuns.create(change, new Date(now));
      if (!result.ok) throw new Error(result.message);
      return { agentRun: change.agentRun };
    } } });
    const results = [];
    for (provider of ["codex", "claude-code"]) {
      const created = persistence.tars.create({ requestId: provider, title: "Existing work", instruction: "Original delegation",
        acceptanceCriteria: ["Original criterion"], workspaceId: "source", repositoryPath: directory, providerId: provider }, now);
      let row = persistence.tars.patch(created.id, created.revision, { taskId: "task-" + provider, executionWorkspaceId: "execution", state: "completed",
        agentRunId: "previous-" + provider }, now);
      assignments.recordTaskAgent({ requestId: "tars-" + row.id, taskId: row.taskId, workspaceId: "execution", repositoryPath: directory,
        agent: BUILTIN_AGENTS.find(agent => agent.id === "supervisor"), providerId: provider, model: null, assignment: row.instruction });
      const old = createAgentRun({ id: row.agentRunId, input: { workspaceId: "execution", leadTaskId: row.taskId, origin: "agent",
        workflow: tarsWorkflow(row, now), assignment: row.instruction, consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } },
        repositoryPath: directory, fingerprint: { providerId: provider, model: "test-model" }, now: new Date(now) });
      old.agentRun.state = "completed";
      persistence.agentRuns.create(old, new Date(now));
      const scope = { requestId: "follow-up-" + provider, previousRunId: row.agentRunId, previousInstruction: row.instruction,
        previousCriteria: row.acceptanceCriteria, text: "Add and verify error handling", requestedAt: now };
      row = persistence.tars.patch(row.id, row.revision, { continuation: scope }, now);
      const refused = [];
      readFailure = true; try { await ports.continueWork(row, scope); } catch (error) { refused.push(error.name); } readFailure = false;
      missing = true; try { await ports.continueWork(row, scope); } catch { refused.push("missing"); } missing = false;
      archived = true; try { await ports.continueWork(row, scope); } catch { refused.push("archived"); } archived = false;
      inUse = true; const busy = await ports.continueWork(row, scope); inUse = false;
      beforeAdmission = () => assignments.releaseTaskAgent(row.taskId);
      try { await ports.continueWork(row, scope); } catch { refused.push("owner"); }
      beforeAdmission = null;
      results.push({ refused, busy });
    }
    // Use a separate task with authority intact for successful start and lost-ack reconciliation.
    // The assignment store is intentionally not repaired: build a fresh admitted responsibility.
    const created = persistence.tars.create({ requestId: "success", title: "Existing work", instruction: "Original delegation",
      acceptanceCriteria: ["Original criterion"], workspaceId: "source", repositoryPath: directory, providerId: "codex" }, now);
    provider = "codex";
    let owned = persistence.tars.patch(created.id, created.revision, { taskId: "success-task", executionWorkspaceId: "execution", state: "completed", agentRunId: "old-success" }, now);
    assignments.recordTaskAgent({ requestId: "tars-" + owned.id, taskId: owned.taskId, workspaceId: "execution", repositoryPath: directory,
      agent: BUILTIN_AGENTS.find(agent => agent.id === "supervisor"), providerId: provider, model: null, assignment: owned.instruction });
    const old = createAgentRun({ id: owned.agentRunId, input: { workspaceId: "execution", leadTaskId: owned.taskId, origin: "agent", workflow: tarsWorkflow(owned, now),
      assignment: owned.instruction, consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } }, repositoryPath: directory,
      fingerprint: { providerId: provider, model: "test-model" }, now: new Date(now) });
    old.agentRun.state = "completed"; persistence.agentRuns.create(old, new Date(now));
    const scope = { requestId: "next", previousRunId: owned.agentRunId, previousInstruction: owned.instruction, previousCriteria: owned.acceptanceCriteria,
      text: "Add and verify error handling", requestedAt: now };
    owned = persistence.tars.patch(owned.id, owned.revision, { continuation: scope }, now);
    writeFileSync(path.join(directory, "artifact.txt"), "existing artifact");
    registry[0].workspaces.shift(); // Removing the source does not remove the actual execution location.
    const beforeStart = await ports.reconcileContinuation(owned, scope);
    let withdrawn = false, raceRefused = false;
    beforeAdmission = () => { withdrawn = true; };
    try { await ports.continueWork(owned, scope, () => { if (withdrawn) throw new Error("Request withdrawn during preflight"); }); }
    catch { raceRefused = true; }
    beforeAdmission = null;
    const startsBeforeActual = starts;
    const id = await ports.continueWork(owned, scope);
    const replay = await ports.continueWork(owned, scope);
    const reconciled = await ports.reconcileContinuation(owned, scope);
    const next = persistence.agentRuns.getAgentRun(id);
    const savedAssignment = persistence.agentAssignments.getByTaskId(owned.taskId);
    const stagePrompt = compileAgentRunStagePrompt(persistence.agentRuns.getAggregate(id));
    const agentPrompt = compileTaskAgentRole({ agent: savedAssignment.agent, providerId: provider,
      standards: savedAssignment.standards, role: savedAssignment.role ?? "primary" });
    console.log(JSON.stringify({ results, id, replay, starts, next, beforeStart, raceRefused, startsBeforeActual, reconciled, stagePrompt, agentPrompt, savedAssignmentText: savedAssignment.assignment, original: persistence.agentRuns.getAgentRun("old-success"),
      artifact: readFileSync(path.join(directory, "artifact.txt"), "utf8") }));
    db.close(); rmSync(directory, { recursive: true, force: true });
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const output = JSON.parse(result.stdout.toString());
  expect(output.results).toEqual([{ refused: ["TarsRunRefusedError", "missing", "archived", "owner"], busy: "busy" }, { refused: ["TarsRunRefusedError", "missing", "archived", "owner"], busy: "busy" }]);
  expect(output.starts).toBe(1); expect(output.id).toBe(output.replay);
  expect(output.beforeStart).toBeNull(); expect(output.raceRefused).toBe(true); expect(output.startsBeforeActual).toBe(0);
  expect(output.reconciled).toBe(output.id);
  expect(output.next).toMatchObject({ workspaceId: "execution", leadTaskId: "success-task", assignment: "Add and verify error handling" });
  expect(output.next.workflow.stages.map((stage: { id: string }) => stage.id)).toEqual(["work", "review", "fix-review"]);
  expect(output.original).toMatchObject({ state: "completed", assignment: "Original delegation" });
  expect(output.artifact).toBe("existing artifact");
  expect(output.savedAssignmentText).toBe("Original delegation");
  expect(output.stagePrompt).toContain("Add and verify error handling");
  expect(output.stagePrompt).not.toContain("Original delegation");
  expect(JSON.stringify(output.agentPrompt)).not.toContain("Original delegation");
});
