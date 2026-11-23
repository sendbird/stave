import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildFilesystemSearchRgArgs,
  parseFilesystemSearchMatchLine,
  searchFilesystemContent,
} from "../electron/main/ipc/filesystem-search";
import { registerFilesystemSearchHandlers } from "../electron/main/ipc/filesystem-search-ipc";
import { normalizeFilesystemSearchQuery } from "../src/lib/fs/content-search";
import type { FilesystemSearchRequest } from "../src/lib/fs/content-search";

describe("filesystem search helpers", () => {
  test("malformed match events do not throw or invent results", () => {
    for (const event of [null, [], { type: "match", data: { path: { text: 42 }, line_number: 1, lines: { text: "match" } } },
      { type: "match", data: { path: { text: "file" }, line_number: -1, lines: { text: "match" } } }]) {
      expect(parseFilesystemSearchMatchLine(JSON.stringify(event))).toBeNull();
    }
  });
  test("trims single-line queries", () => {
    expect(normalizeFilesystemSearchQuery("  hello world  ")).toBe(
      "hello world",
    );
  });

  test("preserves multiline indentation while trimming outer blank lines", () => {
    expect(
      normalizeFilesystemSearchQuery("\n  const x = 1;\n  return x;\n\n"),
    ).toBe("  const x = 1;\n  return x;");
  });

  test("enables multiline ripgrep mode only for multiline queries", () => {
    expect(buildFilesystemSearchRgArgs("needle")).not.toContain("--multiline");
    expect(
      buildFilesystemSearchRgArgs("const x = 1;\nreturn x;"),
    ).toContain("--multiline");
  });

  test("parses ripgrep json match lines into grouped results", () => {
    const parsed = parseFilesystemSearchMatchLine(
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "./src/example.ts" },
          line_number: 12,
          lines: { text: "  const x = 1;\n  return x;\n" },
        },
      }),
    );

    expect(parsed).toEqual({
      file: "src/example.ts",
      match: {
        line: 12,
        text: "  const x = 1;\n  return x;",
      },
    });
  });

  test("ignores non-match ripgrep events", () => {
    expect(
      parseFilesystemSearchMatchLine(
        JSON.stringify({ type: "summary", data: { matches: 0 } }),
      ),
    ).toBeNull();
  });
});

