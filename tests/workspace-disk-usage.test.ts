import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorkspaceDiskUsage, measureDirectory, measureWithDu, parseDuKilobytes, readWorkspaceDiskUsage,
  walkDirectorySize, workspaceDiskFolders, type DirectorySize, type ExecRunner,
} from "../electron/host-service/workspace-disk-usage";

const root = mkdtempSync(join(tmpdir(), "stave-disk-usage-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function runner(results: Record<string, { stdout?: string; code?: string | number | null; killed?: boolean }>) {
  const calls: string[][] = [];
  const run: ExecRunner = async (command, args) => {
    calls.push([command, ...args]);
    const result = results[command] ?? { code: "ENOENT" };
    return { stdout: result.stdout ?? "", code: result.code ?? 0, killed: result.killed ?? false };
  };
  return { run, calls };
}

describe("du", () => {
  test("parses the first total, and nothing else", () => {
    expect(parseDuKilobytes("2048\t/tmp/workspace\n")).toBe(2048);
    expect(parseDuKilobytes("du: /tmp/x: Permission denied\n")).toBeNull();
    expect(parseDuKilobytes("")).toBeNull();
  });

  test("runs at the lowest priority, and falls back to plain du without nice", async () => {
    const niced = runner({ nice: { stdout: "4\t/w\n" } });
    expect(await measureWithDu("/w", { run: niced.run })).toEqual({ bytes: 4096, partial: false });
    expect(niced.calls).toEqual([["nice", "-n", "19", "du", "-sk", "/w"]]);
    const plain = runner({ du: { stdout: "8\t/w\n" } });
    expect(await measureWithDu("/w", { run: plain.run })).toEqual({ bytes: 8192, partial: false });
    expect(plain.calls.map((call) => call[0])).toEqual(["nice", "du"]);
  });

  test("a total printed with a non-zero exit is a lower bound; a timeout or no du is not a number", async () => {
    expect(await measureWithDu("/w", { run: runner({ nice: { stdout: "10\t/w\n", code: 1 } }).run })).toEqual({ bytes: 10240, partial: true });
    expect(await measureWithDu("/w", { run: runner({ nice: { killed: true, code: null } }).run })).toBe("timeout");
    expect(await measureWithDu("/w", { run: runner({}).run })).toBe("missing");
    expect(await measureWithDu("/w", { run: runner({ nice: { code: 1, stdout: "" } }).run })).toBe("failed");
  });
});

describe("measureDirectory", () => {
  const walk = async () => ({ bytes: 1, partial: false });

  test("uses du on macOS and Linux and does not walk again after a timeout", async () => {
    let walked = 0;
    const counting = async () => { walked++; return { bytes: 1, partial: false }; };
    expect(await measureDirectory("/w", { platform: "darwin", run: runner({ nice: { stdout: "1\t/w" } }).run, walk: counting })).toEqual({ bytes: 1024, partial: false, method: "du" });
    expect(await measureDirectory("/w", { platform: "linux", run: runner({ nice: { killed: true, code: null } }).run, walk: counting })).toEqual({ bytes: null, timedOut: true });
    expect(walked).toBe(0);
  });

  test("walks on Windows or when du cannot run", async () => {
    const neverRun: ExecRunner = async () => { throw new Error("du must not run on Windows"); };
    expect(await measureDirectory("/w", { platform: "win32", run: neverRun, walk })).toEqual({ bytes: 1, partial: false, method: "walk" });
    expect(await measureDirectory("/w", { platform: "darwin", run: runner({}).run, walk })).toEqual({ bytes: 1, partial: false, method: "walk" });
    expect(await measureDirectory("/w", { platform: "darwin", run: runner({}).run, walk: async () => null })).toEqual({ bytes: null, timedOut: false });
  });
});

describe("walkDirectorySize", () => {
  const folder = join(root, "walk");
  mkdirSync(join(folder, "nested", "deeper"), { recursive: true });
  writeFileSync(join(folder, "a.txt"), "a".repeat(5000));
  writeFileSync(join(folder, "nested", "deeper", "b.txt"), "b".repeat(9000));
  symlinkSync(join(root), join(folder, "loop"));

  test("counts files below the folder without following links", async () => {
    const result = await walkDirectorySize(folder);
    expect(result?.partial).toBe(false);
    expect(result!.bytes).toBeGreaterThanOrEqual(14_000);
    // Following `loop` would count the folder again and never end.
    expect(result!.bytes).toBeLessThan(1_000_000);
  });

  test("stops at its time or entry budget and says the count is partial", async () => {
    let clock = 0;
    expect((await walkDirectorySize(folder, { budgetMs: 0, now: () => clock++ }))?.partial).toBe(true);
    expect((await walkDirectorySize(folder, { maxEntries: 1 }))?.partial).toBe(true);
  });

  test("measures a real folder with the platform's own method", async () => {
    const measured = await measureDirectory(folder);
    expect(measured.bytes).toBeGreaterThanOrEqual(14_000);
    expect(measured).toMatchObject({ partial: false, method: process.platform === "win32" ? "walk" : "du" });
  });

  test("reports an unreadable folder as unmeasured", async () => {
    expect(await walkDirectorySize(join(root, "missing"))).toBeNull();
  });
});

describe("workspace disk usage cache", () => {
  const deferred = () => {
    let resolve!: (value: DirectorySize) => void;
    const promise = new Promise<DirectorySize>((done) => { resolve = done; });
    return { promise, resolve };
  };

  test("measures one folder at a time and reuses fresh results for five minutes", async () => {
    let clock = Date.parse("2026-10-01T00:00:00Z");
    const order: string[] = [];
    const pending = new Map<string, ReturnType<typeof deferred>>();
    const disk = createWorkspaceDiskUsage({ now: () => clock, measure: (path) => {
      order.push(`start:${path}`);
      const next = deferred();
      pending.set(path, next);
      return next.promise.then((value) => { order.push(`end:${path}`); return value; });
    } });
    const first = disk.read("a", "/a");
    const second = disk.read("b", "/b");
    const again = disk.read("a", "/a");
    await Promise.resolve();
    expect(order).toEqual(["start:/a"]);
    expect(disk.isMeasuring()).toBe(true);
    pending.get("/a")!.resolve({ bytes: 10, partial: false, method: "du" });
    expect(await first).toMatchObject({ bytes: 10, status: "measured" });
    expect(await again).toBe(await first);
    await new Promise((done) => setTimeout(done, 0));
    expect(order).toEqual(["start:/a", "end:/a", "start:/b"]);
    pending.get("/b")!.resolve({ bytes: null, timedOut: true });
    expect(await second).toMatchObject({ bytes: null, status: "timeout" });
    expect(disk.isMeasuring()).toBe(false);

    clock += 4 * 60_000;
    expect(await disk.read("a", "/a")).toMatchObject({ bytes: 10 });
    expect(order.filter((entry) => entry === "start:/a")).toHaveLength(1);
    // A forced read measures again; so does a moved folder.
    const forced = disk.read("a", "/a", 0);
    await new Promise((done) => setTimeout(done, 0));
    pending.get("/a")!.resolve({ bytes: 20, partial: true, method: "walk" });
    expect(await forced).toMatchObject({ bytes: 20, partial: true });
    expect(disk.peek("a", "/a")).toMatchObject({ bytes: 20 });
    expect(disk.peek("a", "/elsewhere")).toBeNull();
  });

  test("a failing measurement settles as unavailable and does not stop the queue", async () => {
    const disk = createWorkspaceDiskUsage({ measure: async (path) => {
      if (path === "/bad") throw new Error("EACCES");
      return { bytes: 1, partial: false, method: "du" };
    } });
    expect(await disk.read("bad", "/bad")).toMatchObject({ bytes: null, status: "unavailable" });
    expect(await disk.read("good", "/good")).toMatchObject({ bytes: 1, status: "measured" });
  });
});

describe("workspace folders", () => {
  const registry = [{
    repositoryPath: "/repo", repositoryName: "repo",
    workspaces: [{ id: "default", name: "main" }, { id: "feature", name: "feature" }, { id: "same-as-root", name: "root" }, { id: "no-path", name: "gone" }],
    workspacePathById: { default: "/repo", feature: "/repo/.stave/workspaces/feature", "same-as-root": "/repo/" },
    workspaceDefaultById: { default: true },
  }];
  const archives: Record<string, Array<{ workspaceId: string; name: string; path: string }>> = {
    "/repo": [{ workspaceId: "kept", name: "kept", path: "/repo/.stave/workspaces/kept" }, { workspaceId: "removed", name: "removed", path: "/repo/.stave/workspaces/removed" }],
  };
  const store = { loadRepositoryRegistry: () => registry, listArchivedWorkspacesPersistence: ({ repositoryPath }: { repositoryPath: string }) => archives[repositoryPath] ?? [] };
  const options = { exists: (path: string) => !path.endsWith("removed"), canonical: (path: string) => path.replace(/\/$/, "") };

  test("are workspace folders and kept archives, never the project's own checkout", () => {
    expect(workspaceDiskFolders(store, options).map((folder) => [folder.workspaceId, folder.archived])).toEqual([["feature", false], ["kept", true]]);
  });

  test("answer at once with what is measured and queue the rest", async () => {
    let calls = 0;
    const disk = createWorkspaceDiskUsage({ measure: async () => { calls++; return { bytes: 2048, partial: false, method: "du" }; } });
    const folders = workspaceDiskFolders(store, options);
    const first = readWorkspaceDiskUsage(folders, disk);
    expect(first.measuring).toBe(true);
    expect(first.rows.every((row) => row.measurement === null)).toBe(true);
    expect(first.rows[0]).not.toHaveProperty("path");
    await new Promise((done) => setTimeout(done, 10));
    const second = readWorkspaceDiskUsage(folders, disk);
    expect(second.measuring).toBe(false);
    expect(second.rows.map((row) => row.measurement?.bytes)).toEqual([2048, 2048]);
    expect(calls).toBe(2);
    readWorkspaceDiskUsage(folders, disk, true);
    await new Promise((done) => setTimeout(done, 10));
    expect(calls).toBe(4);
  });
});
