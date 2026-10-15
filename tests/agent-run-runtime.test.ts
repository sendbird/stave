import { resolveScriptsForWorkspace } from "../electron/main/workspace-scripts/config-loader";
import { workspaceScriptDefinitionHash } from "../electron/host-service/supervision/workspace-script-definition";
import { currentProviderAccountId, withProviderAccountScope } from "../electron/provider-accounts/runtime-scope";
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { rememberAdaptiveCatalog, rememberAdaptiveQuota } from "../electron/providers/adaptive-observations";
import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";
import {
  createAgentRunRuntime,
  invokeAgentRunRuntime,
  type AgentRunRuntimeDependencies,
  type AgentRunTurnRow,
} from "../electron/host-service/supervision/agent-run-runtime";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import type { AgentRunStageGrant } from "../electron/providers/agent-run-grants";
import type { AgentRunChangedEvent } from "../src/lib/agent-runs/api";
import { AGENT_RUN_CONTEXT_SOURCE_ID } from "../src/lib/agent-runs/briefing";
import {
  createAgentRun,
  currentStageRecord,
  EMPTY_STAGE_FACTS,
  AgentRunCommandError,
  type AgentRunStartInput,
  type StageFacts,
} from "../src/lib/agent-runs/domain";
import { classifyStageEvidence } from "../src/lib/agent-runs/evidence";
import type { ActionOutcome } from "../src/lib/agent-runs/policy";
import { computeAgentRunMetrics } from "../src/lib/agent-runs/report";
import { WorkflowSchema, type Workflow, type WorkflowStage } from "../src/lib/workflows/schema";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readWorkspaceRevision } from "../electron/host-service/supervision/workspace-revision";
import { observeWorkspaceScript } from "../electron/host-service/supervision/workspace-script-verification";
import { createAgentRunActionExecutor, type AgentRunScmPort } from "../electron/host-service/supervision/agent-run-actions";
import { runCommandArgs } from "../electron/main/utils/command";
import { createAgentRunRouter } from "../electron/host-service/supervision/agent-run-route-host";
import type { AgentConfig } from "../src/lib/agents/schema";
import { buildAgentRunStartInput } from "../src/lib/agent-runs/agent-run";
import { agentRunWorkQueueLane } from "../src/lib/agent-runs/lanes";
import { resolveTurnPolicy } from "../src/lib/policy/turn-policy";
import { buildStarterProfile, DEFAULT_AUTO_ROUTING_PROFILE_ID } from "../src/lib/providers/auto-routing-profile";
import { AgentRouteSettingsSchema, routeAgentRunTurn } from "../src/lib/routing/agent-run-route";
import type { PromptDraftRuntimeOverrides } from "../src/types/chat";
import type { AgentRunRouteSelection } from "../src/lib/agent-runs/route-observation";
import { buildAgentRunTurnDividers } from "../src/lib/agent-runs/agent-run-view";
import { describeAgentRunNotification } from "../src/lib/agent-runs/notifications";

const START = "2026-09-26T10:00:00.000Z";

function workflow(stages: WorkflowStage[], overrides: Partial<Workflow> = {}): Workflow {
  return WorkflowSchema.parse({
    version: 1,
    id: "workflow_runtime",
    name: "Runtime workflow",
    purpose: "Carry the assignment to a verified change.",
    checkIns: "when-stuck",
    team: "solo",
    stages,
    createdAt: START,
    updatedAt: START,
    ...overrides,
  });
}

const DRAFT: WorkflowStage = {
  id: "draft",
  title: "Draft",
  kind: "ai",
  instruction: "Draft the change.",
  doneWhen: "The change is drafted.",
};
const POLISH: WorkflowStage = {
  id: "polish",
  title: "Polish",
  kind: "ai",
  instruction: "Polish the change.",
  doneWhen: "The change is polished.",
};
const OPEN_PR: WorkflowStage = {
  id: "open-pr",
  title: "Open draft PR",
  kind: "action",
  action: { type: "open-draft-pr" },
};

function startInput(overrides: Partial<AgentRunStartInput> = {}): AgentRunStartInput {
  return {
    workspaceId: "ws-1",
    leadTaskId: "task-1",
    workflow: workflow([DRAFT, POLISH]),
    assignment: "Add CSV export to the billing page.",
    consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: [] },
    ...overrides,
  };
}

const COMPLETE = {
  summary: "Drafted the export.",
  decisions: [{ decision: "Reuse the table model", reason: "It already has the rows." }],
  evidence: [{ label: "Tests pass", kind: "check" as const, command: "bun test" }],
  artifacts: [],
};

function createHarness(options: {
  store?: AgentRunStore;
  /** The turns table, shared with a harness that ran before a restart. */
  turns?: AgentRunTurnRow[];
  /** Prefix of the ids this harness gives its turns. */
  turnPrefix?: string;
  hangTurnStarts?: boolean;
  performAction?: AgentRunRuntimeDependencies["performAction"];
  updatePullRequestBody?: AgentRunRuntimeDependencies["updatePullRequestBody"];
  userPermissionOptions?: AgentRunRuntimeDependencies["userPermissionOptions"];
  workspacePath?: string;
  /** More dependencies, such as an agent run's router. */
  extra?: Partial<AgentRunRuntimeDependencies>;
} = {}) {
  const store = options.store ?? new AgentRunStore(new Database(":memory:"));
  const turnPrefix = options.turnPrefix ?? "turn";
  /** Closes and notifications, in the order they happened. */
  const log: string[] = [];
  /** The newest event kind at each announcement. */
  const announcedKinds: string[] = [];
  let clock = new Date(START);
  let snapshot: TaskSupervisionSnapshot = {
    workspaceId: "ws-1",
    taskId: "task-1",
    repositoryPath: "/tmp/repo",
    exists: true,
    archived: false,
    providerId: "claude-code",
    model: "sonnet",
    activeTurnId: null,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
  };
  const turns: AgentRunTurnRow[] = options.turns ?? [];
  const grants = new Map<string, AgentRunStageGrant>();
  const runCalls: Array<Parameters<AgentRunRuntimeDependencies["runSupervisedTurn"]>[0]> = [];
  const factCalls: Array<Parameters<AgentRunRuntimeDependencies["collectStageFacts"]>[0]> = [];
  const notifications: string[] = [];
  const changes: AgentRunChangedEvent[] = [];
  const closedTurns: string[] = [];
  let reportingAvailable = true;
  let runError: Error | null = null;
  let activeDelegated = 0;
  let facts: StageFacts = EMPTY_STAGE_FACTS;
  let turnCounter = 0;

  const advance = (ms = 1_000) => {
    clock = new Date(clock.getTime() + ms);
  };

  const runtime = createAgentRunRuntime({
    store,
    getTaskSupervisionSnapshot: async () => snapshot,
    listRecentTurns: () => turns.slice(0, 20),
    runSupervisedTurn: async (args) => {
      runCalls.push(args);
      if (options.hangTurnStarts) return await new Promise<never>(() => {});
      if (runError) throw runError;
      turnCounter += 1;
      const turnId = `${turnPrefix}-${turnCounter}`;
      advance();
      turns.unshift({ id: turnId, createdAt: clock.toISOString(), completedAt: null });
      // What the provider runtime does: a grant for this turn's stage attempt.
      if (args.agentRunStage) {
        grants.set(`key-${turnId}`, { ...args.agentRunStage, turnId, taskId: args.taskId });
      }
      return { turnId };
    },
    completeInterruptedTurn: (turnId) => {
      closedTurns.push(turnId);
      log.push(`close:${turnId}`);
      const row = turns.find((candidate) => candidate.id === turnId);
      if (!row) return true;
      if (row.completedAt) return false;
      row.completedAt = clock.toISOString();
      return true;
    },
    countActiveDelegatedTasks: () => activeDelegated,
    isReportingAvailable: async () => reportingAvailable,
    resolveAgentRunGrant: (key) => grants.get(key) ?? null,
    resolveWorkspacePath: async () => options.workspacePath ?? "/tmp/repo-ws",
    ...(options.workspacePath ? { readWorkspaceRevision } : {}),
    readHeadSha: async () => "abc1234",
    collectStageFacts: async (args) => {
      factCalls.push(args);
      return facts;
    },
    readWorkspaceState: async () => ({
      branch: "feature/csv",
      branchPushed: true,
      openPullRequest: { url: "https://github.com/acme/app/pull/7", number: 7, isDraft: true },
    }),
    ...(options.performAction ? { performAction: options.performAction } : {}),
    ...(options.updatePullRequestBody ? { updatePullRequestBody: options.updatePullRequestBody } : {}),
    ...(options.userPermissionOptions ? { userPermissionOptions: options.userPermissionOptions } : {}),
    notifyAgentRunProblem: ({ agentRun, detail }) => {
      notifications.push(detail);
      log.push(`notify:${agentRun.leadTaskId}`);
    },
    emitChanged: (event) => {
      changes.push(event);
      announcedKinds.push(store.listRecentEvents(event.agentRunId, 1).at(-1)?.kind ?? "none");
    },
    now: () => clock,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
    ...options.extra,
  });

  return {
    store,
    grants,
    runtime,
    runCalls,
    factCalls,
    notifications,
    changes,
    closedTurns,
    log,
    announcedKinds,
    turns,
    advance,
    setSnapshot: (patch: Partial<TaskSupervisionSnapshot>) => {
      snapshot = { ...snapshot, ...patch };
    },
    setReporting: (available: boolean) => {
      reportingAvailable = available;
    },
    setRunError: (error: Error | null) => {
      runError = error;
    },
    setActiveDelegated: (count: number) => {
      activeDelegated = count;
    },
    setFacts: (next: StageFacts) => {
      facts = next;
    },
    /** A turn the user started from the composer. */
    userTurn: (id: string) => {
      advance();
      turns.unshift({ id, createdAt: clock.toISOString(), completedAt: null });
    },
    endTurn: (id: string) => {
      advance();
      const row = turns.find((candidate) => candidate.id === id)!;
      row.completedAt = clock.toISOString();
      grants.delete(`key-${id}`);
    },
    tick: () => runtime.requestTick(),
    aggregate: (agentRunId: string) => store.getAggregate(agentRunId)!,
    current: (agentRunId: string) => currentStageRecord(store.getAggregate(agentRunId)!),
  };
}

async function startedAgentRun(
  harness: ReturnType<typeof createHarness>,
  input: AgentRunStartInput = startInput(),
) {
  const detail = await harness.runtime.startAgentRun(input);
  await harness.tick();
  return detail.agentRun.id;
}

describe("run runtime: accounts a turn runs on", () => {
  const PERSONAL = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
  const WORK = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

  test("primary turns and host routing keep captured accounts across continuation and restart", async () => {
    const seen: string[][] = [];
    const routeAgentTurn = async () => {
      await Promise.resolve();
      seen.push([currentProviderAccountId("claude-code"), currentProviderAccountId("codex")]);
      return null;
    };
    const harness = createHarness({ extra: { routeAgentTurn } });
    const id = await withProviderAccountScope({ claudeAccountProfileId: WORK, codexAccountProfileId: WORK }, () =>
      startedAgentRun(harness, startInput({ origin: "agent", accounts: { claudeAccountProfileId: PERSONAL, codexAccountProfileId: "system-default" } })));
    expect(harness.runCalls[0]?.runtimeOptions).toMatchObject({ claudeAccountProfileId: PERSONAL, codexAccountProfileId: "system-default" });
    await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.current(id).stageId).toBe(POLISH.id);
    expect(harness.runCalls[1]?.runtimeOptions).toMatchObject({ claudeAccountProfileId: PERSONAL, codexAccountProfileId: "system-default" });
    harness.endTurn("turn-2");
    const restored = createHarness({ store: harness.store, turns: harness.turns, turnPrefix: "restored", extra: { routeAgentTurn } });
    await restored.tick();
    expect(seen).toEqual(Array.from({ length: 3 }, () => [PERSONAL, "system-default"]));
    expect(currentProviderAccountId("claude-code")).toBe("system-default");
  });

  test("a run preserves API connection account ids for main-owned per-turn credential resolution", async () => {
    const harness = createHarness();
    await startedAgentRun(harness, startInput({ accounts: { claudeAccountProfileId: WORK, codexAccountProfileId: "system-default" } }));
    expect(harness.runCalls[0]?.runtimeOptions).toMatchObject({ claudeAccountProfileId: WORK });
  });

  test("an adaptive policy's frozen account wins for its provider; the other provider keeps the selection", async () => {
    const frozen = { version: 1 as const, profile: "balanced" as const, providerId: "claude-code" as const, allowedModels: ["sonnet"],
      modelLocked: true, effortLocked: false, initialEffort: null, accountProfileId: WORK, teamTurns: 30,
      concurrentHelpers: 2 as const, totalHelpers: 4 as const, parentReserve: 1 as const, maxChanges: 2 as const, cooldownTurns: 2 as const };
    const seen: unknown[] = [];
    const harness = createHarness({ extra: { freezeResources: (args) => { seen.push(args.accounts); return frozen; } } });
    const accounts = { claudeAccountProfileId: PERSONAL, codexAccountProfileId: PERSONAL };
    await startedAgentRun(harness, startInput({ origin: "agent", adaptive: true, accounts }));
    expect(seen).toEqual([accounts]);
    expect(harness.runCalls[0]?.runtimeOptions).toMatchObject({ claudeAccountProfileId: WORK, codexAccountProfileId: PERSONAL });
  });
});

describe("run runtime: permissions a turn runs with", () => {
  const USER_SETTINGS = {
    "claude-code": { claudePermissionMode: "auto" as const, claudeSandboxEnabled: false, claudeDisallowedTools: ["WebFetch"],
      claudeSandboxCredentialFiles: ["~/.netrc"] },
    codex: { codexApprovalPolicy: "never" as const, codexFileAccess: "danger-full-access" as const, codexNetworkAccess: true },
  };
  const userPermissionOptions = (providerId: string) =>
    USER_SETTINGS[providerId as keyof typeof USER_SETTINGS];
  const manual = { checkIns: "when-stuck" as const, permissionMode: "manual" as const, authorizedEffectStageIds: [] };

  test("a Your settings (manual) run turn uses the user's Claude settings", async () => {
    const harness = createHarness({ userPermissionOptions });
    await startedAgentRun(harness, startInput({ consent: manual }));
    expect(harness.runCalls[0]?.runtimeOptions).toEqual(USER_SETTINGS["claude-code"]);
  });

  test("a Your settings (manual) run turn uses the user's Codex settings", async () => {
    const harness = createHarness({ userPermissionOptions });
    harness.setSnapshot({ providerId: "codex", model: "gpt-5" });
    await startedAgentRun(harness, startInput({ consent: manual }));
    expect(harness.runCalls[0]?.fingerprint.providerId).toBe("codex");
    expect(harness.runCalls[0]?.runtimeOptions).toEqual(USER_SETTINGS.codex);
  });

  test("Auto and Guided replace only the approval method; the user's protection settings survive", async () => {
    const guided = createHarness({ userPermissionOptions });
    await startedAgentRun(guided);
    expect(guided.runCalls[0]?.runtimeOptions).toEqual({
      ...USER_SETTINGS["claude-code"],
      claudePermissionMode: "default",
      claudeAllowDangerouslySkipPermissions: false,
    });
    const claudeAuto = createHarness({ userPermissionOptions });
    const id = await startedAgentRun(claudeAuto, startInput({ consent: { ...manual, permissionMode: "auto" } }));
    // The deny list, sandbox and credential protection from the user's settings stay on an Auto run.
    expect(claudeAuto.runCalls[0]?.runtimeOptions).toEqual({
      ...USER_SETTINGS["claude-code"], claudePermissionMode: "auto", claudeAllowDangerouslySkipPermissions: false,
    });
    claudeAuto.setSnapshot({ pendingApprovalCount: 1 });
    await claudeAuto.tick();
    expect(claudeAuto.runCalls).toHaveLength(1);
    expect(claudeAuto.aggregate(id).agentRun.state).toBe("running");
    expect(claudeAuto.current(id).nudged).toBe(false);
    const auto = createHarness({ userPermissionOptions });
    auto.setSnapshot({ providerId: "codex", model: "gpt-5" });
    await startedAgentRun(auto, startInput({ consent: { ...manual, permissionMode: "auto" } }));
    expect(auto.runCalls[0]?.runtimeOptions).toEqual({
      ...USER_SETTINGS.codex, codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review",
    });
  });

  test("the user's reply in a stage carries the run's permission, on both providers", async () => {
    const auto = { ...manual, permissionMode: "auto" as const };
    for (const providerId of ["claude-code", "codex"] as const) {
      const h = createHarness({ userPermissionOptions, extra: { taskRunsAsAgent: () => true } });
      h.setSnapshot({ providerId, model: providerId === "codex" ? "gpt-5" : "sonnet" });
      const id = await startedAgentRun(h, startInput({ origin: "agent", consent: auto }));
      await h.runtime.blockStage({ agentRunKey: "key-turn-1", block: { missing: "Choose a storage policy", kind: "input" } });
      h.endTurn("turn-1");
      await h.tick();
      h.userTurn("reply-1");
      const reply = h.runtime.prepareUserTurn({ taskId: "task-1", workspaceId: "ws-1", turnId: "reply-1", providerId });
      expect(reply?.agentRunStage).toMatchObject({ agentRunId: id, stageId: "draft", attempt: 1 });
      expect(reply?.runtimeOptionsMode).toBe("routing");
      expect(reply?.runtimeOptions).toEqual(providerId === "codex"
        ? { ...USER_SETTINGS.codex, codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" }
        : { ...USER_SETTINGS["claude-code"], claudePermissionMode: "auto", claudeAllowDangerouslySkipPermissions: false });
    }
  });
});

describe("run runtime: starting", () => {
  test("refuses unsupported runtimes, archived tasks, missing Local MCP and a second run", async () => {
    const harness = createHarness();
    harness.setSnapshot({ providerId: "cursor" });
    await expect(harness.runtime.startAgentRun(startInput())).rejects.toThrow("Claude and Codex");
    harness.setSnapshot({ providerId: "claude-code", archived: true });
    await expect(harness.runtime.startAgentRun(startInput())).rejects.toThrow("archived");
    harness.setSnapshot({ archived: false });
    harness.setReporting(false);
    await expect(harness.runtime.startAgentRun(startInput())).rejects.toThrow("Local MCP");
    harness.setReporting(true);
    await harness.runtime.startAgentRun(startInput());
    await expect(harness.runtime.startAgentRun(startInput())).rejects.toThrow(
      "already has an active run",
    );
    expect(harness.store.listRecentAgentRuns()).toHaveLength(1);
  });

  test("starts the first stage turn with its prompt, run context, stage identity and consent", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    expect(harness.runCalls).toHaveLength(1);
    const call = harness.runCalls[0]!;
    expect(call.agentRunStage).toEqual({ agentRunId, stageId: "draft", attempt: 1 });
    expect(call.fingerprint).toEqual({ providerId: "claude-code", model: "sonnet" });
    expect(call.runtimeOptions).toEqual({
      claudePermissionMode: "default",
      claudeAllowDangerouslySkipPermissions: false,
    });
    expect(call.prompt).toContain("Stage 1 of 2: Draft");
    expect(call.prompt).not.toContain(agentRunId);
    expect(call.retrievedContextParts[0]?.sourceId).toBe(AGENT_RUN_CONTEXT_SOURCE_ID);
    expect(call.retrievedContextParts[0]?.content).toContain("This turn starts the stage.");

    const record = harness.current(agentRunId);
    expect(record).toMatchObject({ status: "running", startHeadSha: "abc1234" });
    expect(harness.aggregate(agentRunId).agentRun.turnCount).toBe(1);
    const keys = harness.store
      .listEventsByKind(agentRunId, ["turn-started", "turn-linked"])
      .map((event) => event.idempotencyKey);
    expect(keys).toEqual([`${agentRunId}:draft:1:turn:1`, `${agentRunId}:draft:1:turn:1:linked`]);
    expect(harness.changes.at(-1)).toMatchObject({ agentRunId, state: "running" });
  });

  test("a run owns its lead task's automatic turns while it is active", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    expect(harness.runtime.getActiveAgentRunForTask("task-1")?.id).toBe(agentRunId);
    await harness.runtime.cancel({ agentRunId });
    expect(harness.runtime.getActiveAgentRunForTask("task-1")).toBeNull();
  });
});

