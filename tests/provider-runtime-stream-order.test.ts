import { afterEach, describe, expect, mock, test } from "bun:test";
import type {
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";
import {
  applyProviderTurnActivityEvents,
  startProviderTurnActivity,
} from "@/lib/providers/turn-status";

const actualClaudeRuntime =
  await import("../electron/providers/claude-sdk-runtime");
const actualCodexAppServerRuntime =
  await import("../electron/providers/codex-app-server-runtime");

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
  streamClaudeWithSdk: async (args: { prompt?: string }) =>
    args.prompt === "runtime-fallback" ? [] : [{ type: "done" }],
  suggestClaudePRDescription: async () => ({
    ok: true,
    title: "fix: stub",
    body: "stub",
  }),
}));

mock.module("../electron/providers/codex-app-server-runtime", () => ({
  ...actualCodexAppServerRuntime,
  cleanupCodexAppServerTask: () => {},
  resolveCodexExecutablePath: () => "/tmp/codex",
  getCodexConnectedToolStatus: async () => ({
    ok: true,
    detail: "",
    tools: [],
  }),
  streamCodexWithAppServer: async (args: {
    prompt?: string;
    onEvent?: (event: { type: string }) => void;
  }) => {
    if (args.prompt === "runtime-fallback") {
      return [];
    }
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

  test.each([
    { providerId: "codex" as const, message: "Codex unavailable/timeout." },
    {
      providerId: "claude-code" as const,
      message: "Claude SDK unavailable/timeout.",
    },
  ])(
    "retains the $providerId unavailable fallback as Turn Activity failure",
    async ({
      providerId,
      message,
    }: {
      providerId: ProviderId;
      message: string;
    }) => {
      let resolveDone = () => undefined;
      const donePromise = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });
      const started = providerRuntime.startTurnStream(
        {
          providerId,
          prompt: "runtime-fallback",
        },
        {
          bufferEvents: true,
          onDone: () => {
            resolveDone();
          },
        },
      );

      await donePromise;
      const page = providerRuntime.readTurnStream({
        streamId: started.streamId,
        cursor: 0,
      });
      expect(page.events).toEqual([
        {
          type: "error",
          message: expect.stringContaining(message),
          recoverable: true,
        },
        { type: "done", stop_reason: "runtime_failure" },
      ]);

      const tracked = startProviderTurnActivity({
        activityByTask: {},
        taskId: "task-fallback",
        turnId: "turn-fallback",
        providerId,
        now: 1000,
      });
      const failed = applyProviderTurnActivityEvents({
        activityByTask: tracked,
        taskId: "task-fallback",
        turnId: "turn-fallback",
        providerId,
        events: page.events as NormalizedProviderEvent[],
        now: 2000,
      });
      expect(failed["task-fallback"]).toMatchObject({
        providerId,
        turnErrorRecoverable: true,
        completedAt: 2000,
      });
    },
  );

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
