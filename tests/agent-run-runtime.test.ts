import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

describe("run runtime: permissions a turn runs with", () => {
  const USER_SETTINGS = {
    "claude-code": { claudePermissionMode: "auto" as const, claudeSandboxEnabled: false },
    codex: { codexApprovalPolicy: "never" as const, codexFileAccess: "danger-full-access" as const },
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

  test("Auto and Guided keep their explicit consent over the user's settings", async () => {
    const guided = createHarness({ userPermissionOptions });
    await startedAgentRun(guided);
    expect(guided.runCalls[0]?.runtimeOptions).toEqual({
      claudePermissionMode: "default",
      claudeAllowDangerouslySkipPermissions: false,
    });
    const auto = createHarness({ userPermissionOptions });
    auto.setSnapshot({ providerId: "codex", model: "gpt-5" });
    await startedAgentRun(auto, startInput({ consent: { ...manual, permissionMode: "auto" } }));
    expect(auto.runCalls[0]?.runtimeOptions).toEqual({ codexApprovalPolicy: "never" });
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
    const agentRunId = await startedAgentRun(first);

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
