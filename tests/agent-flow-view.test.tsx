import { describe, expect, test } from "bun:test";
import { buildFlow, type FlowAssignmentInput } from "@/lib/agents/flow-view";
import type { MissionDetail } from "@/lib/missions/api";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowPanel } from "../src/components/agents/FlowPanel";

const assignment: FlowAssignmentInput = {
  id: "a1",
  agentName: "Implementer",
  providerId: "claude-code",
  model: "claude-sonnet-5",
  workspaceMode: "new-worktree",
  branch: "agent/implementer-fix-x",
  state: "started",
  detail: null,
  createdAt: "2026-09-29T00:00:00.000Z",
  updatedAt: "2026-09-29T00:00:05.000Z",
};

function delegate(overrides: Partial<DelegatedTaskSummary>): DelegatedTaskSummary {
  return {
    runId: "run-1",
    stepId: "step-1",
    parentTaskId: "task-1",
    delegationKey: "review-diff",
    delegatedTaskId: "child-1",
    delegatedWorkspaceId: "ws-1",
    delegatedTurnId: null,
    providerId: "codex",
    lifecycle: "one-turn",
    phase: "running",
    reason: null,
    attempt: 0,
    createdAt: "2026-09-29T00:10:00.000Z",
    updatedAt: "2026-09-29T00:10:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function mission(): MissionDetail {
  const stage = (id: string, title: string) => ({ id, kind: "ai", title, instruction: "x", doneWhen: "y" });
  return {
    mission: { playbook: { stages: [stage("plan", "Plan"), stage("build", "Build"), stage("pr", "Open PR")] } },
    stages: [
      {
        stageId: "plan",
        attempt: 1,
        status: "completed",
        startedAt: "2026-09-29T00:01:00.000Z",
        endedAt: "2026-09-29T00:05:00.000Z",
        detail: null,
        feedback: null,
        report: { outcome: "complete", summary: "Planned the fix.", evidence: [{ label: "tests", command: "bun test" }], decisions: [] },
        facts: { toolCalls: [], commands: [{ command: "bun test", exitCode: 0 }] },
      },
      {
        stageId: "build",
        attempt: 2,
        status: "running",
        startedAt: "2026-09-29T00:06:00.000Z",
        endedAt: null,
        detail: null,
        feedback: "Handle the empty case.",
        report: null,
        facts: null,
      },
    ],
    events: [],
    report: null,
  } as unknown as MissionDetail;
}

describe("buildFlow", () => {
  test("a plain task shows its delegated tasks under it", () => {
    const nodes = buildFlow({ taskTitle: "Fix", assignment: null, mission: null, delegates: [delegate({})], taskRunning: false });
    expect(nodes.map((node) => node.kind)).toEqual(["task"]);
    expect(nodes[0]!.state).toBe("running");
    expect(nodes[0]!.children[0]).toMatchObject({ kind: "delegate", title: "review-diff", target: { workspaceId: "ws-1", taskId: "child-1" } });
  });

  test("an assignment and a mission read as one flow; delegates hang off the stage that was running", () => {
    const nodes = buildFlow({ taskTitle: "Fix", assignment, mission: mission(), delegates: [delegate({})], taskRunning: true });
    expect(nodes.map((node) => [node.kind, node.title, node.state])).toEqual([
      ["assignment", "Assigned to Implementer", "done"],
      ["stage", "1. Plan", "done"],
      ["stage", "2. Build", "running"],
      ["stage", "3. Open PR", "waiting"],
    ]);
    expect(nodes[0]!.detail).toBe("claude-code · claude-sonnet-5 · New worktree agent/implementer-fix-x");
    expect(nodes[1]!.evidence).toEqual({ verified: 1, reported: 0 });
    expect(nodes[2]!.children.map((child) => child.title)).toEqual(["review-diff"]);
    expect(nodes[2]!.events.map((event) => event.label)).toEqual(["Started (attempt 2)", "Changes requested"]);
  });

  test("a delegate outside every stage window is kept, not dropped", () => {
    const nodes = buildFlow({
      taskTitle: "Fix",
      assignment: null,
      mission: mission(),
      delegates: [delegate({ createdAt: "2026-09-28T23:00:00.000Z", phase: "failed" })],
      taskRunning: false,
    });
    expect(nodes.at(-1)).toMatchObject({ kind: "task" });
    expect(nodes.at(-1)!.children[0]!.state).toBe("failed");
  });

  test("an interrupted assignment asks for the user", () => {
    const nodes = buildFlow({
      taskTitle: "Fix",
      assignment: { ...assignment, state: "interrupted", detail: "Stave stopped before the first turn started." },
      mission: null,
      delegates: [],
      taskRunning: false,
    });
    expect(nodes[0]).toMatchObject({ state: "action-required", detail: "Stave stopped before the first turn started." });
  });

  test("the panel renders an empty task with a hint", () => {
    const html = renderToStaticMarkup(createElement(FlowPanel, { workspaceId: "ws", taskId: "t", repositoryPath: null }));
    expect(html).toContain("Assign work to an agent");
  });
});