describe("run runtime: stage reports", () => {
  test("a report through the turn's grant completes the stage only after the turn ends", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    const receipt = await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
    expect(receipt).toMatchObject({ recorded: true, stage: "Draft", revision: 1 });

    await harness.tick();
    expect(harness.current(agentRunId).stageId).toBe("draft");
    expect(harness.runCalls).toHaveLength(1);

    harness.endTurn("turn-1");
    await harness.tick();
    const aggregate = harness.aggregate(agentRunId);
    expect(aggregate.stages.find((record) => record.stageId === "draft")?.status).toBe("completed");
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.agentRunStage.stageId).toBe("polish");
    expect(harness.runCalls[1]!.prompt).toContain("**Draft:** Drafted the export.");
  });

  test("an ended turn without a report is nudged once, then the stage is stuck", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("without reporting the stage \"Draft\"");
    expect(harness.runCalls[1]!.retrievedContextParts[0]?.content).toContain(
      "ended without a stage report",
    );
    expect(harness.current(agentRunId)).toMatchObject({ status: "running", nudged: true });

    harness.endTurn("turn-2");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.current(agentRunId).status).toBe("stuck");
  });

  test("the reporting tools refuse a turn whose grant ended or whose stage moved on", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await expect(
      harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE }),
    ).rejects.toThrow("No run stage is active");
    await expect(harness.runtime.getForGrant({ agentRunKey: "key-unknown" })).rejects.toBeInstanceOf(
      AgentRunCommandError,
    );
    await harness.tick();
    expect(harness.current(agentRunId).stageId).toBe("polish");

    const briefing = await harness.runtime.getForGrant({ agentRunKey: "key-turn-2" });
    expect(briefing.currentStage).toMatchObject({ title: "Polish", attempt: 1 });
    expect(JSON.stringify(briefing)).not.toContain(agentRunId);
  });

  test("a blocked report blocks the stage, and a reply in the task resumes it", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    await harness.runtime.blockStage({
      agentRunKey: "key-turn-1",
      block: { missing: "Which billing plan gets the export?", kind: "input" },
    });
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.current(agentRunId)).toMatchObject({
      status: "blocked",
      blockReason: "agent-blocked",
    });
    expect(harness.runCalls).toHaveLength(1);

    harness.userTurn("user-turn-1");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(1);
    harness.endTurn("user-turn-1");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.retrievedContextParts[0]?.content).toContain("The user replied");
    expect(harness.current(agentRunId).status).toBe("running");
  });

  test("a stage cannot complete while work it delegated is still running", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
    harness.setActiveDelegated(1);
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.current(agentRunId).stageId).toBe("draft");
    harness.setActiveDelegated(0);
    await harness.tick();
    expect(harness.current(agentRunId).stageId).toBe("polish");
  });

  test("legacy command facts without real execution provenance do not verify a report", async () => {
    const harness = createHarness();
    harness.setFacts({
      ...EMPTY_STAGE_FACTS,
      commands: [{ command: "bun test", exitCode: 0, toolCallId: "call-1" }],
    });
    const agentRunId = await startedAgentRun(harness);
    await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.factCalls[0]).toMatchObject({
      cwd: "/tmp/repo-ws",
      startHeadSha: "abc1234",
    });
    expect([...harness.factCalls[0]!.turnIds]).toEqual(["turn-1"]);
    const draft = harness.aggregate(agentRunId).stages.find((record) => record.stageId === "draft")!;
    expect(draft.report?.outcome).toBe("complete");
    if (draft.report?.outcome !== "complete") throw new Error("expected a complete report");
    expect(classifyStageEvidence(draft.report, draft.facts)[0]?.source).toBe("agent");
  });
});

describe("run runtime: the user and the reporting channel", () => {
  test("take over pauses the run until Resume", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    harness.endTurn("turn-1");
    await harness.runtime.noteUserTurn({ agentRunId, intent: "take-over" });
    await harness.tick();
    expect(harness.aggregate(agentRunId).agentRun).toMatchObject({
      state: "paused",
      pauseReason: "taken-over",
    });
    expect(harness.runCalls).toHaveLength(1);

    await harness.runtime.resume({ agentRunId });
    await harness.tick();
    expect(harness.aggregate(agentRunId).agentRun.state).toBe("running");
    expect(harness.runCalls).toHaveLength(2);
  });

  test("each user turn that ends during the run counts once as a reply", async () => {
    const store = new AgentRunStore(new Database(":memory:"));
    const turns: AgentRunTurnRow[] = [];
    const harness = createHarness({ store, turns });
    // A turn from before the agent run is not a reply to it.
    harness.userTurn("before");
    harness.endTurn("before");
    harness.advance();
    const agentRunId = await startedAgentRun(harness);
    await harness.runtime.blockStage({
      agentRunKey: "key-turn-1",
      block: { missing: "Which billing plan gets the export?", kind: "input" },
    });
    harness.endTurn("turn-1");
    await harness.tick();
    harness.userTurn("reply-1");
    harness.endTurn("reply-1");
    await harness.tick();
    await harness.tick();
    const replies = () =>
      store.listEventsByKind(agentRunId, ["user-turn"]).map((event) => [event.idempotencyKey, event.detail.turnId]);
    expect(replies()).toEqual([[`${agentRunId}:user-turn:reply-1`, "reply-1"]]);
    expect(harness.announcedKinds).toContain("user-turn");

    // A restart does not count it again, and a composer choice adds nothing.
    const restarted = createHarness({ store, turns, turnPrefix: "after" });
    await restarted.tick();
    await restarted.runtime.noteUserTurn({ agentRunId, intent: "continue" });
    expect(replies()).toHaveLength(1);
    const events = store.listRecentEvents(agentRunId, 200);
    expect(computeAgentRunMetrics({ providerId: "claude-code", events }).userReplies).toBe(1);
  });

  test("Skip works on a running stage between turns, not while a turn runs", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    const draft = { agentRunId, stageId: "draft", attempt: 1 };
    expect(await invokeAgentRunRuntime(harness.runtime, "skip-stage", draft)).toMatchObject({
      ok: false,
      code: "invalid-state",
    });
    // The turn ended and the next tick has not run yet.
    harness.endTurn("turn-1");
    await harness.runtime.skipStage(draft);
    const aggregate = harness.aggregate(agentRunId);
    expect(aggregate.stages.find((record) => record.stageId === "draft")?.status).toBe("skipped");
    expect(currentStageRecord(aggregate).stageId).toBe("polish");
  });

  test("an unreachable Local MCP blocks the stage instead of spending the nudge", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    harness.setReporting(false);
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.current(agentRunId)).toMatchObject({
      status: "blocked",
      blockReason: "reporting-unavailable",
      nudged: false,
    });
    expect(harness.runCalls).toHaveLength(1);

    harness.setReporting(true);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.retrievedContextParts[0]?.content).toContain("reachable again");
  });

  test("a sign-off waits for the user and refuses a card for another attempt", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(
      harness,
      startInput({ workflow: workflow([DRAFT, { ...POLISH, signOff: "ask" }]) }),
    );
    await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.current(agentRunId)).toMatchObject({ stageId: "polish", status: "awaiting-sign-off" });
    expect(harness.runCalls).toHaveLength(1);

    const stale = await invokeAgentRunRuntime(harness.runtime, "sign-off", {
      agentRunId,
      stageId: "polish",
      attempt: 2,
    });
    expect(stale).toMatchObject({ ok: false, code: "stale-identity" });

    await harness.runtime.signOff({ agentRunId, stageId: "polish", attempt: 1 });
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.agentRunStage).toEqual({ agentRunId, stageId: "polish", attempt: 1 });
  });
});

describe("run runtime: failures and restarts", () => {
  test("a turn that cannot start marks the stage stuck and tells the user", async () => {
    const harness = createHarness();
    harness.setRunError(new Error("provider unavailable"));
    const agentRunId = await startedAgentRun(harness);
    expect(harness.current(agentRunId)).toMatchObject({ status: "stuck" });
    expect(harness.current(agentRunId).detail).toContain("provider unavailable");
    expect(harness.notifications).toEqual(["A run turn could not start: provider unavailable"]);
    expect(
      harness.store.listEventsByKind(agentRunId, ["turn-failed"]).map((event) => event.idempotencyKey),
    ).toEqual([`${agentRunId}:draft:1:turn:1:failed`]);
    harness.setRunError(null);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(1);
  });

  test("a restart reports a start it interrupted and never replays it", async () => {
    const store = new AgentRunStore(new Database(":memory:"));
    const crashed = createHarness({ store, hangTurnStarts: true });
    const { agentRun } = await crashed.runtime.startAgentRun(startInput());
    void crashed.runtime.requestTick();
    await Bun.sleep(5);
    expect(crashed.runCalls).toHaveLength(1);

    const restarted = createHarness({ store });
    restarted.runtime.start();
    await restarted.tick();
    expect(restarted.runCalls).toHaveLength(0);
    expect(restarted.current(agentRun.id)).toMatchObject({ status: "stuck" });
    expect(restarted.notifications).toHaveLength(1);
    expect(restarted.notifications[0]).toContain("interrupted");

    restarted.runtime.stop();
    const again = createHarness({ store });
    again.runtime.start();
    await again.tick();
    expect(again.notifications).toEqual([]);
    expect(again.runCalls).toHaveLength(0);
  });

  test("a restart closes the run turn the stopped host left open", async () => {
    const store = new AgentRunStore(new Database(":memory:"));
    const first = createHarness({ store });
    await startedAgentRun(first);
    const restarted = createHarness({ store });
    restarted.runtime.start();
    await restarted.tick();
    expect(restarted.closedTurns).toEqual(["turn-1"]);
  });

  test("a stage whose turn a restart interrupted resumes without spending its reminder", async () => {
    const store = new AgentRunStore(new Database(":memory:"));
    const turns: AgentRunTurnRow[] = [];
    const first = createHarness({ store, turns });
    const initialContext = {
      imageContexts: [{ dataUrl: "data:image/png;base64,AA==", label: "mock", mimeType: "image/png" }],
      retrievedContextParts: [{ type: "retrieved_context" as const, sourceId: "task:source", content: "Frozen reply" }],
    };
    const original = structuredClone(initialContext);
    const agentRunId = await startedAgentRun(first, startInput({ initialContext }));
    expect(first.runCalls[0]?.initialContext).toEqual(original);
    initialContext.retrievedContextParts[0]!.content = "Later reply";

    const restarted = createHarness({ store, turns, turnPrefix: "resumed" });
    restarted.runtime.start();
    await restarted.tick();
    expect(restarted.closedTurns).toEqual(["turn-1"]);
    expect(
      store.listEventsByKind(agentRunId, ["turn-interrupted"]).map((event) => [event.idempotencyKey, event.detail.turnId]),
    ).toEqual([[`${agentRunId}:draft:1:turn:1:interrupted`, "turn-1"]]);
    expect(restarted.runCalls).toHaveLength(1);
    expect(restarted.runCalls[0]!.agentRunStage).toEqual({ agentRunId, stageId: "draft", attempt: 1 });
    expect(restarted.runCalls[0]!.retrievedContextParts[0]?.content).toContain(
      "Stave stopped while the previous turn of this stage ran",
    );
    expect(restarted.current(agentRunId)).toMatchObject({ status: "running", nudged: false });

    // The resumed turn ends without a report: the one reminder is still there.
    restarted.endTurn("resumed-1");
    await restarted.tick();
    expect(restarted.runCalls).toHaveLength(2);
    expect(restarted.runCalls[1]!.prompt).toContain('without reporting the stage "Draft"');
    expect(restarted.runCalls.map((call) => call.initialContext)).toEqual([original, original]);
    expect(restarted.current(agentRunId)).toMatchObject({ status: "running", nudged: true });
  });

  test("a stuck stage continues once per reply, not on every tick after its turn failed to start", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    harness.endTurn("turn-1");
    await harness.tick();
    harness.endTurn("turn-2");
    await harness.tick();
    expect(harness.current(agentRunId).status).toBe("stuck");

    harness.userTurn("reply-1");
    harness.endTurn("reply-1");
    harness.setRunError(new Error("provider unavailable"));
    await harness.tick();
    expect(harness.current(agentRunId).status).toBe("stuck");
    const turnCount = harness.aggregate(agentRunId).agentRun.turnCount;
    const starts = harness.runCalls.length;
    for (let tick = 0; tick < 3; tick += 1) {
      harness.advance(5_000);
      await harness.tick();
    }
    expect(harness.aggregate(agentRunId).agentRun.turnCount).toBe(turnCount);
    expect(harness.runCalls).toHaveLength(starts);

    // A new reply continues the stage.
    harness.setRunError(null);
    harness.userTurn("reply-2");
    harness.endTurn("reply-2");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(starts + 1);
    expect(harness.runCalls.at(-1)!.retrievedContextParts[0]?.content).toContain("The user replied");
    expect(harness.current(agentRunId).status).toBe("running");
  });

  test("a restart closes every run's open turn before it notifies anyone", async () => {
    const store = new AgentRunStore(new Database(":memory:"));
    const seed = (id: string, leadTaskId: string, at: Date, linkedTurnId?: string) => {
      const change = createAgentRun({
        id,
        input: startInput({ leadTaskId }),
        repositoryPath: "/tmp/repo",
        fingerprint: { providerId: "claude-code", model: "sonnet" },
        now: at,
      });
      store.create(change, at);
      const turnKey = `${id}:draft:1:turn:1`;
      store.apply(
        {
          agentRun: { ...change.agentRun, turnCount: 1 },
          upserts: [{ ...change.upserts[0]!, status: "running", startedAt: at.toISOString() }],
          events: [{ kind: "turn-started", idempotencyKey: turnKey, detail: { stageId: "draft", attempt: 1, reason: "stage-start" } }],
        },
        at,
      );
      if (linkedTurnId) {
        store.recordEvent(
          id,
          { kind: "turn-linked", idempotencyKey: `${turnKey}:linked`, detail: { agentRunId: id, stageId: "draft", attempt: 1, turnId: linkedTurnId } },
          at,
        );
      }
    };
    // The first agent run's start was interrupted; the second one's turn was left open.
    seed("agent-run-a", "task-1", new Date(START));
    seed("agent-run-b", "task-2", new Date(Date.parse(START) + 1_000), "turn-b");
    const turns: AgentRunTurnRow[] = [{ id: "turn-b", createdAt: START, completedAt: null }];
    const restarted = createHarness({ store, turns });
    restarted.runtime.start();
    await restarted.tick();
    expect(restarted.log.indexOf("close:turn-b")).toBeGreaterThanOrEqual(0);
    expect(restarted.log.indexOf("close:turn-b")).toBeLessThan(restarted.log.indexOf("notify:task-1"));
  });

  test("an archived lead task stops the run, and its report lists what was left behind", async () => {
    const harness = createHarness();
    const agentRunId = await startedAgentRun(harness);
    harness.setSnapshot({ archived: true });
    await harness.tick();
    const detail = await harness.runtime.get({ agentRunId });
    expect(detail.agentRun).toMatchObject({ state: "stopped", stopReason: "task-unavailable" });
    expect(detail.report?.outcome).toBe("stopped");
    expect(detail.report?.leftBehind).toEqual([
      "Branch feature/csv is pushed.",
      "Draft PR #7 is still open: https://github.com/acme/app/pull/7",
    ]);
  });
});

