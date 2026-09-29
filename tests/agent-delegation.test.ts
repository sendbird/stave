import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
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
    listRunReceipts: (args) => store.listReceipts(args),
    listRunAggregatesByOrigin: (args) => store.listAggregatesByOrigin(args),
    listActiveRunAggregatesByStepKind: (args) => store.listActiveAggregatesByStepKind(args),
  };
}

function harness(options: { head?: string | null; parentPermission?: AgentPermission | null; allowed?: string[] | null } = {}) {
  const store = new RunLedgerStore(new Database(":memory:"));
  const runs: Array<Record<string, unknown>> = [];
  const host: DelegatedTaskHostPort = {
    resolveWorkspace: async ({ workspaceId }) =>
      workspaceId === PARENT_WORKSPACE
        ? { workspaceId, workspacePath: `${REPOSITORY_PATH}/.stave/workspaces/parent`, repositoryPath: REPOSITORY_PATH }
        : null,
    createWorkspace: async ({ name }) => ({ workspaceId: `ws-${name}`, workspacePath: `${REPOSITORY_PATH}/${name}`, repositoryPath: REPOSITORY_PATH }),
    getTaskStatus: async () => IDLE,
    runTask: async (args) => {
      runs.push({ ...args });
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
        allowedAgentIds: options.allowed ?? null,
      });
      return result.ok ? { ok: true, args: result.args, agentContentHash: result.snapshot.contentHash } : { ok: false, message: result.message };
    },
  });
  return { coordinator, runs, store };
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
    expect(String(runs[0]!.prompt)).toStartWith("# Agent: Strict reviewer");
    expect(String(runs[0]!.prompt)).toContain("Review the last commit.");
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

  test("a delegation without an agent is unchanged", async () => {
    const { coordinator, runs } = harness();
    await coordinator.delegate(args());
    await Bun.sleep(5);
    expect(runs[0]).toMatchObject({ prompt: "Review the last commit.", permissionProfile: "auto" });
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
