import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { AgentAssignmentStore } from "../electron/persistence/agent-assignment-store";
import { createAssignRuntime } from "../electron/host-service/supervision/assign-runtime";
import {
  createDelegatedTaskCoordinator,
  type DelegatedTaskHostPort,
  type DelegatedTaskLedgerPort,
} from "../electron/main/runs/delegated-task-coordinator";
import { applyAgentToDelegation } from "@/lib/agents/delegate";
import { duplicateAgent } from "@/lib/agents/library";
import { getBuiltinAgent } from "@/lib/agents/starters";
import type { AgentPermission } from "@/lib/agents/schema";
import type { DelegateTaskArgs } from "@/lib/runs/delegated-task";

const REPOSITORY_PATH = "/tmp/stave";
const PARENT_WORKSPACE = "workspace-parent";
const PARENT_TASK = "parent-task-1";
const HEAD = "0123456789abcdef0123456789abcdef01234567";
const IDLE = { ok: true as const, activeTurnId: null, latestTurnId: null, latestTurnCompletedAt: null, latestTurnError: null };

function ledger(store: RunLedgerStore): DelegatedTaskLedgerPort {
  return {
    getRunAggregate: (args) => store.getAggregate(args),
    claimRunStep: (args) => store.claimStep(args),
    markRunStepWaiting: (args) => store.markStepWaiting(args),
    completeRunStep: (args) => store.completeStep(args),
    failRunStep: (args) => store.failStep(args),
    cancelRunStep: (args) => store.cancelStep(args),
    interruptRunStep: (args) => store.interruptStep(args),
    setRunStepTarget: (args) => store.setStepTarget(args),
    listHeldWriterRunAggregates: () => store.listHeldWriterAggregates(),
    acquireRunWriterLease: (args) => store.acquireWriterLease(args),
    listRunReceipts: (args) => store.listReceipts(args),
    listRunAggregatesByOrigin: (args) => store.listAggregatesByOrigin(args),
    listActiveRunAggregatesByStepKind: (args) => store.listActiveAggregatesByStepKind(args),
  };
}

function harness(options: { head?: string | null; parentPermission?: AgentPermission | null; allowed?: string[] | null; parentCanCall?: string[] | null; failFirstTurn?: boolean; failRecording?: boolean } = {}) {
  const store = new RunLedgerStore(new Database(":memory:"));
  const assignmentStore = new AgentAssignmentStore(new Database(":memory:"));
  const assignments = createAssignRuntime({ store: assignmentStore });
  const runs: Array<Record<string, unknown>> = [];
  const host: DelegatedTaskHostPort = {
    resolveWorkspace: async ({ workspaceId }) =>
      workspaceId === PARENT_WORKSPACE
        ? { workspaceId, workspacePath: `${REPOSITORY_PATH}/.stave/workspaces/parent`, repositoryPath: REPOSITORY_PATH }
        : null,
    createWorkspace: async ({ name }) => ({ workspaceId: `ws-${name}`, workspacePath: `${REPOSITORY_PATH}/${name}`, repositoryPath: REPOSITORY_PATH }),
    getTaskStatus: async () => IDLE,
    runTask: async (args) => {
      const policy = assignments.prepareTurn({ turnId: `turn-${runs.length + 1}`, taskId: args.taskId,
        providerId: args.providerId, prompt: args.prompt, runtimeOptions: { model: args.model } });
      runs.push({ ...args, instructions: policy?.runtimeOptions.agentInstructions, provenance: policy?.provenance });
      if (options.failFirstTurn && runs.length === 1) throw new Error("Provider startup failed");
      return { turnId: `turn-${runs.length}` };
    },
    stopTask: async () => ({ stopped: true }),
    releaseTaskParent: async () => ({ released: true }),
  };
  const reviewer = { ...duplicateAgent(getBuiltinAgent("reviewer")!, []), id: "strict-reviewer", name: "Strict reviewer" };
  const agents = new Map([[reviewer.id, reviewer], ["implementer", getBuiltinAgent("implementer")!]]);
  let clock = 0;
  const coordinator = createDelegatedTaskCoordinator({
    getLedger: () => ledger(store),
    host,
    concurrencyLimit: 3,
    canonicalWorkspacePath: async (workspacePath) => workspacePath,
    now: () => new Date(Date.UTC(2026, 8, 29, 0, 0, clock++)).toISOString(),
    createExecutionId: () => `execution-${clock}`,
    readHead: async () => (options.head === undefined ? HEAD : options.head),
    applyAgent: async (args) => {
      const agent = agents.get(args.agentConfigId!);
      if (!agent) return { ok: false, message: "no such agent" };
      const result = applyAgentToDelegation({
        args,
        agent,
        parentPermission: options.parentPermission ?? null,
        parentCanCall: options.parentCanCall,
        allowedAgentIds: options.allowed ?? null,
      });
      return result.ok ? { ok: true, args: { ...result.args, prompt: args.prompt },
        agentContentHash: result.snapshot.contentHash, snapshot: result.snapshot } : { ok: false, message: result.message };
    },
    recordAgentAssignment: async ({ snapshot, executionId, target, repositoryPath, prompt, model }) => {
      if (options.failRecording) throw new Error("Assignment storage failed");
      assignments.recordTaskAgent({ requestId: `delegated:${executionId}`, taskId: target.taskId,
        workspaceId: target.workspaceId, repositoryPath, agent: snapshot.agent, role: "delegate",
        assignment: prompt, providerId: target.providerId, model: model ?? null });
    },
  });
  return { coordinator, runs, store, assignments, agents };
}