describe("run runtime: Stave action stages", () => {
  test("a real nonzero script blocks its stage even when stdout claims success", async () => {
    const store = new AgentRunStore(new Database(":memory:"));
    const performAction = createAgentRunActionExecutor({ store, scm: {} as AgentRunScmPort, resolveWorkspacePath: async () => "/tmp", runScript: async () => {
      const observed = await observeWorkspaceScript({ cwd: "/tmp", readRevision: async () => ({ status: "unknown", reason: "unavailable" }), run: () => runCommandArgs({ cwd: "/tmp", command: process.execPath, commandArgs: ["-e", "console.log('all tests passed; exit 0'); process.exit(7)"] }) });
      return { ok: true, exitCode: observed.result.code!, output: observed.result.stdout, verification: observed.verification };
    } });
    const harness = createHarness({ store, performAction });
    const id = await startedAgentRun(harness, startInput({ workflow: workflow([{ id: "check", title: "Check", kind: "action", action: { type: "run-script", scriptId: "test" }, acceptanceCriteria: [{ text: "Tests pass" }] }]), consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: ["check"] } }));
    for (let attempt = 0; attempt < 30 && harness.current(id).status !== "blocked"; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10)); await harness.tick();
    }
    expect(harness.current(id)).toMatchObject({ status: "blocked", blockReason: "action-failed" });
    expect(harness.current(id).detail).toContain("exited with 7");
    expect(harness.aggregate(id).agentRun.state).not.toBe("completed");
  });
  test("a real unchanged Run script satisfies required checks; a later edit makes its evidence stale", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "stave-agent-run-check-"));
    try {
      const git = (...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
      git("init"); writeFileSync(join(cwd, "tracked.txt"), "original"); git("add", ".");
      git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: record workspace");
      const store = new AgentRunStore(new Database(":memory:"));
      const performAction = createAgentRunActionExecutor({ store, scm: {} as AgentRunScmPort, resolveWorkspacePath: async () => cwd, runScript: async () => {
        const observed = await observeWorkspaceScript({ cwd, run: () => runCommandArgs({ cwd, command: process.execPath, commandArgs: ["-e", "process.exit(0)"] }) });
        return { ok: true, exitCode: observed.result.code!, output: observed.result.stdout, verification: observed.verification };
      } });
      const harness = createHarness({ store, workspacePath: cwd, performAction });
      const id = await startedAgentRun(harness, startInput({ workflow: workflow([{ ...DRAFT, role: "plan" }, { id: "check", title: "Check", kind: "action", action: { type: "run-script", scriptId: "test" }, acceptanceCriteria: [{ text: "Tests pass" }] }]), consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: ["check"] } }));
      await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: { ...COMPLETE, acceptanceCriteria: [{ text: "Tests pass", status: "unverified" }] } });
      harness.endTurn("turn-1"); await harness.tick();
      for (let attempt = 0; attempt < 30 && harness.aggregate(id).agentRun.state !== "completed"; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10)); await harness.tick();
      }
      expect(harness.aggregate(id).agentRun.state).toBe("completed");
      const current = await harness.runtime.get({ agentRunId: id });
      expect(current.report?.stages[1]?.evidence[0]).toMatchObject({ outcome: "succeeded", exitCode: 0, freshness: "current" });
      expect(current.report?.acceptanceCriteria).toContainEqual(expect.objectContaining({ text: "Tests pass", status: "met" }));
      writeFileSync(join(cwd, "tracked.txt"), "changed after the check");
      const stale = await harness.runtime.get({ agentRunId: id });
      expect(stale.report?.stages[1]?.evidence[0]).toMatchObject({ freshness: "stale", exitCode: 0 });
      expect(stale.report?.acceptanceCriteria).toContainEqual(expect.objectContaining({ text: "Tests pass", status: "unverified" }));
      // Viewing changed work must not rewrite the check's original source revision.
      expect(harness.aggregate(id).stages[1]?.facts?.action).toEqual(current.stages[1]?.facts?.action);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  const actionInput = () =>
    startInput({
      workflow: workflow([DRAFT, OPEN_PR]),
      consent: {
        checkIns: "when-stuck",
        permissionMode: "guided",
        authorizedEffectStageIds: ["open-pr"],
      },
    });

  async function reachAction(harness: ReturnType<typeof createHarness>) {
    const agentRunId = await startedAgentRun(harness, actionInput());
    await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await harness.tick();
    return agentRunId;
  }

  test("blocks with a sentence while this version cannot run the action", async () => {
    const harness = createHarness();
    const agentRunId = await reachAction(harness);
    expect(harness.current(agentRunId)).toMatchObject({
      stageId: "open-pr",
      status: "blocked",
      blockReason: "action-failed",
    });
    expect(harness.current(agentRunId).detail).toContain("cannot run");
  });

  test("records a successful action as verified evidence and completes the run", async () => {
    const outcome: ActionOutcome = {
      status: "succeeded",
      result: {
        type: "open-draft-pr",
        prUrl: "https://github.com/acme/app/pull/9",
        prNumber: 9,
        created: true,
      },
    };
    const harness = createHarness({ performAction: async () => outcome });
    const agentRunId = await reachAction(harness);
    const detail = await harness.runtime.get({ agentRunId });
    expect(detail.agentRun.state).toBe("completed");
    expect(detail.report?.links).toContainEqual({
      label: "Opened draft PR #9",
      url: "https://github.com/acme/app/pull/9",
      source: "stave",
    });
  });
});

describe("run runtime: turns an action asks for", () => {
  test("a repair turn counts against the cap, reports nothing, and hands back to the action", async () => {
    const outcomes: ActionOutcome[] = [
      {
        status: "needs-turn",
        reason: "repair-checks",
        prompt: "These checks fail on the pull request: unit tests.",
        detail: "Checks failed: unit tests.",
      },
      { status: "in-progress" },
      {
        status: "succeeded",
        result: { type: "watch-checks", outcome: "passed", checks: [{ name: "unit tests", state: "SUCCESS" }] },
      },
    ];
    let actionCalls = 0;
    const harness = createHarness({
      performAction: async () => outcomes[Math.min(actionCalls++, outcomes.length - 1)]!,
    });
    const agentRunId = await startedAgentRun(
      harness,
      startInput({
        workflow: workflow([
          DRAFT,
          { id: "watch", title: "Watch checks", kind: "action", action: { type: "watch-checks", repairAttempts: 2, timeoutMinutes: 30 } },
        ]),
        consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: ["watch"] },
      }),
    );
    await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await harness.tick();

    expect(actionCalls).toBe(1);
    expect(harness.runCalls).toHaveLength(2);
    const repair = harness.runCalls[1]!;
    expect(repair.prompt).toBe("These checks fail on the pull request: unit tests.");
    expect(repair.agentRunStage).toBeUndefined();
    expect(repair.retrievedContextParts[0]?.content).toContain("Checks failed on the pull request");
    expect(harness.aggregate(agentRunId).agentRun.turnCount).toBe(2);
    expect(harness.current(agentRunId)).toMatchObject({ stageId: "watch", status: "running" });

    // The action is not called while the repair turn runs.
    await harness.tick();
    expect(actionCalls).toBe(1);

    harness.endTurn("turn-2");
    await harness.tick();
    expect(actionCalls).toBe(2);
    expect(harness.aggregate(agentRunId).agentRun.state).toBe("running");
    await harness.tick();
    expect(actionCalls).toBe(3);
    expect(harness.aggregate(agentRunId).agentRun.state).toBe("completed");
  });
});

describe("run runtime: announcements", () => {
  test("events written outside a transition tell the surface, such as a linked turn and observed checks", async () => {
    const harness = createHarness({
      performAction: async ({ aggregate }) => {
        // What Watch checks does while it waits.
        harness.store.recordEvent(
          aggregate.agentRun.id,
          { kind: "checks-observed", idempotencyKey: null, detail: { stageId: "watch", attempt: 1, kind: "pending" } },
          new Date(START),
        );
        return { status: "in-progress" };
      },
    });
    const agentRunId = await startedAgentRun(
      harness,
      startInput({
        workflow: workflow([
          DRAFT,
          { id: "watch", title: "Watch checks", kind: "action", action: { type: "watch-checks", repairAttempts: 1, timeoutMinutes: 30 } },
        ]),
        consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: ["watch"] },
      }),
    );
    expect(harness.announcedKinds).toContain("turn-linked");
    await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.current(agentRunId).stageId).toBe("watch");
    expect(harness.announcedKinds.at(-1)).toBe("checks-observed");
  });
});

describe("run runtime: report actions", () => {
  test("adds the ended run's report to its pull request, and only then", async () => {
    let body = "## Summary\nAdds export.";
    const harness = createHarness({
      updatePullRequestBody: async ({ merge }) => {
        body = merge(body);
        return { ok: true, url: "https://github.com/acme/app/pull/7" };
      },
    });
    const agentRunId = await startedAgentRun(harness);
    await expect(harness.runtime.addReportToPullRequest({ agentRunId })).rejects.toThrow(
      "once the run ends",
    );
    await harness.runtime.cancel({ agentRunId });
    expect(await harness.runtime.addReportToPullRequest({ agentRunId })).toEqual({
      prUrl: "https://github.com/acme/app/pull/7",
    });
    expect(body).toContain("<!-- stave:mission-report -->");
    expect(body).toContain("Run cancelled");
    await harness.runtime.addReportToPullRequest({ agentRunId });
    expect(body.split("<!-- stave:mission-report -->")).toHaveLength(2);
  });
});

describe("run runtime: host dispatch", () => {
  test("returns refusals and invalid arguments as results rather than errors", async () => {
    const harness = createHarness();
    expect(
      await invokeAgentRunRuntime(harness.runtime, "get", { agentRunId: "missing" }),
    ).toMatchObject({ ok: false, code: "not-active" });
    const detail = await harness.runtime.startAgentRun(startInput());
    await harness.tick();
    expect(
      await invokeAgentRunRuntime(harness.runtime, "report-stage", {
        agentRunKey: "key-turn-1",
        report: { summary: "" },
      }),
    ).toMatchObject({ ok: false, code: "invalid-args" });
    expect(
      await invokeAgentRunRuntime(harness.runtime, "list", { workspaceId: "ws-1" }),
    ).toMatchObject({ ok: true, value: { agentRuns: [{ id: detail.agentRun.id }] } });
  });
});

