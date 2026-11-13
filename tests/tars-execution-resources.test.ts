import { expect, test } from "bun:test";
import path from "node:path";
import { buildTarsExecutionResources, tarsExecutionTarget } from "../src/lib/tars/execution-resources";
import { CreateTarsResponsibilityInputSchema, TarsResponsibilityPatchSchema } from "../src/lib/tars/types";
import { freezeAdaptivePolicy } from "../electron/host-service/supervision/adaptive-policy";
import { constrainHelperResources, helperKeepsParentProvider } from "../src/lib/agent-runs/resources";
import { tarsExecutionInstructions, tarsReviewGuidance, tarsWorkflow } from "../electron/host-service/tars-execution";
import { getBuiltinAgent } from "../src/lib/agents/starters";

const ACCOUNT = "123e4567-e89b-42d3-a456-426614174000";

test("execution defaults to automatic routing; only an explicit pin locks the model, and the conversation effort never leaks in", () => {
  expect(buildTarsExecutionResources({ providerId: "codex", model: null })).toEqual({ routingIntent: { autoRouting: true } });
  expect(buildTarsExecutionResources({ providerId: "claude-code", model: null, runtimeHints: {} }))
    .toEqual({ accounts: { claudeAccountProfileId: "system-default" }, routingIntent: { autoRouting: true } });
  expect(buildTarsExecutionResources({ providerId: "codex", model: null, runtimeHints: { codexAccountProfileId: ACCOUNT, codexReasoningEffort: "high" } }))
    .toEqual({ accounts: { codexAccountProfileId: ACCOUNT }, routingIntent: { autoRouting: true } });
  expect(buildTarsExecutionResources({ providerId: "codex", model: "gpt-6.1-sol", runtimeHints: {
    codexAccountProfileId: ACCOUNT, codexReasoningEffort: "high", codexBinaryPath: "/tmp/provider",
    codexFastMode: true, claudeAccountProfileId: "system-default", claudeEffort: "low",
  } })).toEqual({ accounts: { codexAccountProfileId: ACCOUNT }, routingIntent: {
    model: "gpt-6.1-sol", modelProviderId: "codex", autoRouting: false,
  } });
  // The conversation model is never the execution target; a pin may name the other provider.
  expect(tarsExecutionTarget({ providerId: "codex" })).toEqual({ providerId: "codex", model: null });
  expect(tarsExecutionTarget({ providerId: "codex", executionModel: { providerId: "claude-code", model: "claude-opus-5-5" } }))
    .toEqual({ providerId: "claude-code", model: "claude-opus-5-5" });
});

test("automatic routing leaves the team free to review on the other provider; a pin keeps it on one", () => {
  const freeze = (row: { providerId: "codex" | "claude-code"; model: string | null }, model: string) => {
    const resources = buildTarsExecutionResources(row);
    return freezeAdaptivePolicy({ providerId: row.providerId, model, agent: getBuiltinAgent("supervisor")!, settings: null, maxTurns: 20,
      accounts: resources.accounts, draft: resources.routingIntent, autoRouting: resources.routingIntent?.autoRouting });
  };
  const automatic = freeze({ providerId: "codex", model: null }, "gpt-6.1-sol");
  expect(automatic).toMatchObject({ modelLocked: false, effortLocked: false, autoRouting: true });
  expect(automatic.allowedModels.length).toBeGreaterThan(1);
  expect(helperKeepsParentProvider(automatic)).toBe(false);
  const reviewer = freezeAdaptivePolicy({ providerId: "claude-code", model: "claude-sonnet-5-5", agent: getBuiltinAgent("reviewer")!,
    settings: null, maxTurns: 20, delegated: true });
  expect(constrainHelperResources(automatic, reviewer, "claude-sonnet-5-5")).toMatchObject({ providerId: "claude-code", autoRouting: true });
  const pinned = freeze({ providerId: "codex", model: "gpt-6.1-sol" }, "gpt-6.1-sol");
  expect(pinned).toMatchObject({ modelLocked: true, allowedModels: ["gpt-6.1-sol"] });
  expect(helperKeepsParentProvider(pinned)).toBe(true);
  expect(() => constrainHelperResources(pinned, reviewer, "claude-sonnet-5-5")).toThrow("keep its provider");
});

