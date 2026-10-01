import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RunHistoryRow,
  TaskResultReviews,
} from "@/components/session/TaskResultReviews";
import { ExchangeDetail } from "@/components/delegation/ExchangeDetail";
import { fromDelegatedTask } from "@/lib/delegation/exchange";
import { SubagentsSection } from "@/components/session/SubagentsSection";
import { Accordion } from "@/components/ui/accordion";
import type { ResultReview } from "@/lib/reviews/result-review";

test("run history opens as a filterable list with its purpose stated up front", () => {
  const html = renderToStaticMarkup(
    createElement(TaskResultReviews, { workspaceId: "w", taskId: "t" }),
  );
  expect(html).toContain("Run history");
  expect(html).toContain("One entry per finished run");
  expect(html).toContain("All runs");
  expect(html).toContain("Needs review");
  expect(html).toMatch(/aria-pressed="true"[^>]*><span[^>]*>Needs review/);
  expect(html).toMatch(/aria-pressed="false"[^>]*><span[^>]*>All runs/);
  expect(html.indexOf("Needs review")).toBeLessThan(html.indexOf("All runs"));
  expect(html).toContain("Review marks are for your own tracking");
});

test("run history rows lead with the result before review metadata", () => {
  const result: ResultReview = {
    id: "result-1",
    repositoryPath: "/tmp/project",
    repositoryName: "Project",
    workspaceId: "workspace",
    workspaceName: "Workspace",
    taskId: "task",
    taskTitle: "Task",
    turnId: "turn",
    outcome: "completed",
    summary: "Implemented the focused panel hierarchy.",
    createdAt: "2026-09-21T00:00:00Z",
    reviewedAt: null,
  };
  const html = renderToStaticMarkup(
    createElement(
      Accordion,
      {},
      createElement(RunHistoryRow, {
        result,
        expanded: false,
        busy: false,
        disabled: false,
        onReview: () => {},
        onFollowUp: () => {},
      }),
    ),
  );

  expect(html.indexOf(result.summary)).toBeLessThan(html.indexOf("Finished"));
  expect(html.indexOf(result.summary)).toBeLessThan(
    html.indexOf("Not reviewed"),
  );
});

test("the Subagents tab says what it lists before any subagent exists", () => {
  const html = renderToStaticMarkup(
    createElement(SubagentsSection, { taskId: "t", workspaceId: "w", repositoryPath: "/tmp/p" }),
  );
  expect(html).toMatch(/Loading subagents|No subagents yet/);
  expect(html).not.toContain("Advisor");
  expect(html).not.toContain("Worker");
});

test("finished execution detail prioritizes the returned result and folds assignment diagnostics", () => {
  const exchange = { ...fromDelegatedTask({
    runId: "child-task:t:review", stepId: "child-task:t:review:turn", parentTaskId: "t", delegationKey: "review",
    delegatedTaskId: "c", delegatedWorkspaceId: "w", delegatedTurnId: "turn", providerId: "codex", lifecycle: "one-turn",
    phase: "completed", reason: null, attempt: 1, createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:02.000Z",
    completedAt: "2026-08-10T00:00:02.000Z", result: "Cancellation verified",
  }, { prompt: "Review cancellation" }), outcome: { status: "returned" as const, result: "Cancellation verified", progress: ["Inspected cancellation"] } };
  const html = renderToStaticMarkup(createElement(ExchangeDetail, { exchange, nowMs: 3, resultFirst: true }));
  expect(html.indexOf("Cancellation verified")).toBeLessThan(html.indexOf("Review cancellation"));
  expect(html).toMatch(/<details><summary[^>]*>Assignment and execution details/);
  expect(html.indexOf("Inspected cancellation")).toBeGreaterThan(html.indexOf("<details>"));
  expect(html).not.toMatch(/<details open/);
});
