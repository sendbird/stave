import { describe, expect, test } from "bun:test";
import { buildBaseSteps, buildFlow, deriveFlowBase, type FlowAssignmentInput, type FlowBaseInput } from "@/lib/agents/flow-view";
import type { MissionDetail } from "@/lib/missions/api";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import type { TaskExecutionSummary } from "@/lib/fleet/task-execution-summary";
import type { WorkspacePrInfo } from "@/lib/pr-status";
import type { ChatMessage } from "@/types/chat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowPanel } from "../src/components/agents/FlowPanel";

const EMPTY_BASE: FlowBaseInput = {
  request: null,
  plan: null,
  changes: null,
  verification: null,
  pullRequest: null,
  needsYou: null,
  taskRunning: false,
};

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

describe("buildBaseSteps", () => {
  test("a fresh task shows only Request", () => {
    const steps = buildBaseSteps({ ...EMPTY_BASE, request: { at: "2026-09-29T00:00:00.000Z", text: "Fix the bug" } });
    expect(steps.map((step) => [step.title, step.state])).toEqual([["Request", "done"]]);
    expect(steps[0]!.detail).toBe("Fix the bug");
  });

  test("every base step appears once its source reports, in order", () => {
    const steps = buildBaseSteps({
      request: { at: "2026-09-29T00:00:00.000Z", text: "Fix the bug" },
      plan: { total: 3, done: 1, items: [{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: false }] },
      changes: { fileCount: 2, additions: 10, deletions: 4, partial: false },
      verification: { status: "pass", totalEntries: 3, executedEntries: 3, completedAt: Date.parse("2026-09-29T00:07:00.000Z") },
      pullRequest: { number: 42, title: "Fix the bug", url: "https://example.test/42", status: "checks_pending", checks: "pending", createdAt: "2026-09-29T00:08:00.000Z" },
      needsYou: null,
      taskRunning: true,
    });
    expect(steps.map((step) => [step.title, step.state])).toEqual([
      ["Request", "done"],
      ["Plan", "running"],
      ["Changes", "running"],
      ["Verification", "done"],
      ["Workspace PR", "running"],
    ]);
    expect(steps[1]!.detail).toBe("1/3 done");
    expect(steps[2]!.detail).toBe("2 files · +10/−4");
    expect(steps[3]!.detail).toBe("3/3 checks");
    expect(steps[4]!.detail).toBe("#42 Fix the bug · Checks running · Checks running");
  });

  test("a failing verification and a waiting approval read as action required", () => {
    const steps = buildBaseSteps({
      ...EMPTY_BASE,
      verification: { status: "fail", totalEntries: 2, executedEntries: 2, completedAt: Date.parse("2026-09-29T00:07:00.000Z") },
      needsYou: { kind: "approval", label: "Bash: rm -rf build", at: null },
    });
    expect(steps.map((step) => [step.title, step.state])).toEqual([
      ["Verification", "failed"],
      ["Waiting for approval", "action-required"],
    ]);
  });
});

describe("deriveFlowBase", () => {
  const summary = (over: Partial<TaskExecutionSummary> = {}): TaskExecutionSummary =>
    ({
      changes: { value: { files: ["a.ts"], additions: 3, deletions: 1, partial: false }, provenance: "derived", sourceRefs: [] },
      verification: { value: { workspaceId: "ws", status: "pass", totalEntries: 1, executedEntries: 1, failures: [], completedAt: 1 }, provenance: "reported", sourceRefs: [] },
      elapsed: { value: null, provenance: "unavailable", sourceRefs: [] },
      latestActivity: { value: null, provenance: "unavailable", sourceRefs: [] },
      usage: { value: null, provenance: "unavailable", sourceRefs: [] },
      accountLimit: { value: null, provenance: "unavailable", sourceRefs: [] },
      contextHeadroom: { value: null, provenance: "unavailable", sourceRefs: [] },
      agents: { value: null, provenance: "unavailable", sourceRefs: [] },
      ...over,
    }) as TaskExecutionSummary;

  test("reads the first user message and the summary's changes and verification", () => {
    const messages = [
      { id: "m1", role: "user", content: "Please fix", startedAt: "2026-09-29T00:00:00.000Z", parts: [] },
      { id: "m2", role: "assistant", content: "on it", parts: [] },
    ] as unknown as ChatMessage[];
    const base = deriveFlowBase({ messages, summary: summary(), prInfo: null, taskRunning: false });
    expect(base.request).toEqual({ at: "2026-09-29T00:00:00.000Z", text: "Please fix" });
    expect(base.changes).toEqual({ fileCount: 1, additions: 3, deletions: 1, partial: false });
    expect(base.verification).toMatchObject({ status: "pass", totalEntries: 1, executedEntries: 1 });
  });

  test("reads a TodoWrite plan and a pull request", () => {
    const messages = [
      { id: "m1", role: "user", content: "Please fix", parts: [] },
      {
        id: "m2",
        role: "assistant",
        content: "",
        parts: [
          {
            type: "tool_use",
            toolName: "TodoWrite",
            state: "output-available",
            input: JSON.stringify({ todos: [{ content: "step one", status: "completed" }, { content: "step two", status: "pending" }] }),
          },
        ],
      },
    ] as unknown as ChatMessage[];
    const prInfo: WorkspacePrInfo = {
      pr: {
        number: 7,
        title: "Fix",
        state: "OPEN",
        isDraft: false,
        url: "https://example.test/7",
        reviewDecision: "REVIEW_REQUIRED",
        mergeable: "MERGEABLE",
        mergeStateStatus: "BLOCKED",
        checksRollup: "SUCCESS",
        mergedAt: null,
        baseRefName: "main",
        headRefName: "feat/fix",
      },
      derived: "review_required",
      lastFetched: 0,
    };
    const base = deriveFlowBase({ messages, summary: summary(), prInfo, taskRunning: false });
    expect(base.plan).toEqual({ total: 2, done: 1, items: [{ text: "step one", done: true }, { text: "step two", done: false }] });
    expect(base.pullRequest).toEqual({ number: 7, title: "Fix", url: "https://example.test/7", status: "review_required", checks: "success", createdAt: null });
  });
});

