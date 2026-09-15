import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskResultReviews } from "@/components/session/TaskResultReviews";
import { DelegateTaskForm } from "@/components/collaboration/DelegateTaskForm";

test("run history opens as a filterable list with its purpose stated up front", () => {
  const html = renderToStaticMarkup(
    createElement(TaskResultReviews, { workspaceId: "w", taskId: "t" }),
  );
  expect(html).toContain("Run history");
  expect(html).toContain("One entry per finished run");
  expect(html).toContain("All runs");
  expect(html).toContain("Needs review");
  expect(html).toContain("Review marks are for your own tracking");
});

test("delegate form mounts collapsed behind a body-size header and toggle", () => {
  const html = renderToStaticMarkup(
    createElement(DelegateTaskForm, {
      target: { taskId: "t", workspaceId: "w", projectPath: "/tmp/p" },
      onCreated: () => {},
    }),
  );
  expect(html).toContain("Delegate a task");
  expect(html).toContain("Hand a bounded assignment to another model");
  expect(html).toContain("New delegation");
  expect(html).not.toContain("<select");
  expect(html).not.toContain("<textarea");
});

test("delegate form opens with the routed assignee summarised and the model controls hidden", () => {
  const html = renderToStaticMarkup(
    createElement(DelegateTaskForm, {
      target: { taskId: "t", workspaceId: "w", projectPath: "/tmp/p" },
      onCreated: () => {},
      defaultOpen: true,
    }),
  );
  expect(html).toContain(">Assignment<");
  expect(html).toContain("Who runs it");
  expect(html).toContain("Guardrails");
  // Only Permissions is a select until the user asks to change the model.
  expect(html.match(/<select/g)?.length).toBe(1);
  expect(html).not.toContain(">Effort<");
  expect(html).toContain(">Change<");
  expect(html).toContain('data-agent-identity="GPT-5.6 Sol · Medium"');
  expect(html).toContain(">Auto<");
  expect(html).toContain(
    "Auto → GPT-5.6 Sol · Medium effort (Auto) · Guided · Separate worktree",
  );
  expect(html).not.toContain("Codex · Auto →");
});
