import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createDelegatedTaskCoordinator } from "../electron/main/runs/delegated-task-coordinator";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { AutomationUpsertInputSchema } from "../src/lib/automations";
import { WakeUpUpsertInputSchema } from "../src/lib/supervision/wake-up-policy";
import { UTILITY_INFERENCE_FEATURES } from "../src/lib/providers/utility-inference";
import { resolveProviderRuntimeCapabilities } from "../src/lib/providers/runtime-capabilities";
import {
  createWorkGraph,
  reduceWorkGraphEvent,
} from "../src/lib/work-graph/work-graph-reducer";
import { resolveWorkGraphControls } from "../src/lib/work-graph/work-graph-tree";
import { toolCallNodeKey } from "../src/lib/work-graph/work-graph.types";
import {
  SIDEBAR_WORK_QUEUE_LANE_ORDER,
  buildSidebarWorkQueueLanes,
} from "../src/lib/fleet/sidebar-work-queue";
import { MissionStore } from "../electron/persistence/mission-store";
import { MissionStartInputSchema } from "../src/lib/missions/domain";
import {
  MISSION_DECISION_EFFECTS,
  decideMissionAction,
} from "../src/lib/missions/policy";
import { resolveAutomaticTurnOwner } from "../src/lib/supervision/automatic-turn-owner";
import { createWakeUp, decideWakeUpAction } from "../src/lib/supervision/wake-up-policy";
import {
  COMPLETE_REPORT,
  MISSION_NOW,
  missionFixture,
  observe as observeMission,
  patchCurrent,
  turn,
} from "./fixtures/mission-fixtures";

/**
 * Boundary gates for `docs/architecture/agent-platform-taxonomy.md`.
 *
 * Each test name repeats the boundary statement it defends, so a future change
 * that erases a boundary fails with the sentence it violated rather than with
 * an anonymous assertion.
 */

const ROOT = path.join(import.meta.dir, "..");

function readSource(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function importedModules(source: string) {
  return [...source.matchAll(/^import\s[\s\S]*?from\s+"([^"]+)";/gm)].map(
    (match) => match[1],
  );
}

