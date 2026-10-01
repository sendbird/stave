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
const root = { parentTaskId: "parent", rootTaskId: "parent", rootWorkspaceId: "parent-workspace",
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
    const requests = selectDelegatedInteractionRequests({ notifications, rootTaskId: "parent",
      repositoryPath: REPOSITORY_PATH, now: Date.parse(NOW) });
    const current = requests[0]!;
    const pending = findChildPendingRequest({ expected: current.identity, messages, activeTurnId: "child-turn" });
    const html = renderToStaticMarkup(createElement(ChildRequestView, { requestId: current.identity.requestId,
      childTitle: current.childTaskTitle, providerId: current.providerId, pending, queuedCount: requests.length - 1,
      busy: false, error: null, loaded: true, onRespond: () => {} }));
    expect(html).toContain('aria-label="Requests from delegated tasks"');
    expect(html).toContain("Implementation");
    expect(html).toContain('data-agent-identity="GPT-5.3-Codex"');
    expect(html).toContain("Shell");
    expect(html).toContain("Run focused tests");
    expect(html).toContain("Approve");
    expect(html).toContain("+1 more from delegated tasks");
    // The child itself, or an unrelated task, has nothing to answer on a child's behalf.
    for (const rootTaskId of ["child", "elsewhere"]) {
      expect(selectDelegatedInteractionRequests({ notifications, rootTaskId, repositoryPath: REPOSITORY_PATH,
        now: Date.parse(NOW) })).toEqual([]);
    }
    // A request from another turn renders without controls.
    expect(findChildPendingRequest({ expected: current.identity, messages, activeTurnId: "replacement-turn" })).toBeNull();
  });

  test("approving from the parent answers the child's request and settles its notification", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const { respondToChildInteraction } = await import("@/components/team/respond-child-interaction");
    const { selectDelegatedInteractionRequests } = await import("@/lib/notifications/delegated-attention");
    const select = () => selectDelegatedInteractionRequests({ notifications: useAppStore.getState().notifications,
      rootTaskId: "parent", repositoryPath: REPOSITORY_PATH, now: Date.parse(NOW) });
    const request = select()[0]!;
    expect(request.identity).toEqual({ repositoryPath: REPOSITORY_PATH, workspaceId: "child-workspace", taskId: "child",
      turnId: "child-turn", kind: "approval", requestId: "approval-1", messageId: "approval-message" });

    expect(respondToChildInteraction(request.identity, { kind: "approval", approved: true })).toEqual({ ok: true, messageId: "approval-message" });
    await flush();

    expect(responses).toEqual([{ kind: "approval", workspaceId: "child-workspace", taskId: "child", requestId: "approval-1", approved: true }]);
    expect(select().map((item) => item.identity.requestId)).toEqual(["question-1"]);
    const state = useAppStore.getState();
    expect([state.activeWorkspaceId, state.activeTaskId]).toEqual(["parent-workspace", "parent"]);
  });

  test("answering the child's question carries the child identity and answers", async () => {
    const { respondToChildInteraction } = await import("@/components/team/respond-child-interaction");
    const identity = { repositoryPath: REPOSITORY_PATH, workspaceId: "child-workspace", taskId: "child", turnId: "child-turn",
      kind: "user-input" as const, requestId: "question-1", messageId: "question-message" };
    expect(respondToChildInteraction(identity, { kind: "user-input", answers: { "Which branch?": "Current" } }).ok).toBe(true);
    await flush();
    expect(responses).toEqual([{ kind: "user-input", workspaceId: "child-workspace", taskId: "child", requestId: "question-1",
      answers: { "Which branch?": "Current" }, denied: undefined }]);
  });

  test("a response prepared for another child turn is refused", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const { respondToChildInteraction } = await import("@/components/team/respond-child-interaction");
    useAppStore.setState((state) => ({ workspaceRuntimeCacheById: { "child-workspace": {
      ...state.workspaceRuntimeCacheById["child-workspace"]!, activeTurnIdsByTask: { child: "replacement-turn" } } } }));
    const result = respondToChildInteraction({ repositoryPath: REPOSITORY_PATH, workspaceId: "child-workspace", taskId: "child",
      turnId: "child-turn", kind: "approval", requestId: "approval-1", messageId: "approval-message" }, { kind: "approval", approved: true });
    await flush();
    expect(result.ok).toBe(false);
    expect(responses).toEqual([]);
  });
});
