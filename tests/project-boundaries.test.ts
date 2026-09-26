import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { coordinatorRuntimeOptions } from "../src/lib/projects/briefing";

const runtimeSource = readFileSync("electron/host-service/supervision/project-runtime.ts", "utf8");

describe("project boundaries", () => {
  test("a project starts work only as missions through intake; its coordinator edits no files", () => {
    // Work starts as a mission on a task the project created in a new worktree.
    expect(runtimeSource).toContain("deps.createMissionWorkspace(");
    expect(runtimeSource).toContain("deps.createIdleTask(");
    expect(runtimeSource).toContain("deps.startMission(");
    // The only turn the project starts itself is on its coordinator task.
    const turnCalls = [...runtimeSource.matchAll(/deps\.runSupervisedTurn\(\{([\s\S]*?)\}\);/g)].map((match) => match[1]!);
    expect(turnCalls).toHaveLength(1);
    expect(turnCalls[0]).toContain("taskId: project.coordinator.taskId");
    expect(turnCalls[0]).toContain("runtimeOptions: coordinatorRuntimeOptions(");
    // Coordinator turns cannot write: edits are disallowed on Claude and the
    // sandbox is read-only on Codex.
    expect(coordinatorRuntimeOptions("claude-code").claudeDisallowedTools).toEqual(
      expect.arrayContaining(["Edit", "Write", "MultiEdit", "NotebookEdit"]),
    );
    expect(coordinatorRuntimeOptions("codex")).toMatchObject({ codexFileAccess: "read-only" });
  });
});
