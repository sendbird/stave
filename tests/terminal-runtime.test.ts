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
      screenState: "while detached\u001b[1B\u001b[14D",
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
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

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
