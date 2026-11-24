import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WORKSPACE_SCRATCH_TAIL_BYTES } from "../src/lib/workspace-scratch";
import type { ScratchWatchPort } from "../electron/main/utils/workspace-scratch-watch";

const handlers = new Map<string, (event: unknown, args: unknown) => Promise<unknown>>();
mock.module("electron", () => ({
  ipcMain: { handle: (channel: string, handler: (event: unknown, args: unknown) => Promise<unknown>) => handlers.set(channel, handler) },
  webContents: { fromId: () => null },
}));

const {
  readWorkspaceScratchTail,
  scratchRelativeParts,
  tailTextStart,
  WorkspaceScratchFileMissingError,
} = await import("../electron/main/utils/workspace-scratch-tail");
const { WorkspaceScratchRefusedError } = await import("../electron/main/utils/workspace-scratch");
const { registerWorkspaceScratchHandlers } = await import("../electron/main/ipc/workspace-scratch");

const knownRoots = new Set<string>();
const watchers: { directory: string; closed: boolean }[] = [];
const port: ScratchWatchPort = {
  watch(directory) {
    const watcher = { directory, closed: false };
    watchers.push(watcher);
    return { close: () => { watcher.closed = true; } };
  },
  isDirectory: async () => true,
};
const destroyedCallbacks = new Map<number, () => void>();
const hub = registerWorkspaceScratchHandlers({
  isKnownWorkspaceRoot: async (rootPath) => knownRoots.has(rootPath),
  watchPort: port,
  send: () => true,
  onWindowDestroyed: (contentsId, onDestroyed) => {
    destroyedCallbacks.set(contentsId, onDestroyed);
    return true;
  },
});