test("execution instructions and the review stage restore cross-provider review guidance where the policy allows it", () => {
  const row = { id: "goal", model: null, agentId: null, acceptanceCriteria: ["Works"] } as unknown as Parameters<typeof tarsWorkflow>[0];
  expect(tarsReviewGuidance({ model: null })).toContain("Run the review on the provider that did not write the change");
  expect(tarsExecutionInstructions({ model: null, agentId: null })).toContain("Run the review on the provider that did not write the change");
  const automatic = tarsWorkflow(row, "2026-11-05T00:00:00.000Z");
  expect(automatic.stages[1]).toMatchObject({ agentConfigId: "reviewer" });
  expect(automatic.stages[1]?.kind === "ai" && automatic.stages[1].instruction).not.toContain("provider that did not write the change");
  const pinned = tarsWorkflow({ ...row, model: "gpt-6.1-sol" }, "2026-11-05T00:00:00.000Z");
  const pinnedReview = pinned.stages[1]?.kind === "ai" ? pinned.stages[1].instruction : "";
  expect(pinnedReview).not.toContain("stays on this provider and model");
  expect(pinnedReview).not.toContain("provider that did not write the change");
  expect(tarsExecutionInstructions({ model: "gpt-6.1-sol", agentId: null })).toContain("stays on this provider and model");
});

test("strict capture rejects malformed accounts, permissions, an agent on the renderer create path and changing accepted runtime hints", () => {
  const input = { requestId: "one", title: "Fix", instruction: "Fix search", acceptanceCriteria: ["Works"],
    repositoryPath: "/tmp/project", workspaceId: "source", providerId: "codex" };
  for (const runtimeHints of [{ codexAccountProfileId: "unknown-format" }, { codexApprovalPolicy: "never" }, { secretEnv: {} }])
    expect(CreateTarsResponsibilityInputSchema.safeParse({ ...input, runtimeHints }).success).toBe(false);
  // Only host decision admission may name an agent.
  expect(CreateTarsResponsibilityInputSchema.safeParse({ ...input, agentId: "implementer" }).success).toBe(false);
  expect(TarsResponsibilityPatchSchema.safeParse({ runtimeHints: { codexAccountProfileId: ACCOUNT } }).success).toBe(false);
  expect(TarsResponsibilityPatchSchema.safeParse({ agentId: "implementer" }).success).toBe(false);
  const resources = buildTarsExecutionResources({ providerId: "codex", model: "claude-sonnet-5-5", runtimeHints: {} });
  expect(() => freezeAdaptivePolicy({ providerId: "codex", model: "claude-sonnet-5-5", agent: null,
    settings: null, maxTurns: 5, accounts: resources.accounts, draft: resources.routingIntent })).toThrow("another provider");
});

