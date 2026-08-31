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
      if (method === "mcpServerStatus/list") {
        return {
          data: [
            { name: "github" },
            { name: "linear" },
            // Registered by the Codex plugin runtime, absent from `mcp_servers`.
            { name: "codex_apps" },
          ],
        } as T;
      }
      if (method === "config/read") {
        return { config: { mcp_servers: { github: {}, linear: {} } } } as T;
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
      nativeSessionId: "advisor-thread",
      sessionReused: false,
    });
    // `isolated` only *instructs* the model to avoid MCP; every registered
    // server stays reachable unless disabled per thread, so the isolated call
    // must carry an explicit disable override for each one.
    expect(threadStartArgs).toMatchObject({
      cwd: "/workspace/stave",
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      isolated: true,
      configOverrides: {
        // Declared servers are switched off by name, through a nested value.
        // A quoted dotted key would address a transport-less server instead and
        // Codex would reject the whole configuration.
        mcp_servers: {
          github: { enabled: false },
          linear: { enabled: false },
        },
        // `codex_apps` has no `mcp_servers` entry, so it cannot be named at
        // all — the feature that registers it is disabled instead.
        "features.apps": false,
      },
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
      "config/read",
      "thread/start",
      "turn/start",
      "thread/delete",
    ]);
    expect(
      Object.keys(
        (threadStartArgs as { configOverrides?: Record<string, unknown> })
          .configOverrides ?? {},
      ).some((key) => key.includes('"')),
    ).toBe(false);
  });

  test("resumes and preserves an isolated role session", async () => {
    const methods: string[] = [];
    let resumeArgs: unknown;

    const result = await runCodexReadOnlyPromptWithClient({
      runtimeCwd: "/workspace/stave",
      prompt: "Review the follow-up.",
      isolated: true,
      resumeSessionId: "advisor-thread",
      preserveSession: true,
      request: async <T>(method: string): Promise<T> => {
        methods.push(method);
        if (method === "account/read") {
          return {
            account: { type: "chatgpt" },
            requiresOpenaiAuth: true,
          } as T;
        }
        if (method === "config/read") {
          return { config: { mcp_servers: {} } } as T;
        }
        if (method === "thread/resume") {
          return { thread: { id: "advisor-thread" } } as T;
        }
        if (method === "turn/start") {
          return {
            turn: {
              id: "advisor-turn-2",
              status: "completed",
              items: [{ type: "agentMessage", text: "Reuse it." }],
            },
          } as T;
        }
        return {} as T;
      },
      subscribe: () => () => {},
      buildThreadStartParams: () => {
        throw new Error("A resumed lane must not start a fresh thread.");
      },
      buildThreadResumeParams: (args) => {
        resumeArgs = args;
        return args;
      },
      buildTurnStartParams: (args) => args,
    });

    expect(result).toMatchObject({
      ok: true,
      text: "Reuse it.",
      nativeSessionId: "advisor-thread",
      sessionReused: true,
    });
    expect(resumeArgs).toMatchObject({
      threadId: "advisor-thread",
      cwd: "/workspace/stave",
      secondaryReadOnly: true,
      runtimeOptions: {
        codexFileAccess: "read-only",
        codexNetworkAccess: false,
        codexApprovalPolicy: "never",
      },
    });
    expect(methods).toEqual([
      "account/read",
      "config/read",
      "thread/resume",
      "turn/start",
    ]);
  });

  test("refuses an isolated call when the effective config cannot be read", async () => {
    const methods: string[] = [];

    const result = await runCodexReadOnlyPromptWithClient({
      runtimeCwd: "/workspace/stave",
      prompt: "Review this request.",
      isolated: true,
      request: async <T>(method: string) => {
        methods.push(method);
        if (method === "account/read") {
          return {
            account: { type: "chatgpt" },
            requiresOpenaiAuth: true,
          } as T;
        }
        if (method === "mcpServerStatus/list") {
          return { data: [{ name: "github" }] } as T;
        }
        if (method === "config/read") {
          return { config: "unreadable" } as T;
        }
        return {} as T;
      },
      subscribe: () => () => {},
      buildThreadStartParams: (args) => args,
      buildTurnStartParams: (args) => args,
    });

    // Without the config we cannot tell which servers are safe to name, and
    // naming the wrong one makes Codex reject the entire configuration.
    expect(result).toMatchObject({ ok: false });
    expect(methods).not.toContain("thread/start");
  });

  test("disables a project-scoped server the shared MCP catalog cannot see", async () => {
    const methods: string[] = [];
    let threadStartArgs: unknown;

    await runCodexReadOnlyPromptWithClient({
      runtimeCwd: "/workspace/stave",
      prompt: "Review this request.",
      isolated: true,
      request: async <T>(method: string, params: unknown) => {
        methods.push(method);
        if (method === "account/read") {
          return {
            account: { type: "chatgpt" },
            requiresOpenaiAuth: true,
          } as T;
        }
        if (method === "config/read") {
          // Resolved from `cwd`, so it includes the repo's own config layer.
          return {
            config: { mcp_servers: { globalsrv: {}, projsrv: {} } },
          } as T;
        }
        if (method === "thread/start") {
          threadStartArgs = params;
          return { thread: { id: "advisor-thread" } } as T;
        }
        if (method === "turn/start") {
          return {
            turn: {
              id: "advisor-turn",
              status: "completed",
              items: [{ type: "agentMessage", text: "Fine." }],
            },
          } as T;
        }
        return {} as T;
      },
      subscribe: () => () => {},
      buildThreadStartParams: (args) => args,
      buildTurnStartParams: (args) => args,
    });

    // The catalog runs in the App Server's own directory and takes no cwd, so
    // `projsrv` never appears in it. Gating on it left the server live in a
    // thread whose whole purpose is that nothing MCP is reachable.
    expect(threadStartArgs).toMatchObject({
      configOverrides: {
        mcp_servers: {
          globalsrv: { enabled: false },
          projsrv: { enabled: false },
        },
        "features.apps": false,
      },
    });
    expect(methods).not.toContain("mcpServerStatus/list");
  });

  test("does not resolve the MCP catalog for non-isolated calls", async () => {
    const methods: string[] = [];

    await runCodexReadOnlyPromptWithClient({
      runtimeCwd: "/workspace/stave",
      prompt: "Review this request.",
      request: async <T>(method: string) => {
        methods.push(method);
        if (method === "account/read") {
          return {
            account: { type: "chatgpt" },
            requiresOpenaiAuth: true,
          } as T;
        }
        if (method === "thread/start") {
          return { thread: { id: "read-only-thread" } } as T;
        }
        if (method === "turn/start") {
          return {
            turn: {
              id: "read-only-turn",
              status: "completed",
              items: [{ type: "agentMessage", text: "Fine." }],
            },
          } as T;
        }
        return {} as T;
      },
      subscribe: () => () => {},
      buildThreadStartParams: (args) => args,
      buildTurnStartParams: (args) => args,
    });

    expect(methods).not.toContain("mcpServerStatus/list");
  });

  test("labels failures with the caller, not with Advisor", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runCodexReadOnlyPromptWithClient({
      runtimeCwd: "/workspace/stave",
      prompt: "Summarize the diff.",
      label: "Commit message generation",
      signal: controller.signal,
      request: async <T>() => ({}) as T,
      subscribe: () => () => {},
      buildThreadStartParams: (args) => args,
      buildTurnStartParams: (args) => args,
    });

    // This helper backs commit messages, task naming, and PR descriptions too;
    // their toasts used to read "Advisor was aborted."
    expect(result.detail).toBe("Commit message generation was aborted.");
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
