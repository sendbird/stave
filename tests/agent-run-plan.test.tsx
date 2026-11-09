import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describePlanDelta, flattenPlan } from "../src/components/aui/components/Plan.parts";
import { AgentRunPlan, toPlanSteps } from "../src/components/agent-runs/AgentRunPlan";
import { AgentRunDetailView } from "../src/components/agent-runs/AgentRunPanel";
import { AgentRunOverview } from "../src/components/agent-runs/AgentRunOverview";
import { AgentRunReportView } from "../src/components/agent-runs/AgentRunReportView";
import { ShelfPlan } from "../src/components/session/composer-shelf/ShelfPlan";
import { TaskTurnPlan } from "../src/components/session/TaskTurnPlan";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import type { AgentRunReport } from "../src/lib/agent-runs/report";
import { useAppStore } from "../src/store/app.store";
import type { ChatMessage } from "../src/types/chat";

const items = [
  { content: "Inspect the contract", status: "completed" as const },
  { content: "Implement the fix", status: "in_progress" as const },
  { content: "Open the pull request", status: "pending" as const },
];

const initial = useAppStore.getInitialState();
const original = { ...initial };
afterEach(() => Object.assign(initial, original));

/** The rows of a rendered plan: their `aria-current` and screen-reader state word. */
function rows(html: string) {
  return [...html.matchAll(/<li([^>]*)>(.*?)<\/li>/g)].map(([, attributes, body]) => ({
    current: attributes!.includes('aria-current="step"'),
    text: body!.replace(/<[^>]*>/g, ""),
  }));
}

test("one mapping: completed is done, the step in progress runs only while its work is live and stays current", () => {
  expect(toPlanSteps(items, true).map((step) => [step.status, step.current ?? false])).toEqual([
    ["done", false], ["running", true], ["pending", false],
  ]);
  // A paused, halted or ended run never looks busy, and its step is still the current one.
  expect(toPlanSteps(items, false).map((step) => [step.status, step.current ?? false])).toEqual([
    ["done", false], ["pending", true], ["pending", false],
  ]);
});

test("a run's plan draws on the design system's Plan: its count, its marks and the current step", () => {
  const live = renderToStaticMarkup(createElement(AgentRunPlan, { items, live: true }));
  expect(live).toContain('role="group"');
  expect(live).toContain("1 / 3");
  expect(live).toContain("1 of 3 steps complete");
  expect(rows(live)).toEqual([
    // AUI F7: a plan step speaks the shared agent-state word ("Completed").
    { current: false, text: "Inspect the contract, Completed" },
    { current: true, text: "Implement the fix, Running" },
    // The pending step's word is no longer blank.
    { current: false, text: "Open the pull request, Pending" },
  ]);
  // No surface-specific icons or words are left: the plan's own marks carry the state.
  expect(live).not.toContain("lucide-loader-circle");
  expect(live).not.toContain(">Now<");
  const still = renderToStaticMarkup(createElement(AgentRunPlan, { items }));
  expect(rows(still)[1]).toEqual({ current: true, text: "Implement the fix, Pending" });
  // The announcer's region is mounted from the first render, and that render says nothing.
  expect(live).toContain('aria-live="polite"');
  expect(live.match(/aria-live="polite"[^>]*><\/span>/g)?.length).toBe(2);
});

test("the plan announces what moved after the first render, never the whole plan", () => {
  const before = new Map(flattenPlan(toPlanSteps(items, true)).map((step) => [step.id, step.status]));
  const next = items.map((item, index) => (index === 1 ? { ...item, status: "completed" as const } : index === 2 ? { ...item, status: "in_progress" as const } : item));
  const after = flattenPlan(toPlanSteps(next, true));
  expect(describePlanDelta(before, after, 2, 3)).toBe("Implement the fix: completed. Open the pull request: running. 2 of 3 complete.");
  // Nothing moved: nothing is said.
  expect(describePlanDelta(before, flattenPlan(toPlanSteps(items, true)), 1, 3)).toBe("");
});

test("the Progress tab of an agent run shows the Plan with its own header", () => {
  const detail = buildAgentRunFixtures(new Date("2026-10-01T09:00:00.000Z")).working;
  const html = renderToStaticMarkup(createElement(AgentRunOverview, { detail, plan: { items }, now: Date.parse("2026-10-01T09:04:00.000Z") }));
  expect(html).toContain("1 / 3");
  expect(rows(html).filter((row) => row.current)).toEqual([{ current: true, text: "Implement the fix, Running" }]);
  expect(html).not.toContain("1 of 3 done");
});

test("a workflow run's panel shows the same Plan", () => {
  const working = buildAgentRunFixtures(new Date("2026-10-01T09:00:00.000Z")).working;
  const legacy = {
    ...working,
    agentRun: { ...working.agentRun, origin: undefined },
    stages: working.stages.map((stage) => ({ ...stage, facts: { diff: null, commands: [], toolCalls: [], action: null, plan: { items } } })),
  };
  const html = renderToStaticMarkup(createElement(AgentRunDetailView, { detail: legacy, now: Date.parse("2026-10-01T09:04:00.000Z"), onCommand: async () => null }));
  expect(html).toContain("1 / 3");
  // The stage list marks its current stage too; the plan's current row is its step.
  expect(rows(html).filter((row) => row.current).map((row) => row.text)).toContain("Implement the fix, Running");
});

test("an ended run's report shows its plan on the same Plan, still", () => {
  const report = {
    agentRunId: "agent-run-1", workflowName: "Implementer", assignment: "Fix the table.", outcome: "stopped", reason: null,
    startedAt: "2026-10-01T09:00:00.000Z", endedAt: "2026-10-01T09:20:00.000Z", turnCount: 3,
    stages: [{ stageId: "work", title: "Work", kind: "ai", status: "cancelled", attempts: 1, summary: null, decisions: [], evidence: [], detail: null, plan: items }],
    acceptanceCriteria: [], links: [], leftBehind: [],
  } as unknown as AgentRunReport;
  const html = renderToStaticMarkup(createElement(AgentRunReportView, { report }));
  expect(html).toContain("1 / 3");
  // An ended run is not working: its last step is current but not running.
  expect(rows(html).find((row) => row.current)?.text).toBe("Implement the fix, Pending");
});

test("the shelf's plan keeps its fold and leaves the count to the run line", () => {
  const html = renderToStaticMarkup(createElement(ShelfPlan, { items, live: true }));
  expect(html).toContain('role="group"');
  expect(html).not.toContain("1 / 3");
  expect(html).not.toContain("steps complete");
  expect(html).toContain("Show 1 done");
  expect(rows(html)).toEqual([
    { current: true, text: "Implement the fix, Running" },
    { current: false, text: "Open the pull request, Pending" },
  ]);
});

test("a task's turn plan marks its current step the same way", () => {
  const message: ChatMessage = { id: "plan", role: "assistant", providerId: "codex", model: "model", content: "", turnId: "turn", parts: [{ type: "tool_use", toolUseId: "todo", toolName: "TodoWrite", state: "output-available", input: JSON.stringify({ todos: items }) }] };
  Object.assign(initial, { activeTurnIdsByTask: { task: "turn" }, messagesByTask: { task: [message] } });
  const html = renderToStaticMarkup(createElement(TaskTurnPlan, { taskId: "task" }));
  expect(rows(html).find((row) => row.current)?.text).toBe("Implement the fix, Running");
});
