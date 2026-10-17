import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import { workspaceExecutionGate } from "../electron/shared/workspace-execution-gate";
import { afterEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { OPENCODE_NATIVE_SESSION_DISCOVERY } from "../src/lib/terminal/native-session-discovery-window";

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

mock.module("../electron/providers/cursor-cli-env", () => ({
  resolveCursorAgentExecutablePath: () => "/tmp/fake-agent",
  buildCursorAgentEnv: () => ({ PATH: process.env.PATH ?? "" }),
}));

let fakeKiroSessions: Array<{ sessionId: string; updatedAtMs: number }> = [];
const fakeKiroListCalls: Array<{ executablePath: string; cwd: string }> = [];

mock.module("../electron/host-service/kiro-native-session-files", () => ({
  listKiroSessions: async (listArgs: {
    executablePath: string;
    cwd: string;
  }) => {
    fakeKiroListCalls.push({
      executablePath: listArgs.executablePath,
      cwd: listArgs.cwd,
    });
    return fakeKiroSessions;
  },
}));

mock.module("../electron/providers/kiro-cli-env", () => ({
  resolveKiroExecutablePath: () => "/tmp/fake-kiro",
  buildKiroCliEnv: () => ({ PATH: process.env.PATH ?? "" }),
}));

let fakeOpenCodeSessions: Array<{ sessionId: string; updatedAtMs: number }> = [];
const fakeOpenCodeListCalls: Array<{ executablePath: string; cwd: string }> = [];

mock.module("../electron/host-service/opencode-native-session-files", () => ({
  canonicalOpenCodeDirectory: (value: string) => value,
  listOpenCodeSessions: async (listArgs: {
    executablePath: string;
    cwd: string;
  }) => {
    fakeOpenCodeListCalls.push({
      executablePath: listArgs.executablePath,
      cwd: listArgs.cwd,
    });
    return fakeOpenCodeSessions;
  },
}));

let fakeOpenCodeMajorVersion: number | null = 1;

mock.module("../electron/providers/opencode-cli-env", () => ({
  resolveOpenCodeExecutablePath: () => "/tmp/fake-opencode",
  buildOpenCodeCliEnv: () => ({ PATH: process.env.PATH ?? "" }),
  readOpenCodeMajorVersion: () => fakeOpenCodeMajorVersion,
}));

const { rememberOpenCodeAcpSessionId } = await import(
  "../electron/providers/opencode/opencode-session-registry"
);

const { createTerminalRuntime } =
  await import("../electron/host-service/terminal-runtime");
const { Terminal: HeadlessTerminal } = await import("@xterm/headless");

const TERMINAL_PUSH_FLUSH_MAX_BYTES = 128 * 1024;
const TERMINAL_BACKGROUND_BUFFER_MAX_BYTES = 2 * 1024 * 1024;

afterEach(() => {
  fakePtys.length = 0;
  fakeSpawnCalls.length = 0;
  fakeClaudeAutoModeSupported = true;
  fakeKiroSessions = [];
  fakeKiroListCalls.length = 0;
  fakeOpenCodeSessions = [];
  fakeOpenCodeListCalls.length = 0;
  fakeOpenCodeMajorVersion = 1;
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

  test("destroys the PTY when the child exits on its own", async () => {
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

    const fake = fakePtys[0];
    expect(fake).toBeTruthy();

    // The child process exits by itself (no closeSession() call). The exit
    // handler must release the PTY master fd via destroy(); disposing the
    // listeners alone would orphan it — the fd leak this guards against.
    fake.fireExit({ exitCode: 0 });
    await Promise.resolve();

    expect(fake.destroyed).toBe(true);
    expect(fake.dataListeners.every((entry) => entry.disposable.disposed)).toBe(
      true,
    );
    expect(fake.exitListeners.every((entry) => entry.disposable.disposed)).toBe(
      true,
    );
  });

  test("destroys the PTY when a flow-paused session's child exits", async () => {
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

    const fake = fakePtys[0];
    expect(fake).toBeTruthy();

    // Simulate the leak's corner case: the PTY is flow-paused (renderer
    // backpressure) and the child then exits. node-pty's socket never reads
    // EOF while paused, so only an explicit destroy() reclaims the master fd.
    fake.pause();
    expect(fake.paused).toBe(true);

    fake.fireExit({ exitCode: 143, signal: 15 });
    await Promise.resolve();

    expect(fake.destroyed).toBe(true);
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

  describe("headless mirror writes", () => {
    const originalWrite = HeadlessTerminal.prototype.write;
    afterEach(() => {
      HeadlessTerminal.prototype.write = originalWrite;
    });

    function createMirroredSession() {
      const runtime = createTerminalRuntime({ emitEvent: async () => {} });
      const created = runtime.createSession({
        workspaceId: "workspace-1",
        workspacePath: "/tmp/workspace",
        taskId: null,
        taskTitle: null,
        terminalTabId: "mirror",
        cwd: "/tmp/workspace",
        deliveryMode: "push",
      });
      return { runtime, sessionId: created.sessionId!, fake: fakePtys[0]! };
    }

    test("hands a burst of output to xterm immediately instead of queuing it", async () => {
      let pendingCallbacks = 0;
      let writeCalls = 0;
      HeadlessTerminal.prototype.write = function (data, callback) {
        writeCalls += 1;
        pendingCallbacks += 1;
        return originalWrite.call(this, data, () => {
          pendingCallbacks -= 1;
          callback?.();
        });
      };
      const { runtime, sessionId, fake } = createMirroredSession();

      for (let index = 0; index < 500; index += 1) {
        fake.fireData(`line ${index}\r\n`);
      }
      // Every chunk is already with xterm: nothing waits in a promise chain.
      expect(writeCalls).toBe(500);

      const attached = await runtime.attachSession({ sessionId, deliveryMode: "push" });
      expect(pendingCallbacks).toBe(0);
      expect(attached.screenState).toContain("line 499");
    });

    test("keeps output order and includes everything written before the snapshot", async () => {
      const { runtime, sessionId, fake } = createMirroredSession();
      fake.fireData("first\r\n");
      fake.fireData("second\r\n");
      fake.fireData("third\r\n");

      const { screenState = "" } = await runtime.attachSession({ sessionId, deliveryMode: "push" });

      expect(screenState.indexOf("first")).toBeGreaterThanOrEqual(0);
      expect(screenState.indexOf("first")).toBeLessThan(screenState.indexOf("second"));
      expect(screenState.indexOf("second")).toBeLessThan(screenState.indexOf("third"));
    });

    test("a chunk xterm refuses is dropped without breaking the PTY handler", async () => {
      const warnings: unknown[][] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args);
      };
      try {
        const { runtime, sessionId, fake } = createMirroredSession();
        fake.fireData("kept\r\n");
        HeadlessTerminal.prototype.write = function (data, callback) {
          if (String(data).includes("overflow")) {
            throw new Error("write data discarded, use flow control to avoid losing data");
          }
          return originalWrite.call(this, data, callback);
        };

        expect(() => {
          fake.fireData("overflow 1\r\n");
          fake.fireData("overflow 2\r\n");
        }).not.toThrow();
        fake.fireData("after\r\n");

        const attached = await runtime.attachSession({ sessionId, deliveryMode: "push" });
        expect(attached.screenState).toContain("kept");
        expect(attached.screenState).toContain("after");
        const drops = warnings.filter(([message]) =>
          String(message).includes("headless mirror dropped"),
        );
        expect(drops).toEqual([
          ["[terminal] headless mirror dropped PTY output", { droppedBytes: 12 }],
        ]);
      } finally {
        console.warn = originalWarn;
      }
    });
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

  test("native login uses an ephemeral PTY and retains output only while the session is alive", async () => {
    const snapshotWrites: unknown[] = [];
    let snapshotReads = 0;
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
      persistence: {
        saveTerminalSnapshot: (args) => { snapshotWrites.push(args); },
        loadTerminalSnapshot: () => { snapshotReads++; return { screen_state: "old login output", updated_at: "fixture" }; },
        deleteTerminalSnapshot: () => {},
      },
    });
    const input = { providerId: "codex" as const, profileId: "system-default", workspaceId: "workspace-1", workspacePath: "/tmp/workspace" };
    const created = runtime.createProviderLoginSession(input);
    expect(created.ok).toBe(true);
    expect(fakeSpawnCalls.at(-1)?.args).toEqual(["login"]);
    expect(created.nativeSessionId).toBeUndefined();
    expect(snapshotReads).toBe(0);
    fakePtys.at(-1)!.fireData("Open the native login link\r\n");
    expect(runtime.readSession({ sessionId: created.sessionId! }).output).toContain("Open the native login link");
    expect(runtime.createProviderLoginSession(input).sessionId).toBe(created.sessionId);
    await runtime.attachSession({ sessionId: created.sessionId!, deliveryMode: "push" });
    await runtime.closeSession({ sessionId: created.sessionId! });
    expect(snapshotWrites).toEqual([]);
    expect(fakePtys.at(-1)!.destroyed).toBe(true);
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
  test("starts Cursor CLI sessions with no arguments", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "cursor",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    expect(created.nativeSessionId).toBeUndefined();
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-agent",
      args: [],
      options: expect.objectContaining({ cwd: "/tmp/workspace" }),
    });
  });

  test("resumes Cursor CLI sessions from a stored native session id", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "cursor",
      contextMode: "workspace",
      nativeSessionId: "cursor-chat-1",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created).toEqual({
      ok: true,
      sessionId: expect.any(String),
      nativeSessionId: "cursor-chat-1",
    });
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-agent",
      args: ["--resume", "cursor-chat-1"],
      options: expect.objectContaining({ cwd: "/tmp/workspace" }),
    });
  });

  test("starts Kiro CLI sessions in chat mode", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "kiro",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-kiro",
      args: ["chat"],
      options: expect.objectContaining({ cwd: "/tmp/workspace" }),
    });
  });

  test("discovers the Kiro native session id after spawn", async () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const startedAtMs = Date.now();
    fakeKiroSessions = [
      { sessionId: "kiro-stale", updatedAtMs: startedAtMs - 600_000 },
      { sessionId: "kiro-fresh", updatedAtMs: startedAtMs + 1_000 },
    ];

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "kiro",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    expect(created.nativeSessionId).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();

    expect(fakeKiroListCalls.at(-1)).toEqual({
      executablePath: "/tmp/fake-kiro",
      cwd: "/tmp/workspace",
    });
    expect(
      runtime.getSessionResumeInfo({ sessionId: created.sessionId! }),
    ).toEqual({
      ok: true,
      nativeSessionId: "kiro-fresh",
    });

    runtime.closeSession({ sessionId: created.sessionId! });
  });

  test("ignores Kiro sessions already claimed by another PTY", async () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const startedAtMs = Date.now();
    fakeKiroSessions = [
      { sessionId: "kiro-shared", updatedAtMs: startedAtMs + 1_000 },
    ];

    const first = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "kiro",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });
    await Promise.resolve();
    await Promise.resolve();

    const second = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-2",
      providerId: "kiro",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(
      runtime.getSessionResumeInfo({ sessionId: first.sessionId! }),
    ).toEqual({ ok: true, nativeSessionId: "kiro-shared" });
    expect(
      runtime.getSessionResumeInfo({ sessionId: second.sessionId! }),
    ).toEqual({ ok: true, nativeSessionId: undefined });

    runtime.closeSession({ sessionId: first.sessionId! });
    runtime.closeSession({ sessionId: second.sessionId! });
  });

  test("starts the OpenCode TUI bare and discovers its session after spawn", async () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const startedAtMs = Date.now();
    fakeOpenCodeSessions = [
      { sessionId: "ses_stale", updatedAtMs: startedAtMs - 600_000 },
      { sessionId: "ses_fresh", updatedAtMs: startedAtMs + 1_000 },
    ];

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "opencode",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    expect(created.nativeSessionId).toBeUndefined();
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-opencode",
      args: [],
      options: expect.objectContaining({ cwd: "/tmp/workspace" }),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(fakeOpenCodeListCalls.at(-1)).toEqual({
      executablePath: "/tmp/fake-opencode",
      cwd: "/tmp/workspace",
    });
    expect(
      runtime.getSessionResumeInfo({ sessionId: created.sessionId! }),
    ).toEqual({
      ok: true,
      nativeSessionId: "ses_fresh",
    });

    runtime.closeSession({ sessionId: created.sessionId! });
  });

  test("ignores OpenCode sessions already claimed by another PTY", async () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });
    fakeOpenCodeSessions = [{ sessionId: "ses_shared", updatedAtMs: Date.now() + 1_000 }];
    const create = (cliSessionTabId: string) =>
      runtime.createCliSession({
        workspaceId: "workspace-1",
        workspacePath: "/tmp/workspace",
        cliSessionTabId,
        providerId: "opencode",
        contextMode: "workspace",
        taskId: null,
        taskTitle: null,
        cwd: "/tmp/workspace",
        deliveryMode: "push",
      });
    const first = create("cli-1");
    await Promise.resolve();
    await Promise.resolve();
    const second = create("cli-2");
    await Promise.resolve();
    await Promise.resolve();

    expect(
      runtime.getSessionResumeInfo({ sessionId: first.sessionId! }),
    ).toEqual({ ok: true, nativeSessionId: "ses_shared" });
    expect(
      runtime.getSessionResumeInfo({ sessionId: second.sessionId! }),
    ).toEqual({ ok: true, nativeSessionId: undefined });

    runtime.closeSession({ sessionId: first.sessionId! });
    runtime.closeSession({ sessionId: second.sessionId! });
  });

  test("does not adopt an OpenCode session created before the tab started", async () => {
    const runtime = createTerminalRuntime({ emitEvent: async () => {} });
    // An ACP turn in the same folder created this one a moment earlier.
    fakeOpenCodeSessions = [{ sessionId: "ses_recent_acp", updatedAtMs: Date.now() - 2_000 }];
    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "opencode",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(
      runtime.getSessionResumeInfo({ sessionId: created.sessionId! }),
    ).toEqual({ ok: true, nativeSessionId: undefined });
    runtime.closeSession({ sessionId: created.sessionId! });
  });

  test("does not adopt a session Stave's own OpenCode ACP turn created after the tab started", async () => {
    const runtime = createTerminalRuntime({ emitEvent: async () => {} });
    rememberOpenCodeAcpSessionId("ses_acp_turn");
    fakeOpenCodeSessions = [{ sessionId: "ses_acp_turn", updatedAtMs: Date.now() + 1_000 }];
    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "opencode",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(
      runtime.getSessionResumeInfo({ sessionId: created.sessionId! }),
    ).toEqual({ ok: true, nativeSessionId: undefined });
    runtime.closeSession({ sessionId: created.sessionId! });
  });

  test("leaves two OpenCode tabs in one folder unconfirmed when one new session appears", async () => {
    const runtime = createTerminalRuntime({ emitEvent: async () => {} });
    const create = (cliSessionTabId: string) =>
      runtime.createCliSession({
        workspaceId: "workspace-1",
        workspacePath: "/tmp/workspace",
        cliSessionTabId,
        providerId: "opencode",
        contextMode: "workspace",
        taskId: null,
        taskTitle: null,
        cwd: "/tmp/workspace",
        deliveryMode: "push",
      });
    const first = create("cli-1");
    const second = create("cli-2");
    await Promise.resolve();
    await Promise.resolve();
    // Either tab could have sent the first message, so neither may claim it.
    fakeOpenCodeSessions = [{ sessionId: "ses_one_of_two", updatedAtMs: Date.now() + 500 }];
    await Bun.sleep(2_300);
    expect(fakeOpenCodeListCalls.length).toBeGreaterThan(2);
    expect(
      runtime.getSessionResumeInfo({ sessionId: first.sessionId! }),
    ).toEqual({ ok: true, nativeSessionId: undefined });
    expect(
      runtime.getSessionResumeInfo({ sessionId: second.sessionId! }),
    ).toEqual({ ok: true, nativeSessionId: undefined });
    runtime.closeSession({ sessionId: first.sessionId! });
    runtime.closeSession({ sessionId: second.sessionId! });
  }, 10_000);

  test("stops OpenCode discovery when its time window ends, however slow listing is", async () => {
    const runtime = createTerminalRuntime({ emitEvent: async () => {} });
    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "opencode",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });
    await Promise.resolve();
    await Promise.resolve();
    // Few attempts have run, but the renderer stops asking once the window
    // ends, so a session found later would never be stored.
    const windowMs =
      OPENCODE_NATIVE_SESSION_DISCOVERY.pollMs * OPENCODE_NATIVE_SESSION_DISCOVERY.maxAttempts;
    setSystemTime(new Date(Date.now() + windowMs + 1_000));
    try {
      fakeOpenCodeSessions = [{ sessionId: "ses_too_late", updatedAtMs: Date.now() }];
      await Bun.sleep(2_300);
      expect(
        runtime.getSessionResumeInfo({ sessionId: created.sessionId! }),
      ).toEqual({ ok: true, nativeSessionId: undefined });
    } finally {
      setSystemTime();
      runtime.closeSession({ sessionId: created.sessionId! });
    }
  }, 10_000);

  test("a new OpenCode tab does not take the session of a live tab whose discovery ended", async () => {
    const runtime = createTerminalRuntime({ emitEvent: async () => {} });
    const create = (cliSessionTabId: string) =>
      runtime.createCliSession({
        workspaceId: "workspace-1",
        workspacePath: "/tmp/workspace",
        cliSessionTabId,
        providerId: "opencode",
        contextMode: "workspace",
        taskId: null,
        taskTitle: null,
        cwd: "/tmp/workspace",
        deliveryMode: "push",
      });
    const older = create("cli-1");
    await Promise.resolve();
    await Promise.resolve();
    const windowMs =
      OPENCODE_NATIVE_SESSION_DISCOVERY.pollMs * OPENCODE_NATIVE_SESSION_DISCOVERY.maxAttempts;
    setSystemTime(new Date(Date.now() + windowMs + 1_000));
    try {
      // Tab A's discovery runs out while its PTY stays open.
      await Bun.sleep(2_300);
      const newer = create("cli-2");
      await Promise.resolve();
      await Promise.resolve();
      // Tab A now sends its first message; the session belongs to A.
      fakeOpenCodeSessions = [{ sessionId: "ses_created_by_old_pty", updatedAtMs: Date.now() + 500 }];
      await Bun.sleep(2_300);
      expect(
        runtime.getSessionResumeInfo({ sessionId: newer.sessionId! }),
      ).toEqual({ ok: true, nativeSessionId: undefined });
      expect(
        runtime.getSessionResumeInfo({ sessionId: older.sessionId! }),
      ).toEqual({ ok: true, nativeSessionId: undefined });
      runtime.closeSession({ sessionId: newer.sessionId! });
    } finally {
      setSystemTime();
      runtime.closeSession({ sessionId: older.sessionId! });
    }
  }, 10_000);

  test("a waiting OpenCode tab can own a session once the other tab in its folder closes", async () => {
    const runtime = createTerminalRuntime({ emitEvent: async () => {} });
    const create = (cliSessionTabId: string) =>
      runtime.createCliSession({
        workspaceId: "workspace-1",
        workspacePath: "/tmp/workspace",
        cliSessionTabId,
        providerId: "opencode",
        contextMode: "workspace",
        taskId: null,
        taskTitle: null,
        cwd: "/tmp/workspace",
        deliveryMode: "push",
      });
    const first = create("cli-1");
    const second = create("cli-2");
    await Promise.resolve();
    runtime.closeSession({ sessionId: first.sessionId! });
    fakeOpenCodeSessions = [{ sessionId: "ses_second", updatedAtMs: Date.now() + 500 }];
    await Bun.sleep(2_300);
    expect(
      runtime.getSessionResumeInfo({ sessionId: second.sessionId! }),
    ).toEqual({ ok: true, nativeSessionId: "ses_second" });
    runtime.closeSession({ sessionId: second.sessionId! });
  }, 10_000);

  test("chooses the session id up front on OpenCode 2.x", () => {
    fakeOpenCodeMajorVersion = 2;
    const runtime = createTerminalRuntime({ emitEvent: async () => {} });
    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "opencode",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });
    expect(created.nativeSessionId).toMatch(/^ses_[0-9a-z]{26}$/);
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-opencode",
      args: ["--session", created.nativeSessionId],
      options: expect.objectContaining({ cwd: "/tmp/workspace" }),
    });
    expect(fakeOpenCodeListCalls).toEqual([]);
    runtime.closeSession({ sessionId: created.sessionId! });
  });

  test("resumes OpenCode sessions with --session", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "opencode",
      contextMode: "workspace",
      nativeSessionId: "ses_saved",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created).toEqual({
      ok: true,
      sessionId: expect.any(String),
      nativeSessionId: "ses_saved",
    });
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-opencode",
      args: ["--session", "ses_saved"],
      options: expect.objectContaining({ cwd: "/tmp/workspace" }),
    });
    expect(fakeOpenCodeListCalls).toEqual([]);
  });

  test("resumes Kiro CLI sessions from a stored native session id", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createCliSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      cliSessionTabId: "cli-1",
      providerId: "kiro",
      contextMode: "workspace",
      nativeSessionId: "kiro-session-1",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created).toEqual({
      ok: true,
      sessionId: expect.any(String),
      nativeSessionId: "kiro-session-1",
    });
    expect(fakeSpawnCalls.at(-1)).toEqual({
      command: "/tmp/fake-kiro",
      args: ["chat", "--resume-id", "kiro-session-1"],
      options: expect.objectContaining({ cwd: "/tmp/workspace" }),
    });
    expect(
      runtime.getSessionResumeInfo({ sessionId: created.sessionId! }),
    ).toEqual({
      ok: true,
      nativeSessionId: "kiro-session-1",
    });
  });
});


