import { workspaceExecutionGate } from "../electron/shared/workspace-execution-gate";
import { afterEach, describe, expect, mock, test } from "bun:test";

type ExitPayload = { exitCode: number; signal?: number };

class FakeDisposable {
  disposed = false;

  dispose() {
    this.disposed = true;
  }
}

class FakePty {
  killed = false;
  exited = false;
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

  kill() {
    this.killed = true;
    if (!this.exited) {
      // Defer so killProcess can register its onExit listener before we fire.
      queueMicrotask(() => this.fireExit({ exitCode: -15 }));
    }
  }

  fireExit(event: ExitPayload) {
    this.exited = true;
    for (const entry of this.exitListeners) {
      if (!entry.disposable.disposed) {
        entry.listener(event);
      }
    }
  }
}

const fakePtys: FakePty[] = [];

test("cancelling an owned action stops its child command before later effects", async () => {
  const { mkdtempSync, existsSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "stave-cancel-"));
  const controller = new AbortController();
  try {
    const run = runScriptEntry({
      workspaceId: "cancel-workspace", workspacePath: directory, repositoryPath: directory,
      workspaceName: "cancel", branch: "test", signal: controller.signal,
      scriptEntry: { ...createServiceScript(), id: "action", kind: "action",
        commands: ["echo ready > ready; sleep 1; echo late > late", "echo next > next"] },
    });
    for (let attempt = 0; attempt < 100 && !existsSync(join(directory, "ready")); attempt++) await Bun.sleep(10);
    expect(existsSync(join(directory, "ready"))).toBe(true);
    controller.abort();
    expect((await run).ok).toBe(false);
    await Bun.sleep(1100);
    expect(existsSync(join(directory, "late"))).toBe(false);
    expect(existsSync(join(directory, "next"))).toBe(false);
  } finally {
    controller.abort();
    rmSync(directory, { recursive: true, force: true });
  }
});

mock.module("node-pty", () => ({
  spawn: () => {
    const fake = new FakePty();
    fakePtys.push(fake);
    return fake;
  },
}));

mock.module("../electron/providers/executable-path", () => ({
  buildExecutableLookupEnv: () => ({ PATH: process.env.PATH ?? "" }),
  canExecutePath: () => true,
  resolveExecutablePath: () => null,
  toAsarUnpackedPath: (value: string) => value,
}));

const {
  cleanupAllScriptProcesses,
  runScriptEntry,
  setWorkspaceScriptEventListener,
} = await import("../electron/main/workspace-scripts");
const {
  clearWorkspaceScriptProcesses,
  getScriptProcessKey,
  getWorkspaceScriptProcess,
} = await import("../electron/main/workspace-scripts/state");

afterEach(async () => {
  setWorkspaceScriptEventListener(null);
  await cleanupAllScriptProcesses();
  clearWorkspaceScriptProcesses();
  fakePtys.length = 0;
});

function createServiceScript() {
  return {
    id: "dev",
    kind: "service" as const,
    label: "Dev Server",
    description: "Runs the dev server",
    commands: ["bun run dev"],
    targetId: "workspace",
    target: {
      id: "workspace",
      label: "Workspace",
      cwd: "workspace" as const,
      env: {},
    },
    restartOnRun: true,
    source: "script" as const,
  };
}

describe("workspace scripts executor", () => {
  test("starts a service run without throwing and stores the PTY cleanup handle", async () => {
    const result = await runScriptEntry({
      workspaceId: "ws-1",
      workspacePath: "/tmp/workspace",
      workspaceName: "workspace",
      repositoryPath: "/tmp/project",
      branch: "fix/test",
      scriptEntry: createServiceScript(),
    });

    expect(result.ok).toBe(true);
    expect(result.sessionId).toBeTruthy();

    const entry = getWorkspaceScriptProcess(getScriptProcessKey({
      workspaceId: "ws-1",
      scriptId: "dev",
      scriptKind: "service",
    }));
    expect(entry?.cleanup).toBeFunction();
  });

  test("surfaces non-zero exit code via the completed event", async () => {
    const events: Array<{ type: string; exitCode?: number }> = [];
    setWorkspaceScriptEventListener((payload) => {
      if (payload.event.type === "completed") {
        events.push({ type: "completed", exitCode: payload.event.exitCode });
      } else {
        events.push({ type: payload.event.type });
      }
    });

    const result = await runScriptEntry({
      workspaceId: "ws-1",
      workspacePath: "/tmp/workspace",
      workspaceName: "workspace",
      repositoryPath: "/tmp/project",
      branch: "fix/test",
      scriptEntry: createServiceScript(),
    });

    expect(result.ok).toBe(true);

    fakePtys[0]?.fireExit({ exitCode: 2 });

    const completed = events.find((e) => e.type === "completed");
    expect(completed).toBeDefined();
    expect(completed?.exitCode).toBe(2);
  });
});


test("a stopped workspace refuses scripts before creating a process", async () => {
  const target = { workspaceId: "stopped-script", workspacePath: "/tmp/workspace" };
  await workspaceExecutionGate.stop(target, async () => {});
  try {
    await expect(runScriptEntry({ ...target, workspaceName: "workspace", repositoryPath: "/tmp/project", branch: "main", scriptEntry: createServiceScript() })).rejects.toThrow("stopped");
    expect(fakePtys.length).toBe(0);
  } finally { workspaceExecutionGate.resume(target.workspaceId); }
});
