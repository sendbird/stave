import { afterEach, describe, expect, mock, test } from "bun:test";

// Task B integration: a turn that emits an `approval` event must pause its
// turn-level timeout until the approval is delivered (or the stream ends
// some other way). The provider adapter is mocked to emit an approval event
// and then wait indefinitely, and we assert the stream does NOT time out
// within a window that exceeds the configured turn-timeout.

const actualClaudeRuntime = await import(
  "../electron/providers/claude-sdk-runtime"
);
const actualCodexRuntime = await import(
  "../electron/providers/codex-sdk-runtime"
);
const actualCodexAppServerRuntime = await import(
  "../electron/providers/codex-app-server-runtime"
);

type ApprovalResponder = (args: {
  requestId: string;
  approved: boolean;
}) => { ok: true } | { ok: false; reason: "unknown-request"; pendingRequestIds: string[] };

type StreamController = {
  approvalResponder?: ApprovalResponder;
  release?: () => void;
  eventEmitter?: (event: { type: string; [key: string]: unknown }) => void;
};

const streamController: StreamController = {};

mock.module("../electron/providers/claude-sdk-runtime", () => ({
  ...actualClaudeRuntime,
  buildClaudeEnv: () => ({}),
  cleanupClaudeTask: () => {},
  getClaudeCommandCatalog: async () => ({
    ok: true,
    supported: true,
    commands: [],
    detail: "",
  }),
  resolveClaudeExecutablePath: () => "/tmp/claude",
  streamClaudeWithSdk: async (args: {
    onEvent?: (event: { type: string; [key: string]: unknown }) => void;
    registerApprovalResponder?: (responder: ApprovalResponder) => void;
  }) => {
    streamController.eventEmitter = args.onEvent;
    let pendingRequestId = "approval-req-1";
    let resolverFn: ((approved: boolean) => void) | null = null;
    args.registerApprovalResponder?.((callArgs) => {
      if (callArgs.requestId !== pendingRequestId || !resolverFn) {
        return {
          ok: false,
          reason: "unknown-request",
          pendingRequestIds: resolverFn ? [pendingRequestId] : [],
        };
      }
      const r = resolverFn;
      resolverFn = null;
      r(callArgs.approved);
      return { ok: true };
    });

    // Emit an approval event immediately — this should trigger the runtime
    // to pause the turn timeout.
    args.onEvent?.({
      type: "approval",
      toolName: "bash",
      requestId: pendingRequestId,
      description: "test approval",
    });

    // Wait for the user's approval or test release.
    await new Promise<boolean | void>((resolve) => {
      resolverFn = (approved) => resolve(approved);
      streamController.release = () => resolve();
    });

    args.onEvent?.({ type: "done" });
    return [{ type: "done" }];
  },
}));

mock.module("../electron/providers/codex-sdk-runtime", () => ({
  ...actualCodexRuntime,
  cleanupCodexTask: () => {},
  resolveCodexExecutablePath: () => "/tmp/codex",
  streamCodexWithSdk: async (args: {
    onEvent?: (event: { type: string }) => void;
  }) => {
    args.onEvent?.({ type: "done" });
    return [{ type: "done" }];
  },
}));

mock.module("../electron/providers/codex-app-server-runtime", () => ({
  ...actualCodexAppServerRuntime,
  cleanupCodexAppServerTask: () => {},
  getCodexConnectedToolStatus: async () => ({
    ok: true,
    detail: "",
    tools: [],
  }),
  streamCodexWithAppServer: async (args: {
    onEvent?: (event: { type: string }) => void;
  }) => {
    args.onEvent?.({ type: "done" });
    return [{ type: "done" }];
  },
}));

mock.module("../electron/providers/connected-tool-status", () => ({
  getProviderConnectedToolStatus: async () => ({
    ok: true,
    detail: "",
    tools: [],
  }),
}));

const { providerRuntime } = await import("../electron/providers/runtime");

afterEach(async () => {
  streamController.release?.();
  streamController.release = undefined;
  streamController.eventEmitter = undefined;
  await providerRuntime.shutdown();
});

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

describe("providerRuntime pausable turn timeout", () => {
  test("approval event pauses the turn timeout so a slow user does not abort the stream", async () => {
    const turnId = "turn-pausable-approval";
    const events: Array<{ type: string }> = [];
    let doneSeen = false;

    const started = providerRuntime.startTurnStream(
      {
        providerId: "claude-code",
        prompt: "approve me",
        turnId,
        runtimeOptions: {
          // Very short turn timeout: the approval event must pause it,
          // otherwise the turn aborts before the user can respond.
          providerTimeoutMs: 60,
        },
      },
      {
        onEvent: (event) => {
          events.push(event);
          if (event.type === "done") {
            doneSeen = true;
          }
        },
      },
    );
    expect(started.ok).toBe(true);

    // Let the approval event propagate. We wait well past the 60ms timeout
    // to prove the stream is NOT being aborted while waiting for approval.
    await sleep(150);
    expect(events.some((event) => event.type === "approval")).toBe(true);
    expect(doneSeen).toBe(false);

    // User approves — this should resume the timer AND satisfy the pending
    // approval, unblocking the mocked stream so it can emit done.
    const result = providerRuntime.respondApproval({
      turnId,
      requestId: "approval-req-1",
      approved: true,
    });
    expect(result.ok).toBe(true);

    // Give the stream a moment to finish.
    await sleep(50);
    expect(doneSeen).toBe(true);
  });
});
