import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppNotification } from "@/lib/notifications/notification.types";
import { createEmptyWorkspaceState } from "@/store/workspace-session-state";
import type { ChatMessage, Task } from "@/types/chat";

// A parent in one worktree delegated work that runs in another. The child's
// approval and question must be answerable from the parent's composer, with
// the child's identity, without selecting the child or switching workspaces.
const REPOSITORY_PATH = "/tmp/child-request-project";
const NOW = "2026-10-01T00:00:00.000Z";
const parent: Task = { id: "parent", title: "Consult two models", provider: "claude-code", updatedAt: NOW, unread: false,
  controlMode: "interactive", controlOwner: "stave" };
const child: Task = { id: "child", title: "Implementation", provider: "codex", updatedAt: NOW, unread: false,
  controlMode: "managed", controlOwner: "external", parentTaskId: "parent" };
const messages: ChatMessage[] = [
  { id: "approval-message", role: "assistant", model: "gpt-5.3-codex", providerId: "codex", content: "",
    parts: [{ type: "approval", requestId: "approval-1", toolName: "Shell", description: "Run focused tests", state: "approval-requested" }] },
  { id: "question-message", role: "assistant", model: "gpt-5.3-codex", providerId: "codex", content: "",
    parts: [{ type: "user_input", requestId: "question-1", toolName: "request_user_input", state: "input-requested",
      questions: [{ question: "Which branch?", header: "Branch", options: [{ label: "Current", description: "Keep it here." }] }] }] },
];
const root = { parentTaskId: "parent", ancestorTaskIds: ["parent"], rootTaskId: "parent", rootWorkspaceId: "parent-workspace",
  rootWorkspaceName: "Parent", rootTaskTitle: "Consult two models" };
function notification(overrides: Partial<AppNotification> & Pick<AppNotification, "id" | "kind">): AppNotification {
  return { title: "Consult two models", body: "", repositoryPath: REPOSITORY_PATH, repositoryName: "project",
    workspaceId: "child-workspace", workspaceName: "Child", taskId: "child", taskTitle: "Implementation",
    turnId: "child-turn", providerId: "codex", action: null, payload: root, createdAt: NOW, readAt: null, resolvedAt: null, ...overrides };
}
const approvalNotification = notification({ id: "notification-approval", kind: "task.approval_requested",
  action: { type: "approval", requestId: "approval-1", messageId: "approval-message" }, payload: { ...root, toolName: "Shell" } });
const questionNotification = notification({ id: "notification-question", kind: "task.user_input_requested",
  createdAt: "2026-10-01T00:00:01.000Z", payload: { ...root, requestId: "question-1", messageId: "question-message" } });

const originalWindow = globalThis.window;
const responses: Array<{ kind: string; [key: string]: unknown }> = [];

beforeEach(async () => {
  responses.length = 0;
  globalThis.window = {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    api: { localMcp: {
      respondApproval: async (args: Record<string, unknown>) => { responses.push({ kind: "approval", ...args }); return { ok: true }; },
      respondUserInput: async (args: Record<string, unknown>) => { responses.push({ kind: "user-input", ...args }); return { ok: true }; },
    } },
  } as unknown as Window & typeof globalThis;
  const { useAppStore } = await import("@/store/app.store");
  useAppStore.setState({ ...useAppStore.getInitialState(), repositoryPath: REPOSITORY_PATH,
    activeWorkspaceId: "parent-workspace", activeTaskId: "parent", tasks: [parent],
    workspaces: [{ id: "parent-workspace", name: "Parent", updatedAt: NOW }, { id: "child-workspace", name: "Child", updatedAt: NOW }],
    taskWorkspaceIdById: { parent: "parent-workspace", child: "child-workspace" },
    workspaceRuntimeCacheById: { "child-workspace": { ...createEmptyWorkspaceState(), nativeSessionReadyByTask: {},
      tasks: [child], activeTaskId: "child", messagesByTask: { child: messages }, activeTurnIdsByTask: { child: "child-turn" } } },
    notifications: [questionNotification, approvalNotification] });
});

afterEach(async () => {
  const { useAppStore } = await import("@/store/app.store");
  useAppStore.setState(useAppStore.getInitialState(), true);
  globalThis.window = originalWindow;
});

