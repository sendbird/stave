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
  deferred: number[] = [];
  stdin = {
    write: (payload: string) => {
      const request = JSON.parse(payload) as { id: number };
      if (deferResponses) {
        this.deferred.push(request.id);
        return true;
      }
      this.respond(request.id);
      return true;
    },
  };

  respond(id: number) {
    this.stdout.emit("data", `${JSON.stringify({ id, ok: true, diagnostics: [] })}\n`);
  }

  flushDeferred() {
    for (const id of this.deferred.splice(0)) {
      this.respond(id);
    }
  }

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
let deferResponses = false;

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
  deferResponses = false;
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

  test("trims back to three workers once overlapping requests settle", async () => {
    const roots = ["a", "b", "c", "d"].map((name) => createProjectRoot(`busy-${name}`));
    deferResponses = true;

    const results = Promise.all(roots.map((rootPath) => lint(rootPath)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    while (spawned.length < roots.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(spawned.every((worker) => !worker.killed)).toBe(true);

    for (const worker of spawned) {
      worker.flushDeferred();
    }
    expect((await results).every((result) => result.ok)).toBe(true);
    expect(spawned.filter((worker) => !worker.killed)).toHaveLength(3);
    expect(spawned[0]!.killed).toBe(true);
  });
});
