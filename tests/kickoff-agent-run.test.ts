import { afterEach, expect, test } from "bun:test";
import { createAgentRun } from "../src/lib/agent-runs/domain";
import type { AgentRunStartArgs } from "../src/lib/agent-runs/api";
import type { AgentAssignment, RecordTaskAgentInput } from "../src/lib/agents/assign";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { buildKickoffFirstTaskPrompt } from "../src/lib/kickoff-brief";
import { buildDeterministicKickoffProposal, classifyKickoffSource, DEFAULT_KICKOFF_SOURCE_CONFIGS } from "../src/lib/workspace-kickoff";
import { useAppStore } from "../src/store/app.store";
import { useAgentAssignmentsStore } from "../src/store/agent-assignments-store";
import { useAgentRunsStore } from "../src/store/agent-runs-store";
import { registerAgentRunBridge } from "../src/store/agent-run-send";
import { recordKickoffTaskAgent } from "../src/store/kickoff-agent-assignment";
import { usePendingAutoRoutingStore } from "../src/store/pending-auto-routing-store";
import { createEmptyWorkspaceState, flushPendingSnapshotPersists } from "../src/store/workspace-session-state";
import { runWorkspaceKickoff } from "../src/store/workspace-kickoff-actions";
import type { WorkspaceSnapshot } from "../src/lib/db/workspaces.db";

const originalWindow = globalThis.window;
const originalState = useAppStore.getState();
const originalRuns = useAgentRunsStore.getState();
const originalAssignments = useAgentAssignmentsStore.getState();
const lead = getBuiltinAgent("lead")!;
const proposal = () => buildDeterministicKickoffProposal({
  classification: classifyKickoffSource({ input: "Fix CSV export. Keep the public API.", configs: DEFAULT_KICKOFF_SOURCE_CONFIGS }),
});

function seedWorkspace(workspaceId: string) {
  useAppStore.setState({
    ...createEmptyWorkspaceState(),
    activeWorkspaceId: workspaceId,
    workspaces: [{ id: workspaceId, name: "Kickoff", updatedAt: new Date().toISOString() }],
    workspacePathById: { [workspaceId]: "/tmp/kickoff/worktree" },
    workspaceBranchById: { [workspaceId]: "fix/export" },
    taskWorkspaceIdById: {},
    workspaceRuntimeCacheById: {},
  });
}

function install(options: { refuseRun?: boolean; refuseRecord?: boolean; failSave?: boolean } = {}) {
  const order: string[] = [];
  const starts: AgentRunStartArgs[] = [];
  let plainTurns = 0;
  let listReads = 0;
  let createdWorkspaces = 0;
  let saved: WorkspaceSnapshot | undefined;
  const api = {
    agents: {
      recordTask: async (input: RecordTaskAgentInput) => {
        order.push("record");
        if (options.refuseRecord) return { ok: false, code: "refused", message: "Record refused" };
        const row: AgentAssignment = {
          ...input, id: "assignment-1", requestHash: "request-hash", agentContentHash: "agent-hash",
          agentConfigId: input.agent.id, agentName: input.agent.name,
          model: input.model ?? null, workspaceMode: "same-workspace", branch: null, turnId: null,
          state: "started", detail: null, received: [], support: [],
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        return { ok: true, value: row };
      },
      listAssignments: async () => { listReads++; throw new Error("List unavailable"); },
    },
    persistence: {
      listWorkspaces: async () => ({ ok: true, rows: [] }),
      loadWorkspace: async () => ({ ok: true, snapshot: null }),
      loadWorkspaceShellLite: async () => ({ ok: true, shellLite: null }),
      upsertWorkspace: async ({ snapshot }: { snapshot: WorkspaceSnapshot }) => {
        order.push("save");
        if (options.failSave) return { ok: false };
        saved = snapshot;
        return { ok: true };
      },
    },
    agentRuns: {
      start: async (input: AgentRunStartArgs) => {
        order.push("start-run");
        starts.push(input);
        expect(saved?.tasks.some((task) => task.id === input.leadTaskId)).toBe(true);
        expect(useAgentAssignmentsStore.getState().byTaskId[input.leadTaskId]?.agentConfigId).toBe("lead");
        if (options.refuseRun) return { ok: false, agentRun: null, code: "refused", message: "Lead task unavailable" };
        const change = createAgentRun({ id: "kickoff-run", input, repositoryPath: "/tmp/kickoff",
          fingerprint: { providerId: "codex", model: "gpt-6.1-sol" }, now: new Date() });
        return { ok: true, agentRun: { agentRun: change.agentRun, stages: change.upserts, events: [], report: null } };
      },
    },
    provider: { startPushTurn: async () => { plainTurns++; throw new Error("Unexpected plain turn"); } },
  };
  const storage = new Map<string, string>();
  globalThis.window = { api, localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } } as unknown as Window & typeof globalThis;
  useAppStore.setState({ ...useAppStore.getInitialState(), hasHydratedWorkspaces: true,
    repositoryPath: "/tmp/kickoff", draftProvider: "codex" });
  seedWorkspace("current");
  // Worktree creation is an IPC boundary; task creation, recording, sending,
  // snapshot validation and run dispatch below use their real implementations.
  useAppStore.setState({ createWorkspace: async ({ initialTaskTitle, initialTaskProvider, initialPromptDraft }) => {
    createdWorkspaces++;
    seedWorkspace("new-workspace");
    useAppStore.getState().createTask({ title: initialTaskTitle });
    const taskId = useAppStore.getState().activeTaskId;
    if (initialTaskProvider) useAppStore.getState().setTaskProvider({ taskId, provider: initialTaskProvider });
    if (initialPromptDraft) useAppStore.getState().updatePromptDraft({ taskId, patch: initialPromptDraft });
    return { ok: true, taskId, workspaceId: "new-workspace" };
  } });
  useAgentAssignmentsStore.setState({ byTaskId: {} });
  useAgentRunsStore.setState({ ...originalRuns, details: {}, agentRunIdByTask: {}, agentRunIdsByTask: {} });
  registerAgentRunBridge({
    activeAgentRun: () => null,
    start: (input) => useAgentRunsStore.getState().startAgentRun(input),
    cancel: async () => ({ ok: true, agentRun: null }),
    watchFirstPrompt: () => {},
  });
  return { order, starts, plainTurns: () => plainTurns, listReads: () => listReads, createdWorkspaces: () => createdWorkspaces };
}

