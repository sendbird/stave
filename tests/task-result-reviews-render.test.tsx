import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RunHistoryRow,
  TaskResultReviews,
} from "@/components/session/TaskResultReviews";
import { DelegateTaskForm } from "@/components/team/DelegateTaskForm";
import { TeamSection } from "@/components/team/TeamSection";
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

test("delegate form mounts collapsed behind a body-size header and toggle", () => {
  const html = renderToStaticMarkup(
    createElement(DelegateTaskForm, {
      target: { taskId: "t", workspaceId: "w", repositoryPath: "/tmp/p" },
      onCreated: () => {},
    }),
  );
  expect(html).toContain("Delegate a task");
  expect(html).toContain("Hand a bounded assignment to another model");
  expect(html).toContain("New delegation");
  expect(html).not.toContain("<select");
  expect(html).not.toContain("<textarea");
});

test("collaboration puts the delegation entry before history controls", () => {
  const html = renderToStaticMarkup(
    createElement(TeamSection, {
      target: { taskId: "t", workspaceId: "w", repositoryPath: "/tmp/p" },
    }),
  );

  expect(html.indexOf("Delegate a task")).toBeLessThan(
    html.indexOf("Every advisor consult"),
  );
  expect(html.indexOf("Delegate a task")).toBeLessThan(html.indexOf("All"));
});

test("delegate form opens with the routed assignee summarised and the model controls hidden", () => {
  const html = renderToStaticMarkup(
    createElement(DelegateTaskForm, {
      target: { taskId: "t", workspaceId: "w", repositoryPath: "/tmp/p" },
      onCreated: () => {},
      defaultOpen: true,
    }),
  );
  expect(html).toContain(">Assignment<");
  expect(html).toContain('autofocus=""');
  expect(html).toContain("Who runs it");
  expect(html).toContain("Guardrails");
  // Only Permissions is a select until the user asks to change the model.
  expect(html.match(/<select/g)?.length).toBe(1);
  expect(html).not.toContain(">Effort<");
  expect(html).toContain(">Change<");
  expect(html).toContain('data-agent-identity="GPT-6.1 Sol · Medium"');
  expect(html).toContain(">Auto<");
  expect(html).toContain(
    "Auto → GPT-6.1 Sol · Medium effort (Auto) · Use user permissions · Separate worktree",
  );
  expect(html).not.toContain("Codex · Auto →");
});