async function flush() {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe("child requests in the parent composer", () => {
  test("the parent's slot shows the oldest child request with the child's attribution", async () => {
    const { ChildRequestView, findChildPendingRequest } = await import("@/components/session/ChildRequestSlot");
    const { selectDelegatedInteractionRequests } = await import("@/lib/notifications/delegated-attention");
    const notifications = [questionNotification, approvalNotification];
    const requests = selectDelegatedInteractionRequests({ notifications, taskId: "parent",
      repositoryPath: REPOSITORY_PATH, now: Date.parse(NOW) });
    const current = requests[0]!;
    const pending = findChildPendingRequest({ expected: current.identity, messages, activeTurnId: "child-turn" });
    const html = renderToStaticMarkup(createElement(ChildRequestView, { requestId: current.identity.requestId,
      childTitle: current.childTaskTitle, providerId: current.providerId, pending, queuedCount: requests.length - 1,
      busy: false, error: null, settled: false, onRespond: () => {} }));
    expect(html).toContain('aria-label="Requests from delegated tasks"');
    expect(html).toContain("Implementation");
    expect(html).toContain('data-agent-identity="GPT-5.3-Codex"');
    expect(html).toContain("Shell");
    expect(html).toContain("Run focused tests");
    // The same approval card as the composer, in the same decision words.
    expect(html).toContain("Allow once");
    expect(html).toContain("Deny");
    expect(html).toContain('data-density="compact"');
    // Delivered through the delegating host, which keeps no standing grant.
    expect(html).not.toContain("Always allow");
    expect(html).toContain("+1 more");
    // The child itself, or an unrelated task, has nothing to answer on a child's behalf.
    for (const taskId of ["child", "elsewhere"]) {
      expect(selectDelegatedInteractionRequests({ notifications, taskId, repositoryPath: REPOSITORY_PATH,
        now: Date.parse(NOW) })).toEqual([]);
    }
    // A request from another turn renders without controls.
    expect(findChildPendingRequest({ expected: current.identity, messages, activeTurnId: "replacement-turn" })).toBeNull();
  });

  test("approving from the parent answers the child's request and settles its notification", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const { respondToFleetInteraction } = await import("@/lib/fleet/interaction-respond");
    const { selectDelegatedInteractionRequests } = await import("@/lib/notifications/delegated-attention");
    const select = () => selectDelegatedInteractionRequests({ notifications: useAppStore.getState().notifications,
      taskId: "parent", repositoryPath: REPOSITORY_PATH, now: Date.parse(NOW) });
    const request = select()[0]!;
    expect(request.identity).toEqual({ repositoryPath: REPOSITORY_PATH, workspaceId: "child-workspace", taskId: "child",
      turnId: "child-turn", kind: "approval", requestId: "approval-1", messageId: "approval-message" });

    expect(respondToFleetInteraction(request.identity, { kind: "approval", approved: true })).toEqual({ ok: true, messageId: "approval-message" });
    await flush();

    expect(responses).toEqual([{ kind: "approval", workspaceId: "child-workspace", taskId: "child", requestId: "approval-1", approved: true }]);
    expect(select().map((item) => item.identity.requestId)).toEqual(["question-1"]);
    const state = useAppStore.getState();
    expect([state.activeWorkspaceId, state.activeTaskId]).toEqual(["parent-workspace", "parent"]);
  });

  test("answering the child's question carries the child identity and answers", async () => {
    const { respondToFleetInteraction } = await import("@/lib/fleet/interaction-respond");
    const identity = { repositoryPath: REPOSITORY_PATH, workspaceId: "child-workspace", taskId: "child", turnId: "child-turn",
      kind: "user-input" as const, requestId: "question-1", messageId: "question-message" };
    expect(respondToFleetInteraction(identity, { kind: "user-input", answers: { "Which branch?": "Current" } }).ok).toBe(true);
    await flush();
    expect(responses).toEqual([{ kind: "user-input", workspaceId: "child-workspace", taskId: "child", requestId: "question-1",
      answers: { "Which branch?": "Current" }, denied: undefined }]);
  });

  test("a response prepared for another child turn is refused", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const { respondToFleetInteraction } = await import("@/lib/fleet/interaction-respond");
    useAppStore.setState((state) => ({ workspaceRuntimeCacheById: { "child-workspace": {
      ...state.workspaceRuntimeCacheById["child-workspace"]!, activeTurnIdsByTask: { child: "replacement-turn" } } } }));
    const result = respondToFleetInteraction({ repositoryPath: REPOSITORY_PATH, workspaceId: "child-workspace", taskId: "child",
      turnId: "child-turn", kind: "approval", requestId: "approval-1", messageId: "approval-message" }, { kind: "approval", approved: true });
    await flush();
    expect(result.ok).toBe(false);
    expect(responses).toEqual([]);
  });

  test("only a request with nothing left to answer offers a close control", async () => {
    const { ChildRequestView, findChildPendingRequest } = await import("@/components/session/ChildRequestSlot");
    const pending = findChildPendingRequest({ expected: { repositoryPath: REPOSITORY_PATH, workspaceId: "child-workspace",
      taskId: "child", turnId: "child-turn", kind: "approval", requestId: "approval-1", messageId: "approval-message" },
      messages, activeTurnId: "child-turn" });
    const render = (overrides: Partial<Parameters<typeof ChildRequestView>[0]>) =>
      renderToStaticMarkup(createElement(ChildRequestView, { requestId: "approval-1", childTitle: "Implementation",
        providerId: "codex", pending: null, queuedCount: 0, busy: false, error: null, settled: true,
        onRespond: () => {}, onDismiss: () => {}, ...overrides }));
    const close = 'aria-label="Close"';

    const settled = render({});
    expect(settled).toContain("This request was answered or expired.");
    expect(settled).toContain(close);
    // Not proven over: still answerable, not yet found, being delivered, or
    // unreadable (the request may still be waiting). Closing any of them would
    // hide a live request from this composer and from Fleet.
    expect(render({ pending, settled: false })).not.toContain(close);
    expect(render({ settled: false })).toContain("Loading request…");
    expect(render({ settled: false })).not.toContain(close);
    expect(render({ busy: true })).not.toContain(close);
    expect(render({ error: "This request could not be loaded." })).not.toContain(close);
    // A view without a close handler, like the frame preview, shows none.
    expect(render({ onDismiss: undefined })).not.toContain(close);
  });

  test("closing a settled request persists and does not bring it back", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const { dismissChildRequest } = await import("@/components/session/ChildRequestSlot");
    const { selectDelegatedInteractionRequests } = await import("@/lib/notifications/delegated-attention");
    const persisted: Array<{ id: string; resolvedAt?: string }> = [];
    (window.api as unknown as Record<string, unknown>).persistence = {
      listNotifications: async () => ({ ok: true, notifications: [] }),
      createNotification: async () => ({ ok: true }),
      markAllNotificationsRead: async () => ({ ok: true, count: 0 }),
      markNotificationRead: async (args: { id: string; readAt?: string; resolvedAt?: string }) => {
        persisted.push({ id: args.id, resolvedAt: args.resolvedAt });
        const source = [questionNotification, approvalNotification].find((item) => item.id === args.id)!;
        return { ok: true, notification: { ...source, readAt: args.readAt ?? null, resolvedAt: args.resolvedAt ?? null } };
      },
    };
    // The child already answered its question elsewhere, so the parent's card
    // reads "answered or expired" until it is closed.
    const select = () => selectDelegatedInteractionRequests({ notifications: useAppStore.getState().notifications,
      taskId: "parent", repositoryPath: REPOSITORY_PATH, now: Date.parse(NOW) }).map((item) => item.notificationId);
    expect(select()).toEqual(["notification-approval", "notification-question"]);

    await dismissChildRequest("notification-approval");
    await flush();

    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.id).toBe("notification-approval");
    expect(typeof persisted[0]!.resolvedAt).toBe("string");
    // The next queued request takes the slot; the closed one stays gone after
    // the persisted record is merged back.
    expect(select()).toEqual(["notification-question"]);
    const closed = useAppStore.getState().notifications.find((item) => item.id === "notification-approval");
    expect(closed?.resolvedAt).toBe(persisted[0]!.resolvedAt);
    // The parent stays where it was.
    const state = useAppStore.getState();
    expect([state.activeWorkspaceId, state.activeTaskId]).toEqual(["parent-workspace", "parent"]);
  });

  test("a request counts as over only when its message is loaded and nothing pending matches", async () => {
    const { findChildPendingRequest, isChildRequestSettled } = await import("@/components/session/ChildRequestSlot");
    const approval = { repositoryPath: REPOSITORY_PATH, workspaceId: "child-workspace", taskId: "child", turnId: "child-turn",
      kind: "approval" as const, requestId: "approval-1", messageId: "approval-message" };
    const answered: ChatMessage[] = [{ ...messages[0]!, parts: [{ type: "approval", requestId: "approval-1", toolName: "Shell",
      description: "Run focused tests", state: "approval-responded" }] }];
    const settled = (overrides: Partial<Parameters<typeof isChildRequestSettled>[0]>) =>
      isChildRequestSettled({ expected: approval, taskLoaded: true, messages: answered, messageCount: answered.length,
        activeTurnId: "child-turn", ...overrides });

    // Answered in the child, its message loaded: over.
    expect(settled({})).toBe(true);
    // Still pending in the same turn: not over.
    expect(settled({ messages })).toBe(false);
    // The turn ended while it waited: an approval cannot be answered any more.
    expect(settled({ messages, activeTurnId: "replacement-turn" })).toBe(true);
    // Only a later page is loaded and older messages exist: unknown, not over.
    const later: ChatMessage[] = [{ id: "later", role: "assistant", content: "", parts: [] }];
    expect(settled({ messages: later, messageCount: 200 })).toBe(false);
    // Every message is loaded and the request is not among them: over.
    expect(settled({ messages: later, messageCount: later.length })).toBe(true);
    // The child is not loaded at all: unknown.
    expect(settled({ taskLoaded: false })).toBe(false);
    expect(settled({ messages: undefined })).toBe(false);

    // An asynchronous question did not pause its turn and stays answerable
    // after it ends, as sending it does: pending, so neither "answered" nor closable.
    const question = { ...approval, kind: "user-input" as const, requestId: "async-1", messageId: "async-message" };
    const asyncMessages: ChatMessage[] = [{ id: "async-message", role: "assistant", content: "", parts: [{ type: "user_input",
      requestId: "async-1", toolName: "ask", state: "input-requested", delivery: "async",
      questions: [{ question: "Which branch?", header: "Branch", options: [{ label: "Current", description: "" }] }] }] }];
    expect(findChildPendingRequest({ expected: question, messages: asyncMessages, activeTurnId: null })?.messageId).toBe("async-message");
    expect(isChildRequestSettled({ expected: question, taskLoaded: true, messages: asyncMessages, messageCount: 1,
      activeTurnId: null })).toBe(false);
    // A blocking question from an ended turn is over.
    const blocking: ChatMessage[] = [{ ...asyncMessages[0]!, parts: asyncMessages[0]!.parts.map((part) =>
      part.type === "user_input" ? { ...part, delivery: undefined } : part) }];
    expect(isChildRequestSettled({ expected: question, taskLoaded: true, messages: blocking, messageCount: 1,
      activeTurnId: null })).toBe(true);
  });

  test("a close that fails to save puts the request back", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const { dismissChildRequest } = await import("@/components/session/ChildRequestSlot");
    const { selectDelegatedInteractionRequests } = await import("@/lib/notifications/delegated-attention");
    (window.api as unknown as Record<string, unknown>).persistence = {
      listNotifications: async () => ({ ok: true, notifications: [] }),
      createNotification: async () => ({ ok: true }),
      markAllNotificationsRead: async () => ({ ok: true, count: 0 }),
      markNotificationRead: async () => ({ ok: false, notification: null }),
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      const select = () => selectDelegatedInteractionRequests({ notifications: useAppStore.getState().notifications,
        taskId: "parent", repositoryPath: REPOSITORY_PATH, now: Date.parse(NOW) }).map((item) => item.notificationId);
      const pending = dismissChildRequest("notification-approval");
      // The card leaves at once, as with any close.
      expect(select()).toEqual(["notification-question"]);
      expect(await pending).toBe(false);
      // The write failed, so the store holds what the next load would show.
      expect(select()).toEqual(["notification-approval", "notification-question"]);
      expect(useAppStore.getState().notifications.find((item) => item.id === "notification-approval"))
        .toEqual(approvalNotification);
    } finally {
      console.error = originalError;
    }
  });
});