describe("buildFlow", () => {
  test("a plain task shows its base steps and delegated tasks", () => {
    const nodes = buildFlow({
      taskTitle: "Fix",
      assignment: null,
      mission: null,
      delegates: [delegate({})],
      base: { ...EMPTY_BASE, request: { at: "2026-09-29T00:00:00.000Z", text: "Fix" }, taskRunning: false },
    });
    expect(nodes.map((node) => [node.kind, node.title])).toEqual([
      ["task", "Request"],
      ["delegate", "review-diff"],
    ]);
    expect(nodes[1]!.target).toEqual({ workspaceId: "ws-1", taskId: "child-1" });
  });

  test("a task with no messages and no delegates says it is waiting", () => {
    const nodes = buildFlow({ taskTitle: "Fix", assignment: null, mission: null, delegates: [], base: EMPTY_BASE });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ kind: "task", title: "Fix", state: "waiting", detail: "Waiting for the first message." });
  });

  test("an assignment and a mission read as one flow; base steps nest under the running stage", () => {
    const base: FlowBaseInput = {
      ...EMPTY_BASE,
      request: { at: "2026-09-29T00:00:00.000Z", text: "Fix" },
      changes: { fileCount: 1, additions: 2, deletions: 0, partial: false },
      taskRunning: true,
    };
    const nodes = buildFlow({ taskTitle: "Fix", assignment, mission: mission(), delegates: [delegate({})], base });
    expect(nodes.map((node) => [node.kind, node.title, node.state])).toEqual([
      ["assignment", "Assigned to Implementer", "done"],
      ["stage", "1. Plan", "done"],
      ["stage", "2. Build", "running"],
      ["stage", "3. Open PR", "waiting"],
    ]);
    expect(nodes[0]!.detail).toBe("claude-code · claude-sonnet-5 · New worktree agent/implementer-fix-x");
    expect(nodes[1]!.evidence).toEqual({ verified: 1, reported: 0 });
    // Base steps nest under the running stage, delegates alongside them.
    expect(nodes[2]!.children.map((child) => child.title)).toEqual(["Request", "Changes", "review-diff"]);
    expect(nodes[2]!.events.map((event) => event.label)).toEqual(["Started (attempt 2)", "Changes requested"]);
  });

  test("a delegate outside every stage window is kept, not dropped", () => {
    const nodes = buildFlow({
      taskTitle: "Fix",
      assignment: null,
      mission: mission(),
      delegates: [delegate({ createdAt: "2026-09-28T23:00:00.000Z", phase: "failed" })],
      base: EMPTY_BASE,
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
      base: EMPTY_BASE,
    });
    expect(nodes[0]).toMatchObject({ state: "action-required", detail: "Stave stopped before the first turn started." });
  });

  test("the panel renders an empty task as waiting for the first message", () => {
    const html = renderToStaticMarkup(createElement(FlowPanel, { workspaceId: "ws", taskId: "t", repositoryPath: null }));
    expect(html).toContain("Waiting for the first message.");
    expect(html).not.toContain("Assign work to an agent");
  });
});


test("finished and cancelled missions keep current task steps outside historical stages", () => {
  for (const status of ["completed", "cancelled"] as const) {
    const detail = mission();
    detail.stages[1]!.status = status;
    detail.stages[1]!.endedAt = "2026-09-29T00:12:00.000Z";
    const nodes = buildFlow({ taskTitle: "Fix", assignment: null, mission: detail, delegates: [], base: {
      ...EMPTY_BASE, request: { at: "2026-09-29T00:20:00.000Z", text: "Follow up" },
      needsYou: { kind: "approval", label: "Run checks", at: null }, taskRunning: true,
    } });
    expect(nodes.slice(0, 2).map(node => node.title)).toEqual(["Request", "Waiting for approval"]);
    expect(nodes.filter(node => node.kind === "stage").every(node => node.children.length === 0)).toBe(true);
  }
});

test("workspace PR remains task-level context during a mission stage", () => {
  const nodes = buildFlow({ taskTitle: "Fix", assignment: null, mission: mission(), delegates: [], base: {
    ...EMPTY_BASE, pullRequest: { number: 42, title: "Workspace change", url: "https://example.test/42", status: "review_required", checks: null, createdAt: null },
  } });
  expect(nodes.at(-1)?.title).toBe("Workspace PR");
  expect(nodes[1]!.children).toHaveLength(0);
});

test("detached waiting remains open and a follow-up running is separate from its ledger phase", () => {
  const child = delegate({ phase: "waiting", lifecycle: "detached" });
  const args = { taskTitle: "Fix", assignment: null, mission: null, delegates: [child], base: EMPTY_BASE };
  expect(buildFlow(args)[0]).toMatchObject({ state: "waiting", detail: expect.stringContaining("Open for follow-up") });
  expect(buildFlow({ ...args, runningDelegateTaskIds: new Set([child.delegatedTaskId]) })[0]).toMatchObject({
    state: "running", detail: expect.stringContaining("delegation remains open"),
  });
  expect(child.phase).toBe("waiting");
});
