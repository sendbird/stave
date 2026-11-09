import { beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { applyAppLocale } from "@/i18n";
import { buildFleetAttentionProjection } from "@/lib/fleet/attention-projection";
import { collectTarsAttention, selectTarsAttentionRows } from "@/lib/tars/attention";
import { buildTarsTray } from "@/lib/tars/tray-model";
import type { TarsResponsibility } from "@/lib/tars/types";
import { tarsHelperObservation } from "../electron/host-service/tars-execution";
import { helperRunDetail, leadRunDetail, TEAM } from "./fixtures/tars-helper-runs";
import { followUpFixture } from "./tars-follow-up-fixture";

// A Tars responsibility's lead run delegated a supervised helper, and the
// helper's stage blocked to ask the user. The helper stays `running` with a
// blocked stage (the run engine's wait for a reply in the helper's task), the
// lead keeps waiting in its own stage, and Fleet shows the helper's row. Tars
// must say the work waits on the user and count that same row.

beforeEach(async () => { await applyAppLocale("en"); });

describe("a helper of the run that waits on the user", () => {
  test("a helper's asking stage is the team asking: an immediate ask on the helper's task", () => {
    for (const status of ["blocked", "stuck", "awaiting-sign-off"] as const)
      expect(tarsHelperObservation([{ detail: helperRunDetail({ status, turnCount: 2 }), pendingRequests: 0 }])).toEqual({
        state: "waiting", detail: TEAM.question, stageAsksUser: true, waitingTaskId: TEAM.helperTaskId, runTurns: 2,
        runStage: `${TEAM.helperRunId}/${helperRunDetail().agentRun.workflow.stages[0]!.id}#1` });
    expect(tarsHelperObservation([{ detail: helperRunDetail({ status: "running" }), pendingRequests: 0 }])).toBeNull();
    expect(tarsHelperObservation([])).toBeNull();
  });

  test("a paused helper or a request in its task is a plain wait; the user's own pause or a usage reset is not a wait", () => {
    const paused = tarsHelperObservation([{ detail: helperRunDetail({ status: "running", state: "paused", pauseReason: "wait-expired" }), pendingRequests: 0 }]);
    expect(paused).toMatchObject({ state: "waiting", detailCode: "runPaused", detailParams: { reason: "wait-expired" }, waitingTaskId: TEAM.helperTaskId });
    expect(paused).not.toHaveProperty("stageAsksUser");
    expect(tarsHelperObservation([{ detail: helperRunDetail({ status: "running", state: "paused", pauseReason: "paused-by-user" }), pendingRequests: 0 }])).toBeNull();
    const request = tarsHelperObservation([{ detail: helperRunDetail({ status: "running" }), pendingRequests: 1 }]);
    expect(request).toMatchObject({ state: "waiting", detailCode: "waitingForUser", waitingTaskId: TEAM.helperTaskId });
    expect(request).not.toHaveProperty("stageAsksUser");
    // An asking helper is said before a plain wait of another helper.
    const asking = helperRunDetail({ status: "blocked" });
    const other = helperRunDetail({ status: "running" });
    expect(tarsHelperObservation([{ detail: { ...other, agentRun: { ...other.agentRun, id: "other", leadTaskId: "task-other" } }, pendingRequests: 1 },
      { detail: asking, pendingRequests: 0 }])).toMatchObject({ stageAsksUser: true, waitingTaskId: TEAM.helperTaskId });
  });
});

/**
 * The actual host observation over a real Tars store, with the task and run
 * services faked: the helper blocks after a restart that interrupted its turn,
 * the app restarts again while it waits, then the user answers it.
 */
function runHostScenario() {
  const source = `
    import { mock } from "bun:test";
    import { Database } from "bun:sqlite";
    import { mkdtempSync, rmSync } from "node:fs";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import { TarsStore } from "./electron/persistence/tars-store";
    import { TEAM, helperAuthority, helperRunDetail, leadRunDetail } from "./tests/fixtures/tars-helper-runs";
    const directory = mkdtempSync(path.join(tmpdir(), "tars-helper-wait-"));
    const filename = path.join(directory, "store.sqlite");
    const now = "2026-11-05T00:00:00.000Z";
    let db = new Database(filename);
    let tars = new TarsStore(db);
    const created = tars.create({ requestId: "helper-wait", title: "Add subtract", instruction: "Add subtract with a test",
      acceptanceCriteria: ["bun test passes"], workspaceId: "source", repositoryPath: TEAM.repositoryPath, providerId: "codex" }, now);
    const id = created.id, taskId = "tars-" + id;
    tars.patch(id, created.revision, { state: "running", taskId, executionWorkspaceId: TEAM.workspaceId, agentRunId: TEAM.leadRunId }, now);
    let helper = helperRunDetail({ status: "running" });
    const lead = () => leadRunDetail(tars.get(id));
    const active = (run) => run.state === "running" || run.state === "paused";
    const assignment = { id: "assignment", endedAt: null, requestId: "tars-" + id, taskId, workspaceId: TEAM.workspaceId, providerId: "codex",
      repositoryPath: TEAM.repositoryPath };
    const persistence = {
      tars,
      tarsConversations: { getSettings: () => null },
      agentAssignments: { getByTaskId: () => assignment, getByRequestId: () => assignment },
      agentRuns: {
        getLatestAgentRunForTask: (task) => task === taskId ? lead().agentRun : null,
        listActiveAgentRuns: () => [lead().agentRun, helper.agentRun].filter(active),
        listEventsByKind: (runId, kinds) => runId === TEAM.helperRunId && kinds.includes("agent-run-started")
          ? [{ kind: "agent-run-started", detail: { delegation: helperAuthority(taskId) } }] : [],
      },
    };
    mock.module("./electron/host-service/persistence", () => ({ ensureHostServicePersistenceReady: () => persistence }));
    mock.module("./electron/host-service/supervision/assign-host", () => ({ hostAgents: () => [] }));
    mock.module("./electron/providers/runtime", () => ({ providerRuntime: {} }));
    mock.module("./electron/host-service/local-mcp-runtime", () => ({
      getTaskSupervisionSnapshot: async () => ({ exists: true, archived: false, repositoryPath: TEAM.repositoryPath,
        pendingApprovalCount: 0, pendingUserInputCount: 0, activeTurnId: null }),
      listKnownRepositories: async () => [],
    }));
    const { createHostTarsRuntime } = await import("./electron/host-service/tars-host");
    const agentRuns = { get: async ({ agentRunId }) => agentRunId === TEAM.leadRunId ? lead() : helper };
    let runtime = createHostTarsRuntime({ agentRuns, assignments: {} });
    const restart = () => { runtime.stop(); db.close(); db = new Database(filename); tars = new TarsStore(db); persistence.tars = tars;
      runtime = createHostTarsRuntime({ agentRuns, assignments: {} }); };
    const tick = async () => { runtime.requestTick(); await runtime.drain(); };
    const look = () => ({ row: tars.get(id), asks: tars.events.listRecent(100).filter((event) => event.kind === "stageAsksUser").length });
    const steps = {};
    await tick(); steps.working = look();
    // The app restarts while the helper's first turn is in flight; the recovered helper then blocks.
    restart(); helper = helperRunDetail({ status: "blocked", turnCount: 2, interrupted: true });
    await tick(); await tick(); await tick(); steps.blocked = look();
    restart(); await tick(); await tick(); steps.afterRestart = look();
    // The user answers in the helper's task: its stage runs again.
    helper = helperRunDetail({ status: "running", turnCount: 3 });
    await tick(); steps.answered = look();
    runtime.stop(); db.close(); rmSync(directory, { recursive: true, force: true });
    console.log(JSON.stringify(steps));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  return JSON.parse(result.stdout.toString()) as Record<"working" | "blocked" | "afterRestart" | "answered", { row: TarsResponsibility; asks: number }>;
}

/** Fleet's projection over the lead and helper runs, and the tray read from it. */
function fleetAndTray(row: TarsResponsibility, helper: ReturnType<typeof helperRunDetail>) {
  const place = { repositoryPath: TEAM.repositoryPath, repositoryName: "repo", workspaceId: TEAM.workspaceId, workspaceName: "Execution" };
  const projection = buildFleetAttentionProjection({ notifications: [], liveWorkspaces: [], prWorkspaces: [],
    agentRuns: [{ ...place, detail: leadRunDetail(row) }, { ...place, detail: helper }],
    tarsAttention: collectTarsAttention({ responsibilities: [row] }) });
  const tray = buildTarsTray({ responsibilities: [row], attentionItems: projection.items, runs: {} });
  return { actionRequired: projection.blockingItems.length, needsYou: tray.counts.needsYou, lane: tray.lanes.needsYou.length ? "needsYou" : "running" };
}

describe("the host observes the helper's wait, once, across restarts, and the tray agrees with Fleet", () => {
  const steps = runHostScenario();

  test("the responsibility waits on the user while the helper asks, and runs again once it is answered", () => {
    expect(steps.working.row).toMatchObject({ state: "running" });
    expect(steps.blocked.row).toMatchObject({ state: "waiting", detail: TEAM.question, stageAsksUser: true, waitingTaskId: TEAM.helperTaskId,
      observedTurns: 2 });
    expect(steps.afterRestart.row).toMatchObject({ state: "waiting", stageAsksUser: true, waitingTaskId: TEAM.helperTaskId });
    // Unchanged looks, before and after a restart, save nothing.
    expect(steps.afterRestart.row.revision).toBe(steps.blocked.row.revision);
    expect(steps.answered.row).toMatchObject({ state: "running", detail: null });
    expect(steps.answered.row).not.toHaveProperty("waitingTaskId");
    expect(steps.answered.row).not.toHaveProperty("stageAsksUser");
  });

  test("the ask is one judgment event: its immediate follow-up can start once, and no restart or later look adds another", () => {
    expect(steps.working.asks).toBe(0);
    expect(steps.blocked.asks).toBe(1);
    expect(steps.afterRestart.asks).toBe(1);
    expect(steps.answered.asks).toBe(1);
  });

  test("Fleet parity: the tray counts the helper's Action required row for the responsibility", () => {
    const blocked = fleetAndTray(steps.blocked.row, helperRunDetail({ status: "blocked", turnCount: 2, interrupted: true }));
    expect(blocked).toEqual({ actionRequired: 1, needsYou: 1, lane: "needsYou" });
    const answered = fleetAndTray(steps.answered.row, helperRunDetail({ status: "running", turnCount: 3 }));
    expect(answered).toEqual({ actionRequired: 0, needsYou: 0, lane: "running" });
  });

  test("a helper task is attributed only while the work waits on it", () => {
    const row = { ...steps.blocked.row, state: "running" as const };
    expect(selectTarsAttentionRows([{ taskId: TEAM.helperTaskId }], [row]).rows).toHaveLength(0);
    expect(selectTarsAttentionRows([{ taskId: TEAM.helperTaskId }], [steps.blocked.row]).responsibilityIds).toEqual(new Set([steps.blocked.row.id]));
  });
});

test("the helper's ask reaches the real follow-up path once: planner prompt, run admission and answer", async () => {
  const f = followUpFixture({ replies: [{ reply: "The helper asks whether it may edit vendor/. Decide in its task.", actions: [] }] });
  try {
    f.service.start();
    const row = f.responsibility("running");
    await f.settle();
    f.observations.set(row.id, tarsHelperObservation([{ detail: helperRunDetail({ status: "blocked", turnCount: 2, interrupted: true }), pendingRequests: 0 }])!);
    await f.settle(); await f.settle();
    expect(f.automatic().map((message) => [message.origin?.kind === "followUp" ? message.origin.reason : null, message.state, message.error])).toEqual([["stageAsksUser", "answered", null]]);
    expect(f.planner).toHaveLength(1);
    expect(f.planner[0]!.input.prompt).toContain(JSON.stringify(TEAM.question).slice(1, -1));
    expect(f.errors).toEqual([]);
  } finally { await f.close(); }
});
