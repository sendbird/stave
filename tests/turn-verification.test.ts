import { describe, expect, it } from "bun:test";
import {
  type WorkspaceScriptHookRunSummary,
  buildTurnVerificationResult,
  deriveTurnVerificationStatus,
} from "@/lib/workspace-scripts";

function makeSummary(
  failures: Array<{ scriptId: string; message: string; blocking: boolean }>,
  overrides?: Partial<WorkspaceScriptHookRunSummary>,
): WorkspaceScriptHookRunSummary {
  return {
    trigger: "turn.completed",
    totalEntries: overrides?.totalEntries ?? failures.length + 1,
    executedEntries: overrides?.executedEntries ?? 1,
    failures,
  };
}

describe("deriveTurnVerificationStatus", () => {
  it("returns pass when there are no failures", () => {
    expect(deriveTurnVerificationStatus(makeSummary([]))).toBe("pass");
  });

  it("returns warn when only non-blocking entries fail", () => {
    expect(
      deriveTurnVerificationStatus(
        makeSummary([{ scriptId: "lint", message: "x", blocking: false }]),
      ),
    ).toBe("warn");
  });

  it("returns fail when any blocking entry fails", () => {
    expect(
      deriveTurnVerificationStatus(
        makeSummary([
          { scriptId: "lint", message: "x", blocking: false },
          { scriptId: "test", message: "y", blocking: true },
        ]),
      ),
    ).toBe("fail");
  });
});

describe("buildTurnVerificationResult", () => {
  it("carries identity, derived status, and completedAt", () => {
    const result = buildTurnVerificationResult({
      workspaceId: "ws-1",
      taskId: "task-1",
      turnId: "turn-1",
      summary: makeSummary(
        [{ scriptId: "test", message: "boom", blocking: true }],
        { totalEntries: 2, executedEntries: 1 },
      ),
      completedAt: 1234,
    });

    expect(result).toEqual({
      workspaceId: "ws-1",
      taskId: "task-1",
      turnId: "turn-1",
      status: "fail",
      totalEntries: 2,
      executedEntries: 1,
      failures: [{ scriptId: "test", message: "boom", blocking: true }],
      completedAt: 1234,
    });
  });

  it("derives pass for a clean summary", () => {
    const result = buildTurnVerificationResult({
      workspaceId: "ws-2",
      summary: makeSummary([], { totalEntries: 2, executedEntries: 2 }),
      completedAt: 1,
    });
    expect(result.status).toBe("pass");
    expect(result.taskId).toBeUndefined();
    expect(result.turnId).toBeUndefined();
  });
});
