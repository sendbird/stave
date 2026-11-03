import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskTurnPlan } from "@/components/session/TaskTurnPlan";
import { ShelfPlan } from "@/components/session/composer-shelf/ShelfPlan";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const initial = useAppStore.getInitialState();
const original = { ...initial };
afterEach(() => Object.assign(initial, original));
const message = (ownerAgentId?: string): ChatMessage => ({ id: "plan", role: "assistant", providerId: "codex", model: "model", content: "", turnId: "turn", parts: [{ type: "tool_use", toolUseId: "todo", toolName: "TodoWrite", state: "output-available", ownerAgentId, input: JSON.stringify({ todos: [{ content: "Inspect the contract", status: "completed" }, { content: "Verify the result", status: "in_progress" }] }) }] });

test("Progress reads only this task's primary plan and clears on a new user turn", () => {
  Object.assign(initial, { activeTaskId: "other", activeTurnIdsByTask: { task: "turn" }, messagesByTask: { task: [message()], other: [message("worker")] } });
  const html = () => renderToStaticMarkup(createElement(TaskTurnPlan, { taskId: "task" }));
  expect(html()).toContain("Verify the result");
  expect(renderToStaticMarkup(createElement(TaskTurnPlan, { taskId: "other" }))).toBe("");
  Object.assign(initial, { messagesByTask: { task: [message(), { id: "new", role: "user", providerId: "user", model: "user", content: "New assignment", parts: [] }] } });
  expect(html()).toBe("");
});

test("the shelf's plan leads with the steps left and folds the finished ones behind one toggle", () => {
  expect(renderToStaticMarkup(createElement(ShelfPlan, { items: [], live: false }))).toBe("");
  const html = renderToStaticMarkup(createElement(ShelfPlan, { items: [{ content: "Inspect", status: "completed" }, { content: "Verify", status: "in_progress" }, { content: "Ship", status: "pending" }], live: false }));
  // No summary of its own: the run line already says the step and the count.
  expect(html).not.toContain("<details");
  expect(html).not.toContain("1 of 3 done");
  expect(html).not.toContain("1 / 3");
  expect(html).toContain("Show 1 done");
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain(">Inspect<");
  expect(html).toContain("Verify");
  expect(html).toContain("Ship");
  // The state is the mark's and the ink's; the word stays for screen readers only.
  // Between turns the step it is on is still current, but nothing runs.
  expect(html).toContain('aria-current="step"');
  expect(html.replace(/<[^>]*>/g, "")).toContain("Verify, Pending");
  expect(html).not.toContain("loader-circle");
  // A finished plan has nothing left to lead with, so it lists every step.
  const finished = renderToStaticMarkup(createElement(ShelfPlan, { items: [{ content: "Inspect", status: "completed" }], live: false }));
  expect(finished).toContain("Inspect");
  expect(finished).not.toContain("Show 1 done");
});
