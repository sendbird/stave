import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TurnActivitySurface } from "@/components/session/TurnActivity";
import { isDelegatedTaskInTurn } from "@/lib/work-graph/delegated-task-scope";
import { createWorkGraph, mergeDelegatedTasksIntoWorkGraph } from "@/lib/work-graph/work-graph-reducer";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";

const child: DelegatedTaskSummary = {
  runId: "run", stepId: "step", parentTaskId: "parent", delegationKey: "current-review",
  delegatedTaskId: "child", delegatedWorkspaceId: "workspace", delegatedTurnId: "child-turn",
  providerId: "codex", lifecycle: "one-turn", phase: "running", reason: null, attempt: 0,
  createdAt: "2026-09-30T00:00:00.000Z", updatedAt: "2026-09-30T00:00:01.000Z", completedAt: null,
};

test("current turn keeps its finished child and active children but excludes an old finished child", () => {
  const graph = mergeDelegatedTasksIntoWorkGraph(createWorkGraph({ turnId: "turn", providerId: "codex", startedAt: 1 }), [child], 2);
  const finished = { ...child, phase: "completed" as const };
  const old = { ...child, delegationKey: "old-failure", delegatedTaskId: "old-child", phase: "failed" as const };
  expect(isDelegatedTaskInTurn(finished, graph)).toBe(true);
  expect(isDelegatedTaskInTurn(old, graph)).toBe(false);
  expect(isDelegatedTaskInTurn({ ...old, phase: "waiting" }, graph)).toBe(true);
  expect(isDelegatedTaskInTurn({ ...finished, attempt: 1 }, graph)).toBe(false);
  const ok = async () => ({ ok: true, error: null });
  const html = renderToStaticMarkup(createElement(TurnActivitySurface, {
    variant: "panel", activeTurnId: "turn", isPlanPreparing: false, workItems: [], todos: [], workGraph: graph,
    delegatedTasks: { children: [finished, old], actions: { followUp: ok, retry: ok, stop: ok, detach: ok, refresh: () => {} } },
  }));
  expect(html).toContain("current-review");
  expect(html).not.toContain("old-failure");
});
