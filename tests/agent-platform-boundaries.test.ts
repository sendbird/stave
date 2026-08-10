import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createChildTaskCoordinator } from "../electron/main/runs/child-task-coordinator";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { RoutineUpsertInputSchema } from "../src/lib/routines";
import { UTILITY_INFERENCE_FEATURES } from "../src/lib/providers/utility-inference";
import {
  SIDEBAR_WORK_QUEUE_LANE_ORDER,
  buildSidebarWorkQueueLanes,
} from "../src/lib/fleet/sidebar-work-queue";

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
  test("a routine never wakes an existing task: its definition cannot target one", () => {
    // A routine mints a task per occurrence. The moment its input accepts a
    // taskId it has silently become a heartbeat, which is a different concept
    // with different safety rules (serialization, pause-on-approval, expiry).
    const definitionKeys = Object.keys(RoutineUpsertInputSchema.shape);

    expect(definitionKeys).not.toContain("taskId");
    expect(definitionKeys.filter((key) => /task/i.test(key))).toEqual([]);
  });

  test("a worker never survives a restart; a child task always does", async () => {
    // The ledger's blanket restart sweep closes every step whose execution died
    // with the process. A child task is a real task that may still be running,
    // so it is excluded there and reconciled against the live task instead. If
    // that exclusion is ever removed, a surviving child is silently reported as
    // interrupted.
    const ledger = readSource("electron/persistence/run-ledger-store.ts");
    expect(ledger).toContain("kind != 'child-task-turn'");

    // The child-task coordinator owns that recovery, and it asks the live task
    // what happened rather than assuming.
    const store = new RunLedgerStore(new Database(":memory:"));
    const statusCalls: string[] = [];
    const coordinator = createChildTaskCoordinator({
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

    // A worker is turn-scoped: it has no durable record to reconcile.
    const workerImports = importedModules(
      readSource("src/lib/providers/worker-mode.ts"),
    );
    expect(
      workerImports.filter((specifier) =>
        /run-ledger-store|runs\/child-task|persistence\//.test(specifier),
      ),
    ).toEqual([]);
  });

  test("the ledger records and never executes: run domain and store import no provider runtime", () => {
    for (const file of [
      "src/lib/runs/run-domain.ts",
      "src/lib/runs/child-task.ts",
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

  test("advisor advises content while utility inference computes metadata", () => {
    // Utility inference is the mechanical half. If an advisory kind ever lands
    // in this list, the two surfaces have merged and the user loses the
    // distinction between "an opinion was injected" and "a label was computed".
    expect([...UTILITY_INFERENCE_FEATURES].sort()).toEqual([
      "commit-message",
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
});