describe("run runtime: agent runs", () => {
  const USER = {
    "claude-code": { claudePermissionMode: "default" as const },
    codex: { codexApprovalPolicy: "on-request" as const },
  };
  const ROUTE_SETTINGS = AgentRouteSettingsSchema.parse({
    routing: {
      autoRoutingEnabled: true,
      autoRoutingProfile: buildStarterProfile(DEFAULT_AUTO_ROUTING_PROFILE_ID),
    },
    classifier: null,
  });
  const AGENT = { model: { mode: "auto", taskClass: "implement" } } as AgentConfig;
  const runInput = () =>
    buildAgentRunStartInput({
      workspaceId: "ws-1",
      taskId: "task-1",
      agent: { name: "Implementer" },
      assignment: "Add CSV export to the billing page.",
      now: new Date(START),
    });

  test("persists route evidence and projects the exact linked turn's usage without accepting its stage", async () => {
    const turns: AgentRunTurnRow[] = [];
    const usage = { inputTokens: 12, outputTokens: 8, totalCostUsd: 0.2 };
    const harness = createHarness({ turns, extra: {
      routeAgentTurn: async () => {
        const route = await routeAgentRunTurn({ agent: AGENT, draft: { model: "opus", modelProviderId: "claude-code", claudeEffort: "high" },
          current: { providerId: "claude-code", model: "sonnet" }, settings: ROUTE_SETTINGS, prompt: "Implement the export.", history: [] });
        return { fingerprint: { providerId: "claude-code", model: route.model }, runtimeOptions: route.runtimeOptions,
          route: route.route, rationale: route.rationale, selection: route.selection };
      },
      readTurnUsage: ({ turnId }) => {
        const turn = turns.find((candidate) => candidate.id === turnId);
        return turn ? { completed: Boolean(turn.completedAt), usage: turn.completedAt ? usage : null } : null;
      },
      readObservedTurnEnding: () => "completed",
    } });
    const agentRunId = await startedAgentRun(harness, runInput());
    expect(harness.store.listEventsByKind(agentRunId, ["turn-started"])[0]?.detail.routeSelection)
      .toMatchObject({ source: "pinned", requestedEffort: "high", effortSource: "draft" });
    expect((await harness.runtime.get({ agentRunId })).routing?.[0])
      .toMatchObject({ turnId: "turn-1", turnOutcome: "running", usage: null, attemptStatus: "running" });
    harness.endTurn("turn-1");
    const detail = await harness.runtime.get({ agentRunId });
    expect(detail.routing?.[0]).toMatchObject({
      turnId: "turn-1", turnOutcome: "completed", attemptStatus: "running", usage, reportedCostUsd: 0.2,
      effectiveModel: null, effectiveEffort: null,
    });
    expect(detail.usage).toMatchObject({ turns: 1, measuredTurns: 1, inputTokens: 12, outputTokens: 8, costUsd: 0.2 });
    expect(detail.report).toBeNull();
    // A new runtime reads the persisted keyed evidence, not the old runtime's route object.
    const restored = createHarness({ store: harness.store, turns, extra: {
      readTurnUsage: () => ({ completed: true, usage }), readObservedTurnEnding: () => "completed",
    } });
    expect((await restored.runtime.get({ agentRunId })).routing?.[0])
      .toMatchObject({ turnId: "turn-1", selection: { source: "pinned", requestedEffort: "high" }, usage });
  });

  test("usage and Insights do not read terminal events, and missing evidence can arrive later", async () => {
    let reads = 0;
    let ending: "completed" | null = null;
    const harness = createHarness({ extra: {
      readTurnUsage: () => ({ completed: true, usage: { inputTokens: 10 } }),
      readTurnEnding: () => "stopped",
      readObservedTurnEnding: () => { reads += 1; return ending; },
    } });
    const agentRunId = await startedAgentRun(harness, runInput());
    // Startup returns detail; only compare reads after that return.
    const initialReads = reads;
    harness.runtime.readUsage({ agentRunId });
    await harness.runtime.getInsights();
    expect(reads).toBe(initialReads);
    expect((await harness.runtime.get({ agentRunId })).routing?.[0]?.turnOutcome).toBe("unknown");
    ending = "completed";
    expect((await harness.runtime.get({ agentRunId })).routing?.[0]?.turnOutcome).toBe("completed");
    const confirmedReads = reads;
    await harness.runtime.get({ agentRunId });
    expect(reads).toBe(confirmedReads);
  });

  test("invalid route evidence is omitted while the supervised dispatch is preserved", async () => {
    const harness = createHarness({ extra: {
      routeAgentTurn: async () => ({
        fingerprint: { providerId: "codex", model: "gpt-5.5" },
        runtimeOptions: { codexReasoningEffort: "high" }, route: "auto", rationale: "Existing route decision.",
        selection: { version: 999 } as unknown as AgentRunRouteSelection,
      }),
    } });
    const agentRunId = await startedAgentRun(harness, runInput());
    expect(harness.runCalls[0]).toMatchObject({ fingerprint: { providerId: "codex", model: "gpt-5.5" },
      runtimeOptions: { codexReasoningEffort: "high" } });
    expect(harness.store.listEventsByKind(agentRunId, ["turn-started"])[0]?.detail.routeSelection).toBeUndefined();
    expect((await harness.runtime.get({ agentRunId })).routing?.[0]?.selection).toBeNull();
  });

  function agentRunHarness(
    options: { store?: AgentRunStore; turns?: AgentRunTurnRow[]; turnPrefix?: string; releaseWhileRouting?: boolean } = {},
  ) {
    let draft: PromptDraftRuntimeOverrides = { autoRouting: true };
    let runsAsAgent = true;
    const endings = new Map<string, "completed" | "stopped" | "failed">();
    const router = createAgentRunRouter({
      readTask: async () => ({ providerId: "claude-code", model: "sonnet" }),
      readDraft: () => draft,
      readMessages: () => [],
      readSettings: () => ROUTE_SETTINGS,
      resolveWorkspacePath: async () => "/tmp/repo-ws",
      classify: async () => ({ ok: false }),
    });
    const harness = createHarness({
      ...options,
      userPermissionOptions: (providerId) => USER[providerId as keyof typeof USER],
      extra: {
        routeAgentTurn: (args) => {
          // The user picks a model while the turn is still being routed.
          if (options.releaseWhileRouting) runsAsAgent = false;
          return router({ ...args, agent: AGENT });
        },
        taskRunsAsAgent: () => runsAsAgent,
        readTurnEnding: (turnId) => endings.get(turnId) ?? "completed",
      },
    });
    return {
      ...harness,
      setDraft: (next: PromptDraftRuntimeOverrides) => {
        draft = next;
      },
      release: () => {
        runsAsAgent = false;
      },
      stopTurn: (turnId: string) => {
        endings.set(turnId, "stopped");
        harness.endTurn(turnId);
      },
    };
  }

  test("the first turn starts on the routed model and resolves autonomous as the agent", async () => {
    const harness = agentRunHarness();
    const agentRunId = await startedAgentRun(harness, runInput());
    const expected = await routeAgentRunTurn({
      agent: AGENT,
      draft: { autoRouting: true },
      current: { providerId: "claude-code", model: "sonnet" },
      settings: ROUTE_SETTINGS,
      prompt: "Add CSV export to the billing page.",
      history: [],
    });
    expect(harness.runCalls).toHaveLength(1);
    const call = harness.runCalls[0]!;
    expect(call.fingerprint).toEqual({ providerId: expected.providerId, model: expected.model });
    expect(call.agentRunStage).toEqual({ agentRunId, stageId: "work", attempt: 1 });
    expect(call.prompt).toContain("Add CSV export to the billing page.");
    // The user row is marked as the run's prompt, so it renders as the assignment from its first frame.
    expect(call.agentRunPrompt).toEqual({ agentRunId, assignment: "Add CSV export to the billing page." });
    // The run passes the user's settings; the agent actor makes them prompt-free.
    const root = "/tmp/repo-ws";
    expect(resolveTurnPolicy({ providerId: expected.providerId, actor: { kind: "chat" }, options: call.runtimeOptions, root }).autonomy).toBe("ask");
    expect(
      resolveTurnPolicy({ providerId: expected.providerId, actor: { kind: "agent", access: "full" }, options: call.runtimeOptions, root }).autonomy,
    ).toBe("autonomous");
    expect(harness.store.listEventsByKind(agentRunId, ["turn-started"])[0]?.detail).toMatchObject({
      route: "auto",
      model: `${expected.providerId}:${expected.model}`,
    });
  });

  test("a turn without a report gets the nudge, routed again, then the run is stuck and needs the user", async () => {
    const harness = agentRunHarness();
    const agentRunId = await startedAgentRun(harness, runInput());
    // The pin the user picked mid-run applies to the next host turn, and the
    // model it moves the task to is the route at work, not drift.
    harness.setDraft({ model: "opus", modelProviderId: "claude-code" });
    harness.setSnapshot({ model: "opus" });
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain('without reporting the stage "Work"');
    expect(harness.runCalls[1]!.agentRunPrompt).toEqual({ agentRunId, assignment: null });
    expect(harness.runCalls[1]!.fingerprint).toEqual({ providerId: "claude-code", model: "opus" });
    expect(harness.aggregate(agentRunId).agentRun.state).toBe("running");

    harness.endTurn("turn-2");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.current(agentRunId).status).toBe("stuck");
    expect(
      agentRunWorkQueueLane({
        state: "running",
        pauseReason: null,
        currentStageStatus: harness.current(agentRunId).status,
        hasOpenPullRequestAwaitingReview: false,
      }),
    ).toBe("action-required");
  });

  test("a user turn steers the run, which continues after it on a routed turn", async () => {
    const harness = agentRunHarness();
    const agentRunId = await startedAgentRun(harness, runInput());
    harness.endTurn("turn-1");
    await harness.tick();
    harness.endTurn("turn-2");
    await harness.tick();
    expect(harness.current(agentRunId).status).toBe("stuck");

    harness.userTurn("user-1");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    harness.endTurn("user-1");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(3);
    expect(harness.runCalls[2]!.retrievedContextParts[0]?.content).toContain("The user replied during this stage");
    expect(harness.store.listEventsByKind(agentRunId, ["turn-started"]).at(-1)?.detail).toMatchObject({
      reason: "continue-after-user",
      route: "auto",
    });
  });

  test("completes only through the stage report", async () => {
    const harness = agentRunHarness();
    const agentRunId = await startedAgentRun(harness, runInput());
    await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.aggregate(agentRunId).agentRun.state).toBe("completed");
    expect(harness.runCalls).toHaveLength(1);
  });

  test("stopping the run's turn cancels the run instead of nudging", async () => {
    const harness = agentRunHarness();
    const agentRunId = await startedAgentRun(harness, runInput());
    harness.stopTurn("turn-1");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(1);
    expect(harness.aggregate(agentRunId).agentRun.state).toBe("cancelled");
    expect(harness.current(agentRunId)).toMatchObject({ status: "cancelled", detail: "You stopped the run." });
    expect(harness.store.listEventsByKind(agentRunId, ["agent-run-ended"])[0]?.detail).toMatchObject({ endedBy: "stopped" });
  });

  test("moving the task to a model (Chat) cancels the run", async () => {
    const harness = agentRunHarness();
    const agentRunId = await startedAgentRun(harness, runInput());
    harness.release();
    await harness.tick();
    expect(harness.aggregate(agentRunId).agentRun.state).toBe("cancelled");
    expect(harness.current(agentRunId).detail).toBe("The task no longer runs as an agent.");
  });

  test("ending the task's agent ends its active agent run at once, and leaves legacy runs alone", async () => {
    const harness = agentRunHarness();
    const agentRunId = await startedAgentRun(harness, runInput());
    // The agent was replaced, so the task still runs as an agent: only the explicit end stops the run.
    expect(await harness.runtime.endAgentRunForTask({ taskId: "task-1" })).toBe(true);
    expect(harness.aggregate(agentRunId).agentRun.state).toBe("cancelled");
    expect(await harness.runtime.endAgentRunForTask({ taskId: "task-1" })).toBe(false);

    const workflow = agentRunHarness();
    const workflowId = await startedAgentRun(workflow);
    expect(await workflow.runtime.endAgentRunForTask({ taskId: "task-1" })).toBe(false);
    expect(workflow.aggregate(workflowId).agentRun.state).toBe("running");
  });

  test("a release while the next turn is routed ends the run instead of starting that turn", async () => {
    const harness = agentRunHarness({ releaseWhileRouting: true });
    const agentRunId = await startedAgentRun(harness, runInput());
    expect(harness.runCalls).toHaveLength(0);
    expect(harness.aggregate(agentRunId).agentRun.state).toBe("cancelled");
  });

  test("a legacy run ignores the agent-run endings and pauses on drift as before", async () => {
    const harness = agentRunHarness();
    const agentRunId = await startedAgentRun(harness);
    harness.release();
    harness.setSnapshot({ model: "opus" });
    harness.stopTurn("turn-1");
    await harness.tick();
    expect(harness.aggregate(agentRunId).agentRun).toMatchObject({ state: "paused", pauseReason: "runtime-changed" });
    expect(harness.runCalls[0]!.fingerprint).toEqual({ providerId: "claude-code", model: "sonnet" });
  });

  test("an active run resumes after a restart on a routed turn", async () => {
    const store = new AgentRunStore(new Database(":memory:"));
    const turns: AgentRunTurnRow[] = [];
    const first = agentRunHarness({ store, turns });
    const agentRunId = await startedAgentRun(first, runInput());
    const restarted = agentRunHarness({ store, turns, turnPrefix: "resumed" });
    restarted.runtime.start();
    await restarted.tick();
    expect(restarted.aggregate(agentRunId).agentRun.origin).toBe("agent");
    expect(restarted.runCalls).toHaveLength(1);
    expect(restarted.runCalls[0]!.retrievedContextParts[0]?.content).toContain("Stave stopped while the previous turn");
    expect(store.listEventsByKind(agentRunId, ["turn-started"]).at(-1)?.detail).toMatchObject({
      reason: "resume-after-restart",
      route: "auto",
    });
  });
});

test("separate question rounds do not consume another turn's report allowance", async () => {
  const h = createHarness();
  const id = await startedAgentRun(h, startInput({ workflow: workflow([DRAFT]) }));
  for (let round = 1; round <= 5; round++) {
    await h.runtime.blockStage({ agentRunKey: `key-turn-${round}`, block: { missing: `Question ${round}`, kind: "input" } });
    h.endTurn(`turn-${round}`);
    await h.tick();
    h.userTurn(`reply-${round}`);
    h.endTurn(`reply-${round}`);
    await h.tick();
  }
  expect(h.current(id).reportRevision).toBe(5);
  await h.runtime.reportStage({ agentRunKey: "key-turn-6", report: COMPLETE });
  expect(h.current(id).reportRevision).toBe(6);
});

test("cancelling a run aborts its owned script", async () => {
  const store = new AgentRunStore(new Database(":memory:"));
  let scriptSignal: AbortSignal | undefined;
  const performAction = createAgentRunActionExecutor({
    store, scm: {} as never, resolveWorkspacePath: async () => "/tmp/workspace",
    runScript: async ({ signal }) => {
      scriptSignal = signal;
      await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
      return { ok: false, exitCode: -1 };
    },
  });
  const h = createHarness({ store, performAction });
  const id = await startedAgentRun(h, startInput({
    workflow: workflow([{ id: "script", title: "Script", kind: "action", action: { type: "run-script", scriptId: "check" } }]),
    consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: ["script"] },
  }));
  expect(scriptSignal?.aborted).toBe(false);
  await h.runtime.cancel({ agentRunId: id });
  expect(scriptSignal?.aborted).toBe(true);
  expect(h.aggregate(id).agentRun.state).toBe("cancelled");
});

test("user replies attach to the active agent stage without repeating the assignment", async () => {
  const h = createHarness({ extra: { taskRunsAsAgent: () => true } });
  const id = await startedAgentRun(h, startInput({ origin: "agent", workflow: workflow([DRAFT]) }));
  await h.runtime.blockStage({ agentRunKey: "key-turn-1", block: { missing: "Choose a storage policy", kind: "input" } });
  h.endTurn("turn-1");
  await h.tick();
  h.userTurn("reply-1");
  const reply = h.runtime.prepareUserTurn({ taskId: "task-1", workspaceId: "ws-1", turnId: "reply-1" });
  expect(reply?.agentRunStage).toMatchObject({ agentRunId: id, stageId: "draft", attempt: 1 });
  expect(reply?.context.content).toContain("Choose a storage policy");
  expect(reply?.context.content).toContain("Do not restart or repeat");
  h.grants.set("reply-key", { ...reply!.agentRunStage, taskId: "task-1", turnId: "reply-1" });
  await h.runtime.blockStage({ agentRunKey: "reply-key", block: { missing: "Clarified choices; still awaiting selection", kind: "input" } });
  h.endTurn("reply-1");
  await h.tick();
  expect(h.runCalls).toHaveLength(1);
  expect(h.current(id).report?.turnId).toBe("reply-1");
});

test("active runs remain in bounded history responses", async () => {
  const h = createHarness();
  const id = await startedAgentRun(h);
  for (let index = 0; index < 3; index++) {
    const now = new Date(Date.parse(START) + (index + 1) * 60_000);
    const change = createAgentRun({ id: `finished-${index}`, input: startInput({ leadTaskId: `other-${index}` }),
      repositoryPath: "/tmp/repo", fingerprint: { providerId: "claude-code", model: "sonnet" }, now });
    change.agentRun.state = "completed";
    h.store.create(change, now);
  }
  expect((await h.runtime.list({ limit: 1, includeActive: true })).agentRuns.some((run) => run.id === id)).toBe(true);
});

test("Stop bypasses a slow router and discards its late result before any dispatch", async () => {
  let enter!: () => void, finish!: (value: null) => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const routed = new Promise<null>((resolve) => { finish = resolve; });
  let signal: AbortSignal | undefined;
  const h = createHarness({ extra: { routeAgentTurn: (args) => { signal = args.signal; enter(); return routed; } } });
  const detail = await h.runtime.startAgentRun(startInput({ origin: "agent" }));
  await entered;
  try {
    await h.runtime.cancel({ agentRunId: detail.agentRun.id });
    expect(signal?.aborted).toBe(true);
    expect(h.aggregate(detail.agentRun.id).agentRun.state).toBe("cancelled");
    expect(h.aggregate(detail.agentRun.id).agentRun.turnCount).toBe(0);
  } finally { finish(null); }
  await h.tick();
  expect(h.runCalls).toHaveLength(0);
  expect(h.store.listEventsByKind(detail.agentRun.id, ["turn-started", "turn-linked"])).toHaveLength(0);
});

test("release bypasses a slow revision read without dispatch or provider failure", async () => {
  let enter!: () => void, finish!: (value: string) => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const revision = new Promise<string>((resolve) => { finish = resolve; });
  const h = createHarness({ extra: { readHeadSha: () => { enter(); return revision; } } });
  const detail = await h.runtime.startAgentRun(startInput({ origin: "agent" }));
  await entered;
  try {
    expect(await h.runtime.endAgentRunForTask({ taskId: "task-1" })).toBe(true);
    expect(h.aggregate(detail.agentRun.id).agentRun.state).toBe("cancelled");
  } finally { finish("abcdef0"); }
  await h.tick();
  expect(h.runCalls).toHaveLength(0);
  expect(h.store.listEventsByKind(detail.agentRun.id, ["turn-failed"])).toHaveLength(0);
});


test("pause cancels preparation and only a new resume can dispatch", async () => {
  let enter!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  let signal: AbortSignal | undefined, reads = 0;
  const h = createHarness({ extra: { routeAgentTurn: (args) => {
    if (++reads > 1) return Promise.resolve(null);
    signal = args.signal; enter(); return new Promise<null>(() => {});
  } } });
  const detail = await h.runtime.startAgentRun(startInput({ origin: "agent" }));
  await entered;
  await h.runtime.pause({ agentRunId: detail.agentRun.id });
  expect(signal?.aborted).toBe(true);
  expect(h.aggregate(detail.agentRun.id).agentRun.state).toBe("paused");
  expect(h.runCalls).toHaveLength(0);
  await h.runtime.resume({ agentRunId: detail.agentRun.id });
  await h.tick();
  expect(h.runCalls).toHaveLength(1);
});

test("pause during Gateway key preparation prevents a late credential from dispatching or entering events", async () => {
  let reached!: () => void;
  const ready = new Promise<void>((resolve) => { reached = resolve; });
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let signal: AbortSignal | undefined;
  const harness = createHarness({ extra: {
    prepareGatewayCredentials: async (args) => {
      signal = args.signal; reached(); await held;
      return { codex: { profileId: WORK, token: "late-fixture-key" } };
    },
  } });
  const created = await harness.runtime.startAgentRun(startInput());
  await ready;
  await harness.runtime.pause({ agentRunId: created.agentRun.id });
  expect(signal?.aborted).toBe(true);
  release(); await harness.tick();
  expect(harness.runCalls).toHaveLength(0);
  expect(harness.aggregate(created.agentRun.id).agentRun.turnCount).toBe(0);
  expect(JSON.stringify(harness.store.listRecentEvents(created.agentRun.id, 30))).not.toContain("late-fixture-key");
});

for (const conflict of [
  { activeTurnId: "user-turn" }, { pendingApprovalCount: 1 }, { pendingUserInputCount: 1 },
]) test(`preparation defers without charging a turn when attention changes: ${Object.keys(conflict)[0]}`, async () => {
  let enter!: () => void, finish!: (value: null) => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const route = new Promise<null>((resolve) => { finish = resolve; });
  const h = createHarness({ extra: { routeAgentTurn: () => { enter(); return route; } } });
  const detail = await h.runtime.startAgentRun(startInput({ origin: "agent" }));
  await entered;
  const tick = h.tick();
  h.setSnapshot(conflict);
  finish(null);
  await tick;
  expect(h.runCalls).toHaveLength(0);
  expect(h.aggregate(detail.agentRun.id).agentRun.turnCount).toBe(0);
  h.setSnapshot({ activeTurnId: null, pendingApprovalCount: 0, pendingUserInputCount: 0 });
  await h.tick();
  expect(h.runCalls).toHaveLength(1);
});

