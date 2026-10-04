import { describe, expect, test } from "bun:test";
import { buildDelegatedTaskReceiptsRetrievedContext, latestTurnStartedAt } from "../src/lib/task-context/delegated-task-receipts";
import type { DelegatedTaskSummary } from "../src/lib/runs/delegated-task";

function summary(overrides: Partial<DelegatedTaskSummary> = {}): DelegatedTaskSummary {
  return {
    runId: "child-task:parent-1:docs",
    stepId: "child-task:parent-1:docs:turn",
    parentTaskId: "parent-1",
    delegationKey: "docs",
    delegatedTaskId: "child-1",
    delegatedWorkspaceId: "workspace-child",
    delegatedTurnId: "turn-1",
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

describe("subagent results context", () => {
  test("a task with no delegations injects nothing", () => {
    expect(buildDelegatedTaskReceiptsRetrievedContext({ children: [] })).toBeNull();
  });

  test("renders identity, phase and reason with live children first", () => {
    const part = buildDelegatedTaskReceiptsRetrievedContext({
      children: [
        summary({ delegationKey: "finished", phase: "completed" }),
        summary({
          delegationKey: "live",
          phase: "running",
          delegatedTaskId: "child-2",
          reason: null,
        }),
        summary({
          delegationKey: "broken",
          phase: "failed",
          delegatedTaskId: "child-3",
          reason: "Provider exploded",
        }),
      ],
    });

    expect(part?.sourceId).toBe("stave:delegated-tasks");
    const lines = part?.content.split("\n") ?? [];
    const delegationLines = lines.filter((line) =>
      line.startsWith("- subagent:"),
    );
    expect(delegationLines[0]).toContain("subagent: live");
    expect(part?.content).toContain("task: child-3 in workspace");
    expect(part?.content).toContain("reason: Provider exploded");
  });

  test("without a result it carries only the fields the parent may see", () => {
    const part = buildDelegatedTaskReceiptsRetrievedContext({
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
      .filter((line) => line.startsWith("- subagent:") || line.startsWith("  "))
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
        delegatedTaskId: `child-${index}`,
        updatedAt: `2026-08-10T00:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    );

    const part = buildDelegatedTaskReceiptsRetrievedContext({ children });

    const delegationLines = (part?.content ?? "")
      .split("\n")
      .filter((line) => line.startsWith("- subagent:"));
    expect(delegationLines).toHaveLength(20);
    expect(part?.content).toContain("(3 older subagents omitted)");
  });

  test("includes each answer that arrived since the last turn, bounded, and omits seen ones", () => {
    const part = buildDelegatedTaskReceiptsRetrievedContext({
      resultsSince: "2026-08-10T00:04:00.000Z",
      children: [
        summary({ delegationKey: "new", result: "Found two bugs.\nBoth in parser.ts." }),
        summary({ delegationKey: "seen", delegatedTaskId: "child-2", updatedAt: "2026-08-10T00:01:00.000Z", result: "Old answer." }),
        summary({ delegationKey: "long", delegatedTaskId: "child-3", result: "x".repeat(3_000) }),
      ],
    });
    expect(part?.title).toBe("Subagent results");
    expect(part?.content).toContain("    Found two bugs.\n    Both in parser.ts.");
    expect(part?.content).not.toContain("Old answer.");
    expect(part?.content).toContain(`${"x".repeat(1_999)}…`);
    expect(part?.content).not.toContain("x".repeat(2_001));
  });

  test("a child attached to the message keeps its row but not a second copy of its answer", () => {
    const part = buildDelegatedTaskReceiptsRetrievedContext({
      children: [
        summary({ delegationKey: "review", result: "Attached answer." }),
        summary({ delegationKey: "other", delegatedTaskId: "child-2", result: "Other answer." }),
      ],
      attachedTaskIds: new Set(["child-1"]),
    });
    expect(part?.content).toContain("- subagent: review");
    expect(part?.content).toContain("result: attached to this message under Attached Stave Tasks");
    expect(part?.content).not.toContain("Attached answer.");
    expect(part?.content).toContain("Other answer.");
  });

  test("a composer review shares its answer only when the user attaches it", () => {
    const part = buildDelegatedTaskReceiptsRetrievedContext({
      children: [summary({ delegationKey: "stave-review-20261004120000-a", result: "Reviewer findings." })],
    });
    expect(part?.content).toContain("- subagent: stave-review-20261004120000-a");
    expect(part?.content).toContain("result: held until the user attaches this review");
    expect(part?.content).not.toContain("Reviewer findings.");
  });

  test("the results cut-off is the newest assistant turn start", () => {
    expect(latestTurnStartedAt([
      { role: "assistant", startedAt: "a" }, { role: "user" }, { role: "assistant", startedAt: "b" }, { role: "user" },
    ])).toBe("b");
    expect(latestTurnStartedAt([{ role: "user" }])).toBeNull();
  });
});
