import { describe, expect, it } from "bun:test";
import {
  type WorkspaceScriptHookRunSummary,
  buildTurnVerificationResult,
  deriveFileVerificationStatuses,
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

describe("deriveFileVerificationStatuses", () => {
  const changedPaths = ["src/a.ts", "src/b.ts", "src/c.ts"];

  it("marks files referenced by a blocking failure as fail", () => {
    const statuses = deriveFileVerificationStatuses({
      failures: [{ blocking: true, output: "src/a.ts:12:3 error TS2304" }],
      changedPaths,
    });
    expect(statuses).toEqual({ "src/a.ts": "fail" });
  });

  it("marks files referenced by only non-blocking failures as warn", () => {
    const statuses = deriveFileVerificationStatuses({
      failures: [
        {
          blocking: false,
          output: "/abs/repo/src/b.ts\n  3:1  warning  no-console",
        },
      ],
      changedPaths,
    });
    expect(statuses).toEqual({ "src/b.ts": "warn" });
  });

  it("prefers fail over warn for the same file", () => {
    const statuses = deriveFileVerificationStatuses({
      failures: [
        { blocking: false, output: "src/a.ts lint warning" },
        { blocking: true, output: "src/a.ts test failed" },
      ],
      changedPaths,
    });
    expect(statuses["src/a.ts"]).toBe("fail");
  });

  it("ignores failures without output and unreferenced files", () => {
    const statuses = deriveFileVerificationStatuses({
      failures: [
        { blocking: true },
        { blocking: false, output: "src/a.ts warning" },
      ],
      changedPaths,
    });
    expect(statuses).toEqual({ "src/a.ts": "warn" });
    expect(statuses["src/c.ts"]).toBeUndefined();
  });
});
