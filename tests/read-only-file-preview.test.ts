import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFilePreviewRange } from "../electron/main/utils/file-preview-range";
import { FILE_PREVIEW_CHUNK_BYTES, type FilePreviewReader } from "@/lib/fs/file-preview-reader";
import { resolveReadOnlyFileViewer, workspaceTextFilePreviewMaxBytes } from "@/lib/fs/file-preview-limits";
import { findInLog, locateLogLine, readLogPage, readLogTail } from "@/lib/fs/log-preview";
import { readPdfPreview } from "@/lib/fs/pdf-preview";

describe("read-only file previews", () => {
  let directory: string;
  let file: string;
  const reader: FilePreviewReader = (request) => readFilePreviewRange(file, request);
  const signal = () => new AbortController().signal;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "stave-file-view-"));
    file = path.join(directory, "generated.log");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test("bounds chunk requests and rejects stale reads after overwrite and rename", async () => {
    await writeFile(file, "original");
    const first = await reader({ offset: 0, length: 4 });
    expect(first.ok && new TextDecoder().decode(first.bytes)).toBe("orig");
    if (!first.ok) throw new Error("Unable to read initial revision");
    expect(await reader({ offset: 4, length: 4, revision: first.revision })).toMatchObject({ ok: true });
    expect(await reader({ offset: 0, length: FILE_PREVIEW_CHUNK_BYTES + 1 })).toEqual({ ok: false, reason: "unavailable" });
    await writeFile(file, "modified");
    expect(await reader({ offset: 4, length: 4, revision: first.revision })).toEqual({ ok: false, reason: "changed" });

    const second = await reader({ offset: 0, length: 4 });
    if (!second.ok) throw new Error("Unable to read updated revision");
    const replacement = path.join(directory, "replacement.log");
    await writeFile(replacement, "modified");
    await rename(replacement, file);
    expect(await reader({ offset: 4, length: 4, revision: second.revision })).toEqual({ ok: false, reason: "changed" });
  });

  test("tail reads complete new windows after append and truncation", async () => {
    await writeFile(file, "old output\n".repeat(40_000));
    const first = await readLogTail(reader, undefined, signal());
    expect(first?.text.length).toBeLessThan(FILE_PREVIEW_CHUNK_BYTES);
    expect(first?.text.endsWith("old output\n")).toBe(true);
    expect(await readLogTail(reader, first?.revision, signal())).toBeNull();

    await appendFile(file, "\x1b[31mnew output\x1b[0m\n");
    const next = await readLogTail(reader, first?.revision, signal());
    expect(next?.text.endsWith("new output\n")).toBe(true);
    expect(next?.revision).not.toBe(first?.revision);
    expect(next?.text).not.toContain("\x1b");

    await writeFile(file, "rotated\n");
    const rotated = await readLogTail(reader, next?.revision, signal());
    expect(rotated?.text).toBe("rotated\n");
    expect(rotated?.previousIndex).toBe(-1);
  });

  test("keeps UTF-8 intact and finds literal matches across chunk boundaries", async () => {
    const pad = "x".repeat(128 * 1024 - 1);
    await writeFile(file, pad + "한글 needle " + "x".repeat(700) + "\nsecond line\n");
    const first = await readLogPage(reader, 0, signal());
    const second = await readLogPage(reader, 1, signal(), first);
    expect(first.text.endsWith("한")).toBe(true);
    expect(second.text.startsWith("글 needle")).toBe(true);
    const match = await findInLog(reader, "한글", signal());
    expect(match?.highlight && (match.prefix + match.page.text).slice(...match.highlight)).toBe("한글");
    await expect(findInLog(reader, "한글", signal(), match ?? undefined)).resolves.toBeNull();
    const line = await locateLogLine(reader, 2, signal());
    expect(line.highlight && line.page.text.slice(...line.highlight)).toBe("second line");
  });

  test("strips a color sequence split at a long line's byte boundary", async () => {
    const prefix = "x".repeat(128 * 1024 - 2);
    const suffix = "y".repeat(700);
    await writeFile(file, prefix + "\x1b[31m" + suffix + "\x1b[0m\n");
    const first = await readLogPage(reader, 0, signal());
    const second = await readLogPage(reader, 1, signal(), first);
    expect(first.text).toBe(prefix);
    expect(second.text).toBe(suffix + "\n");
  });

  test("aborts a multi-chunk PDF read when the file changes between ranges", async () => {
    await writeFile(file, "x".repeat(FILE_PREVIEW_CHUNK_BYTES + 32));
    const changing: FilePreviewReader = async (request) => {
      const result = await reader(request);
      if (request.offset === 0) await appendFile(file, "changed");
      return result;
    };
    await expect(readPdfPreview(changing, signal())).rejects.toMatchObject({ reason: "changed" });
  });

  test("keeps the editable caps and routes only supported read-only surfaces", () => {
    expect(workspaceTextFilePreviewMaxBytes("output.log")).toBe(1024 * 1024);
    expect(workspaceTextFilePreviewMaxBytes("report.HTML")).toBe(10 * 1024 * 1024);
    const log = { id: "file:output.log", filePath: "output.log", kind: "text" };
    expect(resolveReadOnlyFileViewer({ ...log, contentState: "ready" }, true)).toBeNull();
    expect(resolveReadOnlyFileViewer({ ...log, contentState: "too-large" }, true)).toBe("log");
    expect(resolveReadOnlyFileViewer({ ...log, contentState: "too-large" }, false)).toBeNull();
    expect(resolveReadOnlyFileViewer({ ...log, kind: "image", contentState: "too-large" }, true)).toBeNull();
    expect(resolveReadOnlyFileViewer({ id: "file:report.PDF", filePath: "report.PDF", contentState: "read-only" }, true)).toBe("pdf");
  });
});