test("a new persisted Run event invalidates an old route before dispatch", async () => {
  let enter!: () => void, enterFresh!: () => void, finish!: (value: null) => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const fresh = new Promise<void>((resolve) => { enterFresh = resolve; });
  const route = new Promise<null>((resolve) => { finish = resolve; });
  let reads = 0;
  const h = createHarness({ extra: { routeAgentTurn: () => {
    if (++reads > 1) { enterFresh(); return new Promise<null>(() => {}); }
    enter(); return route;
  } } });
  const detail = await h.runtime.startAgentRun(startInput({ origin: "agent" }));
  await entered;
  const tick = h.tick();
  h.store.recordEvent(detail.agentRun.id, { kind: "user-turn", idempotencyKey: "new-intent", detail: { turnId: "user-1" } }, new Date(START));
  finish(null);
  await fresh;
  expect(h.runCalls).toHaveLength(0);
  expect(h.aggregate(detail.agentRun.id).agentRun.turnCount).toBe(0);
  await h.runtime.cancel({ agentRunId: detail.agentRun.id });
  await tick;
});

describe("opted-in adaptive Run resources", () => {
  const policy = (providerId: "claude-code" | "codex", patch = {}) => ({
    version: 1 as const, profile: "balanced" as const, providerId,
    allowedModels: providerId === "codex" ? ["gpt-6.1-sol", "gpt-6-luna"] : ["claude-sonnet-5-5", "claude-opus-5-5"],
    modelLocked: false, effortLocked: false, initialEffort: "medium", teamTurns: 30,
    concurrentHelpers: 2 as const, totalHelpers: 4 as const, parentReserve: 1 as const,
    maxChanges: 2 as const, cooldownTurns: 2 as const, ...patch,
  });
  test("Adaptive Decision recommendations use frozen limits and are cancelled before spending a turn", async () => {
    const p = policy("codex");
    let calls = 0;
    const h = createHarness({ extra: { freezeResources: () => p, routeConstrainedTurn: async (input) => {
      calls++; expect(input.allowedModels).toEqual(p.allowedModels);
      return { fingerprint: { providerId: "codex", model: "gpt-6-luna" }, runtimeOptions: { codexReasoningEffort: "low" }, route: "auto", rationale: "Low complexity" };
    } } });
    h.setSnapshot({ providerId: "codex", model: p.allowedModels[0]! });
    const id = await startedAgentRun(h, startInput({ origin: "agent", adaptive: true }));
    expect(calls).toBe(1);
    expect(h.runCalls[0]!.fingerprint.model).toBe("gpt-6-luna");
    expect(h.store.listEventsByKind(id, ["resource-decision"])[0]?.detail).toMatchObject({ automatic: true, accepted: true });
    await h.runtime.cancel({ agentRunId: id });
    let entered!: () => void, finish!: () => void, observed: AbortSignal | undefined;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { finish = resolve; });
    const stopped = createHarness({ extra: { freezeResources: () => p, routeConstrainedTurn: async (_, signal) => {
      observed = signal; entered(); await held; return { fingerprint: { providerId: "codex", model: "gpt-6-luna" }, runtimeOptions: {}, route: "auto", rationale: "Late" };
    } } });
    stopped.setSnapshot({ providerId: "codex", model: p.allowedModels[0]! });
    const start = await stopped.runtime.startAgentRun(startInput({ origin: "agent", adaptive: true }));
    await ready; await stopped.runtime.pause({ agentRunId: start.agentRun.id });
    expect(observed?.aborted).toBe(true); finish(); await stopped.tick();
    expect(stopped.runCalls).toHaveLength(0);
    expect(stopped.store.readResources(start.agentRun.id)?.spent).toBe(0);
  });
  for (const providerId of ["claude-code", "codex"] as const) test(`${providerId}: a grant proposal changes only the next turn and keeps provider/permissions`, async () => {
    const p = policy(providerId);
    const h = createHarness({ extra: { freezeResources: () => p, routeAgentTurn: async () => { throw new Error("Adaptive turns must not run the utility classifier"); } } });
    h.setSnapshot({ providerId, model: p.allowedModels[0]! });
    const id = await startedAgentRun(h, startInput({ origin: "agent", adaptive: true }));
    expect((await h.runtime.get({ agentRunId: id })).resources).toMatchObject({ spent: 1, remaining: 29 });
    await h.runtime.requestResources({ agentRunKey: "key-turn-1", request: { model: p.allowedModels[1], reason: "capability-mismatch", rationale: "The linked turn diagnosed a capability gap", evidenceRefs: ["turn-1"] } });
    expect(h.runCalls).toHaveLength(1);
    expect(h.runCalls[0]!.fingerprint.model).toBe(p.allowedModels[0]!);
    h.endTurn("turn-1"); await h.tick();
    expect(h.runCalls[1]!.fingerprint).toEqual({ providerId, model: p.allowedModels[1]! });
    expect(h.store.listEventsByKind(id, ["resource-decision"])[0]?.detail.accepted).toBe(true);
    expect((await h.runtime.get({ agentRunId: id })).resources?.spent).toBe(2);
    expect(h.runCalls[1]?.runtimeOptions).toMatchObject(providerId === "codex" ? { codexApprovalPolicy: "untrusted" } : { claudePermissionMode: "default" });
  });
  test("pins and foreign-stage evidence refuse escalation, and refusal is recorded once", async () => {
    const p = policy("claude-code", { modelLocked: true });
    const h = createHarness({ extra: { freezeResources: () => p } });
    h.setSnapshot({ model: p.allowedModels[0]! });
    const id = await startedAgentRun(h, startInput({ origin: "agent", adaptive: true }));
    await h.runtime.requestResources({ agentRunKey: "key-turn-1", request: { model: p.allowedModels[1], reason: "capability-mismatch", rationale: "gap", evidenceRefs: ["other-stage-turn"] } });
    h.endTurn("turn-1"); await h.tick();
    expect(h.runCalls[1]!.fingerprint.model).toBe(p.allowedModels[0]!);
    expect(h.store.listEventsByKind(id, ["resource-decision"])).toHaveLength(1);
    expect(h.store.listEventsByKind(id, ["resource-decision"])[0]?.detail).toMatchObject({ accepted: false, reason: "Evidence must name turns linked to this stage attempt." });
    h.endTurn("turn-2"); await h.tick();
    await h.runtime.retryStage({ agentRunId: id, stageId: "draft", attempt: 1 }); await h.tick();
    expect(h.store.listEventsByKind(id, ["resource-decision"])).toHaveLength(1);
  });
  test("budget refusal prevents native dispatch and never reports completion", async () => {
    const h = createHarness({ extra: { freezeResources: () => policy("claude-code", { teamTurns: 1 }) } });
    const id = await startedAgentRun(h, startInput({ origin: "agent", adaptive: true }));
    h.endTurn("turn-1"); await h.tick();
    expect(h.runCalls).toHaveLength(1);
    expect(h.current(id).status).toBe("stuck");
    expect(h.aggregate(id).agentRun.state).toBe("running");
    expect(() => h.runtime.prepareUserTurn({ taskId: "task-1", turnId: "reply" })).toThrow("budget");
  });
  test("replies deduplicate against the same team budget", async () => {
    const h = createHarness({ extra: { freezeResources: () => policy("claude-code") } });
    const id = await startedAgentRun(h, startInput({ origin: "agent", adaptive: true }));
    h.endTurn("turn-1");
    const reply = { taskId: "task-1", turnId: "user-reply" };
    h.runtime.prepareUserTurn(reply); h.runtime.prepareUserTurn(reply);
    expect(h.store.readResources(id)?.spent).toBe(2);
    await h.runtime.pause({ agentRunId: id });
    expect(() => h.runtime.prepareUserTurn({ ...reply, turnId: "new-reply" })).toThrow("Resume");
  });
  const rememberCodexEfforts = (account: string, efforts: string[]) => rememberAdaptiveCatalog(account, {
    providerId: "codex", ok: true, detail: "Observed model support",
    models: [{ model: "gpt-6.1-sol", displayName: "Sol", description: "", hidden: false, isDefault: true,
      defaultEffort: "medium", supportedEfforts: efforts }],
  }, Date.parse(START));
  test("initial pins respect the fresh account catalog, but not another account or expired facts", async () => {
    const account = "initial-catalog-account";
    const p = policy("codex", { initialEffort: "ultra", effortLocked: true, accountProfileId: account });
    const h = createHarness({ extra: { freezeResources: () => p } });
    h.setSnapshot({ providerId: "codex", model: p.allowedModels[0]! });
    rememberCodexEfforts(account, ["medium"]);
    await expect(h.runtime.startAgentRun(startInput({ origin: "agent", adaptive: true }))).rejects.toThrow("does not support");
    expect(h.store.listActiveAgentRuns()).toHaveLength(0);
    expect(h.runCalls).toHaveLength(0);
    h.advance(300_001);
    const id = await startedAgentRun(h, startInput({ origin: "agent", adaptive: true }));
    expect(h.runCalls[0]?.runtimeOptions.codexReasoningEffort).toBe("ultra");
    await h.runtime.cancel({ agentRunId: id });
    const other = createHarness({ extra: { freezeResources: () => ({ ...p, accountProfileId: "different-catalog-account" }) } });
    other.setSnapshot({ providerId: "codex", model: p.allowedModels[0]! });
    await startedAgentRun(other, startInput({ origin: "agent", adaptive: true }));
    expect(other.runCalls[0]?.runtimeOptions.codexReasoningEffort).toBe("ultra");
  });
  test("a proposal cannot accept statically supported effort excluded by the account catalog", async () => {
    const account = "proposal-catalog-account";
    const p = policy("codex", { accountProfileId: account });
    const h = createHarness({ extra: { freezeResources: () => p } });
    h.setSnapshot({ providerId: "codex", model: p.allowedModels[0]! });
    const id = await startedAgentRun(h, startInput({ origin: "agent", adaptive: true }));
    await h.runtime.requestResources({ agentRunKey: "key-turn-1", request: { effort: "ultra", reason: "capability-mismatch",
      rationale: "Deeper reasoning requested", evidenceRefs: ["turn-1"] } });
    rememberCodexEfforts(account, ["medium", "high"]);
    h.endTurn("turn-1"); await h.tick();
    expect(h.runCalls[1]?.runtimeOptions.codexReasoningEffort).toBe("medium");
    expect(h.store.listEventsByKind(id, ["resource-decision"])[0]?.detail)
      .toMatchObject({ accepted: false, reason: "The model does not support that effort." });
  });
  test("newly unsupported current effort blocks supervised turns and replies before charging", async () => {
    const account = "current-catalog-account";
    const p = policy("codex", { initialEffort: "ultra", effortLocked: true, accountProfileId: account });
    const h = createHarness({ extra: { freezeResources: () => p } });
    h.setSnapshot({ providerId: "codex", model: p.allowedModels[0]! });
    const id = await startedAgentRun(h, startInput({ origin: "agent", adaptive: true }));
    rememberCodexEfforts(account, ["medium", "high"]);
    h.endTurn("turn-1"); await h.tick();
    expect(h.runCalls).toHaveLength(1);
    expect(h.current(id).status).toBe("stuck");
    expect(h.store.readResources(id)?.spent).toBe(1);
    expect(() => h.runtime.prepareUserTurn({ taskId: "task-1", providerId: "codex", turnId: "unsupported-reply" })).toThrow("does not support");
    expect(h.store.readResources(id)?.spent).toBe(1);
    expect(h.store.listEventsByKind(id, ["turn-linked"])).toHaveLength(1);
    rememberCodexEfforts(account, ["medium", "ultra"]);
    expect(h.runtime.prepareUserTurn({ taskId: "task-1", providerId: "codex", turnId: "restored-reply" })?.runtimeOptions)
      .toMatchObject({ codexReasoningEffort: "ultra", codexAccountProfileId: account });
    expect(h.store.readResources(id)?.spent).toBe(2);
  });
});

test("a parent report predating helper settlement requires a fresh integration turn", async () => {
  const policy = { version: 1 as const, profile: "balanced" as const, providerId: "claude-code" as const,
    allowedModels: ["sonnet"], modelLocked: true, effortLocked: true, initialEffort: "medium", teamTurns: 30,
    concurrentHelpers: 2 as const, totalHelpers: 4 as const, parentReserve: 1 as const, maxChanges: 2 as const, cooldownTurns: 2 as const };
  const h = createHarness({ extra: { freezeResources: () => policy } });
  const id = await startedAgentRun(h, startInput({ origin: "agent", adaptive: true, workflow: workflow([DRAFT]) }));
  const reserved = h.store.reserveChildResources({ parentTaskId: "task-1", expectedRootRunId: id, childRunId: "helper", executionId: "exec", requestedTurns: 4, now: new Date(START) })!;
  await h.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
  h.endTurn("turn-1"); h.setActiveDelegated(1); await h.tick();
  expect(h.runCalls).toHaveLength(1);
  h.store.releaseResourceReservation(reserved.link, new Date(START)); h.setActiveDelegated(0); await h.tick();
  expect(h.runCalls).toHaveLength(2);
  expect(h.runCalls[1]?.prompt).toContain("Integrate the final helper outcomes");
  expect(h.runCalls[1]?.agentRunStage).toMatchObject({ agentRunId: id, stageId: "draft", attempt: 1 });
  expect(h.aggregate(id).agentRun.state).toBe("running");
  await h.runtime.reportStage({ agentRunKey: "key-turn-2", report: COMPLETE }); h.endTurn("turn-2"); await h.tick();
  expect(h.aggregate(id).agentRun.state).toBe("completed");
});

test("root Stop cancels the exact child and releases unused capacity without refunding spent turns", async () => {
  const stops: string[] = [];
  const p = { version: 1 as const, profile: "balanced" as const, providerId: "claude-code" as const,
    allowedModels: ["sonnet"], modelLocked: true, effortLocked: true, initialEffort: "medium", teamTurns: 30,
    concurrentHelpers: 2 as const, totalHelpers: 4 as const, parentReserve: 1 as const, maxChanges: 2 as const, cooldownTurns: 2 as const };
  const h = createHarness({ extra: { freezeResources: () => p, stopResourceTask: async ({ taskId }) => { stops.push(taskId); } } });
  const id = await startedAgentRun(h, startInput({ origin: "agent", adaptive: true }));
  const reservation = h.store.reserveChildResources({ parentTaskId: "task-1", expectedRootRunId: id, childRunId: "child", executionId: "exact", requestedTurns: 4, now: new Date(START) })!;
  const change = createAgentRun({ id: "child", input: startInput({ leadTaskId: "child-task", origin: "agent" }), repositoryPath: "/tmp/repo",
    fingerprint: { providerId: "claude-code", model: "sonnet" }, now: new Date(START) });
  change.events[0]!.detail = { ...change.events[0]!.detail, resources: p, resourceLink: reservation.link };
  change.events[0]!.idempotencyKey = "child:started";
  h.store.create(change, new Date(START)); h.store.consumeResourceTurn("child", "child-1", new Date(START));
  await h.runtime.cancel({ agentRunId: id });
  expect(h.store.getAggregate("child")?.agentRun.state).toBe("cancelled"); expect(stops).toEqual(["child-task"]);
  expect(h.store.readResources(id)).toMatchObject({ spent: 2, reserved: 0, activeHelpers: 0, helpersLaunched: 1 });
  expect(h.store.consumeResourceTurn("child", "child-2", new Date(START))).toBe(false);
});

test("cached quota admits a healthy same-account turn and replies cannot change its provider/account", async () => {
  const p = { version: 1 as const, profile: "balanced" as const, providerId: "claude-code" as const,
    allowedModels: ["sonnet"], modelLocked: true, effortLocked: true, initialEffort: "medium", accountProfileId: "quota-regression-account", teamTurns: 30,
    concurrentHelpers: 2 as const, totalHelpers: 4 as const, parentReserve: 1 as const, maxChanges: 2 as const, cooldownTurns: 2 as const };
  const snapshot = emptyRateLimitsSnapshot();
  snapshot.claude = { ...snapshot.claude, source: "oauth", session: { usedPercent: 20, resetsAt: Date.parse(START) / 1000 + 3600 } };
  rememberAdaptiveQuota(snapshot, { observedAt: START, providerId: "claude-code", accountProfileId: p.accountProfileId,
    claudeAccountProfileId: p.accountProfileId, codexAccountProfileId: "system-default", source: "sdk" });
  const h = createHarness({ extra: { freezeResources: () => p } });
  const id = await startedAgentRun(h, startInput({ origin: "agent", adaptive: true }));
  expect(h.runCalls).toHaveLength(1); h.endTurn("turn-1"); await h.tick(); expect(h.runCalls).toHaveLength(2);
  expect(() => h.runtime.prepareUserTurn({ taskId: "task-1", providerId: "codex", turnId: "forged" })).toThrow("provider");
  expect(h.store.readResources(id)?.spent).toBe(2);
  expect(h.runtime.prepareUserTurn({ taskId: "task-1", providerId: "claude-code", turnId: "reply" })?.runtimeOptions)
    .toMatchObject({ claudeAccountProfileId: p.accountProfileId, model: "sonnet" });
  const before = h.store.readResources(id)!.spent;
  snapshot.claude.session = { ...snapshot.claude.session!, usedPercent: 100 };
  rememberAdaptiveQuota(snapshot, { observedAt: START, providerId: "claude-code", accountProfileId: p.accountProfileId,
    claudeAccountProfileId: p.accountProfileId, codexAccountProfileId: "system-default", source: "sdk" });
  expect(() => h.runtime.prepareUserTurn({ taskId: "task-1", providerId: "claude-code", turnId: "quota-blocked" })).toThrow("unavailable");
  expect(h.store.readResources(id)!.spent).toBe(before);
  snapshot.claude.session.usedPercent = 20;
  rememberAdaptiveCatalog(p.accountProfileId, { providerId: "claude-code", ok: false, models: [], detail: "Unavailable" }, Date.parse(START));
  expect(() => h.runtime.prepareUserTurn({ taskId: "task-1", providerId: "claude-code", turnId: "catalog-blocked" })).toThrow("unavailable");
  expect(h.store.readResources(id)!.spent).toBe(before);
});

