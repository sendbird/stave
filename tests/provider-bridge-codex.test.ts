import { afterEach, describe, expect, test } from "bun:test";
import { getProviderAdapter } from "@/lib/providers";

const originalWindow = globalThis.window;

function setWindowApi(api: unknown) {
  (globalThis as { window: unknown }).window = { api } as unknown;
}

afterEach(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("codex provider bridge normalization", () => {
  test("accepts normalized bridge events from Electron push streams", async () => {
    let listener: ((payload: { streamId: string; event: unknown; done: boolean }) => void) | null = null;
    let receivedArgs: Record<string, unknown> | null = null;

    setWindowApi({
      provider: {
        subscribeStreamEvents: (cb: (payload: { streamId: string; event: unknown; done: boolean }) => void) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        startPushTurn: async (args: Record<string, unknown>) => {
          receivedArgs = args;
          listener?.({ streamId: "codex-stream-1", event: { type: "text", text: "Hello from Codex" }, done: false });
          listener?.({ streamId: "codex-stream-1", event: { type: "done" }, done: true });
          return { ok: true, streamId: "codex-stream-1", turnId: "turn-1" };
        },
      },
    });

    const adapter = getProviderAdapter({ providerId: "codex" });
    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of adapter.runTurn({
      prompt: "hello",
      conversation: {
        target: { providerId: "codex", model: "gpt-5.4" },
        mode: "chat",
        history: [],
        input: {
          role: "user",
          providerId: "user",
          model: "user",
          content: "hello",
          parts: [{ type: "text", text: "hello" }],
        },
        contextParts: [],
      },
    })) {
      events.push(event as { type: string; text?: string });
    }

    expect(receivedArgs?.conversation).toEqual({
      target: { providerId: "codex", model: "gpt-5.4" },
      mode: "chat",
      history: [],
      input: {
        role: "user",
        providerId: "user",
        model: "user",
        content: "hello",
        parts: [{ type: "text", text: "hello" }],
      },
      contextParts: [],
    });
    expect(events).toEqual([
      { type: "text", text: "Hello from Codex" },
      { type: "done" },
    ]);
  });

  test("surfaces push-stream start failures as visible system events", async () => {
    setWindowApi({
      provider: {
        subscribeStreamEvents: () => () => {},
        startPushTurn: async () => ({
          ok: false,
          streamId: "",
          turnId: null,
          message: "IPC schema rejected provider request. conversation.history.1.parts.0.type: Invalid input",
        }),
      },
    });

    const adapter = getProviderAdapter({ providerId: "codex" });
    const events: Array<{ type: string; content?: string }> = [];
    for await (const event of adapter.runTurn({ prompt: "hello" })) {
      events.push(event as { type: string; content?: string });
    }

    expect(events).toEqual([
      {
        type: "system",
        content: "IPC schema rejected provider request. conversation.history.1.parts.0.type: Invalid input",
      },
      { type: "done" },
    ]);
  });

  test("reorders out-of-order push events by sequence before yielding them", async () => {
    let listener: ((payload: {
      streamId: string;
      event: unknown;
      sequence: number;
      done: boolean;
    }) => void) | null = null;

    setWindowApi({
      provider: {
        subscribeStreamEvents: (cb: typeof listener) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        startPushTurn: async () => {
          queueMicrotask(() => {
            listener?.({
              streamId: "codex-stream-2",
              event: { type: "text", text: "final summary" },
              sequence: 2,
              done: false,
            });
            listener?.({
              streamId: "codex-stream-2",
              event: { type: "done" },
              sequence: 3,
              done: true,
            });
            listener?.({
              streamId: "codex-stream-2",
              event: { type: "text", text: "progress update" },
              sequence: 1,
              done: false,
            });
          });
          return { ok: true, streamId: "codex-stream-2", turnId: "turn-2" };
        },
      },
    });

    const adapter = getProviderAdapter({ providerId: "codex" });
    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of adapter.runTurn({ prompt: "hello" })) {
      events.push(event as { type: string; text?: string });
    }

    expect(events).toEqual([
      { type: "text", text: "progress update" },
      { type: "text", text: "final summary" },
      { type: "done" },
    ]);
  });

  test("falls back to buffered polling when the push stream goes silent", async () => {
    let listener: ((payload: {
      streamId: string;
      event: unknown;
      sequence: number;
      done: boolean;
    }) => void) | null = null;
    const readCalls: Array<{ streamId: string; cursor: number }> = [];

    (globalThis as {
      window: unknown;
    }).window = {
      setTimeout: (callback: (...args: unknown[]) => void) => globalThis.setTimeout(callback, 0),
      clearTimeout: (handle: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(handle),
      api: {
        provider: {
          subscribeStreamEvents: (cb: typeof listener) => {
            listener = cb;
            return () => {
              listener = null;
            };
          },
          startPushTurn: async () => {
            listener?.({
              streamId: "codex-stream-3",
              event: { type: "text", text: "push event" },
              sequence: 1,
              done: false,
            });
            return { ok: true, streamId: "codex-stream-3", turnId: "turn-3" };
          },
          readStreamTurn: async (args: { streamId: string; cursor: number }) => {
            readCalls.push(args);
            if (args.cursor === 1) {
              return {
                ok: true,
                events: [
                  { type: "text", text: "polled catch-up" },
                  { type: "done" },
                ],
                cursor: 3,
                done: true,
              };
            }
            return {
              ok: true,
              events: [],
              cursor: args.cursor,
              done: false,
            };
          },
        },
      },
    } as unknown;

    const adapter = getProviderAdapter({ providerId: "codex" });
    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of adapter.runTurn({ prompt: "hello" })) {
      events.push(event as { type: string; text?: string });
    }

    expect(events).toEqual([
      { type: "text", text: "push event" },
      { type: "text", text: "polled catch-up" },
      { type: "done" },
    ]);
    expect(readCalls[0]).toEqual({
      streamId: "codex-stream-3",
      cursor: 1,
    });
  });

  test("rebases stale polling cursors instead of surfacing a replay-window error", async () => {
    const readCalls: Array<{ streamId: string; cursor: number }> = [];

    setWindowApi({
      provider: {
        startStreamTurn: async () => ({
          ok: true,
          streamId: "codex-stream-5",
        }),
        readStreamTurn: async (args: { streamId: string; cursor: number }) => {
          readCalls.push(args);
          if (args.cursor === 0) {
            return {
              ok: true,
              events: [{ type: "text", text: "alpha" }],
              cursor: 1,
              done: false,
            };
          }
          if (args.cursor === 1) {
            return {
              ok: false,
              events: [],
              cursor: 2,
              done: false,
              message: "Stream cursor is older than the retained replay window.",
            };
          }
          if (args.cursor === 2) {
            return {
              ok: true,
              events: [{ type: "text", text: "omega" }, { type: "done" }],
              cursor: 4,
              done: true,
            };
          }
          return {
            ok: true,
            events: [],
            cursor: args.cursor,
            done: true,
          };
        },
      },
    });

    const adapter = getProviderAdapter({ providerId: "codex" });
    const events: Array<{ type: string; text?: string; content?: string }> = [];
    for await (const event of adapter.runTurn({ prompt: "hello" })) {
      events.push(event as { type: string; text?: string; content?: string });
    }

    expect(events).toEqual([
      { type: "text", text: "alpha" },
      { type: "text", text: "omega" },
      { type: "done" },
    ]);
    expect(readCalls).toEqual([
      { streamId: "codex-stream-5", cursor: 0 },
      { streamId: "codex-stream-5", cursor: 1 },
      { streamId: "codex-stream-5", cursor: 2 },
    ]);
  });

  test("acknowledges consumed push events so host replay can be trimmed", async () => {
    let listener: ((payload: {
      streamId: string;
      event: unknown;
      sequence: number;
      done: boolean;
    }) => void) | null = null;
    const ackCalls: Array<{ streamId: string; cursor: number }> = [];

    (globalThis as {
      window: unknown;
    }).window = {
      setTimeout: (callback: (...args: unknown[]) => void) => globalThis.setTimeout(callback, 0),
      clearTimeout: (handle: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(handle),
      api: {
        provider: {
          subscribeStreamEvents: (cb: typeof listener) => {
            listener = cb;
            return () => {
              listener = null;
            };
          },
          startPushTurn: async () => {
            queueMicrotask(() => {
              listener?.({
                streamId: "codex-stream-4",
                event: { type: "text", text: "push event" },
                sequence: 1,
                done: false,
              });
              listener?.({
                streamId: "codex-stream-4",
                event: { type: "done" },
                sequence: 2,
                done: true,
              });
            });
            return { ok: true, streamId: "codex-stream-4", turnId: "turn-4" };
          },
          ackStreamTurn: async (args: { streamId: string; cursor: number }) => {
            ackCalls.push(args);
            return { ok: true };
          },
          readStreamTurn: async (args: { streamId: string; cursor: number }) => ({
            ok: true,
            events: [],
            cursor: args.cursor,
            done: true,
          }),
        },
      },
    } as unknown;

    const adapter = getProviderAdapter({ providerId: "codex" });
    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of adapter.runTurn({ prompt: "hello" })) {
      events.push(event as { type: string; text?: string });
    }

    expect(events).toEqual([
      { type: "text", text: "push event" },
      { type: "done" },
    ]);
    expect(ackCalls.some((call) => call.streamId === "codex-stream-4" && call.cursor >= 2)).toBe(true);
  });
});
