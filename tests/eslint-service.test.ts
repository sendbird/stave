import { afterAll, afterEach, describe, expect, jest, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const actualChildProcess = await import("node:child_process");
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "stave-eslint-service-"));

class FakeStream extends EventEmitter {
  setEncoding() {}
}

class FakeWorker extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  exitCode: number | null = null;
  killed = false;
  stdin = {
    write: (payload: string) => {
      const request = JSON.parse(payload) as { id: number };
      this.stdout.emit("data", `${JSON.stringify({ id: request.id, ok: true, diagnostics: [] })}\n`);
      return true;
    },
  };

  constructor(readonly rootPath: string) {
    super();
  }

  kill() {
    this.killed = true;
    this.exitCode = 0;
    this.emit("exit", 0, null);
    return true;
  }
}

const spawned: FakeWorker[] = [];

mock.module("node:child_process", () => ({
  ...actualChildProcess,
  spawn: (_command: string, _args: string[], options: { cwd: string }) => {
    const worker = new FakeWorker(options.cwd);
    spawned.push(worker);
    return worker;
  },
}));

mock.module("electron", () => ({
  app: { getPath: () => tempRoot, on: () => {} },
}));

const { lintFile, stopWorkers } = await import("../electron/main/eslint/eslint-service");

function createProjectRoot(name: string) {
  const rootPath = path.join(tempRoot, name);
  mkdirSync(path.join(rootPath, "node_modules", "eslint"), { recursive: true });
  writeFileSync(path.join(rootPath, "node_modules", "eslint", "package.json"), "{}");
  return rootPath;
}

async function lint(rootPath: string) {
  return lintFile({ rootPath, filePath: "src/index.ts", text: "const x = 1;\n" });
}

function workerFor(rootPath: string) {
  return spawned.filter((worker) => worker.rootPath === rootPath);
}

afterEach(() => {
  jest.useRealTimers();
  stopWorkers();
  spawned.length = 0;
});

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("eslint service worker lifecycle", () => {
  test("stops a worker after five idle minutes and respawns it on the next request", async () => {
    const rootPath = createProjectRoot("idle");
    jest.useFakeTimers();

    expect((await lint(rootPath)).ok).toBe(true);
    jest.advanceTimersByTime(4 * 60_000);
    expect((await lint(rootPath)).ok).toBe(true);
    jest.advanceTimersByTime(4 * 60_000);
    expect(workerFor(rootPath)).toHaveLength(1);
    expect(workerFor(rootPath)[0]!.killed).toBe(false);

    jest.advanceTimersByTime(60_001);
    expect(workerFor(rootPath)[0]!.killed).toBe(true);

    expect((await lint(rootPath)).ok).toBe(true);
    expect(workerFor(rootPath)).toHaveLength(2);
    expect(workerFor(rootPath)[1]!.killed).toBe(false);
  });

  test("keeps at most three workers by stopping the least recently used idle one", async () => {
    const [first, second, third, fourth] = ["a", "b", "c", "d"].map((name) => createProjectRoot(`lru-${name}`));

    await lint(first!);
    await lint(second!);
    await lint(third!);
    await lint(first!);
    await lint(fourth!);

    expect(spawned).toHaveLength(4);
    expect(spawned.filter((worker) => worker.killed).map((worker) => worker.rootPath)).toEqual([second!]);
  });
});