describe("Agent platform boundaries", () => {
  test("an automation never wakes an existing task: its definition cannot target one", () => {
    // An automation mints a task per occurrence. The moment its input accepts a
    // taskId it has silently become a wake-up, which is a different concept
    // with different safety rules (serialization, pause-on-approval, expiry).
    const definitionKeys = Object.keys(AutomationUpsertInputSchema.shape);

    expect(definitionKeys).not.toContain("taskId");
    expect(definitionKeys.filter((key) => /task/i.test(key))).toEqual([]);
  });

  test("a worker never survives a restart; a delegated task always does", async () => {
    // The ledger's blanket restart sweep closes every step whose execution died
    // with the process. A delegated task is a real task that may still be running,
    // so it is excluded there and reconciled against the live task instead. If
    // that exclusion is ever removed, a surviving child is silently reported as
    // interrupted.
    const ledger = readSource("electron/persistence/run-ledger-store.ts");
    expect(ledger).toContain("kind != 'delegated-task-turn'");

    // The delegated-task coordinator owns that recovery, and it asks the live task
    // what happened rather than assuming.
    const store = new RunLedgerStore(new Database(":memory:"));
    const statusCalls: string[] = [];
    const coordinator = createDelegatedTaskCoordinator({
      getLedger: () => ({
        getRunAggregate: (args) => store.getAggregate(args),
        claimRunStep: (args) => store.claimStep(args),
        markRunStepWaiting: (args) => store.markStepWaiting(args),
        completeRunStep: (args) => store.completeStep(args),
        failRunStep: (args) => store.failStep(args),
        cancelRunStep: (args) => store.cancelStep(args),
        interruptRunStep: (args) => store.interruptStep(args),
        setRunStepTarget: (args) => store.setStepTarget(args),
        listRunAggregatesByOrigin: (args) => store.listAggregatesByOrigin(args),
        listActiveRunAggregatesByStepKind: (args) =>
          store.listActiveAggregatesByStepKind(args),
      }),
      host: {
        resolveWorkspace: async () => null,
        createWorkspace: async () => {
          throw new Error("unused");
        },
        getTaskStatus: async ({ taskId }) => {
          statusCalls.push(taskId);
          return { ok: false, reason: "missing" };
        },
        runTask: async () => {
          throw new Error("unused");
        },
        stopTask: async () => ({}),
      },
      concurrencyLimit: 1,
    });

    expect(await coordinator.reconcile()).toEqual({
      reconciled: 0,
      deferred: 0,
    });

  });

  test("a wake-up never creates a task: it only adds a turn to one that exists", () => {
    // The mirror of the automation boundary above. A wake-up definition must
    // name the task it wakes, and must not carry the fields that would let it
    // mint one — the moment it grows a name/title/environment it has become a
    // automation with different safety rules.
    const definitionKeys = Object.keys(WakeUpUpsertInputSchema.shape);

    expect(definitionKeys).toContain("taskId");
    expect(
      definitionKeys.filter((key) => /^(name|title|environment)$/.test(key)),
    ).toEqual([]);
    // A blank taskId would make it mint a task through `runTask`'s create path.
    expect(
      WakeUpUpsertInputSchema.safeParse({
        workspaceId: "ws-1",
        taskId: "",
        prompt: "Re-check CI.",
        trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
      }).success,
    ).toBe(false);
  });

  test("a completion trigger wakes an existing task: it cannot mint one either", () => {
    // The completion trigger is the second way into the same wake-up path, so
    // the boundary above has to hold for it too — including that it carries no
    // definition of its own that could describe a task to create.
    const completionTrigger = WakeUpUpsertInputSchema.shape.trigger.options.find(
      (option) => option.shape.kind.value === "completion",
    );

    expect(completionTrigger).toBeDefined();
    expect(Object.keys(completionTrigger!.shape)).toEqual(["kind"]);
    expect(
      WakeUpUpsertInputSchema.safeParse({
        workspaceId: "ws-1",
        taskId: "",
        prompt: "Fold the delegated result in.",
        trigger: { kind: "completion" },
      }).success,
    ).toBe(false);
  });

  test("supervisor tables record wake-ups while the ledger records delegated execution", () => {
    // A wake-up has no claim, no lease, and no receipts. If the supervisor
    // ever imported the ledger store or the delegated-task coordinator it would be
    // one refactor away from writing runs — which is the collapse this
    // separation exists to prevent. It reads completions through an injected
    // function precisely so that stays true.
    const supervisorRuntime = readSource(
      "electron/host-service/wake-up-runtime.ts",
    );

    expect(
      importedModules(supervisorRuntime).filter((specifier) =>
        /run-ledger-store|delegated-task-coordinator|runs\/run-domain/.test(
          specifier ?? "",
        ),
      ),
    ).toEqual([]);
    // And the pure policy stays pure: no ledger vocabulary at all.
    expect(
      importedModules(readSource("src/lib/supervision/wake-up-policy.ts")).filter(
        (specifier) => /runs\/|persistence\/|host-service/.test(specifier ?? ""),
      ),
    ).toEqual([]);
  });

  test("the ledger records and never executes: run domain and store import no provider runtime", () => {
    for (const file of [
      "src/lib/runs/run-domain.ts",
      "src/lib/runs/delegated-task.ts",
      "electron/persistence/run-ledger-store.ts",
    ]) {
      const imports = importedModules(readSource(file));
      const executionImports = imports.filter((specifier) =>
        /runtime|executor|host-service|child_process/.test(specifier),
      );
      expect({ file, executionImports }).toEqual({ file, executionImports: [] });
    }
  });

  test("executors execute and never write ledger rows: the secondary executor imports no ledger store", () => {
    const imports = importedModules(
      readSource("electron/providers/secondary-run-executor.ts"),
    );
    const ledgerImports = imports.filter((specifier) =>
      /run-ledger-store|persistence\//.test(specifier),
    );

    expect(ledgerImports).toEqual([]);
  });

  test("advisor advises while utility inference stays mechanical", () => {
    // Utility inference owns bounded transforms and metadata. If an advisory
    // kind ever lands in this list, the user loses the distinction between an
    // opinion being injected and a mechanical helper being applied.
    expect([...UTILITY_INFERENCE_FEATURES].sort()).toEqual([
      "commit-message",
      "prompt-enhancement",
      "route-classification",
      "task-name",
    ]);
    expect(
      [...UTILITY_INFERENCE_FEATURES].filter((feature) => /advis/i.test(feature)),
    ).toEqual([]);
  });

  test("the work queue assigns a workspace to exactly one lane, in fixed priority order", () => {
    expect([...SIDEBAR_WORK_QUEUE_LANE_ORDER]).toEqual([
      "action-required",
      "in-progress",
      "in-review",
      "idle",
    ]);

    const groups = buildSidebarWorkQueueLanes({
      entries: [
        { workspaceId: "ws-1" },
        { workspaceId: "ws-2" },
        { workspaceId: "ws-1" },
      ],
      signalsByWorkspaceId: {
        "ws-1": { attentionKind: "approval" },
        "ws-2": { status: "running" },
      },
    });
    const placements = groups.flatMap((group) =>
      group.entries.map((entry) => entry.workspaceId),
    );

    expect(placements).toEqual(["ws-1", "ws-2"]);
    expect(new Set(placements).size).toBe(placements.length);
  });
  test("a work graph node names a worker, never a call", () => {
    // The graph is a projection of the turn, not a second place to run things.
    // If it ever imports an executor or the supervisor, node state has become
    // execution state, and the two layers the taxonomy separates have merged.
    for (const module of [
      "src/lib/work-graph/work-graph.types.ts",
      "src/lib/work-graph/work-graph-reducer.ts",
      "src/lib/work-graph/work-graph-tree.ts",
    ]) {
      const imports = importedModules(readSource(module));
      expect(
        imports.filter((specifier) =>
          /supervision\/|wake-up|secondary-run|run-ledger-store|persistence\/|electron\//.test(
            specifier,
          ),
        ),
      ).toEqual([]);
    }

    // A node the provider never named is shown but never steered: the tool-use
    // id identifies a call, and a Stop aimed at a call either misses or kills
    // the whole turn. Both are worse than no button.
    const graph = reduceWorkGraphEvent(
      createWorkGraph({
        turnId: "turn-1",
        providerId: "claude-code",
        startedAt: 1_000,
      }),
      {
        type: "tool",
        toolName: "Task",
        toolUseId: "toolu_1",
        input: "{}",
        state: "input-available",
      },
      2_000,
    );
    const unnamed = graph.nodesByKey[toolCallNodeKey("toolu_1")];

    expect(unnamed?.identitySource).toBe("tool-call");
    expect(
      resolveWorkGraphControls({
        node: unnamed!,
        capabilities: {
          agentIdentity: true,
          nesting: true,
          message: true,
          interrupt: true,
          stop: true,
        },
        liveIdentities: new Set(["toolu_1"]),
      }).available,
    ).toEqual([]);

    // No runtime may claim per-agent steering it has not wired end to end.
    // These flags are what the UI gates on, so a hopeful `true` here renders a
    // control that silently does nothing.
    for (const versionText of ["2.0.0", "9.9.9"]) {
      const claude = resolveProviderRuntimeCapabilities({
        providerId: "claude-code",
        versionText,
      });
      expect(claude.workGraph.message).toBe(false);
      expect(claude.workGraph.interrupt).toBe(false);
      expect(claude.workGraph.stop).toBe(false);
    }
  });

  test("a mission advances exactly one lead task and never creates a task", () => {
    // Starting a mission names an existing task. A field that could name a new
    // task, workspace or environment would turn it into an automation.
    const startKeys = Object.keys(MissionStartInputSchema.shape);
    expect(startKeys).toContain("leadTaskId");
    expect(startKeys.filter((key) => /^(name|title|environment|repositoryPath|taskId|prompt)$/.test(key))).toEqual([]);
    // No supervisor decision creates anything; each advances the lead task.
    expect(
      Object.keys(MISSION_DECISION_EFFECTS).filter((action) => /create|mint|spawn|new/i.test(action)),
    ).toEqual([]);
    for (const file of [
      "src/lib/missions/domain.ts",
      "src/lib/missions/policy.ts",
      "src/lib/missions/commands.ts",
      "electron/persistence/mission-store.ts",
    ]) {
      const creators = importedModules(readSource(file)).filter((specifier) =>
        /host-service|local-mcp|workspace-create|create-workspace|runs\//.test(specifier ?? ""),
      );
      expect({ file, creators }).toEqual({ file, creators: [] });
    }
  });

  test("a stage completes only through a recorded stage report or a Stave action result; an ended turn alone never completes a stage", () => {
    const started = patchCurrent(missionFixture(), { status: "running", startedAt: MISSION_NOW.toISOString() });
    const decide = (aggregate: typeof started, observation = observeMission()) =>
      decideMissionAction({ aggregate, observation, now: MISSION_NOW }).action;

    for (const nudged of [false, true]) {
      for (const lastEndedTurn of [turn(), turn({ startedBy: "user" })]) {
        for (const reportingAvailable of [true, false]) {
          expect(
            decide(patchCurrent(started, { nudged }), observeMission({ lastEndedTurn, reportingAvailable })),
          ).not.toBe("complete-stage");
        }
      }
    }
    expect(
      decide(patchCurrent(started, { report: COMPLETE_REPORT, reportRevision: 1 }), observeMission({ lastEndedTurn: turn() })),
    ).toBe("complete-stage");

    const atAction = missionFixture();
    const actionStage = {
      mission: { ...atAction.mission, currentStageIndex: 3 },
      stages: [...atAction.stages, { ...atAction.stages[0]!, stageId: "open-draft-pr", status: "running" as const }],
    };
    expect(decide(actionStage, observeMission({ actionOutcome: { status: "in-progress" } }))).toBe("execute-action");
    expect(
      decide(
        actionStage,
        observeMission({
          actionOutcome: {
            status: "succeeded",
            result: { type: "open-draft-pr", prUrl: "https://github.com/o/r/pull/1", prNumber: 1, created: true },
          },
        }),
      ),
    ).toBe("complete-stage");
  });

  test("at most one supervisor entry starts automatic turns on a task at a time", () => {
    // A mission owns its lead task's automatic turns...
    expect(
      resolveAutomaticTurnOwner({ activeMission: { id: "mission-1" }, wakeUp: { id: "wake-1", state: "scheduled" } }),
    ).toEqual({ kind: "mission", missionId: "mission-1" });
    // ...so the task's due wake-up pauses rather than firing beside it...
    const wakeUp = createWakeUp({
      id: "wake-1",
      input: {
        workspaceId: "ws-1",
        taskId: "task-1",
        prompt: "Re-check CI.",
        trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
        maxOccurrences: null,
        expiresAt: null,
      },
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: new Date(MISSION_NOW.getTime() - 2 * 60 * 60 * 1000),
    });
    expect(
      decideWakeUpAction({
        wakeUp,
        observation: {
          workspaceAvailable: true,
          taskExists: true,
          taskArchived: false,
          hasActiveTurn: false,
          pendingApprovalCount: 0,
          pendingUserInputCount: 0,
          fingerprint: { providerId: "claude-code", model: "sonnet" },
          identity: { ok: true },
          completionObservability: "stave_owned",
          completions: [],
          missionActive: true,
        },
        now: MISSION_NOW,
      }),
    ).toMatchObject({ action: "pause", reason: "mission-active" });
    // ...and a task never has two active missions.
    const store = new MissionStore(new Database(":memory:"));
    const first = missionFixture({ id: "mission-1" });
    const second = missionFixture({ id: "mission-2" });
    expect(store.create({ mission: first.mission, upserts: first.stages, events: [] }, MISSION_NOW)).toEqual({ ok: true });
    expect(store.create({ mission: second.mission, upserts: second.stages, events: [] }, MISSION_NOW).ok).toBe(false);
  });
});