test("adaptive admission cannot attach a new budget to an existing native turn or helper", async () => {
  const h = createHarness();
  h.setSnapshot({ activeTurnId: "old-native-turn" });
  await expect(h.runtime.startAgentRun(startInput({ origin: "agent", adaptive: true }))).rejects.toThrow("idle task");
  h.setSnapshot({ activeTurnId: null }); h.setActiveDelegated(1);
  await expect(h.runtime.startAgentRun(startInput({ origin: "agent", adaptive: true }))).rejects.toThrow("idle task");
  expect(h.store.listActiveAgentRuns()).toHaveLength(0);
  expect(h.runCalls).toHaveLength(0);
});


describe("run runtime: persisted usage-limit reservation", () => {
  const account = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
  const reset = "2026-09-26T11:00:00.000Z";
  function quota(usedPercent: number, resetsAt = reset) {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.claude = { source: "oauth", session: { usedPercent, resetsAt: Date.parse(resetsAt) / 1000 },
      weekly: null, fableWeekly: null, error: null };
    return snapshot;
  }
  function limitedHarness(readAccountUsage?: AgentRunRuntimeDependencies["readAccountUsage"], extra: Partial<AgentRunRuntimeDependencies> = {}) {
    return createHarness({ extra: { readUsageLimitStop: (id) => id === "turn-1" ? { resetsAt: reset } : null,
      readAccountUsage, ...extra } });
  }

  test("a due reset resumes once on the actual routed model and captured account, keeping consumed usage", async () => {
    let current = quota(100);
    const reads: Parameters<NonNullable<AgentRunRuntimeDependencies["readAccountUsage"]>>[0][] = [];
    let routes = 0, gateways = 0;
    const h = limitedHarness(async (args) => { reads.push(args); return current; }, {
      routeAgentTurn: async () => { routes++; return { fingerprint: { providerId: "claude-code", model: "opus" }, runtimeOptions: {}, route: "agent-model", rationale: "Pinned model" }; },
      prepareGatewayCredentials: async () => { gateways++; return undefined; },
      readTurnUsage: () => ({ completed: true, usage: { inputTokens: 10, outputTokens: 5, totalCostUsd: 0.25 } }),
    });
    const id = await startedAgentRun(h, startInput({ origin: "agent", accounts: { claudeAccountProfileId: account } }));
    h.endTurn("turn-1"); await h.tick();
    expect(h.aggregate(id).agentRun).toMatchObject({ state: "paused", pauseReason: "usage-limit", turnCount: 1,
      usageLimit: { fingerprint: { providerId: "claude-code", model: "opus" }, accountProfileId: account, resumeAt: "2026-09-26T11:01:00.000Z" } });
    expect(h.current(id)).toMatchObject({ status: "running", nudged: false, attempt: 1 });
    expect(h.runCalls).toHaveLength(1);
    current = quota(5); h.advance(61 * 60_000); await Promise.all([h.tick(), h.tick()]);
    expect(h.runCalls).toHaveLength(2);
    expect(h.runCalls[1]).toMatchObject({ fingerprint: { providerId: "claude-code", model: "opus" },
      runtimeOptions: { claudeAccountProfileId: account }, gatewayCredentials: {} });
    expect(h.runCalls[1]!.retrievedContextParts[0]!.content).toContain("without repeating completed side effects");
    // Same account: the continuation resumes its own conversation.
    expect(h.runCalls[1]!.freshSession).toBeUndefined();
    expect(reads.every((read) => read.accounts.claudeAccountProfileId === account && read.fingerprint.model === "opus")).toBe(true);
    expect(routes).toBe(1); expect(gateways).toBe(1);
    expect(h.aggregate(id).agentRun.turnCount).toBe(2);
    expect(h.runtime.readUsage({ agentRunId: id })?.costUsd).toBe(0.5);
    expect(h.store.listEventsByKind(id, ["resumed"])).toHaveLength(1);
    await h.tick(); expect(h.runCalls).toHaveLength(2);
  });

  test("the resumed turn keeps the limited turn's effort, at the due reset and on manual Resume", async () => {
    let current = quota(100);
    let routes = 0;
    const h = limitedHarness(async () => current, {
      // A second routing would pick another effort; the continuation must not route again.
      routeAgentTurn: async () => ({ fingerprint: { providerId: "claude-code", model: "opus" },
        runtimeOptions: { claudeEffort: routes++ === 0 ? "xhigh" : "low" }, route: "agent-model", rationale: "Pinned model" }),
      // The second limit reports no reset time.
      readUsageLimitStop: (id) => id === "turn-1" ? { resetsAt: reset } : id === "turn-2" ? {} : null,
    });
    const id = await startedAgentRun(h, startInput({ origin: "agent", accounts: { claudeAccountProfileId: account } }));
    expect(h.runCalls[0]!.runtimeOptions.claudeEffort).toBe("xhigh");
    expect(h.store.listEventsByKind(id, ["turn-linked"]).at(-1)?.detail).toMatchObject({ turnId: "turn-1", effort: { claudeEffort: "xhigh" } });
    h.endTurn("turn-1"); await h.tick();
    expect(h.aggregate(id).agentRun).toMatchObject({ state: "paused", pauseReason: "usage-limit" });
    current = quota(5); h.advance(61 * 60_000); await h.tick();
    expect(h.runCalls).toHaveLength(2);
    expect(h.runCalls[1]).toMatchObject({ fingerprint: { providerId: "claude-code", model: "opus" },
      runtimeOptions: { claudeEffort: "xhigh", claudeAccountProfileId: account } });
    expect(routes).toBe(1);

    // The continuation hits the limit too, with no known reset; Resume keeps the same effort.
    current = quota(100); current.claude.session!.resetsAt = null;
    h.endTurn("turn-2"); await h.tick();
    expect(h.aggregate(id).agentRun).toMatchObject({ state: "paused", pauseReason: "usage-limit", usageLimit: { turnId: "turn-2", resumeAt: null } });
    await h.runtime.resume({ agentRunId: id }); await h.tick();
    expect(h.runCalls).toHaveLength(3);
    expect(h.runCalls[2]!.runtimeOptions).toMatchObject({ claudeEffort: "xhigh", claudeAccountProfileId: account });
    expect(routes).toBe(1);
  });

  test("still exhausted re-arms for a later reset; no known reset stays paused and manual Resume works", async () => {
    let current = quota(100);
    const h = limitedHarness(async () => current);
    const id = await startedAgentRun(h, startInput({ accounts: { claudeAccountProfileId: account } }));
    h.endTurn("turn-1"); await h.tick(); h.advance(61 * 60_000);
    current = quota(100, "2026-09-26T14:00:00.000Z"); await h.tick();
    expect(h.aggregate(id).agentRun.usageLimit).toMatchObject({ resetsAt: "2026-09-26T14:00:00.000Z", resumeAt: "2026-09-26T14:01:00.000Z" });
    expect(h.runCalls).toHaveLength(1);
    current = quota(100); current.claude.session!.resetsAt = null;
    h.advance(3 * 60 * 60_000); await h.tick();
    expect(h.aggregate(id).agentRun.usageLimit?.resumeAt).toBeNull();
    h.advance(24 * 60 * 60_000); await h.tick(); expect(h.runCalls).toHaveLength(1);
    await h.runtime.resume({ agentRunId: id }); await h.tick();
    expect(h.runCalls).toHaveLength(2);
    expect(h.runCalls[1]!.runtimeOptions.claudeAccountProfileId).toBe(account);
    expect(h.aggregate(id).agentRun.turnCount).toBe(2);
  });

  test("unavailable usage does not authorize resume; cancel wins before the next due tick", async () => {
    let current: ReturnType<typeof quota> | null = quota(100);
    const h = limitedHarness(async () => current);
    const id = await startedAgentRun(h); h.endTurn("turn-1"); await h.tick();
    current = null; h.advance(61 * 60_000); await h.tick();
    expect(h.aggregate(id).agentRun.state).toBe("paused"); expect(h.runCalls).toHaveLength(1);
    expect(Date.parse(h.aggregate(id).agentRun.usageLimit!.resumeAt!)).toBeGreaterThan(Date.parse("2026-09-26T11:01:00.000Z"));
    await h.runtime.cancel({ agentRunId: id }); current = quota(5); h.advance(60_000); await h.tick();
    expect(h.runCalls).toHaveLength(1); expect(h.aggregate(id).agentRun.state).toBe("cancelled");
  });

  test("no known reset and an unreadable first read: it reads again in five minutes instead of waiting on the user", async () => {
    let current: ReturnType<typeof quota> | null = null;
    let reads = 0;
    const h = limitedHarness(async () => { reads++; return current; }, { readUsageLimitStop: (id) => id === "turn-1" ? {} : null });
    const id = await startedAgentRun(h, startInput({ accounts: { claudeAccountProfileId: account } }));
    h.endTurn("turn-1"); await h.tick();
    expect(reads).toBe(1);
    expect(h.aggregate(id).agentRun).toMatchObject({ state: "paused", pauseReason: "usage-limit",
      usageLimit: { resetsAt: null, resumeAt: new Date(Date.parse(h.aggregate(id).agentRun.updatedAt) + 5 * 60_000).toISOString() } });
    current = quota(5); h.advance(5 * 60_000); await h.tick();
    expect(reads).toBe(2);
    expect(h.runCalls).toHaveLength(2);
    expect(h.runCalls[1]!.runtimeOptions.claudeAccountProfileId).toBe(account);
  });

  test("no known reset and a read that reports none: the run waits for the user", async () => {
    const exhausted = quota(100); exhausted.claude.session!.resetsAt = null;
    const h = limitedHarness(async () => exhausted, { readUsageLimitStop: (id) => id === "turn-1" ? {} : null });
    const id = await startedAgentRun(h, startInput({ accounts: { claudeAccountProfileId: account } }));
    h.endTurn("turn-1"); await h.tick();
    expect(h.aggregate(id).agentRun.usageLimit).toMatchObject({ resetsAt: null, resumeAt: null });
    h.advance(24 * 60 * 60_000); await h.tick(); expect(h.runCalls).toHaveLength(1);
  });

  test("boot reconstructs the persisted due reservation and dispatches only once", async () => {
    const db = new Database(":memory:"); const store = new AgentRunStore(db);
    const first = createHarness({ store, extra: { readUsageLimitStop: () => ({ resetsAt: reset }), readAccountUsage: async () => quota(100) } });
    const id = await startedAgentRun(first, startInput({ accounts: { claudeAccountProfileId: account } }));
    first.endTurn("turn-1"); await first.tick(); first.runtime.stop();
    const restartedStore = new AgentRunStore(db);
    expect(restartedStore.getAgentRun(id)?.usageLimit).toEqual(first.aggregate(id).agentRun.usageLimit);
    const next = createHarness({ store: restartedStore, turns: first.turns, turnPrefix: "restarted", extra: {
      readUsageLimitStop: (id) => id === "turn-1" ? { resetsAt: reset } : null, readAccountUsage: async () => quota(5),
    } });
    next.advance(61 * 60_000); next.runtime.start(); await next.tick(); await next.tick(); next.runtime.stop();
    expect(next.runCalls).toHaveLength(1);
    expect(next.runCalls[0]).toMatchObject({ fingerprint: { providerId: "claude-code", model: "sonnet" }, runtimeOptions: { claudeAccountProfileId: account } });
    expect(next.aggregate(id).agentRun.turnCount).toBe(2);
    expect(restartedStore.listEventsByKind(id, ["resumed"])).toHaveLength(1);
    db.close();
  });
});


test("cancellation during the due account read wins over automatic dispatch", async () => {
  const reset = "2026-09-26T11:00:00.000Z";
  const snapshot = emptyRateLimitsSnapshot();
  snapshot.claude = { source: "oauth", session: { usedPercent: 100, resetsAt: Date.parse(reset) / 1000 }, weekly: null, fableWeekly: null, error: null };
  let announceRead!: () => void, finishRead!: (value: typeof snapshot) => void;
  const reading = new Promise<void>((resolve) => { announceRead = resolve; });
  let reads = 0;
  const h = createHarness({ extra: {
    readUsageLimitStop: () => ({ resetsAt: reset }),
    readAccountUsage: async () => {
      if (++reads === 1) return snapshot;
      announceRead();
      return await new Promise<typeof snapshot>((resolve) => { finishRead = resolve; });
    },
  } });
  const id = await startedAgentRun(h); h.endTurn("turn-1"); await h.tick(); h.advance(61 * 60_000);
  const tick = h.tick(); await reading;
  const cancelled = h.runtime.cancel({ agentRunId: id });
  const headroom = structuredClone(snapshot); headroom.claude.session!.usedPercent = 0;
  finishRead(headroom); await tick; await cancelled; await h.tick();
  expect(h.runCalls).toHaveLength(1);
  expect(h.aggregate(id).agentRun.state).toBe("cancelled");
});

