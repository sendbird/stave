import { afterEach, describe, expect, test } from "bun:test";
import type { ApprovalPart } from "@/types/chat";

/**
 * One assistant message can hold several approvals. An answer must reach the
 * request it was given for, never whichever request is the message's latest.
 */
const originalWindow = globalThis.window;

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  };
}

function setWindow(api: unknown) {
  (globalThis as { window: unknown }).window = {
    api,
    localStorage: memoryStorage(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const approval = (requestId: string, description: string, input: string): ApprovalPart => ({
  type: "approval",
  requestId,
  toolName: "bash",
  description,
  input,
  state: "approval-requested",
});

afterEach(async () => {
  const { useAppStore } = await import("@/store/app.store");
  useAppStore.setState(useAppStore.getInitialState(), true);
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("answers reach the request they were given for", () => {
  test("the bell answers its notification's request, not the message's latest", async () => {
    const calls: Array<Record<string, unknown>> = [];
    setWindow({
      provider: {
        respondApproval: async (args: Record<string, unknown>) => {
          calls.push(args);
          return { ok: true };
        },
      },
    });
    const { useAppStore } = await import("@/store/app.store");
    const initial = useAppStore.getInitialState();
    useAppStore.setState({
      ...initial,
      hasHydratedWorkspaces: true,
      repositoryPath: "/tmp/stave-routing",
      repositoryName: "stave-routing",
      workspaces: [{ id: "ws-main", name: "main", updatedAt: "2026-10-22T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-two",
      activeSurface: { kind: "task", taskId: "task-two" },
      workspacePathById: { "ws-main": "/tmp/stave-routing" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-two",
          title: "Two approvals",
          provider: "codex",
          updatedAt: "2026-10-22T00:00:00.000Z",
          unread: false,
          archivedAt: null,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      messagesByTask: {
        "task-two": [
          {
            id: "message-two",
            role: "assistant",
            model: "gpt-5.5",
            providerId: "codex",
            content: "",
            turnId: "turn-two",
            parts: [
              approval("approval-a", "Read the environment file", "cat .env"),
              approval("approval-b", "Run the focused tests", "bun test"),
            ],
          },
        ],
      },
      activeTurnIdsByTask: { "task-two": "turn-two" },
      taskWorkspaceIdById: { "task-two": "ws-main" },
      notifications: [
        {
          id: "notification-a",
          kind: "task.approval_requested",
          title: "Two approvals",
          body: "bash: Read the environment file",
          repositoryPath: "/tmp/stave-routing",
          repositoryName: "stave-routing",
          workspaceId: "ws-main",
          workspaceName: "main",
          taskId: "task-two",
          taskTitle: "Two approvals",
          turnId: "turn-two",
          providerId: "codex",
          action: { type: "approval", requestId: "approval-a", messageId: "message-two" },
          payload: {},
          createdAt: "2026-10-22T00:00:00.000Z",
          readAt: null,
          resolvedAt: null,
          expiresAt: null,
        },
      ],
    } as never);

    await useAppStore.getState().resolveNotificationApproval({
      notificationId: "notification-a",
      approved: true,
    });
    for (let attempt = 0; attempt < 10 && calls.length === 0; attempt += 1) {
      await Bun.sleep(0);
    }

    expect(calls).toEqual([{ turnId: "turn-two", requestId: "approval-a", approved: true }]);
    const parts = useAppStore.getState().messagesByTask["task-two"]?.[0]?.parts ?? [];
    expect(parts.map((part) => (part as ApprovalPart).state)).toEqual([
      "approval-responded",
      "approval-requested",
    ]);
  });

  test("a trusted request is auto-approved alone, even when an untrusted one follows it", async () => {
    const calls: Array<Record<string, unknown>> = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;
    setWindow({
      provider: {
        startPushTurn: async () => ({ ok: true, streamId: "stream-routing", turnId: "turn-routing" }),
        subscribeStreamEvents: (listener: typeof streamListener) => {
          streamListener = listener;
          return () => {
            if (streamListener === listener) streamListener = null;
          };
        },
        respondApproval: async (args: Record<string, unknown>) => {
          calls.push(args);
          return { ok: true, message: "ok" };
        },
      },
      persistence: {
        listWorkspaces: async () => ({ ok: true, rows: [] }),
        upsertWorkspace: async () => ({ ok: true }),
      },
      fs: {
        readFile: async () => ({ ok: false, content: "", revision: "", stderr: "not found" }),
      },
    });
    const { useAppStore } = await import("@/store/app.store");
    const initial = useAppStore.getInitialState();
    useAppStore.setState({
      ...initial,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-routing",
      activeTaskId: "task-routing",
      repositoryPath: "/tmp/stave-routing",
      workspacePathById: { "ws-routing": "/tmp/stave-routing" },
      workspaceBranchById: { "ws-routing": "main" },
      workspaceDefaultById: { "ws-routing": true },
      draftProvider: "codex",
      settings: { ...initial.settings, trustedTools: ["bash:bun test"] },
      tasks: [
        {
          id: "task-routing",
          title: "Trusted and untrusted",
          provider: "codex",
          updatedAt: "2026-10-22T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-routing": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    } as never);

    await useAppStore.getState().sendUserMessage({ taskId: "task-routing", content: "run tests" });
    const activeTurnId = useAppStore.getState().activeTurnIdsByTask["task-routing"];
    expect(activeTurnId).toBeString();

    // Both requests land in the same batch of events, so in one message.
    for (const event of [
      { type: "approval", toolName: "bash", requestId: "approval-trusted", description: "Run bun test", input: "bun test tests/trusted-tools.test.ts" },
      { type: "approval", toolName: "bash", requestId: "approval-untrusted", description: "Remove the build", input: "rm -rf dist" },
    ]) {
      streamListener?.({ streamId: "stream-routing", done: false, event });
    }
    await Bun.sleep(30);

    expect(calls).toEqual([{ turnId: activeTurnId, requestId: "approval-trusted", approved: true }]);
    const parts = (useAppStore.getState().messagesByTask["task-routing"] ?? [])
      .flatMap((message) => message.parts)
      .filter((part): part is ApprovalPart => part.type === "approval");
    expect(parts.map((part) => [part.requestId, part.state])).toEqual([
      ["approval-trusted", "approval-responded"],
      ["approval-untrusted", "approval-requested"],
    ]);
  });
});
