import { afterEach, describe, expect, test } from "bun:test";
import type { ProviderSteerTurnResponse } from "@/lib/providers/provider.types";
import type { ApprovalPart, ChatMessage } from "@/types/chat";

/**
 * Sending from the composer while approvals wait: the real store declines
 * them through the provider bridge, then steers the text into the same turn.
 */
const originalWindow = (globalThis as { window?: unknown }).window;

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  };
}

const approval = (requestId: string): ApprovalPart => ({
  type: "approval",
  requestId,
  toolName: "Bash",
  description: `Run ${requestId}`,
  input: "bun test",
  state: "approval-requested",
});

type RespondArgs = { turnId: string; requestId: string; approved: boolean };

async function setup(options: {
  respond?: (args: RespondArgs) => { ok: boolean; message?: string; unanswerable?: true };
  steer?: () => ProviderSteerTurnResponse;
  midTurnSteeringEnabled?: boolean;
}) {
  const log: string[] = [];
  const steerRequests: Array<{ turnId: string; text: string; enabled?: boolean }> = [];
  let streamCounter = 0;
  (globalThis as { window?: unknown }).window = {
    localStorage: memoryStorage(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    api: {
      provider: {
        startPushTurn: async () => {
          streamCounter += 1;
          return { ok: true, streamId: `stream-${streamCounter}`, turnId: `persisted-${streamCounter}` };
        },
        steerTurn: async (request: { turnId: string; text: string; enabled?: boolean }) => {
          log.push(`steer ${request.text}`);
          steerRequests.push(request);
          return options.steer?.() ?? { ok: true, delivery: "accepted", message: "ok" };
        },
        respondApproval: async (args: RespondArgs) => {
          log.push(`decline ${args.requestId} approved=${args.approved}`);
          return options.respond?.(args) ?? { ok: true, message: "ok" };
        },
        subscribeStreamEvents: () => () => {},
        abortTurn: async () => ({ ok: true, message: "aborted" }),
        cleanupTask: async () => ({ ok: true, message: "cleaned" }),
      },
      persistence: {
        loadWorkspace: async () => ({
          ok: true,
          snapshot: { activeTaskId: "", tasks: [], messagesByTask: {}, promptDraftByTask: {}, providerSessionByTask: {} },
        }),
      },
      fs: { listFiles: async () => ({ ok: true, files: [] }) },
    },
  };

  const { useAppStore } = await import("../src/store/app.store");
  const initial = useAppStore.getInitialState();
  useAppStore.setState({
    ...initial,
    hasHydratedWorkspaces: true,
    repositoryPath: "/tmp/stave-redirect",
    repositoryName: "redirect",
    defaultBranch: "main",
    workspaces: [{ id: "ws-a", name: "Default Workspace", updatedAt: "2026-10-28T00:00:00.000Z" }],
    activeWorkspaceId: "ws-a",
    workspaceBranchById: { "ws-a": "main" },
    workspacePathById: { "ws-a": "/tmp/stave-redirect" },
    workspaceDefaultById: { "ws-a": true },
    tasks: [
      { id: "task-a", title: "Task A", provider: "claude-code", updatedAt: "2026-10-28T00:00:00.000Z", unread: false, archivedAt: null },
    ],
    activeTaskId: "task-a",
    draftProvider: "claude-code",
    messagesByTask: { "task-a": [] },
    activeTurnIdsByTask: {},
    nativeSessionReadyByTask: {},
    providerSessionByTask: {},
    taskWorkspaceIdById: { "task-a": "ws-a" },
    settings: {
      ...initial.settings,
      midTurnSteeringEnabled: options.midTurnSteeringEnabled ?? false,
    },
  });

  void useAppStore.getState().sendUserMessage({
    taskId: "task-a",
    content: "start the work",
    turnOrigin: "conversation",
  });
  await Bun.sleep(10);
  const turnId = useAppStore.getState().activeTurnIdsByTask["task-a"];
  expect(turnId).toBeTruthy();

  // The running turn asks for two approvals.
  useAppStore.setState((state) => ({
    messagesByTask: {
      ...state.messagesByTask,
      "task-a": [
        ...(state.messagesByTask["task-a"] ?? []),
        {
          id: "m-approvals",
          role: "assistant",
          model: "claude-opus",
          providerId: "claude-code",
          content: "",
          turnId,
          parts: [approval("approval-a"), approval("approval-b")],
        } as ChatMessage,
      ],
    },
  }));

  const approvalStates = () =>
    (useAppStore.getState().messagesByTask["task-a"] ?? [])
      .flatMap((message) => message.parts)
      .filter((part): part is ApprovalPart => part.type === "approval")
      .map((part) => `${part.requestId}:${part.state}`);
  const queuedContents = () =>
    (useAppStore.getState().promptDraftByTask["task-a"]?.queuedTurns ?? []).map((item) => item.content);

  const { submitApprovalRedirect } = await import("../src/components/session/approval-redirect-submit");
  let cleared = 0;
  let draftCurrent = true;
  const submit = (mode: "steer" | "queue", text = "use the focused tests instead") =>
    submitApprovalRedirect({
      mode,
      taskId: "task-a",
      text,
      isDraftCurrent: () => draftCurrent,
      clearDraft: () => {
        cleared += 1;
      },
    });

  return {
    useAppStore,
    log,
    steerRequests,
    turnId: turnId!,
    approvalStates,
    queuedContents,
    submit,
    clearedCount: () => cleared,
    setDraftCurrent: (value: boolean) => {
      draftCurrent = value;
    },
  };
}

afterEach(async () => {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState(), true);
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("redirecting a turn that waits on approvals", () => {
  test("declines every approval first, then steers into the same turn even with steering off", async () => {
    const harness = await setup({});
    await harness.submit("steer");

    expect(harness.log).toEqual([
      "decline approval-b approved=false",
      "decline approval-a approved=false",
      "steer use the focused tests instead",
    ]);
    expect(harness.steerRequests[0]).toMatchObject({ turnId: harness.turnId, enabled: true });
    expect(harness.approvalStates()).toEqual(["approval-a:output-denied", "approval-b:output-denied"]);
    expect(harness.clearedCount()).toBe(1);
  });

  test("a failed decline sends nothing and keeps the draft", async () => {
    const harness = await setup({
      respond: (args) =>
        args.requestId === "approval-a" ? { ok: false, message: "runtime refused" } : { ok: true },
    });
    await harness.submit("steer");

    expect(harness.log).toEqual([
      "decline approval-b approved=false",
      "decline approval-a approved=false",
    ]);
    expect(harness.approvalStates()).toEqual(["approval-a:approval-requested", "approval-b:output-denied"]);
    expect(harness.queuedContents()).toEqual([]);
    expect(harness.clearedCount()).toBe(0);
  });

  test("a draft edited during the declines is not sent", async () => {
    const harness = await setup({
      respond: () => {
        harness.setDraftCurrent(false);
        return { ok: true };
      },
    });
    await harness.submit("steer");

    expect(harness.log.filter((line) => line.startsWith("steer"))).toEqual([]);
    expect(harness.queuedContents()).toEqual([]);
    expect(harness.clearedCount()).toBe(0);
  });

  test("an approval the provider no longer knows is closed and skipped", async () => {
    const harness = await setup({
      respond: (args) =>
        args.requestId === "approval-b"
          ? { ok: false, message: "unknown request", unanswerable: true }
          : { ok: true },
    });
    await harness.submit("steer");

    expect(harness.approvalStates()).toEqual(["approval-a:output-denied", "approval-b:approval-interrupted"]);
    expect(harness.log.at(-1)).toBe("steer use the focused tests instead");
    expect(harness.clearedCount()).toBe(1);
  });

  test("a provider that cannot steer gets the declines, then the message is queued", async () => {
    const harness = await setup({});
    await harness.submit("queue");

    expect(harness.log).toEqual([
      "decline approval-b approved=false",
      "decline approval-a approved=false",
    ]);
    expect(harness.queuedContents()).toEqual(["use the focused tests instead"]);
    expect(harness.clearedCount()).toBe(1);
  });

  test("a steer the provider rejects after the declines is queued, not dropped", async () => {
    const harness = await setup({
      steer: () => ({ ok: false, delivery: "rejected", message: "turn not steerable" }),
    });
    await harness.submit("steer");

    expect(harness.approvalStates()).toEqual(["approval-a:output-denied", "approval-b:output-denied"]);
    expect(harness.queuedContents()).toEqual(["use the focused tests instead"]);
    expect(harness.clearedCount()).toBe(1);
  });

  test("the approval card's Decline still reports a provider that can no longer answer", async () => {
    const harness = await setup({
      respond: () => ({ ok: false, message: "unknown request", unanswerable: true }),
    });
    const outcome = await harness.useAppStore.getState().resolveApproval({
      taskId: "task-a",
      messageId: "m-approvals",
      requestId: "approval-a",
      approved: false,
    });

    expect(outcome).toEqual({ status: "failed", message: "unknown request" });
    expect(harness.approvalStates()).toEqual(["approval-a:approval-requested", "approval-b:approval-requested"]);
    const lastMessage = harness.useAppStore.getState().messagesByTask["task-a"]?.at(-1);
    expect(lastMessage?.content).toBe("Approval delivery failed: unknown request");
  });

  test("a plain send while approvals wait is still blocked", async () => {
    const harness = await setup({});
    const result = await harness.useAppStore.getState().sendUserMessage({
      taskId: "task-a",
      content: "just queue this",
      turnOrigin: "conversation",
      submitIntent: "steer",
    });

    expect(result.status).toBe("blocked");
    expect(harness.log).toEqual([]);
  });
});
