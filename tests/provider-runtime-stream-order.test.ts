import { afterEach, describe, expect, mock, test } from "bun:test";

const actualClaudeRuntime = await import("../electron/providers/claude-sdk-runtime");
const actualCodexRuntime = await import("../electron/providers/codex-sdk-runtime");
const actualCodexAppServerRuntime = await import(
  "../electron/providers/codex-app-server-runtime"
);

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
  getClaudeContextUsage: async () => ({ ok: true, detail: "" }),
  prewarmClaudeSdk: async () => ({ ok: true, detail: "" }),
  reloadClaudePlugins: async () => ({ ok: true, detail: "" }),
  resolveClaudeExecutablePath: () => "/tmp/claude",
  streamClaudeWithSdk: async () => [{ type: "done" }],
  suggestClaudeCommitMessage: async () => "fix: stub",
  suggestClaudePRDescription: async () => ({
    ok: true,
    title: "fix: stub",
    body: "stub",
  }),
  suggestClaudeTaskName: async () => "stub",
}));

mock.module("../electron/providers/codex-sdk-runtime", () => ({
  ...actualCodexRuntime,
  cleanupCodexTask: () => {},
  resolveCodexExecutablePath: () => "/tmp/codex",
  streamCodexWithSdk: async (args: { onEvent?: (event: { type: string }) => void }) => {
    args.onEvent?.({ type: "text", text: "progress" });
    args.onEvent?.({ type: "done" });
    return [{ type: "text", text: "progress" }, { type: "done" }];
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
    prompt?: string;
    onEvent?: (event: { type: string }) => void;
  }) => {
    if (args.prompt === "tool-partials") {
      args.onEvent?.({
        type: "tool_result",
        tool_use_id: "tool-1",
        output: "running 1",
        isPartial: true,
      });
      args.onEvent?.({
        type: "tool_result",
        tool_use_id: "tool-1",
        output: "running 2",
        isPartial: true,
      });
      args.onEvent?.({ type: "done" });
      return [
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          output: "running 2",
          isPartial: true,
        },
        { type: "done" },
      ];
    }
    args.onEvent?.({ type: "text", text: "progress" });
    args.onEvent?.({ type: "done" });
    return [{ type: "text", text: "progress" }, { type: "done" }];
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
  await providerRuntime.shutdown();
});

describe("providerRuntime.startTurnStream", () => {
  test("does not synchronously emit push events before returning", async () => {
    let returned = false;
    let sawSynchronousEvent = false;
    const events: string[] = [];
    let resolveDone = () => undefined;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const started = providerRuntime.startTurnStream(
      {
        providerId: "codex",
        prompt: "smoke",
      },
      {
        onEvent: (event) => {
          if (!returned) {
            sawSynchronousEvent = true;
          }
          events.push(event.type);
        },
        onDone: () => {
          resolveDone();
        },
      },
    );

    returned = true;
    await donePromise;

    expect(started.ok).toBe(true);
    expect(sawSynchronousEvent).toBe(false);
    expect(events).toContain("done");
  });

  test("keeps a push stream readable when buffered replay is requested", async () => {
    let resolveDone = () => undefined;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const started = providerRuntime.startTurnStream(
      {
        providerId: "codex",
        prompt: "smoke",
      },
      {
        bufferEvents: true,
        onEvent: () => {},
        onDone: () => {
          resolveDone();
        },
      },
    );

    await donePromise;

    expect(
      providerRuntime.readTurnStream({
        streamId: started.streamId,
        cursor: 0,
      }),
    ).toEqual({
      ok: true,
      events: [{ type: "text", text: "progress" }, { type: "done" }],
      cursor: 2,
      done: true,
    });

    expect(
      providerRuntime.readTurnStream({
        streamId: started.streamId,
        cursor: 2,
      }),
    ).toEqual({
      ok: true,
      events: [],
      cursor: 2,
      done: true,
    });

    expect(
      providerRuntime.readTurnStream({
        streamId: started.streamId,
        cursor: 2,
      }),
    ).toEqual({
      ok: false,
      events: [],
      cursor: 2,
      done: true,
      message: "Stream session not found.",
    });
  });

  test("acknowledges buffered push progress and trims replayed events", async () => {
    let resolveDone = () => undefined;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const started = providerRuntime.startTurnStream(
      {
        providerId: "codex",
        prompt: "smoke",
      },
      {
        bufferEvents: true,
        onEvent: () => {},
        onDone: () => {
          resolveDone();
        },
      },
    );

    await donePromise;

    expect(
      providerRuntime.ackTurnStream({
        streamId: started.streamId,
        cursor: 1,
      }),
    ).toEqual({
      ok: true,
    });

    expect(
      providerRuntime.readTurnStream({
        streamId: started.streamId,
        cursor: 1,
      }),
    ).toEqual({
      ok: true,
      events: [{ type: "done" }],
      cursor: 2,
      done: true,
    });
  });

  test("replaces unread superseded partial tool snapshots in the replay window", async () => {
    let resolveDone = () => undefined;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const started = providerRuntime.startTurnStream(
      {
        providerId: "codex",
        prompt: "tool-partials",
      },
      {
        bufferEvents: true,
        onDone: () => {
          resolveDone();
        },
      },
    );

    await donePromise;

    expect(
      providerRuntime.readTurnStream({
        streamId: started.streamId,
        cursor: 0,
      }),
    ).toEqual({
      ok: true,
      events: [
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          output: "running 2",
          isPartial: true,
        },
        { type: "done" },
      ],
      cursor: 2,
      done: true,
    });
  });

  test("shutdown clears buffered polling streams", async () => {
    const started = providerRuntime.startTurnStream({
      providerId: "codex",
      prompt: "smoke",
    });

    await Promise.resolve();
    await Promise.resolve();
    await providerRuntime.shutdown();

    expect(
      providerRuntime.readTurnStream({
        streamId: started.streamId,
        cursor: 0,
      }),
    ).toEqual({
      ok: false,
      events: [],
      cursor: 0,
      done: true,
      message: "Stream session not found.",
    });
  });
});