describe("workspace content search execution", () => {
  let rootPath: string;
  let request: FilesystemSearchRequest;
  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), "stave-search-"));
    request = { rootPath, workspaceId: "workspace-a", surface: "explorer", query: "needle" };
  });
  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  test("matches a multiline literal with the bundled ripgrep", async () => {
    const query = "const x = [1];\n  return x;";
    await writeFile(path.join(rootPath, "source.ts"), `first\n${query}\nlast\n`);
    await writeFile(path.join(rootPath, "distractor.ts"), "const x = [1];\nreturn x;\n");
    expect(await searchFilesystemContent({ ...request, query }, new AbortController().signal)).toEqual({
      ok: true,
      results: [{ file: "source.ts", matches: [{ line: 2, text: query }] }],
      limitHit: false,
    });
  });

  test("truncates large Unicode previews and skips oversized records", async () => {
    const prefix = "needle ";
    const line = prefix + "🌈".repeat(30_000);
    await writeFile(path.join(rootPath, "unicode.txt"), `${line}\n${line.repeat(3)}\nneedle after\n`);
    const response = await searchFilesystemContent(request, new AbortController().signal);
    expect(response).toMatchObject({ ok: true, limitHit: true });
    if (!response.ok) throw new Error(JSON.stringify(response));
    expect(response.results).toEqual([{
      file: "unicode.txt",
      matches: [
        // The next four-byte code point would cross the 8 KiB preview cap.
        { line: 1, text: prefix + "🌈".repeat(2_046) },
        { line: 3, text: "needle after" },
      ],
    }]);
  });

  test("caps per-file match counts without dropping other files", async () => {
    await writeFile(path.join(rootPath, "many.txt"), "needle\n".repeat(550));
    await writeFile(path.join(rootPath, "other.txt"), "needle\n");
    const response = await searchFilesystemContent(request, new AbortController().signal);
    expect(response).toMatchObject({ ok: true, limitHit: true });
    if (!response.ok) throw new Error(JSON.stringify(response));
    expect(response.results.find((file) => file.file === "many.txt")?.matches).toHaveLength(500);
    expect(response.results.find((file) => file.file === "other.txt")?.matches).toHaveLength(1);
  });

  test("caps preview bytes per file and across the whole search", async () => {
    for (let index = 0; index < 20; index++) {
      await writeFile(path.join(rootPath, `${index}.txt`), ("needle" + "x".repeat(4090) + "\n").repeat(40));
    }
    const response = await searchFilesystemContent(request, new AbortController().signal);
    expect(response).toMatchObject({ ok: true, limitHit: true });
    if (!response.ok) throw new Error(JSON.stringify(response));
    const totals = response.results.map(({ file, matches }) => {
      const bytes = matches.reduce((sum, match) => sum + Buffer.byteLength(match.text), 0);
      expect(bytes).toBeLessThanOrEqual(128 * 1024);
      return Buffer.byteLength(file) + bytes;
    });
    const bytes = totals.reduce((sum, value) => sum + value, 0);
    expect(bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(bytes).toBeGreaterThan(2 * 1024 * 1024 - 4096);
  });

  test("caps the total match count across files", async () => {
    await Promise.all(Array.from({ length: 41 }, (_, index) =>
      writeFile(path.join(rootPath, `${index}.txt`), "needle\n".repeat(500)),
    ));
    const response = await searchFilesystemContent(request, new AbortController().signal);
    expect(response).toMatchObject({ ok: true, limitHit: true });
    if (!response.ok) throw new Error(JSON.stringify(response));
    expect(response.results.reduce((sum, file) => sum + file.matches.length, 0)).toBe(20_000);
  });

  test("stops reading raw output even when oversized records yield no matches", async () => {
    const oversizedLine = "needle" + "x".repeat(512 * 1024) + "\n";
    await writeFile(path.join(rootPath, "oversized.txt"), oversizedLine.repeat(33) + "needle after\n");
    expect(await searchFilesystemContent(request, new AbortController().signal)).toEqual({
      ok: true, results: [], limitHit: true,
    });
  });

  test.skipIf(process.platform === "win32")("kills replaced and cancelled children within the invoking window's scope", async () => {
    const executable = path.join(rootPath, "controlled-rg");
    await writeFile(executable, `#!/bin/sh
case "$7" in
  slow*)
    echo "$$" > "$7.pid"
    exec sleep 15
    ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
    const handlers = new Map<string, Parameters<IpcMain["handle"]>[1]>();
    registerFilesystemSearchHandlers(
      { handle: (channel, handler) => handlers.set(channel, handler) },
      (args, signal) => searchFilesystemContent(args, signal, executable),
    );
    const search = handlers.get("fs:search-content")!;
    const cancel = handlers.get("fs:cancel-content-search")!;
    const event = { sender: new EventEmitter() } as unknown as IpcMainInvokeEvent;
    const otherEvent = { sender: new EventEmitter() } as unknown as IpcMainInvokeEvent;
    const start = async (owner: IpcMainInvokeEvent, query: string) => {
      const response = search(owner, { ...request, query });
      const pidFile = path.join(rootPath, `${query}.pid`);
      for (let attempt = 0; attempt < 100; attempt++) {
        const pid = Number(await readFile(pidFile, "utf8").catch(() => ""));
        if (pid > 0) return { response, pid };
        await Bun.sleep(10);
      }
      throw new Error("Search subprocess did not start");
    };
    const scope = { workspaceId: request.workspaceId, surface: request.surface };
    expect(await search(event, { ...request, query: { invalid: true } })).toMatchObject({ ok: false });
    expect(await search(event, { ...request, regex: true })).toMatchObject({ ok: false });
    try {
      const old = await start(event, "slow-old");
      const otherWindow = await start(otherEvent, "slow-other-window");
      expect(await search(event, request)).toEqual({ ok: true, results: [], limitHit: false });
      expect(await old.response).toEqual({ ok: false, cancelled: true });
      expect(() => process.kill(old.pid, 0)).toThrow();
      expect(() => process.kill(otherWindow.pid, 0)).not.toThrow();

      const switching = await start(event, "slow-workspace-switch");
      cancel(event, { ...scope, workspaceId: "workspace-b" });
      expect(() => process.kill(switching.pid, 0)).not.toThrow();
      cancel(event, scope);
      expect(await switching.response).toEqual({ ok: false, cancelled: true });
      expect(() => process.kill(switching.pid, 0)).toThrow();
      expect(() => process.kill(otherWindow.pid, 0)).not.toThrow();

      otherEvent.sender.emit("destroyed");
      expect(await otherWindow.response).toEqual({ ok: false, cancelled: true });
      expect(() => process.kill(otherWindow.pid, 0)).toThrow();
    } finally {
      event.sender.emit("destroyed");
      otherEvent.sender.emit("destroyed");
    }
  });
});