const roots: string[] = [];
afterEach(async () => {
  knownRoots.clear();
  watchers.splice(0);
  hub.dispose();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function workspace() {
  const root = await mkdtemp(path.join(tmpdir(), "stave-scratch-tail-"));
  roots.push(root);
  await mkdir(path.join(root, ".stave", "scratch", "agents", "a1"), { recursive: true });
  return root;
}

describe("readWorkspaceScratchTail", () => {
  test("returns a small file whole", async () => {
    const root = await workspace();
    await writeFile(path.join(root, ".stave/scratch/tests.log"), "ok 1\nok 2\n");
    expect(await readWorkspaceScratchTail({ rootPath: root, filePath: ".stave/scratch/tests.log" })).toEqual({
      content: "ok 1\nok 2\n",
      sizeBytes: 10,
      truncated: false,
    });
  });

  test("returns only the last bytes of a big file, from a line start", async () => {
    const root = await workspace();
    const lines = Array.from({ length: 40_000 }, (_, index) => `line ${index + 1}`);
    const content = `${lines.join("\n")}\n`;
    await writeFile(path.join(root, ".stave/scratch/agents/a1/build.log"), content);
    const tail = await readWorkspaceScratchTail({ rootPath: root, filePath: ".stave/scratch/agents/a1/build.log" });
    expect(tail.truncated).toBe(true);
    expect(tail.sizeBytes).toBe(Buffer.byteLength(content));
    expect(Buffer.byteLength(tail.content)).toBeLessThanOrEqual(WORKSPACE_SCRATCH_TAIL_BYTES);
    expect(tail.content.endsWith("line 40000\n")).toBe(true);
    expect(tail.content.startsWith("line ")).toBe(true);
    // Only whole lines, never the end of a cut one.
    expect(lines).toContain(tail.content.split("\n")[0]!);
  });

  test("honours a smaller byte limit and never splits a UTF-8 character", async () => {
    const root = await workspace();
    await writeFile(path.join(root, ".stave/scratch/ko.txt"), "가나다라마바사");
    const tail = await readWorkspaceScratchTail({ rootPath: root, filePath: ".stave/scratch/ko.txt", maxBytes: 7 });
    expect(tail.truncated).toBe(true);
    expect(tail.content).toBe("바사");
    expect(tailTextStart(new Uint8Array([0x80, 0x80, 0x41]))).toBe(2);
  });

  test("refuses paths that leave the scratch folder or go through links", async () => {
    const root = await workspace();
    await writeFile(path.join(root, "secret.txt"), "secret");
    await writeFile(path.join(root, ".stave", "notes.txt"), "notes");
    await symlink(path.join(root, "secret.txt"), path.join(root, ".stave/scratch/link.txt"));
    await symlink(root, path.join(root, ".stave/scratch/agents/escape"));
    for (const filePath of [
      "secret.txt",
      ".stave/notes.txt",
      ".stave/scratch/../notes.txt",
      ".stave/scratch/../../secret.txt",
      ".stave/scratch/./tests.log",
      ".stave/scratch//tests.log",
      ".stave/scratch/link.txt",
      ".stave/scratch/agents/escape/secret.txt",
      ".stave/scratch/agents",
    ]) {
      await expect(readWorkspaceScratchTail({ rootPath: root, filePath })).rejects.toBeInstanceOf(WorkspaceScratchRefusedError);
    }
    expect(() => scratchRelativeParts(".stave/scratch/a\\..\\b")).toThrow(WorkspaceScratchRefusedError);
  });

  test("a scratch folder reached through a link reads nothing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "stave-scratch-tail-"));
    roots.push(root);
    const elsewhere = await mkdtemp(path.join(tmpdir(), "stave-scratch-elsewhere-"));
    roots.push(elsewhere);
    await mkdir(path.join(elsewhere, "scratch"));
    await writeFile(path.join(elsewhere, "scratch", "tests.log"), "outside");
    await symlink(elsewhere, path.join(root, ".stave"));
    await expect(readWorkspaceScratchTail({ rootPath: root, filePath: ".stave/scratch/tests.log" })).rejects.toBeInstanceOf(
      WorkspaceScratchFileMissingError,
    );
  });

  test("a missing file is reported as missing", async () => {
    const root = await workspace();
    await expect(readWorkspaceScratchTail({ rootPath: root, filePath: ".stave/scratch/gone.log" })).rejects.toBeInstanceOf(
      WorkspaceScratchFileMissingError,
    );
  });
});

describe("scratch IPC", () => {
  const tail = (args: unknown) => handlers.get("fs:read-scratch-tail")!(null, args);
  const watch = (contentsId: number, args: unknown) => handlers.get("fs:watch-scratch")!({ sender: { id: contentsId } }, args);
  const unwatch = (contentsId: number, args: unknown) => handlers.get("fs:unwatch-scratch")!({ sender: { id: contentsId } }, args);

  test("fs:read-scratch-tail reads a registered workspace's scratch file and refuses everything else", async () => {
    const root = await workspace();
    await writeFile(path.join(root, ".stave/scratch/tests.log"), "ok\n");
    await writeFile(path.join(root, "secret.txt"), "secret");
    expect(await tail({ rootPath: root, filePath: ".stave/scratch/tests.log" })).toMatchObject({ ok: false, reason: "invalid" });
    knownRoots.add(root);
    expect(await tail({ rootPath: root, filePath: ".stave/scratch/tests.log" })).toEqual({
      ok: true,
      content: "ok\n",
      sizeBytes: 3,
      truncated: false,
    });
    expect(await tail({ rootPath: root, filePath: ".stave/scratch/../../secret.txt" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await tail({ rootPath: root, filePath: "secret.txt" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await tail({ rootPath: root, filePath: ".stave/scratch/gone.log" })).toMatchObject({ ok: false, reason: "missing" });
    expect(await tail({ rootPath: root, filePath: ".stave/scratch/tests.log", maxBytes: WORKSPACE_SCRATCH_TAIL_BYTES + 1 })).toMatchObject({ ok: false });
    expect(await tail({ rootPath: "relative", filePath: ".stave/scratch/tests.log" })).toMatchObject({ ok: false });
  });

  test("fs:watch-scratch subscribes a window, and closing the window closes the watcher", async () => {
    const root = await workspace();
    expect(await watch(4, { rootPath: root })).toEqual({ ok: false, stderr: "Not a known workspace folder." });
    expect(watchers).toHaveLength(0);
    knownRoots.add(root);
    expect(await watch(4, { rootPath: root })).toEqual({ ok: true, watching: true });
    expect(await watch(5, { rootPath: root })).toEqual({ ok: true, watching: true });
    expect(watchers).toHaveLength(1);
    await unwatch(5, { rootPath: root });
    expect(watchers[0]!.closed).toBe(false);
    destroyedCallbacks.get(4)!();
    expect(watchers[0]!.closed).toBe(true);
    expect(hub.watchedRoots()).toEqual([]);
  });
});
