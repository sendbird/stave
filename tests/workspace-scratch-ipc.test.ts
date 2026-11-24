import { afterEach, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const handlers = new Map<string, (event: unknown, args: unknown) => Promise<unknown>>();
mock.module("electron", () => ({
  dialog: {},
  shell: {},
  ipcMain: { handle: (channel: string, handler: (event: unknown, args: unknown) => Promise<unknown>) => handlers.set(channel, handler) },
}));
const knownRoots = new Set<string>();
const { registerFilesystemHandlers } = await import("../electron/main/ipc/filesystem");
registerFilesystemHandlers({ isKnownWorkspaceRoot: async (rootPath) => knownRoots.has(rootPath) });

const roots: string[] = [];
afterEach(async () => {
  knownRoots.clear();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const listScratch = (args: unknown) => handlers.get("fs:list-scratch")!(null, args);

test("fs:list-scratch lists a registered workspace's scratch folder", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "stave-scratch-ipc-"));
  roots.push(rootPath);
  knownRoots.add(rootPath);
  await mkdir(path.join(rootPath, ".stave", "scratch"), { recursive: true });
  await writeFile(path.join(rootPath, ".stave", "scratch", "tests.log"), "ok\n");
  expect(await listScratch({ rootPath })).toMatchObject({
    ok: true,
    fileCount: 1,
    totalBytes: 3,
    files: [{ path: ".stave/scratch/tests.log", sizeBytes: 3 }],
  });
});

test("fs:list-scratch refuses an unregistered folder, a relative path and extra fields", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "stave-scratch-ipc-"));
  roots.push(rootPath);
  await mkdir(path.join(rootPath, ".stave", "scratch"), { recursive: true });
  await writeFile(path.join(rootPath, ".stave", "scratch", "tests.log"), "ok\n");
  expect(await listScratch({ rootPath })).toEqual({ ok: false, stderr: "Not a known workspace folder." });
  knownRoots.add("relative/root");
  expect(await listScratch({ rootPath: "relative/root" })).toMatchObject({ ok: false });
  knownRoots.add(rootPath);
  expect(await listScratch({ rootPath, directoryPath: "/etc" })).toMatchObject({ ok: false });
  expect(await listScratch(undefined)).toMatchObject({ ok: false });
});
