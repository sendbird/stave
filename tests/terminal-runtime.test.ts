import { afterEach, describe, expect, mock, test } from "bun:test";

type ExitPayload = { exitCode: number; signal?: number };

class FakeDisposable {
  disposed = false;

  dispose() {
    this.disposed = true;
  }
}

class FakePty {
  destroyed = false;
  killed = false;
  paused = false;
  pauseCalls = 0;
  resumeCalls = 0;
  writes: string[] = [];
  dataListeners: Array<{
    listener: (data: string) => void;
    disposable: FakeDisposable;
  }> = [];
  exitListeners: Array<{
    listener: (event: ExitPayload) => void;
    disposable: FakeDisposable;
  }> = [];

  onData(listener: (data: string) => void) {
    const disposable = new FakeDisposable();
    this.dataListeners.push({ listener, disposable });
    return disposable;
  }

  onExit(listener: (event: ExitPayload) => void) {
    const disposable = new FakeDisposable();
    this.exitListeners.push({ listener, disposable });
    return disposable;
  }

  write(input: string) {
    this.writes.push(input);
  }

  resize(_cols: number, _rows: number) {}

  kill() {
    this.killed = true;
  }

  destroy() {
    this.destroyed = true;
  }

  pause() {
    this.paused = true;
    this.pauseCalls += 1;
  }

  resume() {
    this.paused = false;
    this.resumeCalls += 1;
  }

  fireData(data: string) {
    for (const entry of this.dataListeners) {
      if (!entry.disposable.disposed) {
        entry.listener(data);
      }
    }
  }

  fireExit(event: ExitPayload) {
    for (const entry of this.exitListeners) {
      if (!entry.disposable.disposed) {
        entry.listener(event);
      }
    }
  }
}

const fakePtys: FakePty[] = [];
const fakeSpawnCalls: Array<{
  command: string;
  args: string[];
  options: {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
  };
}> = [];
let fakeClaudeAutoModeSupported = true;

mock.module("node-pty", () => ({
  spawn: (
    command: string,
    args: string[],
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string>;
    },
  ) => {
    const fake = new FakePty();
    fakePtys.push(fake);
    fakeSpawnCalls.push({ command, args, options });
    return fake;
  },
}));

mock.module("../electron/providers/cli-path-env", () => ({
  resolveClaudeCliExecutablePath: () => "/tmp/fake-claude",
  resolveClaudeCliAutoModeSupport: () => fakeClaudeAutoModeSupported,
  resolveCodexCliExecutablePath: () => "/tmp/fake-codex",
  buildClaudeCliEnv: () => ({ PATH: process.env.PATH ?? "" }),
  buildCodexCliEnv: () => ({ PATH: process.env.PATH ?? "" }),
}));

const { createTerminalRuntime } =
  await import("../electron/host-service/terminal-runtime");

const TERMINAL_PUSH_FLUSH_MAX_BYTES = 128 * 1024;
const TERMINAL_BACKGROUND_BUFFER_MAX_BYTES = 2 * 1024 * 1024;

afterEach(() => {
  fakePtys.length = 0;
  fakeSpawnCalls.length = 0;
  fakeClaudeAutoModeSupported = true;
});

describe("terminal runtime PTY cleanup", () => {
  test("closeSession disposes PTY listeners before destroying the PTY", () => {
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const runtime = createTerminalRuntime({
      emitEvent: async (event, payload) => {
        emitted.push({ event, payload });
      },
    });

    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    expect(created.sessionId).toBeTruthy();

    const fake = fakePtys[0];
    expect(fake).toBeTruthy();

    const result = runtime.closeSession({ sessionId: created.sessionId! });
    expect(result).toEqual({ ok: true });
    expect(fake.destroyed).toBe(true);
    expect(fake.dataListeners.every((entry) => entry.disposable.disposed)).toBe(
      true,
    );
    expect(fake.exitListeners.every((entry) => entry.disposable.disposed)).toBe(
      true,
    );

    fake.fireData("late output");
    fake.fireExit({ exitCode: 0 });
    expect(emitted).toEqual([]);
  });
});