test("actual host preparation and Run admission route automatically by default, honor an explicit pin and snapshot the admitted agent", () => {
  // Mock only the external task/provider services; capture the actual host's task, assignment and Run admission arguments.
  const source = `
    import { mock } from "bun:test";
    import { Database } from "bun:sqlite";
    import { mkdtempSync, rmSync } from "node:fs";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import { TarsStore } from "./electron/persistence/tars-store";
    import { TarsConversationStore } from "./electron/persistence/tars-conversation-store";
    import { AgentAssignmentStore } from "./electron/persistence/agent-assignment-store";
    import { createAssignRuntime } from "./electron/host-service/supervision/assign-runtime";
    import { applyTarsDecision } from "./electron/host-service/tars-decisions";
    import { AgentRunStartInputSchema } from "./src/lib/agent-runs/domain";
    import { helperKeepsParentProvider } from "./src/lib/agent-runs/resources";
    import { BUILTIN_AGENTS } from "./src/lib/agents/starters";
    import { AgentConfigSchema } from "./src/lib/agents/schema";
    import { getDefaultModelForProvider } from "./src/lib/providers/model-catalog";
    import { freezeAdaptivePolicy } from "./electron/host-service/supervision/adaptive-policy";
    import { withProviderAccountScope } from "./electron/provider-accounts/runtime-scope";
    const saved = AgentConfigSchema.parse({ version: 1, id: "release-notes", source: "custom", name: "Release notes",
      description: "Writes release notes from merged changes.", instructions: "Write release notes.", model: { mode: "auto", taskClass: "implement" },
      permission: "auto", workspace: "same-workspace", report: ["summary"], usableAs: ["delegate"] });
    const agents = [...BUILTIN_AGENTS, saved];
    const directory = mkdtempSync(path.join(tmpdir(), "tars-routing-"));
    const filename = path.join(directory, "store.sqlite");
    let db = new Database(filename); let persistence;
    const bind = () => { persistence = { tars: new TarsStore(db), tarsConversations: new TarsConversationStore(db),
      agentAssignments: new AgentAssignmentStore(db), agentRuns: { getLatestAgentRunForTask: () => null } }; };
    const now = "2026-11-05T00:00:00.000Z"; bind();
    const selections = [
      { label: "codex-auto", settings: { providerId: "codex", model: "gpt-6.1-sol", runtimeHints: { codexAccountProfileId: "${ACCOUNT}", codexReasoningEffort: "high" } } },
      { label: "claude-auto", settings: { providerId: "claude-code", model: "claude-sonnet-5-5", runtimeHints: { claudeAccountProfileId: "system-default", claudeEffort: "high" } } },
      { label: "codex-pinned", settings: { providerId: "codex", model: "gpt-6.1-luna", runtimeHints: { codexAccountProfileId: "${ACCOUNT}" },
        executionModel: { providerId: "codex", model: "gpt-6.1-sol" } } },
      { label: "cross-pinned", settings: { providerId: "codex", model: "gpt-6.1-sol", runtimeHints: { codexAccountProfileId: "${ACCOUNT}" },
        executionModel: { providerId: "claude-code", model: "claude-sonnet-5-5" } } },
      { label: "saved-agent", settings: { providerId: "codex", model: "gpt-6.1-sol", allowedAgentIds: ["release-notes"] }, agentId: "release-notes" },
    ];
    for (const selection of selections) {
      persistence.tarsConversations.configure({ ...selection.settings, maxTurns: 5 });
      const queued = persistence.tarsConversations.create({ requestId: selection.label, text: "Fix search" }, now);
      const claimed = persistence.tarsConversations.claim(queued.id, queued.revision, now);
      const message = persistence.tarsConversations.answer(claimed.id, claimed.revision, { reply: "Plan", actions: [{ kind: "delegate", workspaceId: "source",
        title: "Fix", instruction: "Fix search", acceptanceCriteria: ["Works"], priority: 50, ...(selection.agentId ? { agentId: selection.agentId } : {}) }] }, now);
      const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, {
        conversations: persistence.tarsConversations, responsibilities: persistence.tars, agents: () => agents,
        readRegistry: () => [{ repositoryPath: "/tmp/project", workspaces: [{ id: "source" }] }], requestTick: () => {} });
      if (receipts[0].status !== "applied") throw new Error(selection.label + " was not admitted: " + receipts[0].error);
    }
    const labels = new Map(persistence.tarsConversations.list().map(message => ["tars-message:" + message.id + ":0", message.requestId]));
    const ids = persistence.tars.snapshot().responsibilities.map(row => row.id);
    db.close(); db = new Database(filename); bind();
    const assignments = createAssignRuntime({ store: persistence.agentAssignments });
    const idle = [];
    mock.module("./electron/host-service/persistence", () => ({ ensureHostServicePersistenceReady: () => persistence }));
    mock.module("./electron/host-service/supervision/assign-host", () => ({ hostAgents: () => agents }));
    mock.module("./electron/providers/runtime", () => ({ providerRuntime: {} }));
    mock.module("./electron/host-service/local-mcp-runtime", () => ({
      getTaskSupervisionSnapshot: async () => ({ exists: false }),
      createIdleTask: async (args) => { idle.push(args); return { taskId: args.taskId }; },
    }));
    mock.module("./electron/host-service/tars-runtime", () => ({ createTarsRuntime: ports => ports }));
    const { createHostTarsRuntime } = await import("./electron/host-service/tars-host");
    const observed = {};
    let current;
    const runtime = createHostTarsRuntime({ assignments, agentRuns: { startAgentRun: async (raw, guard, admission) => {
      if (admission?.tarsResponsibilityId !== current.id) throw new Error("Missing host-owned Tars admission");
      guard(); const input = AgentRunStartInputSchema.parse(raw);
      const agent = persistence.agentAssignments.getByRequestId("tars-" + current.id).agent;
      const startModel = current.model ?? getDefaultModelForProvider({ providerId: current.providerId });
      const policy = withProviderAccountScope({ codexAccountProfileId: "system-default", claudeAccountProfileId: "system-default" }, () =>
        freezeAdaptivePolicy({ providerId: current.providerId, model: startModel, agent,
          settings: null, maxTurns: input.maxTurns, accounts: input.accounts, draft: input.routingIntent }));
      observed[labels.get(current.requestId)] = { providerId: current.providerId, model: current.model, agentId: current.agentId,
        accounts: input.accounts ?? null, routingIntent: input.routingIntent, account: policy.accountProfileId, locked: policy.modelLocked,
        effortLocked: policy.effortLocked, models: policy.allowedModels.length, helpersKeepProvider: helperKeepsParentProvider(policy),
        canCall: agent.canCall, instructions: agent.instructions, workAgent: input.workflow.stages[0].agentConfigId ?? null,
        review: input.workflow.stages[1].instruction, idle: idle.find(entry => entry.taskId === current.taskId) };
      return { agentRun: { id: "run" } };
    } } });
    for (const id of ids) {
      let row = persistence.tars.get(id);
      row = persistence.tars.patch(id, row.revision, { taskId: "task-" + id, executionWorkspaceId: "execution", state: "preparing" }, now);
      current = row;
      await runtime.prepareTask(row);
      await runtime.startRun(row, () => {});
    }
    console.log(JSON.stringify(observed)); db.close(); rmSync(directory, { recursive: true, force: true });
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const rows = JSON.parse(result.stdout.toString());
  expect(Object.keys(rows).sort()).toEqual(["claude-auto", "codex-auto", "codex-pinned", "cross-pinned", "saved-agent"]);
  // The Supervisor's callable list without the publishing Shipper: publication needs a separate request.
  const builtinCallable = ["implementer", "ui-polisher", "debugger", "reviewer", "researcher"];
  for (const label of ["codex-auto", "claude-auto", "saved-agent"]) {
    const row = rows[label];
    // No forced model: the task starts on Auto and every turn routes; reviews may move to the other provider.
    expect(row).toMatchObject({ model: null, locked: false, effortLocked: false, helpersKeepProvider: false, routingIntent: { autoRouting: true } });
    expect(row.routingIntent).not.toHaveProperty("model");
    expect(row.models).toBeGreaterThan(1);
    expect(row.idle).toMatchObject({ provider: row.providerId, model: null, autoRouting: true });
    expect(row.instructions).toContain("Run the review on the provider that did not write the change");
    expect(row.review).not.toContain("provider that did not write the change");
  }
  expect(rows["codex-auto"]).toMatchObject({ providerId: "codex", account: ACCOUNT, accounts: { codexAccountProfileId: ACCOUNT } });
  expect(rows["claude-auto"]).toMatchObject({ providerId: "claude-code", account: "system-default" });
  expect(rows["codex-pinned"]).toMatchObject({ providerId: "codex", model: "gpt-6.1-sol", locked: true, models: 1, helpersKeepProvider: true,
    account: ACCOUNT, routingIntent: { model: "gpt-6.1-sol", modelProviderId: "codex", autoRouting: false },
    idle: { model: "gpt-6.1-sol", autoRouting: false } });
  expect(rows["codex-pinned"].review).not.toContain("stays on this provider and model");
  // A pin on the other provider runs there with that provider's System default account.
  expect(rows["cross-pinned"]).toMatchObject({ providerId: "claude-code", model: "claude-sonnet-5-5", locked: true,
    account: "system-default", accounts: { claudeAccountProfileId: "system-default" } });
  for (const label of ["codex-auto", "claude-auto", "codex-pinned", "cross-pinned"]) {
    expect(rows[label]).toMatchObject({ agentId: null, workAgent: null });
    expect(rows[label].canCall).toEqual(builtinCallable);
  }
  // The admitted saved agent alone joins the callable list and does the work stage.
  expect(rows["saved-agent"]).toMatchObject({ agentId: "release-notes", workAgent: "release-notes" });
  expect(rows["saved-agent"].canCall).toEqual([...builtinCallable, "release-notes"]);
  expect(rows["saved-agent"].instructions).toContain("`release-notes`");
});