test("workspace stop preserves a similarly prefixed owner and blocks all provider CLI starts", async () => {
  const runtime = createTerminalRuntime({ emitEvent: async () => {} });
  const args = { workspaceId: "stop-w", workspacePath: "/tmp/workspace", taskId: null, taskTitle: null, terminalTabId: "t", cwd: "/tmp/workspace" };
  const first = runtime.createSession(args);
  const other = runtime.createSession({ ...args, workspaceId: "stop-w:other" });
  await workspaceExecutionGate.stop(args, () => runtime.stopWorkspace(args.workspaceId));
  try {
    expect(fakePtys[0]?.destroyed).toBe(true);
    expect(fakePtys[1]?.destroyed).toBe(false);
    expect(runtime.writeSession({ sessionId: first.sessionId!, input: "" }).ok).toBe(false);
    expect(runtime.writeSession({ sessionId: other.sessionId!, input: "" }).ok).toBe(true);
    for (const providerId of ["claude-code", "codex", "cursor", "kiro", "opencode"] as const) {
      expect(runtime.createCliSession({ ...args, cliSessionTabId: "cli", providerId, contextMode: "workspace" }).ok).toBe(false);
    }
    expect(runtime.createSession(args).ok).toBe(false);
  } finally { workspaceExecutionGate.resume(args.workspaceId); await runtime.cleanupAll(); }
});