describe("run runtime: opt-in account pool", () => {
  const WORK = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
  const PERSONAL = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
  const GATEWAY = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
  const reset = "2026-09-26T11:00:00.000Z";
  function quota(usedPercent: number, resetsAt = reset) {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.claude = { source: "oauth", session: { usedPercent, resetsAt: Date.parse(resetsAt) / 1000 },
      weekly: null, fableWeekly: null, error: null };
    return snapshot;
  }
  /** Usage per account; the host lists subscription accounts only, so the API connection is never among them. */
  function poolHarness(usage: Record<string, ReturnType<typeof quota> | null>, stop: { resetsAt?: string } = { resetsAt: reset }) {
    const reads: string[] = [];
    const h = createHarness({ extra: {
      readUsageLimitStop: (id) => id === "turn-1" ? stop : null,
      readAccountUsage: async ({ accounts }) => { reads.push(accounts.claudeAccountProfileId!); return usage[accounts.claudeAccountProfileId!] ?? null; },
      listSubscriptionAccounts: (providerId) => providerId === "claude-code"
        ? [{ id: "system-default", label: "System default" }, { id: WORK, label: "Work" }, { id: PERSONAL, label: "Personal" }] : [],
    } });
    return { h, reads };
  }
  const pooledStart = (accountIds: string[]) => startInput({ origin: "agent", accounts: { claudeAccountProfileId: WORK }, accountPool: { accountIds } });

  test("a limit moves the run to the next pool account with usage: a quiet switch, a fresh session and the Run briefing", async () => {
    const usage: Record<string, ReturnType<typeof quota> | null> = { [WORK]: quota(100), [PERSONAL]: quota(10) };
    const { h, reads } = poolHarness(usage);
    const id = await startedAgentRun(h, pooledStart([WORK, GATEWAY, PERSONAL]));
    // The API connection never joins the pool the host freezes.
    expect(h.aggregate(id).agentRun.accountPool).toEqual({ accountIds: [WORK, PERSONAL] });
    expect(h.runCalls[0]!.runtimeOptions.claudeAccountProfileId).toBe(WORK);

    h.endTurn("turn-1"); await h.tick();
    expect(reads).toEqual([WORK, PERSONAL]);
    expect(h.runCalls).toHaveLength(2);
    const resumed = h.runCalls[1]!;
    expect(resumed.runtimeOptions).toMatchObject({ claudeAccountProfileId: PERSONAL });
    // The switch turn starts a new conversation on that account (runTask then skips its stored slot).
    expect(resumed.runtimeOptions.claudeResumeSessionId).toBeUndefined();
    expect(resumed.freshSession).toBe(true);
    expect(h.runCalls[0]!.freshSession).toBeUndefined();
    expect(resumed.prompt).toContain("Add CSV export to the billing page.");
    expect(resumed.retrievedContextParts[0]!.content).toContain("separate provider conversation");
    expect(h.store.listEventsByKind(id, ["account-switched"]).map((event) => event.detail)).toEqual([{ providerId: "claude-code",
      from: WORK, to: PERSONAL, reason: "usage-limit", turnId: "turn-1", fromLabel: "Work", toLabel: "Personal" }]);
    expect(h.store.listEventsByKind(id, ["turn-started"]).at(-1)?.detail).toMatchObject({ accountProfileId: PERSONAL, reason: "resume-after-account-switch" });
    expect(h.store.listEventsByKind(id, ["paused"])).toHaveLength(0);
    const detail = await h.runtime.get({ agentRunId: id });
    expect(detail.agentRun.state).toBe("running");
    expect(describeAgentRunNotification(detail, { repositoryPath: null, repositoryName: null, workspaceName: null, taskTitle: null })).toBeNull();
    expect(buildAgentRunTurnDividers(detail, (iso) => iso).get("turn-2")).toContain("Account switched · Work → Personal · usage limit");

    // The run's later turns stay on the account it switched to and resume its conversation.
    h.endTurn("turn-2"); await h.tick();
    expect(h.runCalls[2]!.runtimeOptions.claudeAccountProfileId).toBe(PERSONAL);
    expect(h.runCalls[2]!.freshSession).toBeUndefined();
    await h.runtime.cancel({ agentRunId: id });
    expect((await h.runtime.get({ agentRunId: id })).report?.accountSwitches).toEqual([
      expect.objectContaining({ from: "Work", to: "Personal", reason: "usage-limit" })]);
  });

  test("every pool account exhausted: wait for the earliest reset, then check the pool in order", async () => {
    const usage: Record<string, ReturnType<typeof quota> | null> = { [WORK]: quota(100), [PERSONAL]: quota(100, "2026-09-26T10:30:00.000Z") };
    const { h, reads } = poolHarness(usage);
    const id = await startedAgentRun(h, pooledStart([WORK, PERSONAL]));
    h.endTurn("turn-1"); await h.tick();
    expect(h.aggregate(id).agentRun).toMatchObject({ state: "paused", pauseReason: "usage-limit",
      usageLimit: { accountProfileId: WORK, resetsAt: "2026-09-26T10:30:00.000Z", resumeAt: "2026-09-26T10:31:00.000Z" } });
    expect(h.runCalls).toHaveLength(1);
    reads.length = 0;
    usage[PERSONAL] = quota(5); h.advance(31 * 60_000); await h.tick();
    expect(reads).toEqual([WORK, PERSONAL]);
    expect(h.runCalls).toHaveLength(2);
    expect(h.runCalls[1]!.runtimeOptions.claudeAccountProfileId).toBe(PERSONAL);
    expect(h.runCalls[1]!.freshSession).toBe(true);
    expect(h.store.listEventsByKind(id, ["account-switched"]).map((event) => [event.detail.from, event.detail.to])).toEqual([[WORK, PERSONAL]]);
  });

  test("a pool account whose usage read is unavailable is skipped; the next one with usage left takes over", async () => {
    const { h, reads } = poolHarness({ [WORK]: quota(100), [PERSONAL]: null, "system-default": quota(10) });
    const id = await startedAgentRun(h, pooledStart([WORK, PERSONAL, "system-default"]));
    h.endTurn("turn-1"); await h.tick();
    expect(reads).toEqual([WORK, PERSONAL, "system-default"]);
    expect(h.runCalls[1]!.runtimeOptions.claudeAccountProfileId).toBe("system-default");
    expect(h.store.listEventsByKind(id, ["account-switched"]).map((event) => event.detail.to)).toEqual(["system-default"]);
  });

  test("no known reset and every pool read unavailable: the pool is read again in five minutes", async () => {
    const usage: Record<string, ReturnType<typeof quota> | null> = { [WORK]: null, [PERSONAL]: null };
    // This limit's stop reports no reset time.
    const { h, reads } = poolHarness(usage, {});
    const id = await startedAgentRun(h, pooledStart([WORK, PERSONAL]));
    h.endTurn("turn-1"); await h.tick();
    expect(h.runCalls).toHaveLength(1);
    const paused = h.aggregate(id).agentRun;
    expect(paused.usageLimit).toMatchObject({ resetsAt: null, resumeAt: new Date(Date.parse(paused.updatedAt) + 5 * 60_000).toISOString() });
    reads.length = 0;
    usage[PERSONAL] = quota(5); h.advance(5 * 60_000); await h.tick();
    expect(reads).toEqual([WORK, PERSONAL]);
    expect(h.runCalls[1]!.runtimeOptions.claudeAccountProfileId).toBe(PERSONAL);
  });

  test("pool off, or nothing but an API connection to switch to: the run waits on its own account as before", async () => {
    for (const input of [startInput({ origin: "agent", accounts: { claudeAccountProfileId: WORK } }), pooledStart([WORK, GATEWAY])]) {
      const { h, reads } = poolHarness({ [WORK]: quota(100), [GATEWAY]: quota(0), [PERSONAL]: quota(0) });
      const id = await startedAgentRun(h, input);
      expect(h.aggregate(id).agentRun.accountPool).toBeUndefined();
      h.endTurn("turn-1"); await h.tick();
      expect(reads).toEqual([WORK]);
      expect(h.aggregate(id).agentRun).toMatchObject({ state: "paused", pauseReason: "usage-limit",
        usageLimit: { accountProfileId: WORK, resumeAt: "2026-09-26T11:01:00.000Z" } });
      expect(h.store.listEventsByKind(id, ["account-switched"])).toHaveLength(0);
      expect(h.runCalls).toHaveLength(1);
    }
  });
});


test("turn cap persists a pause; Extend keeps the task session, fingerprint and usage", async () => {
  const harness = createHarness({ extra: { readTurnUsage: () => ({ completed: true, usage: { inputTokens: 12, outputTokens: 8, totalCostUsd: 0.2 } }) } });
  const id = await startedAgentRun(harness, startInput({ origin: "agent", maxTurns: 1 }));
  await harness.runtime.reportStage({ agentRunKey: "key-turn-1", report: COMPLETE });
  harness.endTurn("turn-1");
  await harness.tick();
  const paused = await harness.runtime.get({ agentRunId: id });
  expect(paused.agentRun).toMatchObject({ state: "paused", pauseReason: "limit-reached", turnCount: 1, maxTurns: 1 });
  expect(harness.store.getAggregate(id)?.agentRun.pauseReason).toBe("limit-reached");
  expect(paused.report).toBeNull();
  const context = { repositoryPath: null, repositoryName: null, workspaceName: null, taskTitle: null };
  const notices = new Set([describeAgentRunNotification(paused, context)?.dedupeKey]);
  await harness.tick();
  notices.add(describeAgentRunNotification(await harness.runtime.get({ agentRunId: id }), context)?.dedupeKey);
  expect(notices.size).toBe(1);
  expect(describeAgentRunNotification(paused, context)?.title).toBe("Halted · Limit reached · Runtime workflow");
  expect(harness.runCalls).toHaveLength(1);
  expect(paused.events.filter(event => event.kind === "paused")).toHaveLength(1);
  const resumed = await invokeAgentRunRuntime(harness.runtime, "extend", { agentRunId: id });
  expect(resumed).toMatchObject({ ok: true });
  if (!resumed.ok) throw new Error(resumed.message);
  expect((resumed.value as import("../src/lib/agent-runs/api").AgentRunDetail).usage).toEqual(paused.usage);
  await harness.tick();
  expect(harness.runCalls).toHaveLength(2);
  expect(harness.runCalls[1]?.taskId).toBe(harness.runCalls[0]?.taskId);
  expect(harness.runCalls[1]?.fingerprint).toEqual(harness.runCalls[0]?.fingerprint);
  expect(harness.runCalls[1]?.freshSession).toBeUndefined();
  const continued = await harness.runtime.get({ agentRunId: id });
  expect(continued.agentRun).toMatchObject({ state: "running", pauseReason: null, turnCount: 2, maxTurns: 11 });
  expect(continued.usage?.inputTokens).toBeGreaterThanOrEqual(paused.usage!.inputTokens);
  await harness.runtime.reportStage({ agentRunKey: "key-turn-2", report: COMPLETE });
  harness.endTurn("turn-2");
  await harness.tick();
  expect(harness.aggregate(id).agentRun.state).toBe("completed");
});

for (const delivery of ["async", undefined] as const) {
  test(`a persisted ${delivery ?? "native"} Run question survives SQLite reload and answers once`, async () => {
    const { runQuestionRequestId } = await import("../src/lib/agent-runs/persistent-question");
    const { interruptPendingToolInteractionsInMessages, findPendingUserInputMessageByRequestId } = await import("../src/store/provider-message.utils");
    const { buildWorkspaceSessionState } = await import("../src/store/workspace-session-state");
    const { respondHostUserInput } = await import("../electron/host-service/host-user-input");
    const { setRunQuestionAnswerer } = await import("../electron/host-service/run-question-answer");
    const { agentRunDecisionOfMessages, describeAgentRunStatus } = await import("../src/lib/agent-runs/agent-run-status");
    const { applyUserInputState } = await import("../src/store/editor.utils");
    const directory = mkdtempSync(join(tmpdir(), "stave-run-question-restart-"));
    const databasePath = join(directory, "state.sqlite");
    let db = new Database(databasePath);
    try {
      const first = createHarness({ store: new AgentRunStore(db) });
      const id = await startedAgentRun(first, startInput({ origin: "agent", workflow: workflow([DRAFT]) }));
      const stage = { agentRunId: id, stageId: DRAFT.id, attempt: 1 };
      const requestId = runQuestionRequestId(stage, "native-question");
      // This is the persisted message shape; no provider callback survives this close.
      db.exec("CREATE TABLE question_test_snapshot (payload TEXT NOT NULL)");
      db.query("INSERT INTO question_test_snapshot VALUES (?)").run(JSON.stringify({
        tasks: [{ id: "task-1", title: "Task", provider: "claude-code", unread: false, updatedAt: START }],
        activeTaskId: "task-1", messagesByTask: { "task-1": [{ id: "question-message", role: "assistant", model: "sonnet", providerId: "claude-code", turnId: "turn-1", content: "", parts: [{
          type: "user_input", requestId, toolName: "AskUserQuestion", state: "input-requested", ...(delivery ? { delivery } : {}),
          questions: [{ key: "file", question: "Which filename?", header: "File", options: [] }],
        }] }] },
      }));
      first.endTurn("turn-1"); first.runtime.stop(); db.close();
      db = new Database(databasePath);
      const loadSession = () => {
        const row = db.query("SELECT payload FROM question_test_snapshot").get() as { payload: string };
        const session = buildWorkspaceSessionState({ snapshot: JSON.parse(row.payload) });
        session.messagesByTask["task-1"] = interruptPendingToolInteractionsInMessages({ messages: session.messagesByTask["task-1"]! });
        return session;
      };
      let session = loadSession();
      expect(session.messagesByTask["task-1"]![0]!.parts[0]).toMatchObject({ state: "input-requested", delivery: "async" });
      const restored = createHarness({ store: new AgentRunStore(db), turns: first.turns, extra: {
        runSupervisedTurn: async args => {
          // As runTaskImpl does: a card answered by an earlier reply is not answered again.
          if (!findPendingUserInputMessageByRequestId({ messages: session.messagesByTask["task-1"]!, requestId: args.questionAnswer!.requestId })) throw new Error("already answered");
          const pending = session.messagesByTask["task-1"]![0]!;
          session = { ...session, ...applyUserInputState({ messagesByTask: session.messagesByTask, workspaceSnapshotVersion: 0,
            taskId: "task-1", messageId: pending.id, ...args.questionAnswer! }) };
          session.messagesByTask["task-1"]!.push({ id: "reply-message", turnId: "reply-1", role: "user", providerId: "user", model: "user", content: args.prompt, parts: [{ type: "text", text: args.prompt }] });
          db.query("UPDATE question_test_snapshot SET payload = ?").run(JSON.stringify(session));
          restored.runtime.prepareUserTurn({ taskId: "task-1", workspaceId: "ws-1", turnId: "reply-1", providerId: "claude-code" });
          return { turnId: "reply-1" };
        },
      } });
      restored.setSnapshot({ pendingUserInputCount: 1 });
      restored.runtime.start(); await restored.tick(); await restored.tick();
      const detail = await restored.runtime.get({ agentRunId: id });
      expect(describeAgentRunStatus(detail, agentRunDecisionOfMessages(session.messagesByTask["task-1"])).badge).toBe("needs-answer");
      expect(restored.current(id)).toMatchObject({ status: "running", nudged: false });
      expect(restored.runCalls).toHaveLength(0);
      setRunQuestionAnswerer(args => restored.runtime.answerQuestion(args));
      let chain = Promise.resolve();
      const ports = { workspaceName: "Test", load: async () => session,
        enqueue: <T>(_key: string, operation: () => Promise<T>) => { const next = chain.then(operation); chain = next.then(() => {}, () => {}); return next; },
        respond: async () => { throw new Error("The expired native callback must not receive the answer"); },
        cache: (_key: string, value: typeof session) => value, persist: async () => {} };
      const answer = { workspaceId: "ws-1", taskId: "task-1", requestId, answers: { file: "B.md" } };
      const responses = await Promise.allSettled([respondHostUserInput(answer, ports), respondHostUserInput(answer, ports)]);
      expect(responses.map(response => response.status).sort()).toEqual(["fulfilled", "rejected"]);
      session = loadSession();
      expect(session.messagesByTask["task-1"]!.filter(message => message.role === "user").map(message => message.content)).toEqual(["> Which filename?\n\nB.md"]);
      expect(restored.store.listEventsByKind(id, ["user-turn"])).toHaveLength(1);
      expect(restored.store.listEventsByKind(id, ["turn-linked"]).at(-1)?.detail).toMatchObject({ ...stage, turnId: "reply-1", reason: "user-reply" });
      await expect(respondHostUserInput(answer, ports)).rejects.toThrow("Pending user input not found");
      restored.runtime.stop();
    } finally { setRunQuestionAnswerer(null); db.close(); rmSync(directory, { recursive: true, force: true }); }
  });
}

test("a paused Run keeps its saved question answerable until Resume", async () => {
  const { runQuestionRequestId } = await import("../src/lib/agent-runs/persistent-question");
  const replies: string[] = [];
  const h = createHarness({ extra: { runSupervisedTurn: async args => { if (args.questionAnswer) replies.push(args.prompt); return { turnId: `turn-${replies.length}` }; } } });
  const id = await startedAgentRun(h, startInput({ origin: "agent", workflow: workflow([DRAFT]) }));
  const stage = { agentRunId: id, stageId: DRAFT.id, attempt: 1 };
  const requestId = runQuestionRequestId(stage, "native-question");
  h.setSnapshot({ pendingUserInputCount: 1 });
  const answer = { workspaceId: "ws-1", taskId: "task-1", stage, prompt: "> Which filename?\n\nB.md", questionAnswer: { requestId, answers: { file: "B.md" } } };
  await h.runtime.pause({ agentRunId: id });
  // Paused only waits: the card must stay answerable, so this is a transient refusal, not "not-active".
  await expect(h.runtime.answerQuestion(answer)).rejects.toMatchObject({ code: "refused" });
  expect(replies).toHaveLength(0);
  await h.runtime.resume({ agentRunId: id });
  await h.runtime.answerQuestion(answer);
  expect(replies).toEqual(["> Which filename?\n\nB.md"]);
  await h.runtime.cancel({ agentRunId: id });
  await expect(h.runtime.answerQuestion(answer)).rejects.toMatchObject({ code: "not-active" });
  h.runtime.stop();
});


