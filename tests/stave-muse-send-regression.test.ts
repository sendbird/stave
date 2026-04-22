import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";

const originalWindow = (globalThis as { window?: unknown }).window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
});

describe("stave muse send flow", () => {
  test("keeps the submitted user message visible while routing is still pending", async () => {
    let providerStartCount = 0;
    let resolveRouterStart:
      | ((value: { ok: boolean; streamId?: string; message?: string }) => void)
      | null = null;
    const localStorage = createMemoryStorage();

    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        api: {
          provider: {
            startPushTurn: async () => {
              providerStartCount += 1;
              if (providerStartCount === 1) {
                return await new Promise<{ ok: boolean; streamId?: string; message?: string }>((resolve) => {
                  resolveRouterStart = resolve;
                });
              }
              return {
                ok: false,
                message: "Provider request could not start.",
              };
            },
            subscribeStreamEvents: () => () => {},
            abortTurn: async () => ({ ok: true, message: "aborted" }),
            cleanupTask: async () => ({ ok: true, message: "cleaned" }),
          },
        },
      },
      configurable: true,
      writable: true,
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const persistedStore = useAppStore as typeof useAppStore & {
      persist: {
        setOptions: (options: { storage: ReturnType<typeof createJSONStorage> }) => void;
      };
    };

    persistedStore.persist.setOptions({
      storage: createJSONStorage(() => localStorage as Storage),
    });

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectName: "Stave",
      projectPath: "/tmp/stave-project",
      staveMuse: {
        ...initialState.staveMuse,
        open: true,
        promptDraft: {
          text: "stale draft",
          attachedFilePaths: [],
          attachments: [],
        },
      },
    });

    const sendPromise = useAppStore.getState().sendStaveMuseMessage({
      content: "Why is this so slow?",
    });

    const stateDuringRouting = useAppStore.getState();
    expect(stateDuringRouting.staveMuse.messages).toHaveLength(1);
    expect(stateDuringRouting.staveMuse.messages[0]).toMatchObject({
      role: "user",
      content: "Why is this so slow?",
    });
    expect(stateDuringRouting.staveMuse.promptDraft.text).toBe("");

    resolveRouterStart?.({
      ok: false,
      message: "router unavailable",
    });

    await sendPromise;

    const finalState = useAppStore.getState();
    expect(finalState.staveMuse.messages[0]).toMatchObject({
      role: "user",
      content: "Why is this so slow?",
    });
    expect(finalState.staveMuse.messages[1]?.role).toBe("assistant");
  });

  test("fast-path handoff creates a task instead of starting a muse repo-inspection turn", async () => {
    const startedTurns: Array<{ taskId?: string; prompt?: string }> = [];
    const localStorage = createMemoryStorage();

    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        api: {
          provider: {
            startPushTurn: async (args: { taskId?: string; prompt?: string }) => {
              startedTurns.push(args);
              return {
                ok: true,
                streamId: `stream-${startedTurns.length}`,
                turnId: `turn-${startedTurns.length}`,
              };
            },
            subscribeStreamEvents: () => () => {},
            abortTurn: async () => ({ ok: true, message: "aborted" }),
            cleanupTask: async () => ({ ok: true, message: "cleaned" }),
          },
        },
      },
      configurable: true,
      writable: true,
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const persistedStore = useAppStore as typeof useAppStore & {
      persist: {
        setOptions: (options: { storage: ReturnType<typeof createJSONStorage> }) => void;
      };
    };

    persistedStore.persist.setOptions({
      storage: createJSONStorage(() => localStorage as Storage),
    });

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectName: "Stave",
      projectPath: "/tmp/stave-project",
      workspaces: [{ id: "ws-main", name: "Default Workspace", updatedAt: "2026-04-05T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      workspacePathById: { "ws-main": "/tmp/stave-project/.stave/workspaces/main" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      draftProvider: "codex",
      staveMuse: {
        ...initialState.staveMuse,
        open: true,
      },
    });

    await useAppStore.getState().sendStaveMuseMessage({
      content: "Muse에서 타겟 드롭다운이 안 되는데 stave default workspace 에 새 Task 열고 고쳐달라고해",
    });

    await Bun.sleep(0);

    const stateAfter = useAppStore.getState();
    expect(stateAfter.tasks[0]?.title).toContain("Muse");
    expect(startedTurns).toHaveLength(1);
    expect(startedTurns[0]?.taskId).not.toBe("stave-muse");
    expect(startedTurns[0]?.taskId).not.toBe("stave-muse-router");
  });

  test("connected tool workflows stay in muse chat with read-only runtime boundaries", async () => {
    let startedTurn:
      | {
          taskId?: string;
          cwd?: string;
          conversation?: Record<string, unknown>;
          runtimeOptions?: Record<string, unknown>;
        }
      | undefined;
    const localStorage = createMemoryStorage();

    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        api: {
          provider: {
            startPushTurn: async (args: {
              taskId?: string;
              cwd?: string;
              conversation?: Record<string, unknown>;
              runtimeOptions?: Record<string, unknown>;
            }) => {
              startedTurn = args;
              return {
                ok: true,
                streamId: "stream-connected-tools",
                turnId: "turn-connected-tools",
              };
            },
            subscribeStreamEvents: () => () => {},
            abortTurn: async () => ({ ok: true, message: "aborted" }),
            cleanupTask: async () => ({ ok: true, message: "cleaned" }),
          },
        },
      },
      configurable: true,
      writable: true,
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const persistedStore = useAppStore as typeof useAppStore & {
      persist: {
        setOptions: (options: { storage: ReturnType<typeof createJSONStorage> }) => void;
      };
    };

    persistedStore.persist.setOptions({
      storage: createJSONStorage(() => localStorage as Storage),
    });

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectName: "Stave",
      projectPath: "/tmp/stave-project",
      workspaces: [{ id: "ws-main", name: "Default Workspace", updatedAt: "2026-04-05T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      workspacePathById: { "ws-main": "/tmp/stave-project/.stave/workspaces/main" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      draftProvider: "codex",
      staveMuse: {
        ...initialState.staveMuse,
        open: true,
        providerSession: { codex: "native-session-should-not-resume" },
      },
    });

    await useAppStore.getState().sendStaveMuseMessage({
      content: "Read this Slack thread, create a Jira issue, update Confluence, and put the link in the Information panel.",
    });

    await Bun.sleep(0);

    expect(startedTurn?.taskId).toBe("stave-muse");
    expect(startedTurn?.cwd).toBe("/tmp");
    expect(startedTurn?.runtimeOptions?.codexApprovalPolicy).toBe("never");
    expect(startedTurn?.runtimeOptions?.codexFileAccess).toBe("read-only");

    const conversation = startedTurn?.conversation;
    expect(conversation?.resume).toBeUndefined();

    const contextParts = (conversation?.contextParts as Array<Record<string, unknown>> | undefined) ?? [];
    const sourceIds = contextParts
      .filter((part) => part.type === "retrieved_context")
      .map((part) => String(part.sourceId));

    expect(sourceIds).toContain("stave:muse-chat-prompt");
    expect(sourceIds).toContain("stave:muse-context");
    expect(sourceIds).not.toContain("stave:repo-map");
  });

  test("workflow requests with a Slack thread URL still start a muse chat turn instead of short-circuiting to link-only edits", async () => {
    let startedTurn:
      | {
          taskId?: string;
          cwd?: string;
          conversation?: Record<string, unknown>;
          runtimeOptions?: Record<string, unknown>;
        }
      | undefined;
    const localStorage = createMemoryStorage();

    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        api: {
          provider: {
            startPushTurn: async (args: {
              taskId?: string;
              cwd?: string;
              conversation?: Record<string, unknown>;
              runtimeOptions?: Record<string, unknown>;
            }) => {
              startedTurn = args;
              return {
                ok: true,
                streamId: "stream-url-workflow",
                turnId: "turn-url-workflow",
              };
            },
            subscribeStreamEvents: () => () => {},
            abortTurn: async () => ({ ok: true, message: "aborted" }),
            cleanupTask: async () => ({ ok: true, message: "cleaned" }),
          },
        },
      },
      configurable: true,
      writable: true,
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const persistedStore = useAppStore as typeof useAppStore & {
      persist: {
        setOptions: (options: { storage: ReturnType<typeof createJSONStorage> }) => void;
      };
    };

    persistedStore.persist.setOptions({
      storage: createJSONStorage(() => localStorage as Storage),
    });

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectName: "Stave",
      projectPath: "/tmp/stave-project",
      workspaces: [{ id: "ws-main", name: "Default Workspace", updatedAt: "2026-04-05T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      workspacePathById: { "ws-main": "/tmp/stave-project/.stave/workspaces/main" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      draftProvider: "codex",
      staveMuse: {
        ...initialState.staveMuse,
        open: true,
      },
    });

    await useAppStore.getState().sendStaveMuseMessage({
      content: "Read this Slack thread, create a Jira issue, and put everything in the Information panel https://acme.slack.com/archives/C123/p1234567890123456",
    });

    await Bun.sleep(0);

    expect(startedTurn?.taskId).toBe("stave-muse");
    expect(useAppStore.getState().workspaceInformation.slackThreads).toHaveLength(0);
  });

  test("connected tool preflight returns a system message instead of starting a turn when auth is missing", async () => {
    let startedTurn = false;
    const localStorage = createMemoryStorage();

    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        api: {
          provider: {
            checkAvailability: async () => ({
              ok: true,
              available: true,
              detail: "ready",
            }),
            getConnectedToolStatus: async () => ({
              ok: true,
              providerId: "codex" as const,
              detail: "loaded",
              tools: [
                {
                  id: "slack" as const,
                  label: "Slack",
                  state: "needs-auth" as const,
                  available: false,
                  detail: "Missing SLACK_OAUTH_TOKEN in the Codex runtime environment.",
                },
              ],
            }),
            startPushTurn: async () => {
              startedTurn = true;
              return {
                ok: true,
                streamId: "stream-connected-tools",
                turnId: "turn-connected-tools",
              };
            },
            subscribeStreamEvents: () => () => {},
            abortTurn: async () => ({ ok: true, message: "aborted" }),
            cleanupTask: async () => ({ ok: true, message: "cleaned" }),
          },
        },
      },
      configurable: true,
      writable: true,
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const persistedStore = useAppStore as typeof useAppStore & {
      persist: {
        setOptions: (options: { storage: ReturnType<typeof createJSONStorage> }) => void;
      };
    };

    persistedStore.persist.setOptions({
      storage: createJSONStorage(() => localStorage as Storage),
    });

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectName: "Stave",
      projectPath: "/tmp/stave-project",
      workspaces: [{ id: "ws-main", name: "Default Workspace", updatedAt: "2026-04-05T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      workspacePathById: { "ws-main": "/tmp/stave-project/.stave/workspaces/main" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      draftProvider: "codex",
      staveMuse: {
        ...initialState.staveMuse,
        open: true,
      },
    });

    await useAppStore.getState().sendStaveMuseMessage({
      content: "Send a Slack message to the team channel.",
    });

    await Bun.sleep(0);

    const stateAfter = useAppStore.getState();
    expect(startedTurn).toBe(false);
    expect(stateAfter.staveMuse.messages).toHaveLength(2);
    expect(stateAfter.staveMuse.messages[1]?.role).toBe("assistant");
    expect(stateAfter.staveMuse.messages[1]?.content).toContain("Slack");
    expect(stateAfter.staveMuse.messages[1]?.content).toContain("SLACK_OAUTH_TOKEN");
  });
});
