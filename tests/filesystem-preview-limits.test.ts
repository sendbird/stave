import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const handlers = new Map<string, (event: unknown, args: unknown) => Promise<unknown>>();
mock.module("electron", () => ({
  dialog: {},
  shell: {},
  ipcMain: { handle: (channel: string, handler: (event: unknown, args: unknown) => Promise<unknown>) => handlers.set(channel, handler) },
}));
const { registerFilesystemHandlers } = await import("../electron/main/ipc/filesystem");
registerFilesystemHandlers();

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("desktop HTML preview reads", () => {
  test("reads the full 10 MiB file and rejects a larger file without returning content", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "stave-preview-limit-"));
    roots.push(rootPath);
    const maxBytes = 10 * 1024 * 1024;
    const html = "한".repeat(Math.floor(maxBytes / 3)) + "x";
    await writeFile(path.join(rootPath, "large.html"), html);
    const read = (filePath: string) => handlers.get("fs:read-file")!(null, { rootPath, filePath });
    expect(await read("large.html")).toMatchObject({ ok: true, content: html });
    await writeFile(path.join(rootPath, "large.HTM"), html + "x");
    expect(await read("large.HTM")).toMatchObject({
      ok: false, content: "", tooLarge: true, sizeBytes: maxBytes + 1, maxSizeBytes: maxBytes,
    });
    await writeFile(path.join(rootPath, "large.txt"), "x".repeat(1024 * 1024 + 1));
    expect(await read("large.txt")).toMatchObject({
      ok: false, content: "", tooLarge: true, maxSizeBytes: 1024 * 1024,
    });
    expect(await read("missing.html")).toMatchObject({ ok: false, content: "" });
    expect(await handlers.get("fs:read-file")!(null, { rootPath })).toMatchObject({ ok: false, content: "" });
  });
});