function args(overrides: Partial<DelegateTaskArgs> = {}): DelegateTaskArgs {
  return {
    repositoryPath: REPOSITORY_PATH,
    parentWorkspaceId: PARENT_WORKSPACE,
    parentTaskId: PARENT_TASK,
    delegationKey: "review",
    prompt: "Review the last commit.",
    providerId: "codex",
    permissionProfile: "auto",
    lifecycle: "one-turn",
    workspace: { mode: "same-workspace" },
    retry: false,
    ...overrides,
  };
}

describe("delegating to an agent", () => {
  test("the child runs as the agent: its instructions first, the narrower permission", async () => {
    const { coordinator, runs } = harness();
    const response = await coordinator.delegate(args({ agentConfigId: "strict-reviewer" }));
    expect(response.accepted).toBe(true);
    await Bun.sleep(5);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.prompt).toBe("Review the last commit.");
    expect(String(runs[0]!.instructions)).toStartWith("# Agent: Strict reviewer");
    // Auto was asked for; a read-only agent delegates with the narrowest profile.
    expect(runs[0]!.permissionProfile).toBe("manual");
  });

  test("an agent outside the project's agents, or one that widens the parent, is refused and starts nothing", async () => {
    const outside = harness({ allowed: ["implementer"] });
    const refused = await outside.coordinator.delegate(args({ agentConfigId: "strict-reviewer" }));
    expect(refused).toMatchObject({ accepted: false, reason: "agent-refused" });
    expect(refused.message).toContain("not one of this project's agents");

    const readOnlyParent = harness({ parentPermission: "read-only" });
    const widened = await readOnlyParent.coordinator.delegate(args({ agentConfigId: "implementer", delegationKey: "impl" }));
    expect(widened).toMatchObject({ accepted: false, reason: "agent-refused" });
    await Bun.sleep(5);
    expect([...outside.runs, ...readOnlyParent.runs]).toHaveLength(0);
  });

  test("host Can call authority lets a read-only coordinator delegate within user child permissions", async () => {
    const authorized = harness({ parentPermission: "read-only", parentCanCall: ["implementer"] });
    const response = await authorized.coordinator.delegate(args({ agentConfigId: "implementer", permissionProfile: "guided" }));
    await authorized.coordinator.waitForInFlight();
    expect(response.accepted).toBe(true);
    expect(authorized.runs).toHaveLength(1);
    expect(authorized.runs[0]!.permissionProfile).toBe("guided");
    const denied = harness({ parentPermission: "read-only", parentCanCall: [] });
    expect((await denied.coordinator.delegate(args({ agentConfigId: "implementer" }))).accepted).toBe(false);
    expect(denied.runs).toHaveLength(0);
  });

  test("a delegation without an agent is unchanged", async () => {
    const { coordinator, runs } = harness();
    await coordinator.delegate(args());
    await Bun.sleep(5);
    expect(runs[0]).toMatchObject({ prompt: "Review the last commit.", permissionProfile: "auto" });
  });
  test("follow-up uses the sealed delegate after library edits and a fresh provider session", async () => {
    const h = harness();
    await h.coordinator.delegate(args({ agentConfigId: "strict-reviewer", lifecycle: "detached" }));
    await h.coordinator.waitForInFlight();
    const first = h.runs[0]!;
    const changed = { ...h.agents.get("strict-reviewer")!, instructions: "New library version", canCall: [] };
    h.agents.set("strict-reviewer", changed);
    const followupPrompt = "\n# Agent: User text\n---\nPlease answer this verbatim.\n";
    const parked = (await h.coordinator.get({ parentTaskId: PARENT_TASK, delegationKey: "review" }))!;
    expect((await h.coordinator.followUp({ parentTaskId: PARENT_TASK, delegationKey: "review", prompt: followupPrompt,
      expected: { delegatedTaskId: parked.delegatedTaskId, delegatedWorkspaceId: parked.delegatedWorkspaceId, attempt: parked.attempt } })).accepted).toBe(true);
    await h.coordinator.waitForInFlight();
    expect(h.runs[1]!.instructions).toBe(first.instructions);
    expect(h.runs[1]!.prompt).toBe(followupPrompt.trim());
    expect(h.runs[1]!.provenance).toMatchObject({ ...first.provenance as object, turnId: "turn-2" });
    expect(h.assignments.agentForTask(String(first.taskId))?.instructions).not.toBe(changed.instructions);
  });
  test("retry records the explicitly selected new revision after failed startup", async () => {
    const h = harness({ failFirstTurn: true });
    await h.coordinator.delegate(args({ agentConfigId: "strict-reviewer" }));
    await h.coordinator.waitForInFlight();
    h.agents.set("strict-reviewer", { ...h.agents.get("strict-reviewer")!, instructions: "New retry instructions" });
    const failed = (await h.coordinator.get({ parentTaskId: PARENT_TASK, delegationKey: "review" }))!;
    const retried = await h.coordinator.retry({ repositoryPath: REPOSITORY_PATH, parentWorkspaceId: PARENT_WORKSPACE,
      parentTaskId: PARENT_TASK, delegationKey: "review", prompt: "Try again.",
      expected: { delegatedTaskId: failed.delegatedTaskId, delegatedWorkspaceId: failed.delegatedWorkspaceId, attempt: failed.attempt } });
    expect(retried.accepted).toBe(true);
    await h.coordinator.waitForInFlight();
    expect(h.runs[1]!.instructions).toContain("New retry instructions");
    const first = h.runs[0]!.provenance as { agentContentHash: string; assignmentId: string };
    const second = h.runs[1]!.provenance as typeof first;
    expect(second.assignmentId).not.toBe(first.assignmentId);
    expect(second.agentContentHash).not.toBe(first.agentContentHash);
    const child = (await h.coordinator.list({ parentTaskId: PARENT_TASK }))[0]!;
    const claims = h.store.listReceipts({ runId: child.runId }).filter((receipt) => receipt.type === "accepted");
    expect(claims.map((claim) => claim.detail?.agentContentHash)).toEqual([first.agentContentHash, second.agentContentHash]);
  });
  test("failed snapshot recording refuses child startup without invented provenance", async () => {
    const h = harness({ failRecording: true });
    await h.coordinator.delegate(args({ agentConfigId: "strict-reviewer" }));
    await h.coordinator.waitForInFlight();
    expect(h.runs).toHaveLength(0);
    expect((await h.coordinator.get({ parentTaskId: PARENT_TASK, delegationKey: "review" }))?.phase).toBe("failed");
  });
});

