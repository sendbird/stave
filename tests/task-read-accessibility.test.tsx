import { afterEach, beforeEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FleetWorkspaceCard } from "@/components/layout/FleetWorkspaceCard";
import { WorkspaceProgressTaskTreeView } from "@/components/layout/WorkspaceProgressTaskTree";
import { TaskReadMenu } from "@/components/session/TaskReadIndicator";
import { resetTaskAutoReadSuppression, setTaskReadState } from "@/lib/task-read-state-client";
import { invalidateResultReviews } from "@/lib/reviews/result-review-client";
import { useAppStore } from "@/store/app.store";
import type { Task } from "@/types/chat";

const originalWindow = globalThis.window;
/* Server rendering reads the store's initial state, so the card is seeded there. */
const app = useAppStore.getInitialState();
const original = { repositoryPath: app.repositoryPath, activeWorkspaceId: app.activeWorkspaceId, tasks: app.tasks, openTaskTabIds: app.openTaskTabIds };
const workspaceId = "ws-card";
const task: Task = {
  id: "task-unread", title: "Fix the billing table", provider: "codex", updatedAt: "2026-11-01T00:00:00Z",
  unread: false, archivedAt: null, controlMode: "interactive", controlOwner: "stave",
};

beforeEach(async () => {
  const values = new Map<string, string>();
  Object.assign(globalThis, { window: { api: undefined, localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } } });
  useAppStore.setState({ notifications: [] });
  Object.assign(app, { repositoryPath: "/tmp/project", activeWorkspaceId: workspaceId, tasks: [task], openTaskTabIds: [task.id] });
  invalidateResultReviews();
  resetTaskAutoReadSuppression({ workspaceId, taskId: task.id });
  await setTaskReadState({ workspaceId, taskId: task.id, read: false });
});
afterEach(() => { Object.assign(globalThis, { window: originalWindow }); Object.assign(app, original); });

/** Start and end offsets of every element named `tag`, including nesting. */
function nestedButtons(html: string) {
  let depth = 0; let nested = 0;
  for (const match of html.matchAll(/<(\/?)button\b/g)) {
    if (match[1]) depth--; else { if (depth > 0) nested++; depth++; }
  }
  return nested;
}
function buttonByAttribute(html: string, attribute: string) {
  return html.match(new RegExp(`<button[^>]*${attribute}[^>]*>`))?.[0] ?? "";
}

test("a Fleet card row keeps its read menu and unread mark outside the row button and names the unread state", () => {
  const html = renderToStaticMarkup(createElement(FleetWorkspaceCard, {
    repositoryPath: "/tmp/project", repositoryName: "project",
    workspace: { id: workspaceId, name: "billing", isDefault: false },
    isCurrentRepository: true, filter: "all", searchQuery: "", nowMs: Date.parse("2026-11-02T00:00:00Z"),
    attentionItems: [], expandedTaskKey: null, cardKey: "card",
    onOpenTask: () => {}, onOpenWorkspace: () => {}, onToggleTaskControl: () => {}, onVisibilityChange: () => {},
  } as never));
  expect(html).toContain('data-fleet-task-row="true"');
  expect(nestedButtons(html)).toBe(0);
  const row = buttonByAttribute(html, 'data-fleet-task-row="true"');
  expect(row).toContain("unread");
  expect(html).toContain('aria-label="Read actions for Fix the billing table"');
});

test("a sidebar task row names its unread state and its controls name the task", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceProgressTaskTreeView, {
    items: [{ taskId: task.id, title: task.title, status: "idle", providerId: "codex" }],
    workspaceId, onOpenTask: () => {},
  }));
  expect(nestedButtons(html)).toBe(0);
  expect(buttonByAttribute(html, `data-workspace-progress-task="${task.id}"`)).toContain('aria-label="Fix the billing table, Idle, unread"');
  expect(html).toContain('aria-label="Pin Fix the billing table"');
  expect(html).toContain('aria-label="Read actions for Fix the billing table"');
});

test("a read menu is named after its task", () => {
  const html = renderToStaticMarkup(createElement(TaskReadMenu, { workspaceId, taskId: "other", title: "Write release notes" }));
  expect(html).toContain('aria-label="Read actions for Write release notes"');
});
