import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ATTACHMENT_IMPORT_DIRECTORY,
  importAttachmentFiles,
  safeAttachmentFileName,
} from "../electron/main/utils/attachment-import";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "stave-attach-import-"));
  directories.push(dir);
  return dir;
}

test("a workspace file keeps its own relative path and is not copied", async () => {
  const root = await tempDir();
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "App.tsx"), "export {}");
  const result = await importAttachmentFiles({
    rootPath: root,
    entries: [{ absolutePath: path.join(root, "src", "App.tsx") }],
  });
  expect(result).toEqual({ filePaths: ["src/App.tsx"], failures: [] });
});

test("a file outside the workspace is copied into .stave/attachments with a gitignore", async () => {
  const root = await tempDir();
  const outside = await tempDir();
  await writeFile(path.join(outside, "report.pdf"), Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]));
  const result = await importAttachmentFiles({
    rootPath: root,
    entries: [{ absolutePath: path.join(outside, "report.pdf") }],
  });
  expect(result.failures).toEqual([]);
  expect(result.filePaths).toHaveLength(1);
  const [relative] = result.filePaths;
  expect(relative?.startsWith(`${ATTACHMENT_IMPORT_DIRECTORY}/`)).toBe(true);
  expect(relative?.endsWith("/report.pdf")).toBe(true);
  expect(await readFile(path.join(root, relative!))).toEqual(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]));
  expect(await readFile(path.join(root, ATTACHMENT_IMPORT_DIRECTORY, ".gitignore"), "utf8")).toBe("*\n");
});

test("two outside files with the same name do not overwrite each other", async () => {
  const root = await tempDir();
  const a = await tempDir();
  const b = await tempDir();
  await writeFile(path.join(a, "notes.txt"), "first");
  await writeFile(path.join(b, "notes.txt"), "second");
  const result = await importAttachmentFiles({
    rootPath: root,
    entries: [{ absolutePath: path.join(a, "notes.txt") }, { absolutePath: path.join(b, "notes.txt") }],
  });
  expect(result.filePaths).toHaveLength(2);
  expect(await readFile(path.join(root, result.filePaths[0]!), "utf8")).toBe("first");
  expect(await readFile(path.join(root, result.filePaths[1]!), "utf8")).toBe("second");
});

test("bytes without a disk path are written under a safe name", async () => {
  const root = await tempDir();
  const result = await importAttachmentFiles({
    rootPath: root,
    entries: [{ name: "../../evil.txt", data: new TextEncoder().encode("hello") }],
  });
  expect(result.filePaths).toHaveLength(1);
  expect(result.filePaths[0]?.startsWith(`${ATTACHMENT_IMPORT_DIRECTORY}/`)).toBe(true);
  expect(result.filePaths[0]?.endsWith("/evil.txt")).toBe(true);
  expect(await readFile(path.join(root, result.filePaths[0]!), "utf8")).toBe("hello");
});

test("folders and missing files are reported, not attached", async () => {
  const root = await tempDir();
  const outside = await tempDir();
  const result = await importAttachmentFiles({
    rootPath: root,
    entries: [{ absolutePath: outside }, { absolutePath: path.join(outside, "missing.txt") }],
  });
  expect(result.filePaths).toEqual([]);
  expect(result.failures.map((failure) => failure.reason)).toEqual(["not-a-file", "unreadable"]);
});

test("a workspace symlink that points outside the workspace is copied, not referenced", async () => {
  const root = await tempDir();
  const outside = await tempDir();
  await writeFile(path.join(outside, "secret.txt"), "outside");
  await symlink(path.join(outside, "secret.txt"), path.join(root, "link.txt"));
  const result = await importAttachmentFiles({
    rootPath: root,
    entries: [{ absolutePath: path.join(root, "link.txt") }],
  });
  expect(result.filePaths[0]?.startsWith(`${ATTACHMENT_IMPORT_DIRECTORY}/`)).toBe(true);
});

test("safeAttachmentFileName strips directories and empty names", () => {
  expect(safeAttachmentFileName("a/b/c.png")).toBe("c.png");
  expect(safeAttachmentFileName("..")).toBe("attachment");
  expect(safeAttachmentFileName("")).toBe("attachment");
});
