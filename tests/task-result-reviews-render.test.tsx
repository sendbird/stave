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

test("delegate form offers provider, model, effort and permissions as matching selects", () => {
  const html = renderToStaticMarkup(
    createElement(DelegateTaskForm, {
      target: { taskId: "t", workspaceId: "w", projectPath: "/tmp/p" },
      onCreated: () => {},
    }),
  );
  expect(html.match(/<select/g)?.length).toBe(4);
  expect(html).toContain(">Effort<");
  expect(html).toContain("Custom model id…");
  expect(html).toContain(
    "Codex · Default model · Default effort · Guided · Separate worktree",
  );
});
