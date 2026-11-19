import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Database } from "bun:sqlite";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime, type TarsExecutionObservation, type TarsRuntimePorts } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import type { TarsControlOperation } from "../src/lib/tars/conversation";
import type { TarsResponsibility, TarsState } from "../src/lib/tars/types";

// The user and Tars both steer one delegated task: a run the user starts there
// does not end Tars's responsibility; Tars follows it on its next pass.
const NOW = "2026-11-05T00:00:00.000Z";
const input = { completionGoal: "design" as const, requestId: "one", title: "Investigate search", instruction: "Investigate why search misses results.",
  acceptanceCriteria: ["The cause is identified."], workspaceId: "source", repositoryPath: "/tmp/tars-repository",
  providerId: "codex" as const, model: null, priority: 50, maxTurns: 30 };

function fixture(state: TarsState, overrides: Partial<TarsRuntimePorts> = {}) {
  const database = new Database(":memory:");
  const store = new TarsStore(database);
  // The task's newest run: Tars's own until the user continues in the task.
  let latest = "tars-run";
  const observed: Record<string, TarsExecutionObservation> = { "tars-run": { state: "completed", detail: null }, "user-run": { state: "running", detail: null } };
  const controlled: string[] = [];
  const ports: TarsRuntimePorts = {
    store, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null, startRun: async () => "unexpected",
    followTaskRun: (row) => latest !== row.agentRunId && !row.previousRunIds?.includes(latest) ? latest : null,
    observe: async (row) => {
      // The host refuses any run but the one the responsibility names.
      if (row.agentRunId !== latest) throw new Error("observe must follow the task's newest run first");
      return observed[row.agentRunId]!;
    },
    controlRun: async (row, operation) => { controlled.push(`${operation}:${row.agentRunId}`); },
    ...overrides,
  };
  const runtime = createTarsRuntime(ports);
  const created = store.create(input, NOW);
  const row = store.patch(created.id, created.revision, { taskId: "task", executionWorkspaceId: "execution", agentRunId: "tars-run", state }, NOW);
  const conversations = new TarsConversationStore(database);
  let clicks = 0;
  const act = async (current: TarsResponsibility, operation: TarsControlOperation) =>
    (await actTars({ requestId: `click-${clicks++}`, responsibilityId: current.id, expectedRevision: current.revision, operation, source: "click" },
      { conversations, runtime, now: () => NOW })).record;
  return {
    database, store, row, observed, controlled, act,
    userContinues: () => { latest = "user-run"; },
    tick: async () => { runtime.requestTick(); await runtime.drain(); await Promise.resolve(); },
    current: () => store.get(row.id)!,
  };
}

describe("Tars and the user share a delegated task", () => {
  for (const state of ["completed", "resultReady", "running", "waiting", "blocked"] as const) {
    test(`a run the user starts in the task is followed, not taken over (${state})`, async () => {
      const f = fixture(state);
      f.userContinues();
      await f.tick();
      expect(f.current()).toMatchObject({ state: "running", agentRunId: "user-run", previousRunIds: ["tars-run"] });
      // The record follows what actually happened in the task, through to its end.
      f.observed["user-run"] = { state: "completed", detail: null };
      await f.tick();
      expect(f.current()).toMatchObject({ state: "completed", agentRunId: "user-run" });
      f.database.close();
    });
  }
  for (const state of ["takenOver", "cancelled", "paused"] as const) {
    test(`work the user took over, cancelled or paused through Tars is not followed (${state})`, async () => {
      const f = fixture(state);
      f.userContinues();
      await f.tick();
      expect(f.current()).toMatchObject({ state, agentRunId: "tars-run" });
      f.database.close();
    });
  }
  test("a control given before Tars's next pass acts on the run the user started, never takes the work over", async () => {
    // The run Tars started ended unverified; the user continued in the task before Tars's next pass.
    const f = fixture("blocked");
    f.userContinues();
    expect((await f.act(f.current(), "pause")).status).toBe("applied");
    expect(f.controlled).toEqual(["pause:user-run"]);
    expect(f.current()).toMatchObject({ state: "paused", agentRunId: "user-run", previousRunIds: ["tars-run"] });
    f.database.close();
  });
  test("an unfinished publication of Tars's result is not replaced by a newer run", async () => {
    const f = fixture("resultReady");
    const row = f.store.patch(f.row.id, f.current().revision, { publication: { state: "committed", failedStep: null, commit: "abcdef1",
      branch: "tars/search", base: "main", commitMessage: "fix: search", title: "Fix search", url: null, number: null, error: null, reason: null, updatedAt: NOW, agentRunId: "tars-run" } }, NOW);
    f.userContinues();
    await f.tick();
    expect(f.store.get(row.id)).toMatchObject({ state: "resultReady", agentRunId: "tars-run" });
    f.database.close();
  });
});

/**
 * The actual host and runtime over real Tars, run and assignment stores, with
 * the task services faked: the user continues a completed delegation in its
 * task, and another workspace has a run under the same task id.
 */