describe("primary write run workspace checks", () => {
  const definitionHash = "a".repeat(64);
  const scriptDefinitions = [{ scriptId: "check", definitionHash }];
  const scriptMetadata = { definitionHash, executedCommands: "sh check.sh", commandsTruncated: false };
  const agent = { id: "implementer", name: "Implementer", permission: "auto" } as AgentConfig;
  const revision = { status: "known" as const, revision: "final" };
  function checkedHarness(extra: Partial<AgentRunRuntimeDependencies> = {}) {
    return createHarness({ extra: {
      taskAgent: () => agent, listWorkspaceActionScripts: async () => scriptDefinitions,
      readWorkspaceRevision: async () => revision,
      runWorkspaceScript: async () => ({ ...scriptMetadata, exitCode: 0, output: "passed", verification: { sourceRevision: revision, completedRevision: revision } }),
      ...extra,
    } });
  }
  function input() {
    return buildAgentRunStartInput({ workspaceId: "ws-1", taskId: "task-1", agent, assignment: "Make checks pass", now: new Date(START) });
  }
  test("report without host check blocks; the next report after the check completes with persisted evidence", async () => {
    const h = checkedHarness();
    h.setFacts({ ...EMPTY_STAGE_FACTS, workspaceRevision: revision });
    const id = await startedAgentRun(h, input());
    expect(h.aggregate(id).agentRun.workflow.stages[0]!.acceptanceCriteria).toEqual([{ text: "Workspace checks pass", required: true, verification: "stave-check", scriptIds: ["check"], scriptDefinitions }]);
    await h.runtime.reportStage({ agentRunKey: "key-turn-1", report: { ...COMPLETE, acceptanceCriteria: [{ text: "Workspace checks pass", status: "met" }] } });
    h.endTurn("turn-1"); await h.tick();
    expect(h.current(id)).toMatchObject({ status: "blocked", blockReason: "acceptance-unmet" });
    expect(h.current(id).detail).toContain("Run `stave_run_workspace_script` with script `check` on the final revision, then report again");
    h.userTurn("reply");
    h.grants.set("reply-key", { agentRunId: id, stageId: "work", attempt: 1, taskId: "task-1", turnId: "reply" });
    const receipt = await h.runtime.runWorkspaceScript({ agentRunKey: "reply-key", scriptId: "check" });
    expect(receipt).toMatchObject({ exitCode: 0, verified: true, sourceRevision: revision, completedRevision: revision });
    await h.runtime.reportStage({ agentRunKey: "reply-key", report: { summary: "Checked final work" } });
    h.endTurn("reply"); await h.tick();
    expect(h.aggregate(id).agentRun.state).toBe("completed");
    expect(h.current(id).facts?.workspaceScripts?.[0]).toMatchObject({ source: "stave", exitCode: 0, verification: { sourceRevision: revision, completedRevision: revision }, durationMs: expect.any(Number) });
    expect(h.current(id).report).toMatchObject({ workspaceRevision: revision });
    const report = (await h.runtime.get({ agentRunId: id })).report!;
    expect(report.acceptanceCriteria).toContainEqual({ text: "Workspace checks pass", required: true, status: "met" });
    expect(report.stages[0]!.evidence).toContainEqual(expect.objectContaining({ source: "stave", exitCode: 0, freshness: "current" }));
  });
  test("script tool refuses non-run, read-only, unknown-script and action-stage callers", async () => {
    const h = checkedHarness();
    await expect(h.runtime.runWorkspaceScript({ agentRunKey: "missing", scriptId: "check" })).rejects.toThrow();
    const id = await startedAgentRun(h, input());
    await expect(h.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "unknown" })).rejects.toThrow("Unknown workspace action");
    const readonly = checkedHarness({ taskAgent: () => ({ ...agent, permission: "read-only" }) });
    await startedAgentRun(readonly, input());
    await expect(readonly.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "check" })).rejects.toThrow("read-only");
    const aggregate = h.aggregate(id);
    aggregate.agentRun.workflow.stages = [OPEN_PR];
    h.store.apply({ agentRun: aggregate.agentRun, upserts: [{ ...h.current(id), stageId: OPEN_PR.id }], events: [] }, new Date(START));
    h.grants.set("action-key", { agentRunId: id, stageId: OPEN_PR.id, attempt: 1, taskId: "task-1", turnId: "turn-1" });
    await expect(h.runtime.runWorkspaceScript({ agentRunKey: "action-key", scriptId: "check" })).rejects.toThrow("action stage");
  });
  test("failure records bounded host evidence; concurrent second invocation is refused", async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    const h = checkedHarness({ runWorkspaceScript: async () => {
      entered(); await pending;
      return { ...scriptMetadata, exitCode: 1, output: "x".repeat(4_000), verification: { sourceRevision: revision, completedRevision: revision } };
    } });
    const id = await startedAgentRun(h, input());
    const first = h.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "check" });
    await started;
    await expect(h.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "check" })).rejects.toThrow("already running");
    release();
    expect(await first).toMatchObject({ exitCode: 1, verified: false });
    expect(h.current(id).facts?.workspaceScripts?.[0]).toMatchObject({ source: "stave", exitCode: 1, outputTail: "x".repeat(2_000) });
  });
  test("retry preserves the required criterion and drops old attempt evidence", async () => {
    const h = checkedHarness();
    const id = await startedAgentRun(h, input());
    await h.runtime.reportStage({ agentRunKey: "key-turn-1", report: { summary: "done" } });
    h.endTurn("turn-1"); await h.tick();
    await h.runtime.retryStage({ agentRunId: id, stageId: "work", attempt: 1 });
    expect(h.aggregate(id).agentRun.workflow.stages[0]!.acceptanceCriteria?.[0]).toMatchObject({ verification: "stave-check" });
    expect(h.current(id).facts?.workspaceScripts).toBeUndefined();
  });
  test("a changed ignored check definition is refused and cannot satisfy acceptance", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "stave-frozen-check-"));
    try {
      execFileSync("git", ["init", "-b", "main"], { cwd });
      writeFileSync(join(cwd, ".gitignore"), ".stave/\n");
      execFileSync("git", ["add", ".gitignore"], { cwd });
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: seed ignored check"], { cwd });
      mkdirSync(join(cwd, ".stave"));
      const configure = (command: string) => writeFileSync(join(cwd, ".stave/scripts.json"), JSON.stringify({ version: 2, actions: { check: { commands: [command], target: "workspace" } } }));
      configure("exit 1");
      const before = await readWorkspaceRevision(cwd);
      let executions = 0;
      const h = checkedHarness({ resolveWorkspacePath: async () => cwd, readWorkspaceRevision,
        listWorkspaceActionScripts: async () => (await resolveScriptsForWorkspace({ repositoryPath: cwd, workspacePath: cwd }))!.actions.map(script => ({ scriptId: script.id,
          definitionHash: workspaceScriptDefinitionHash(script, { repositoryPath: cwd, workspacePath: cwd, workspaceName: "test", branch: "main" }) })),
        runWorkspaceScript: async () => { executions++; return { ...scriptMetadata, exitCode: 0, output: "", verification: { sourceRevision: revision, completedRevision: revision } }; },
      });
      h.setFacts({ ...EMPTY_STAGE_FACTS, workspaceRevision: before });
      const id = await startedAgentRun(h, input());
      configure("true");
      expect(await readWorkspaceRevision(cwd)).toEqual(before);
      await expect(h.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "check" })).rejects.toThrow("definition changed");
      expect(executions).toBe(0);
      await h.runtime.reportStage({ agentRunKey: "key-turn-1", report: { summary: "done", acceptanceCriteria: [{ text: "Workspace checks pass", status: "met" }] } });
      h.endTurn("turn-1"); await h.tick();
      expect(h.current(id)).toMatchObject({ status: "blocked", blockReason: "acceptance-unmet" });
      expect(h.current(id).facts?.workspaceScripts).toBeUndefined();
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  test("admission reads no revision; an unreadable revision keeps the default check and blocks the report with its reason", async () => {
    let reads = 0;
    const h = checkedHarness({ readWorkspaceRevision: async () => { reads++; return { status: "unknown", reason: "limit" }; } });
    const id = await startedAgentRun(h, input());
    expect(reads).toBe(0);
    expect(h.aggregate(id).agentRun.workflow.stages[0]!.acceptanceCriteria).toEqual([{ text: "Workspace checks pass", required: true, verification: "stave-check", scriptIds: ["check"], scriptDefinitions }]);
    expect(h.store.listEventsByKind(id, ["agent-run-started"])[0]!.detail.workspaceCheckNotice).toBeUndefined();
    await h.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "check" });
    await h.runtime.reportStage({ agentRunKey: "key-turn-1", report: { summary: "done", acceptanceCriteria: [{ text: "Workspace checks pass", status: "met" }] } });
    h.endTurn("turn-1"); await h.tick();
    expect(reads).toBeGreaterThan(0);
    expect(h.current(id)).toMatchObject({ status: "blocked", blockReason: "acceptance-unmet" });
    expect(h.current(id).detail).toContain("200-file");
  });
  test("an existing default criterion is upgraded in place and remains gated by the host check", async () => {
    const h = checkedHarness();
    h.setFacts({ ...EMPTY_STAGE_FACTS, workspaceRevision: revision });
    const start = input();
    start.workflow.stages[0]!.acceptanceCriteria = [{ text: "Workspace checks pass", verification: "agent-report" }];
    const id = await startedAgentRun(h, start);
    expect(h.aggregate(id).agentRun.workflow.stages[0]!.acceptanceCriteria).toEqual([{ text: "Workspace checks pass", required: true, verification: "stave-check", scriptIds: ["check"], scriptDefinitions }]);
    expect(h.store.listEventsByKind(id, ["agent-run-started"])[0]!.detail.workspaceCheckNotice).toBeUndefined();
    await h.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "check" });
    await h.runtime.reportStage({ agentRunKey: "key-turn-1", report: { summary: "done" } });
    h.endTurn("turn-1"); await h.tick();
    expect(h.aggregate(id).agentRun.state).toBe("completed");
  });
  test("reports without stave-check do not read revisions", async () => {
    let reads = 0;
    const h = checkedHarness({ readWorkspaceRevision: async () => { reads++; return revision; } });
    await startedAgentRun(h, startInput({ workflow: workflow([DRAFT]) }));
    await h.runtime.reportStage({ agentRunKey: "key-turn-1", report: { summary: "done" } });
    expect(reads).toBe(0);
  });
  test("Run again rebinds the previous workflow after a script edit and completes with the new host check", async () => {
    let definitions = scriptDefinitions;
    const custom = { ...agent, id: "custom-checker", workflow: [{ ...DRAFT, acceptanceCriteria: [{ text: "Custom checks pass", verification: "stave-check" }] }] } as AgentConfig;
    const h = checkedHarness({ taskAgent: () => custom, listWorkspaceActionScripts: async () => definitions,
      runWorkspaceScript: async () => ({ ...scriptMetadata, definitionHash: definitions[0]!.definitionHash, exitCode: 0, output: "passed", verification: { sourceRevision: revision, completedRevision: revision } }),
    });
    h.setFacts({ ...EMPTY_STAGE_FACTS, workspaceRevision: revision });
    let stages = custom.workflow!;
    for (const turn of [1, 2]) {
      const start = buildAgentRunStartInput({ workspaceId: "ws-1", taskId: "task-1", agent: { ...custom, workflow: stages }, assignment: "Check work", now: new Date(START) });
      const id = await startedAgentRun(h, start);
      stages = h.aggregate(id).agentRun.workflow.stages;
      expect(stages[0]!.acceptanceCriteria?.[0]?.scriptDefinitions).toEqual(definitions);
      expect(await h.runtime.runWorkspaceScript({ agentRunKey: `key-turn-${turn}`, scriptId: "check" })).toMatchObject({ verified: true });
      await h.runtime.reportStage({ agentRunKey: `key-turn-${turn}`, report: { summary: "Checked" } });
      h.endTurn(`turn-${turn}`); await h.tick();
      expect(h.aggregate(id).agentRun.state).toBe("completed");
      expect(h.current(id).facts?.workspaceScripts?.[0]?.definitionHash).toBe(definitions[0]!.definitionHash);
      definitions = [{ scriptId: "check", definitionHash: "b".repeat(64) }];
    }
  });
  test("explicit script subset completes with its selected action and missing actions refuse before persistence", async () => {
    const h = checkedHarness({ listWorkspaceActionScripts: async () => [...scriptDefinitions, { scriptId: "other", definitionHash: "b".repeat(64) }] });
    h.setFacts({ ...EMPTY_STAGE_FACTS, workspaceRevision: revision });
    const start = input();
    start.workflow.stages[0]!.acceptanceCriteria = [{ text: "Lint passes", verification: "stave-check", scriptIds: ["check"] }];
    const id = await startedAgentRun(h, start);
    expect(h.aggregate(id).agentRun.workflow.stages[0]!.acceptanceCriteria).toEqual([{ text: "Lint passes", verification: "stave-check", scriptIds: ["check"], scriptDefinitions }]);
    await h.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "check" });
    await h.runtime.reportStage({ agentRunKey: "key-turn-1", report: { summary: "Checked" } });
    h.endTurn("turn-1"); await h.tick();
    expect(h.aggregate(id).agentRun.state).toBe("completed");
    for (const scripts of [[], [{ scriptId: "other", definitionHash }]]) {
      const refused = checkedHarness({ listWorkspaceActionScripts: async () => scripts });
      await expect(refused.runtime.startAgentRun(start)).rejects.toThrow(scripts.length ? "'check'" : "no action script");
      expect(refused.store.listRecentAgentRuns()).toEqual([]);
      expect(refused.runCalls).toEqual([]);
    }
  });
  test("a check that modifies the tree returns its reason and blocks the final report", async () => {
    const changed = { status: "known" as const, revision: "modified-by-check" };
    const h = checkedHarness({ runWorkspaceScript: async () => ({ ...scriptMetadata, exitCode: 0, output: "", verification: { sourceRevision: revision, completedRevision: changed } }) });
    h.setFacts({ ...EMPTY_STAGE_FACTS, workspaceRevision: revision });
    const id = await startedAgentRun(h, input());
    expect(await h.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "check" })).toMatchObject({ verified: false, reason: expect.stringContaining("changed the workspace") });
    await h.runtime.reportStage({ agentRunKey: "key-turn-1", report: { summary: "done" } });
    h.endTurn("turn-1"); await h.tick();
    expect(h.current(id).detail).toContain("changed the workspace");
  });
  for (const action of ["pause", "cancel", "stop"] as const) test(`${action} aborts a running workspace script and fences its late evidence`, async () => {
    let signal!: AbortSignal;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const h = checkedHarness({ runWorkspaceScript: async args => { signal = args.signal; entered(); return new Promise(() => {}); } });
    const id = await startedAgentRun(h, input());
    const pending = h.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "check" }).catch(error => error);
    await started;
    if (action === "stop") h.runtime.stop(); else await h.runtime[action]({ agentRunId: id });
    expect(signal.aborted).toBe(true);
    expect(await pending).toBeInstanceOf(Error);
    expect(h.current(id).facts?.workspaceScripts).toBeUndefined();
  });

  for (const origin of ["agent", undefined] as const) for (const changed of [false, true]) test(`custom ${origin ?? "saved"} workflow ${changed ? "refuses a changed definition and blocks" : "completes with its own frozen stave-check"}`, async () => {
    const custom = { ...agent, id: "custom-checker", workflow: [{ ...DRAFT, id: "work", acceptanceCriteria: [{ text: "Custom checks pass", verification: "stave-check" }] }] } as AgentConfig;
    let definitions = scriptDefinitions;
    const h = checkedHarness({ taskAgent: () => custom, listWorkspaceActionScripts: async () => definitions });
    h.setFacts({ ...EMPTY_STAGE_FACTS, workspaceRevision: revision });
    const start = buildAgentRunStartInput({ workspaceId: "ws-1", taskId: "task-1", agent: custom, assignment: "Check custom work", now: new Date(START) });
    if (!origin) delete start.origin;
    const id = await startedAgentRun(h, start);
    expect(h.aggregate(id).agentRun.workflow.stages[0]!.acceptanceCriteria).toEqual([{ text: "Custom checks pass", verification: "stave-check", scriptIds: ["check"], scriptDefinitions }]);
    if (changed) {
      definitions = [{ scriptId: "check", definitionHash: "b".repeat(64) }];
      await expect(h.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "check" })).rejects.toThrow("definition changed");
    } else expect(await h.runtime.runWorkspaceScript({ agentRunKey: "key-turn-1", scriptId: "check" })).toMatchObject({ verified: true });
    await h.runtime.reportStage({ agentRunKey: "key-turn-1", report: { summary: "done", acceptanceCriteria: [{ text: "Custom checks pass", status: "met" }] } });
    h.endTurn("turn-1"); await h.tick();
    if (changed) expect(h.current(id)).toMatchObject({ status: "blocked", blockReason: "acceptance-unmet" });
    else expect(h.aggregate(id).agentRun.state).toBe("completed");
  });
  test("a skipped-default notice survives stage retry and appears once in the final report", async () => {
    const h = checkedHarness();
    const start = input();
    // Twenty optional criteria fill the stage, so the default check cannot be inserted.
    start.workflow.stages[0]!.acceptanceCriteria = Array.from({ length: 20 }, (_, i) => ({ text: `Criterion ${i}`, required: false }));
    const id = await startedAgentRun(h, start);
    const notice = h.current(id).facts!.workspaceCheckNotice;
    expect(notice).toContain("invalid");
    expect(h.store.listEventsByKind(id, ["agent-run-started"])[0]!.detail.workspaceCheckNotice).toBe(notice);
    expect(h.aggregate(id).agentRun.workflow.stages[0]!.acceptanceCriteria).toHaveLength(20);
    await h.runtime.blockStage({ agentRunKey: "key-turn-1", block: { missing: "Retry this stage", kind: "environment" } });
    h.endTurn("turn-1"); await h.tick();
    await h.runtime.retryStage({ agentRunId: id, stageId: "work", attempt: 1 });
    await h.tick();
    expect(h.current(id).attempt).toBe(2);
    expect(h.current(id).facts?.workspaceCheckNotice).toBe(notice);
    expect(h.current(id).facts?.workspaceScripts).toBeUndefined();
    await h.runtime.reportStage({ agentRunKey: "key-turn-2", report: { summary: "done" } });
    h.endTurn("turn-2"); await h.tick();
    expect(h.aggregate(id).agentRun.state).toBe("completed");
    const report = (await h.runtime.get({ agentRunId: id })).report!;
    expect(report.stages[0]!.evidence.filter(entry => entry.label === notice)).toHaveLength(1);
  });

});