describe("terminal runtime slot lifecycle", () => {
  test("reuses the existing PTY for the same terminal slot", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const args = {
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push" as const,
    };

    const first = runtime.createSession(args);
    const second = runtime.createSession(args);

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: true,
      sessionId: first.sessionId,
    });
    expect(fakePtys).toHaveLength(1);
    expect(
      runtime.getSlotState({ slotKey: "terminal:workspace-1:tab-1" }),
    ).toEqual({
      state: "background",
      sessionId: first.sessionId,
    });
  });

  test("restores detached terminal backlog when the same slot reattaches", async () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    const sessionId = created.sessionId!;
    const slotKey = "terminal:workspace-1:tab-1";
    const fake = fakePtys[0]!;

    fake.fireData("while detached\r\n");

    expect(runtime.getSlotState({ slotKey })).toEqual({
      state: "background",
      sessionId,
    });
    const attached = await runtime.attachSession({
      sessionId,
      deliveryMode: "push",
    });
    expect(attached).toEqual({
      ok: true,
      attachmentId: expect.any(String),
      backlog: "while detached\r\n",
      screenState: "while detached\u001b[1B\u001b[14D\u001b[2;1H",
    });
    expect(
      runtime.resumeSessionStream({
        sessionId,
        attachmentId: attached.attachmentId!,
      }),
    ).toEqual({ ok: true });
    expect(runtime.getSlotState({ slotKey })).toEqual({
      state: "running",
      sessionId,
    });
  });

  test("returns canonical screen state even when raw backlog contains stale screen history", async () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    const sessionId = created.sessionId!;
    const fake = fakePtys[0]!;

    fake.fireData("hello\r\n");
    fake.fireData("\x1b[2J\x1b[H");

    expect(
      await runtime.attachSession({ sessionId, deliveryMode: "push" }),
    ).toEqual({
      ok: true,
      attachmentId: expect.any(String),
      backlog: "hello\r\n\x1b[2J\x1b[H",
      screenState: "",
    });
  });

  test("answers device queries from the backend mirror while the renderer is detached", async () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    const sessionId = created.sessionId!;
    const fake = fakePtys[0]!;

    fake.fireData("\x1b[0c");
    const attached = await runtime.attachSession({
      sessionId,
      deliveryMode: "push",
    });
    runtime.resumeSessionStream({
      sessionId,
      attachmentId: attached.attachmentId!,
    });

    expect(fake.writes).toContain("\x1b[?1;2c");
  });

  test("chunks push delivery output to transport-safe sizes", async () => {
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const runtime = createTerminalRuntime({
      emitEvent: async (event, payload) => {
        emitted.push({ event, payload });
      },
    });

    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    const sessionId = created.sessionId!;
    const attached = await runtime.attachSession({
      sessionId,
      deliveryMode: "push",
    });
    runtime.resumeSessionStream({
      sessionId,
      attachmentId: attached.attachmentId!,
    });

    fakePtys[0]!.fireData("x".repeat(TERMINAL_PUSH_FLUSH_MAX_BYTES + 123));
    for (let index = 0; index < 10; index += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(emitted).toHaveLength(2);
    const firstPayload = emitted[0]!.payload as { output: string };
    const secondPayload = emitted[1]!.payload as { output: string };
    expect(firstPayload.output.length + secondPayload.output.length).toBe(
      TERMINAL_PUSH_FLUSH_MAX_BYTES + 123,
    );
    expect(Buffer.byteLength(firstPayload.output, "utf8")).toBe(
      TERMINAL_PUSH_FLUSH_MAX_BYTES,
    );
    expect(Buffer.byteLength(secondPayload.output, "utf8")).toBe(123);
  });

  test("pauses the PTY until the renderer acknowledges cumulative bytes", async () => {
    const emitted: Array<{ event: string; payload: any }> = [];
    const runtime = createTerminalRuntime({
      emitEvent: async (event, payload) => {
        emitted.push({ event, payload });
      },
    });
    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "flow-control",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });
    const attached = await runtime.attachSession({
      sessionId: created.sessionId!,
      deliveryMode: "push",
    });
    runtime.resumeSessionStream({
      sessionId: created.sessionId!,
      attachmentId: attached.attachmentId!,
    });

    const fake = fakePtys[0]!;
    for (let index = 0; index < 5; index += 1) {
      fake.fireData("x".repeat(128 * 1024));
    }
    for (let index = 0; index < 10; index += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(fake.pauseCalls).toBeGreaterThan(0);
    const outputEvents = emitted.filter(
      (entry) => entry.event === "terminal.output",
    );
    const sentBytes = outputEvents.reduce(
      (total, entry) => total + entry.payload.bytes,
      0,
    );
    expect(
      runtime.ackSessionOutput({
        sessionId: created.sessionId!,
        attachmentId: attached.attachmentId!,
        acknowledgedBytes: sentBytes,
      }),
    ).toEqual({ ok: true });
    expect(fake.resumeCalls).toBeGreaterThan(0);
  });

  test("resumes a flow-paused PTY when its renderer detaches", async () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });
    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "flow-detach",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });
    const attached = await runtime.attachSession({
      sessionId: created.sessionId!,
      deliveryMode: "push",
    });
    runtime.resumeSessionStream({
      sessionId: created.sessionId!,
      attachmentId: attached.attachmentId!,
    });

    const fake = fakePtys[0]!;
    for (let index = 0; index < 5; index += 1) {
      fake.fireData("x".repeat(128 * 1024));
    }
    for (let index = 0; index < 10; index += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(fake.paused).toBe(true);

    runtime.detachSession({
      sessionId: created.sessionId!,
      attachmentId: attached.attachmentId!,
    });
    expect(fake.paused).toBe(false);
    expect(fake.resumeCalls).toBeGreaterThan(0);
  });

  test("persists a terminal snapshot across runtime recreation", async () => {
    const snapshots = new Map<string, string>();
    const persistence = {
      saveTerminalSnapshot: ({
        slotKey,
        screenState,
      }: {
        slotKey: string;
        screenState: string;
      }) => {
        snapshots.set(slotKey, screenState);
      },
      loadTerminalSnapshot: ({ slotKey }: { slotKey: string }) => {
        const screenState = snapshots.get(slotKey);
        return screenState
          ? { screen_state: screenState, updated_at: new Date().toISOString() }
          : undefined;
      },
      deleteTerminalSnapshot: ({ slotKey }: { slotKey: string }) => {
        snapshots.delete(slotKey);
      },
    };
    const createArgs = {
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "snapshot",
      cwd: "/tmp/workspace",
      deliveryMode: "push" as const,
    };
    const firstRuntime = createTerminalRuntime({
      emitEvent: async () => {},
      persistence,
    });
    firstRuntime.createSession(createArgs);
    fakePtys[0]!.fireData("persist me");
    await firstRuntime.cleanupAll();
    expect(snapshots.has("terminal:workspace-1:snapshot")).toBe(true);

    const secondRuntime = createTerminalRuntime({
      emitEvent: async () => {},
      persistence,
    });
    const recreated = secondRuntime.createSession(createArgs);
    const attached = await secondRuntime.attachSession({
      sessionId: recreated.sessionId!,
      deliveryMode: "push",
    });
    expect(attached.screenState).toContain("persist me");
  });

  test("merges a persisted snapshot with output from the recreated PTY", async () => {
    const slotKey = "terminal:workspace-1:restored-output";
    const snapshots = new Map([[slotKey, "persisted screen\r\n"]]);
    const persistence = {
      saveTerminalSnapshot: ({
        slotKey: savedSlotKey,
        screenState,
      }: {
        slotKey: string;
        screenState: string;
      }) => {
        snapshots.set(savedSlotKey, screenState);
      },
      loadTerminalSnapshot: ({
        slotKey: loadedSlotKey,
      }: {
        slotKey: string;
      }) => {
        const screenState = snapshots.get(loadedSlotKey);
        return screenState
          ? { screen_state: screenState, updated_at: new Date().toISOString() }
          : undefined;
      },
      deleteTerminalSnapshot: ({
        slotKey: deletedSlotKey,
      }: {
        slotKey: string;
      }) => {
        snapshots.delete(deletedSlotKey);
      },
    };
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
      persistence,
    });
    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "restored-output",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });
    fakePtys[0]!.fireData("fresh prompt\r\n");

    const attached = await runtime.attachSession({
      sessionId: created.sessionId!,
      deliveryMode: "push",
    });

    expect(attached.screenState).toContain("persisted screen");
    expect(attached.screenState).toContain("fresh prompt");
  });

  test("waits for the headless mirror before closing sessions by slot prefix", async () => {
    const snapshots = new Map<string, string>();
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
      persistence: {
        saveTerminalSnapshot: ({ slotKey, screenState }) => {
          snapshots.set(slotKey, screenState);
        },
        loadTerminalSnapshot: () => undefined,
        deleteTerminalSnapshot: () => {},
      },
    });
    runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "archive",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });
    fakePtys[0]!.fireData("latest output");

    const result = await runtime.closeSessionsBySlotPrefix({
      prefix: "terminal:workspace-1:",
    });

    expect(result).toEqual({ ok: true, closedCount: 1 });
    expect(snapshots.get("terminal:workspace-1:archive")).toContain(
      "latest output",
    );
  });

  test("caps detached backlog to a bounded size before reattach", async () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    const sessionId = created.sessionId!;
    fakePtys[0]!.fireData(
      "x".repeat(TERMINAL_BACKGROUND_BUFFER_MAX_BYTES + 4096),
    );

    const attached = await runtime.attachSession({
      sessionId,
      deliveryMode: "push",
    });

    expect(
      Buffer.byteLength(attached.backlog ?? "", "utf8"),
    ).toBeLessThanOrEqual(TERMINAL_BACKGROUND_BUFFER_MAX_BYTES);
  });

  test("preserves exited slot state for background sessions until the slot is recreated", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    const sessionId = created.sessionId!;
    const slotKey = "terminal:workspace-1:tab-1";
    const fake = fakePtys[0]!;

    fake.fireExit({ exitCode: 0 });

    expect(runtime.getSlotState({ slotKey })).toEqual({
      state: "exited",
      exitCode: 0,
      signal: undefined,
    });

    const recreated = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(recreated.ok).toBe(true);
    expect(recreated.sessionId).not.toBe(sessionId);
    expect(fakePtys).toHaveLength(2);
    expect(runtime.getSlotState({ slotKey })).toEqual({
      state: "background",
      sessionId: recreated.sessionId,
    });
  });

  test("ignores stale detach requests after a replacement attach", async () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    const sessionId = created.sessionId!;
    const firstAttach = await runtime.attachSession({
      sessionId,
      deliveryMode: "push",
    });
    const secondAttach = await runtime.attachSession({
      sessionId,
      deliveryMode: "push",
    });

    expect(
      runtime.detachSession({
        sessionId,
        attachmentId: firstAttach.attachmentId!,
      }),
    ).toEqual({ ok: true });
    expect(
      runtime.getSlotState({ slotKey: "terminal:workspace-1:tab-1" }),
    ).toEqual({
      state: "running",
      sessionId,
    });

    expect(
      runtime.detachSession({
        sessionId,
        attachmentId: secondAttach.attachmentId!,
      }),
    ).toEqual({ ok: true });
    expect(
      runtime.getSlotState({ slotKey: "terminal:workspace-1:tab-1" }),
    ).toEqual({
      state: "background",
      sessionId,
    });
  });

  test("creates Claude CLI sessions with a reusable native session id", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "claude-code",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    expect(created.sessionId).toBeTruthy();
    expect(created.nativeSessionId).toBeTruthy();
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-claude",
      args: [
        "--enable-auto-mode",
        "--permission-mode",
        "auto",
        "--session-id",
        created.nativeSessionId!,
      ],
      options: expect.objectContaining({
        cwd: "/tmp/workspace",
      }),
    });
    expect(
      runtime.getSessionResumeInfo({ sessionId: created.sessionId! }),
    ).toEqual({
      ok: true,
      nativeSessionId: created.nativeSessionId,
    });
  });

  test("falls back to default mode for older Claude CLI sessions", () => {
    fakeClaudeAutoModeSupported = false;
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "claude-code",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-claude",
      args: [
        "--permission-mode",
        "default",
        "--session-id",
        created.nativeSessionId!,
      ],
      options: expect.objectContaining({
        cwd: "/tmp/workspace",
      }),
    });
  });

  test("uses the configured Claude permission mode for CLI sessions", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "claude-code",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
      runtimeOptions: {
        claudePermissionMode: "acceptEdits",
      },
    });

    expect(created.ok).toBe(true);
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-claude",
      args: [
        "--enable-auto-mode",
        "--permission-mode",
        "acceptEdits",
        "--session-id",
        created.nativeSessionId!,
      ],
      options: expect.objectContaining({
        cwd: "/tmp/workspace",
      }),
    });
  });

  test("keeps explicit Claude permission modes on older CLI sessions", () => {
    fakeClaudeAutoModeSupported = false;
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "claude-code",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
      runtimeOptions: {
        claudePermissionMode: "acceptEdits",
      },
    });

    expect(created.ok).toBe(true);
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-claude",
      args: [
        "--permission-mode",
        "acceptEdits",
        "--session-id",
        created.nativeSessionId!,
      ],
      options: expect.objectContaining({
        cwd: "/tmp/workspace",
      }),
    });
  });

  test("resumes Codex CLI sessions from a stored native session id", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "codex",
      contextMode: "workspace",
      nativeSessionId: "codex-session-1",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created).toEqual({
      ok: true,
      sessionId: expect.any(String),
      nativeSessionId: "codex-session-1",
    });
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-codex",
      args: ["resume", "codex-session-1"],
      options: expect.objectContaining({
        cwd: "/tmp/workspace",
      }),
    });
    expect(
      runtime.getSessionResumeInfo({ sessionId: created.sessionId! }),
    ).toEqual({
      ok: true,
      nativeSessionId: "codex-session-1",
    });
  });
});