test("the host follows the user's run in the delegated task, judges it by its own report and never a run in another workspace", () => {
  const source = `
    import { mock } from "bun:test";
    import { Database } from "bun:sqlite";
    import { TarsStore } from "./electron/persistence/tars-store";
    import { TarsConversationStore } from "./electron/persistence/tars-conversation-store";
    import { AgentRunStore } from "./electron/persistence/agent-run-store";
    import { AgentAssignmentStore } from "./electron/persistence/agent-assignment-store";
    import { createAssignRuntime } from "./electron/host-service/supervision/assign-runtime";
    import { createAgentRun } from "./src/lib/agent-runs/domain";
    import { BUILTIN_AGENTS } from "./src/lib/agents/starters";
    import { tarsWorkflow } from "./electron/host-service/tars-execution";
    const db = new Database(":memory:");
    const persistence = { tars: new TarsStore(db), tarsConversations: new TarsConversationStore(db),
      agentAssignments: new AgentAssignmentStore(db), agentRuns: new AgentRunStore(db) };
    const assignments = createAssignRuntime({ store: persistence.agentAssignments });
    const repositoryPath = "/tmp/tars-shared-repository";
    const now = "2026-11-11T00:00:00.000Z", later = "2026-11-11T01:00:00.000Z";
    mock.module("./electron/host-service/persistence", () => ({ ensureHostServicePersistenceReady: () => persistence }));
    mock.module("./electron/host-service/supervision/assign-host", () => ({ hostAgents: () => BUILTIN_AGENTS }));
    mock.module("./electron/providers/runtime", () => ({ providerRuntime: {} }));
    mock.module("./electron/host-service/local-mcp-runtime", () => ({
      listKnownRepositories: async () => [],
      getTaskSupervisionSnapshot: async () => ({ exists: true, archived: false, repositoryPath, providerId: "codex", activeTurnId: null,
        pendingApprovalCount: 0, pendingUserInputCount: 0 }),
    }));
    const reports = {};
    const { createHostTarsRuntime } = await import("./electron/host-service/tars-host");
    const runtime = createHostTarsRuntime({ assignments, agentRuns: { get: async ({ agentRunId }) => ({ events: [],
      ...persistence.agentRuns.getAggregate(agentRunId), report: reports[agentRunId] ?? null }) } });
    const consent = { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] };
    const run = (id, row, overrides, at) => {
      const change = createAgentRun({ id, input: { workspaceId: row.executionWorkspaceId, leadTaskId: row.taskId, origin: "agent",
        workflow: tarsWorkflow(row, at), assignment: row.instruction, consent, ...overrides },
        repositoryPath, fingerprint: { providerId: "codex", model: "test-model" }, now: new Date(at) });
      persistence.agentRuns.create(change, new Date(at));
      return change.agentRun;
    };
    const delegate = (requestId, taskId) => {
      const created = persistence.tars.create({ requestId, title: "Investigate search", instruction: "Investigate why search misses results.",
        acceptanceCriteria: ["The cause is identified."], completionGoal: "design", workspaceId: "source", repositoryPath, providerId: "codex" }, now);
      const row = persistence.tars.patch(created.id, created.revision, { taskId, executionWorkspaceId: "execution", state: "completed",
        agentRunId: "tars-run-" + requestId }, now);
      assignments.recordTaskAgent({ requestId: "tars-" + row.id, taskId, workspaceId: "execution", repositoryPath,
        agent: BUILTIN_AGENTS.find(agent => agent.id === "supervisor"), providerId: "codex", model: null, assignment: row.instruction });
      const own = run(row.agentRunId, row, {}, now);
      persistence.agentRuns.apply({ agentRun: { ...own, state: "completed" }, upserts: [], events: [] }, new Date(now));
      return row;
    };
    const shared = delegate("shared", "shared-task");
    const elsewhere = delegate("elsewhere", "elsewhere-task");
    // The user continues in the delegated task with their own words and permission.
    const userRun = run("user-run", shared, { workflow: { ...tarsWorkflow(shared, later), id: "user-workflow" },
      assignment: "Implement it and open the PR.", consent: { ...consent, permissionMode: "manual" } }, later);
    // Another worktree's task with the same id is never this work.
    run("other-workspace-run", { ...elsewhere, executionWorkspaceId: "other-workspace" }, { workflow: { ...tarsWorkflow(elsewhere, later), id: "user-workflow" } }, later);
    const tick = async () => { runtime.requestTick(); await runtime.drain(); await Promise.resolve(); };
    const steps = {};
    await tick();
    steps.following = persistence.tars.get(shared.id);
    steps.elsewhere = persistence.tars.get(elsewhere.id);
    // The user's run completes with its own criteria and the pull request it opened.
    persistence.agentRuns.apply({ agentRun: { ...persistence.agentRuns.getAgentRun("user-run"), state: "completed" }, upserts: [], events: [] }, new Date(later));
    reports["user-run"] = { outcome: "completed", endedAt: later, acceptanceCriteria: [{ text: "The PR is open.", status: "met" }],
      links: [{ label: "PR #1002", url: "https://github.com/example/repo/pull/1002" }], leftBehind: [], evidence: [] };
    await tick();
    steps.ended = persistence.tars.get(shared.id);
    steps.userConsent = persistence.agentRuns.getAgentRun("user-run").consent.permissionMode;
    runtime.stop(); db.close();
    console.log(JSON.stringify(steps));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const steps = JSON.parse(result.stdout.toString());
  expect(steps.following).toMatchObject({ state: "running", agentRunId: "user-run", previousRunIds: ["tars-run-shared"] });
  // Denied: a run under the same task id in another workspace is not followed, and the work is not taken over either.
  expect(steps.elsewhere).toMatchObject({ state: "completed", agentRunId: "tars-run-elsewhere" });
  // Judged by the run's own report (not "incompleteReport" against the first assignment's criteria); Stave saw no check, so the user decides.
  expect(steps.ended).toMatchObject({ state: "blocked", detailCode: "unverifiedCompletion", agentRunId: "user-run" });
  expect(steps.userConsent).toBe("manual");
});
