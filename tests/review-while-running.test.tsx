import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { ReviewEditorOriginButton } from "@/components/review/ReviewEditorOriginButton";
import { ReviewTaskStatusLine, resolveReviewTaskStatus } from "@/components/review/ReviewTaskStatusLine";
import { useAppStore } from "@/store/app.store";
import { editorOriginKey, useTaskReviewModeStore } from "@/store/task-review-mode-store";

const TASK = "task-under-review";

type InitialApp = {
  activeTurnIdsByTask: Record<string, string>;
  providerTurnActivityByTask: Record<string, unknown>;
  tasks: unknown[];
};

/** Server rendering reads the stores' initial state for subscriptions, so the state is seeded there. */
const app = useAppStore.getInitialState() as unknown as InitialApp;
const modes = useTaskReviewModeStore.getInitialState();
const saved = {
  activeTurnIdsByTask: app.activeTurnIdsByTask,
  providerTurnActivityByTask: app.providerTurnActivityByTask,
  tasks: app.tasks,
  originByEditorTab: modes.originByEditorTab,
};

afterEach(() => {
  Object.assign(app, {
    activeTurnIdsByTask: saved.activeTurnIdsByTask,
    providerTurnActivityByTask: saved.providerTurnActivityByTask,
    tasks: saved.tasks,
  });
  modes.originByEditorTab = saved.originByEditorTab;
  applyAppLocale("en");
});

function renderStatus(args: { running: boolean; pending?: "approval" | "user_input" }) {
  app.activeTurnIdsByTask = args.running ? { [TASK]: "turn-live" } : {};
  app.providerTurnActivityByTask = args.pending ? { [TASK]: { pendingInteraction: args.pending } } : {};
  return renderToStaticMarkup(createElement(ReviewTaskStatusLine, { taskId: TASK }));
}

describe("Review's line for the task's run", () => {
  test("says what the task does only while it runs", () => {
    expect(resolveReviewTaskStatus({ running: false, pendingInteraction: null })).toBeNull();
    // A request left on a stopped turn is not one the task waits on.
    expect(resolveReviewTaskStatus({ running: false, pendingInteraction: "approval" })).toBeNull();
    expect(resolveReviewTaskStatus({ running: true, pendingInteraction: null })).toBe("working");
    expect(resolveReviewTaskStatus({ running: true, pendingInteraction: "approval" })).toBe("approval");
    expect(resolveReviewTaskStatus({ running: true, pendingInteraction: "user_input" })).toBe("user_input");
  });

  test("takes no row while the task is idle", () => {
    expect(renderStatus({ running: false })).toBe("");
  });

  test("while the task works, offers its conversation and Stop", () => {
    const html = renderStatus({ running: true });
    expect(html).toContain('role="status"');
    expect(html).toContain("This task is still running.");
    expect(html).toContain("Show conversation");
    expect(html).toContain('data-testid="review-stop-turn"');
    expect(html).not.toContain("review-respond-in-conversation");
  });

  test("when the task waits for you, leads to the conversation to respond, in English and Korean", () => {
    const approval = renderStatus({ running: true, pending: "approval" });
    expect(approval).toContain('data-status="approval"');
    expect(approval).toContain("This task is waiting for your approval.");
    expect(approval).toContain('data-testid="review-respond-in-conversation"');
    expect(approval).not.toContain("review-stop-turn");
    expect(renderStatus({ running: true, pending: "user_input" })).toContain("This task is waiting for your answer.");
    applyAppLocale("ko");
    const ko = renderStatus({ running: true, pending: "approval" });
    expect(ko).toContain("이 작업이 승인을 기다리고 있습니다.");
    expect(ko).toContain("대화에서 응답하기");
  });
});

describe("the way back to Review from the editor", () => {
  const SCOPE = { kind: "turn" as const, taskId: TASK, turnId: "turn-1" };
  const TAB = "chat-diff:review:turn-1:src/billing.ts";

  test("the store remembers the Review a diff came from, per workspace, until another opener takes the tab", () => {
    const store = useTaskReviewModeStore.getState();
    const origins = () => useTaskReviewModeStore.getState().originByEditorTab;
    store.rememberEditorOrigin({ workspaceId: "ws-a", editorTabId: TAB, taskId: TASK, scope: SCOPE });
    expect(origins()[editorOriginKey("ws-a", TAB)]).toEqual({ taskId: TASK, scope: SCOPE });
    const before = origins();
    store.rememberEditorOrigin({ workspaceId: "ws-a", editorTabId: TAB, taskId: TASK, scope: { ...SCOPE } });
    expect(origins()).toBe(before);
    // Another workspace's tab with the same id neither overwrites nor drops it.
    store.rememberEditorOrigin({ workspaceId: "ws-b", editorTabId: TAB, taskId: "task-b", scope: SCOPE });
    store.forgetEditorOrigin({ workspaceId: "ws-b", editorTabId: TAB });
    expect(origins()[editorOriginKey("ws-a", TAB)]).toEqual({ taskId: TASK, scope: SCOPE });
    expect(origins()[editorOriginKey("ws-b", TAB)]).toBeUndefined();
    store.forgetEditorOrigin({ workspaceId: "ws-a", editorTabId: TAB });
    expect(origins()[editorOriginKey("ws-a", TAB)]).toBeUndefined();
  });

  test("shows only on a diff opened from Review in this workspace, while its task is open, in English and Korean", () => {
    const render = () => renderToStaticMarkup(createElement(ReviewEditorOriginButton, { editorTabId: TAB }));
    const workspaceId = (app as unknown as { activeWorkspaceId: string }).activeWorkspaceId;
    app.tasks = [{ id: TASK }];
    expect(render()).toBe("");
    modes.originByEditorTab = { [editorOriginKey("another-workspace", TAB)]: { taskId: TASK, scope: SCOPE } };
    expect(render()).toBe("");
    modes.originByEditorTab = { [editorOriginKey(workspaceId, TAB)]: { taskId: TASK, scope: SCOPE } };
    expect(render()).toContain("Back to Review");
    applyAppLocale("ko");
    expect(render()).toContain("검토로 돌아가기");
    // An archived task cannot be opened, so there is no way back to offer.
    app.tasks = [{ id: TASK, archivedAt: "2026-10-23T00:00:00.000Z" }];
    expect(render()).toBe("");
    app.tasks = [];
    expect(render()).toBe("");
  });
});