test("CLI reuse validates its captured account and rejects a removed profile", () => {
  const root = mkdtempSync(path.join(tmpdir(), "stave-cli-identity-"));
  const originalUserData = process.env.STAVE_USER_DATA_PATH;
  process.env.STAVE_USER_DATA_PATH = root;
  const registry = new ProviderAccountRegistry(root);
  const profile = registry.create({ providerId: "claude-code", label: "A" });
  const runtime = createTerminalRuntime({ emitEvent: async () => {} });
  let sessionId: string | undefined;
  try {
    const args = { workspaceId: "workspace-1", workspacePath: "/tmp/workspace", cliSessionTabId: "account-tab", providerId: "claude-code" as const, contextMode: "workspace" as const, taskId: null, taskTitle: null, runtimeOptions: { claudeAccountProfileId: profile.id } };
    const created = runtime.createCliSession(args);
    expect(created.ok).toBe(true);
    sessionId = created.sessionId;
    expect(runtime.createCliSession(args).sessionId).toBe(sessionId);
    expect(runtime.createCliSession({ ...args, runtimeOptions: { claudeAccountProfileId: "system-default" } })).toMatchObject({ ok: false, stderr: "This CLI tab belongs to another account. Open a new CLI tab." });
    registry.remove({ providerId: "claude-code", id: profile.id });
    expect(runtime.createCliSession(args).ok).toBe(false);
  } finally {
    if (sessionId) runtime.closeSession({ sessionId });
    if (originalUserData === undefined) delete process.env.STAVE_USER_DATA_PATH;
    else process.env.STAVE_USER_DATA_PATH = originalUserData;
    rmSync(root, { recursive: true, force: true });
  }
});
