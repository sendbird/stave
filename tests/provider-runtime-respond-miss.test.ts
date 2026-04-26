import { afterEach, describe, expect, mock, test } from "bun:test";

// Task C regression: respondApproval/respondUserInput must surface rich
// diagnostic context (pending request ids, active turn ids) when delivery
// fails, and emit a bridge warning into the active stream so the renderer
// can react even when the direct IPC ok:false response is unhandled.

const actualClaudeRuntime = await import(
  "../electron/providers/claude-sdk-runtime"
);
const actualCodexRuntime = await import(
  "../electron/providers/codex-sdk-runtime"
);
const actualCodexAppServerRuntime = await import(
  "../electron/providers/codex-app-server-runtime"
);

type ResponderHolder = {
  respondApproval?: (args: {
    requestId: string;
    approved: boolean;
  }) => { ok: true } | { ok: false; reason: "unknown-request"; pendingRequestIds: string[] };
  respondUserInput?: (args: {
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => { ok: true } | { ok: false; reason: "unknown-request"; pendingRequestIds: string[] };
  release?: () => void;
};

const holder: ResponderHolder = {};

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
    onEvent?: (event: { type: string }) => void;
    registerApprovalResponder?: (responder: NonNullable<ResponderHolder["respondApproval"]>) => void;
    registerUserInputResponder?: (responder: NonNullable<ResponderHolder["respondUserInput"]>) => void;
  }) => {
    args.registerApprovalResponder?.((callArgs) => {
      // Pretend there's an in-flight request id "real-approval-id" that the
      // caller needs to match; any other id returns unknown-request with the
      // pending snapshot.
      if (callArgs.requestId === "real-approval-id") {
        return { ok: true };
      }
      return {
        ok: false,
        reason: "unknown-request",
        pendingRequestIds: ["real-approval-id"],
      };
    });
    args.registerUserInputResponder?.((callArgs) => {
      if (callArgs.requestId === "real-input-id") {
        return { ok: true };
      }
      return {
        ok: false,
        reason: "unknown-request",
        pendingRequestIds: ["real-input-id"],
      };
    });
    // Keep the stream open until the test calls release() so respondApproval
    // fires against the active session.
    await new Promise<void>((resolve) => {
      holder.release = resolve;
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
  holder.release?.();
  holder.release = undefined;
  await providerRuntime.shutdown();
});

describe("providerRuntime.respondApproval / respondUserInput miss diagnostics", () => {
  test("respondApproval with no active session returns message listing active turn ids", () => {
    const result = providerRuntime.respondApproval({
      turnId: "ghost-turn",
      requestId: "req-1",
      approved: true,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("No active approval responder");
    expect(result.message).toContain("ghost-turn");
    expect(result.message).toContain("activeTurnIds=[");
  });

  test("respondUserInput with no active session returns message listing active turn ids", () => {
    const result = providerRuntime.respondUserInput({
      turnId: "ghost-turn",
      requestId: "req-2",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("No active user-input responder");
    expect(result.message).toContain("ghost-turn");
    expect(result.message).toContain("activeTurnIds=[");
  });

  test("respondApproval with unknown requestId surfaces pending ids and emits bridge warning", async () => {
    const captured: Array<{ type: string; message?: string }> = [];
    const turnId = "turn-c-approval";
    const started = providerRuntime.startTurnStream(
      {
        providerId: "claude-code",
        prompt: "please approve",
        turnId,
      },
      {
        onEvent: (event) => captured.push(event),
        bufferEvents: true,
      },
    );
    expect(started.ok).toBe(true);

    // Let startTurnStream's queueMicrotask run so the mocked stream registers
    // the responder. The mocked stream awaits holder.release so it stays open.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = providerRuntime.respondApproval({
      turnId,
      requestId: "wrong-id",
      approved: true,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Approval responder rejected unknown request");
    expect(result.message).toContain("wrong-id");
    expect(result.message).toContain("pendingRequestIds=[real-approval-id]");

    // The bridge warning should have been injected into the stream buffer so
    // the UI can pick it up on the next read. Drain via readTurnStream.
    const read = providerRuntime.readTurnStream({
      streamId: started.streamId,
      cursor: 0,
    });
    const warning = read.events.find(
      (event) => event.type === "error" && event.message.includes("pendingRequestIds"),
    );
    expect(warning).toBeDefined();
    if (warning && warning.type === "error") {
      expect(warning.recoverable).toBe(true);
    }

    holder.release?.();
  });

  test("respondUserInput with unknown requestId surfaces pending ids and emits bridge warning", async () => {
    const turnId = "turn-c-user-input";
    const started = providerRuntime.startTurnStream(
      {
        providerId: "claude-code",
        prompt: "please answer",
        turnId,
      },
      {
        bufferEvents: true,
      },
    );
    expect(started.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = providerRuntime.respondUserInput({
      turnId,
      requestId: "wrong-input-id",
      answers: { x: "y" },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("User-input responder rejected unknown request");
    expect(result.message).toContain("wrong-input-id");
    expect(result.message).toContain("pendingRequestIds=[real-input-id]");

    const read = providerRuntime.readTurnStream({
      streamId: started.streamId,
      cursor: 0,
    });
    const warning = read.events.find(
      (event) => event.type === "error" && event.message.includes("pendingRequestIds"),
    );
    expect(warning).toBeDefined();

    holder.release?.();
  });
});