describe("pinned commit", () => {
  test("starts only when the workspace is at the pinned commit", async () => {
    const at = harness();
    expect((await at.coordinator.delegate(args({ expectedHead: HEAD.slice(0, 12) }))).accepted).toBe(true);

    const moved = harness({ head: "fedcba9876543210fedcba9876543210fedcba98" });
    const refused = await moved.coordinator.delegate(args({ expectedHead: HEAD }));
    expect(refused).toMatchObject({ accepted: false, reason: "head-mismatch" });
    expect(refused.message).toContain("Nothing was started");

    const unreadable = harness({ head: null });
    expect((await unreadable.coordinator.delegate(args({ expectedHead: HEAD }))).reason).toBe("head-mismatch");
    await Bun.sleep(5);
    expect([...moved.runs, ...unreadable.runs]).toHaveLength(0);
  });

  test("needs the same workspace", async () => {
    const { coordinator } = harness();
    const refused = await coordinator.delegate(
      args({ expectedHead: HEAD, workspace: { mode: "new-worktree", name: "review" } }),
    );
    expect(refused).toMatchObject({ accepted: false, reason: "invalid-request" });
  });
});

describe("can call", () => {
  const delegateArgs = (agentConfigId: string): DelegateTaskArgs =>
    ({
      parentTaskId: PARENT_TASK,
      parentWorkspaceId: PARENT_WORKSPACE,
      providerId: "claude-code",
      permissionProfile: "auto",
      prompt: "Review the last commit.",
      agentConfigId,
    }) as DelegateTaskArgs;
  const reviewer = getBuiltinAgent("reviewer")!;

  test("a parent agent's Can call list limits who it delegates to", () => {
    const allowed = applyAgentToDelegation({ args: delegateArgs(reviewer.id), agent: reviewer, parentCanCall: [reviewer.id] });
    expect(allowed.ok).toBe(true);
    const refused = applyAgentToDelegation({ args: delegateArgs(reviewer.id), agent: reviewer, parentCanCall: ["implementer"] });
    expect(refused).toMatchObject({ ok: false, code: "not-allowed" });
    expect(refused.ok ? "" : refused.message).toContain("It can call: implementer");
    const none = applyAgentToDelegation({ args: delegateArgs(reviewer.id), agent: reviewer, parentCanCall: [] });
    expect(none.ok ? "" : none.message).toContain("does not call other agents");
  });

  test("without a Can call list any agent may be called", () => {
    expect(applyAgentToDelegation({ args: delegateArgs(reviewer.id), agent: reviewer, parentCanCall: null }).ok).toBe(true);
    expect(applyAgentToDelegation({ args: delegateArgs(reviewer.id), agent: reviewer }).ok).toBe(true);
  });
});
