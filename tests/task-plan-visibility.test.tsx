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

test("the shelf exposes the current step and exact completion count without activity details", () => {
  expect(renderToStaticMarkup(createElement(ShelfPlan, { items: [], live: false }))).toBe("");
  const html = renderToStaticMarkup(createElement(ShelfPlan, { items: [{ content: "Inspect", status: "completed" }, { content: "Verify", status: "in_progress" }], live: false }));
  expect(html).toContain("Plan · 1 of 2 done · Verify");
  expect(html).toContain("<details");
  expect(html).not.toContain("loader-circle");
});