function kickoff(current: boolean, startFirstTask = true, providerId: "claude-code" | "codex" = "codex") {
  return runWorkspaceKickoff({
    input: {
      proposal: proposal(), startFirstTask, firstTaskProvider: providerId,
      ...(current ? { target: { kind: "current-workspace" as const, workspaceId: "current" } } : {}),
      beforeFirstTurn: ({ workspaceId, taskId, prompt }) => recordKickoffTaskAgent({
        requestId: "kickoff:test", workspaceId, taskId, repositoryPath: "/tmp/kickoff",
        agent: lead, assignment: prompt, providerId, model: providerId === "codex" ? "gpt-6.1-sol" : "sonnet",
      }),
    },
    getState: useAppStore.getState,
  });
}

afterEach(async () => {
  // Flush retained failed snapshots against an acknowledged write before reset.
  if (globalThis.window?.api?.persistence) {
    globalThis.window.api.persistence.upsertWorkspace = async () => ({ ok: true });
    await flushPendingSnapshotPersists();
  }
  registerAgentRunBridge(null);
  usePendingAutoRoutingStore.setState({ byTaskId: {} });
  useAgentAssignmentsStore.setState(originalAssignments);
  useAgentRunsStore.setState(originalRuns);
  useAppStore.setState(originalState);
  globalThis.window = originalWindow;
});

for (const providerId of ["claude-code", "codex"] as const) {
test.each([false, true])(`kickoff starts a ${providerId} AgentRun after task creation and recording (current=%s)`, async (current) => {
  const port = install();
  const result = await kickoff(current, true, providerId);
  expect(result).toMatchObject({ ok: true, startup: "started", workspaceId: current ? "current" : "new-workspace" });
  expect(port.order).toEqual(["record", "save", "start-run"]);
  expect(port.starts).toHaveLength(1);
  expect(port.starts[0]).toMatchObject({ leadTaskId: result.taskId, origin: "agent", assignment: buildKickoffFirstTaskPrompt(proposal()) });
  expect(port.plainTurns()).toBe(0);
  expect(port.listReads()).toBe(0);
  expect(port.createdWorkspaces()).toBe(current ? 0 : 1);
  expect(useAppStore.getState().tasks.find((task) => task.id === result.taskId)?.provider).toBe(providerId);
});
}

test("a refused kickoff run preserves its prompt and never dispatches a plain turn", async () => {
  const port = install({ refuseRun: true });
  const result = await kickoff(true);
  expect(result.startup).toBe("blocked");
  expect(port.starts).toHaveLength(1);
  expect(port.plainTurns()).toBe(0);
  expect(useAppStore.getState().promptDraftByTask[result.taskId!]?.text).toBe(buildKickoffFirstTaskPrompt(proposal()));
});

test.each([{ refuseRecord: true }, { failSave: true }])("failed kickoff prerequisites block dispatch (%j)", async (options) => {
  const port = install(options);
  const result = await kickoff(true);
  expect(result.startup).toBe("blocked");
  expect(port.starts).toHaveLength(0);
  expect(port.plainTurns()).toBe(0);
  expect(useAppStore.getState().promptDraftByTask[result.taskId!]?.text).toBe(buildKickoffFirstTaskPrompt(proposal()));
});

test("a staged agent kickoff records the agent and preserves the prompt without starting a run", async () => {
  const port = install();
  const result = await kickoff(true, false);
  expect(result.startup).toBe("staged");
  expect(port.order).toEqual(["record"]);
  expect(useAgentAssignmentsStore.getState().byTaskId[result.taskId!]?.agentConfigId).toBe("lead");
  expect(useAppStore.getState().promptDraftByTask[result.taskId!]?.text).toBe(buildKickoffFirstTaskPrompt(proposal()));
});
