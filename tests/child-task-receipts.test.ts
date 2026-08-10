import { describe, expect, test } from "bun:test";
import { buildChildTaskReceiptsRetrievedContext } from "../src/lib/task-context/child-task-receipts";
import type { ChildTaskSummary } from "../src/lib/runs/child-task";

function summary(overrides: Partial<ChildTaskSummary> = {}): ChildTaskSummary {
  return {
    runId: "child-task:parent-1:docs",
    stepId: "child-task:parent-1:docs:turn",
    parentTaskId: "parent-1",
    delegationKey: "docs",
    childTaskId: "child-1",
    childWorkspaceId: "workspace-child",
    childTurnId: "turn-1",
    providerId: "codex",
    lifecycle: "one-turn",
    phase: "completed",
    reason: null,
    attempt: 1,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:05:00.000Z",
    completedAt: "2026-08-10T00:05:00.000Z",
    ...overrides,
  };
}

describe("child task receipts context", () => {
  test("a task with no delegations injects nothing", () => {
    expect(buildChildTaskReceiptsRetrievedContext({ children: [] })).toBeNull();
  });

  test("renders identity, phase and reason with live children first", () => {
    const part = buildChildTaskReceiptsRetrievedContext({
      children: [
        summary({ delegationKey: "finished", phase: "completed" }),
        summary({
          delegationKey: "live",
          phase: "running",
          childTaskId: "child-2",
          reason: null,
        }),
        summary({
          delegationKey: "broken",
          phase: "failed",
          childTaskId: "child-3",
          reason: "Provider exploded",
        }),
      ],
    });

    expect(part?.sourceId).toBe("stave:child-tasks");
    const lines = part?.content.split("\n") ?? [];
    const delegationLines = lines.filter((line) =>
      line.startsWith("- delegation:"),
    );
    expect(delegationLines[0]).toContain("delegation: live");
    expect(part?.content).toContain("child task: child-3 in workspace");
    expect(part?.content).toContain("reason: Provider exploded");
  });

  test("carries no child output, only the fields the parent may see", () => {
    const part = buildChildTaskReceiptsRetrievedContext({
      children: [summary({ reason: "Stopped by the parent." })],
    });

    // Everything rendered comes from the summary; a transcript, prompt or
    // artifact body has no path into this block.
    const allowed = new Set([
      "docs",
      "child-1",
      "workspace-child",
      "codex",
      "one-turn",
      "completed",
      "Stopped by the parent.",
    ]);
    const rendered = (part?.content ?? "")
      .split("\n")
      .filter((line) => line.startsWith("- delegation:") || line.startsWith("  "))
      .join(" ");
    for (const value of ["turn-1", "parent-1", "child-task:parent-1:docs:turn"]) {
      expect(rendered).not.toContain(value);
    }
    for (const value of allowed) {
      expect(rendered).toContain(value);
    }
  });

  test("caps the rendered list and says how many were omitted", () => {
    const children = Array.from({ length: 23 }, (_, index) =>
      summary({
        delegationKey: `key-${index}`,
        childTaskId: `child-${index}`,
        updatedAt: `2026-08-10T00:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    );

    const part = buildChildTaskReceiptsRetrievedContext({ children });

    const delegationLines = (part?.content ?? "")
      .split("\n")
      .filter((line) => line.startsWith("- delegation:"));
    expect(delegationLines).toHaveLength(20);
    expect(part?.content).toContain("(3 older delegations omitted)");
  });
});
