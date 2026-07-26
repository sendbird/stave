import { describe, expect, test } from "bun:test";
import { runCodexReadOnlyPromptWithClient } from "../electron/providers/codex-read-only-prompt";

describe("runCodexReadOnlyPromptWithClient", () => {
  test("uses one ephemeral thread, captures usage, and always deletes it", async () => {
    const methods: string[] = [];
    let listener:
      ((message: { method?: string; params?: unknown }) => void) | null = null;
    let threadStartArgs: unknown;
    let turnStartArgs: unknown;
    const request = async <T>(method: string, _params: unknown): Promise<T> => {
      methods.push(method);
      if (method === "account/read") {
        return {
          account: { type: "chatgpt" },
          requiresOpenaiAuth: true,
        } as T;
      }
      if (method === "thread/start") {
        return { thread: { id: "advisor-thread" } } as T;
      }
      if (method === "turn/start") {
        queueMicrotask(() => {
          listener?.({
            method: "thread/tokenUsage/updated",
            params: {
              threadId: "advisor-thread",
              tokenUsage: {
                last: {
                  inputTokens: 12,
                  outputTokens: 5,
                  cachedInputTokens: 3,
                },
              },
            },
          });
          listener?.({
            method: "turn/completed",
            params: {
              threadId: "advisor-thread",
              turn: {
                id: "advisor-turn",
                status: "completed",
                items: [
                  {
                    type: "agentMessage",
                    text: "Check cancellation before primary dispatch.",
                  },
                ],
              },
            },
          });
        });
        return {
          turn: { id: "advisor-turn", status: "inProgress", items: [] },
        } as T;
      }
      return {} as T;
    };

    const result = await runCodexReadOnlyPromptWithClient({
      runtimeCwd: "/workspace/stave",
      prompt: "Review this request.",
      model: "gpt-5.6-terra",
      isolated: true,
      request,
      subscribe: (nextListener) => {
        listener = nextListener;
        return () => {
          listener = null;
        };
      },
      buildThreadStartParams: (args) => {
        threadStartArgs = args;
        return args;
      },
      buildTurnStartParams: (args) => {
        turnStartArgs = args;
        return args;
      },
    });

    expect(result).toEqual({
      ok: true,
      text: "Check cancellation before primary dispatch.",
      usage: {
        type: "usage",
        inputTokens: 12,
        outputTokens: 5,
        cacheReadTokens: 3,
      },
    });
    expect(threadStartArgs).toMatchObject({
      cwd: "/workspace/stave",
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      isolated: true,
      runtimeOptions: {
        model: "gpt-5.6-terra",
        codexFileAccess: "read-only",
        codexNetworkAccess: false,
        codexApprovalPolicy: "never",
        codexPlanMode: false,
      },
    });
    expect(turnStartArgs).toMatchObject({
      threadId: "advisor-thread",
      cwd: "/workspace/stave",
      prompt: "Review this request.",
    });
    expect(methods).toEqual([
      "account/read",
      "thread/start",
      "turn/start",
      "thread/delete",
    ]);
  });

  test("does not start a thread when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let requestCount = 0;

    const result = await runCodexReadOnlyPromptWithClient({
      runtimeCwd: "/workspace/stave",
      prompt: "Review this request.",
      signal: controller.signal,
      request: async <T>() => {
        requestCount += 1;
        return {} as T;
      },
      subscribe: () => () => {},
      buildThreadStartParams: (args) => args,
      buildTurnStartParams: (args) => args,
    });

    expect(result).toMatchObject({ ok: false, aborted: true });
    expect(requestCount).toBe(0);
  });

  test("does not start a turn when aborted while creating the thread", async () => {
    const controller = new AbortController();
    const methods: string[] = [];

    const result = await runCodexReadOnlyPromptWithClient({
      runtimeCwd: "/workspace/stave",
      prompt: "Review this request.",
      signal: controller.signal,
      request: async <T>(method: string) => {
        methods.push(method);
        if (method === "account/read") {
          return {
            account: { type: "chatgpt" },
            requiresOpenaiAuth: true,
          } as T;
        }
        if (method === "thread/start") {
          controller.abort();
          return { thread: { id: "advisor-thread" } } as T;
        }
        return {} as T;
      },
      subscribe: () => () => {},
      buildThreadStartParams: (args) => args,
      buildTurnStartParams: (args) => args,
    });

    expect(result).toMatchObject({ ok: false, aborted: true });
    expect(methods).toEqual(["account/read", "thread/start", "thread/delete"]);
  });

  test("waits for ephemeral thread deletion before returning", async () => {
    let resolveDelete = () => {};
    const deleteFinished = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    let markDeleteStarted = () => {};
    const deleteStarted = new Promise<void>((resolve) => {
      markDeleteStarted = resolve;
    });
    let settled = false;

    const pending = runCodexReadOnlyPromptWithClient({
      runtimeCwd: "/workspace/stave",
      prompt: "Review this request.",
      request: async <T>(method: string) => {
        if (method === "account/read") {
          return {
            account: { type: "chatgpt" },
            requiresOpenaiAuth: true,
          } as T;
        }
        if (method === "thread/start") {
          return { thread: { id: "advisor-thread" } } as T;
        }
        if (method === "turn/start") {
          return {
            turn: {
              id: "advisor-turn",
              status: "completed",
              items: [
                {
                  type: "agentMessage",
                  text: "Check cleanup.",
                },
              ],
            },
          } as T;
        }
        if (method === "thread/delete") {
          markDeleteStarted();
          await deleteFinished;
        }
        return {} as T;
      },
      subscribe: () => () => {},
      buildThreadStartParams: (args) => args,
      buildTurnStartParams: (args) => args,
    }).then((result) => {
      settled = true;
      return result;
    });

    await deleteStarted;
    expect(settled).toBe(false);

    resolveDelete();
    expect(await pending).toMatchObject({
      ok: true,
      text: "Check cleanup.",
    });
  });

  test("bounds a stalled ephemeral thread deletion", async () => {
    const result = await runCodexReadOnlyPromptWithClient({
      runtimeCwd: "/workspace/stave",
      prompt: "Review this request.",
      cleanupTimeoutMs: 5,
      request: async <T>(method: string) => {
        if (method === "account/read") {
          return {
            account: { type: "chatgpt" },
            requiresOpenaiAuth: true,
          } as T;
        }
        if (method === "thread/start") {
          return { thread: { id: "advisor-thread" } } as T;
        }
        if (method === "turn/start") {
          return {
            turn: {
              id: "advisor-turn",
              status: "completed",
              items: [
                {
                  type: "agentMessage",
                  text: "Check cleanup timeout.",
                },
              ],
            },
          } as T;
        }
        if (method === "thread/delete") {
          return new Promise<T>(() => {});
        }
        return {} as T;
      },
      subscribe: () => () => {},
      buildThreadStartParams: (args) => args,
      buildTurnStartParams: (args) => args,
    });

    expect(result).toMatchObject({
      ok: true,
      text: "Check cleanup timeout.",
    });
  });
});
