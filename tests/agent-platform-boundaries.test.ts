import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RoutineUpsertInputSchema } from "../src/lib/routines";
import { TaskHeartbeatUpsertInputSchema } from "../src/lib/automation/task-supervisor";
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

  test("a heartbeat never creates a task: it only adds a turn to one that exists", () => {
    // The mirror of the routine boundary above. A heartbeat definition must
    // name the task it wakes, and must not carry the fields that would let it
    // mint one — the moment it grows a name/title/environment it has become a
    // routine with different safety rules.
    const definitionKeys = Object.keys(TaskHeartbeatUpsertInputSchema.shape);

    expect(definitionKeys).toContain("taskId");
    expect(
      definitionKeys.filter((key) => /^(name|title|environment)$/.test(key)),
    ).toEqual([]);
    // A blank taskId would make it mint a task through `runTask`'s create path.
    expect(
      TaskHeartbeatUpsertInputSchema.safeParse({
        workspaceId: "ws-1",
        taskId: "",
        prompt: "Re-check CI.",
        trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
      }).success,
    ).toBe(false);
  });

  test("the ledger records and never executes: run domain and store import no provider runtime", () => {
    for (const file of [
      "src/lib/runs/run-domain.ts",
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
