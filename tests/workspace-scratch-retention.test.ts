import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readlink, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  isScratchRetentionDue,
  mainCheckoutRoots,
  pruneWorkspaceScratch,
  runWorkspaceScratchRetention,
  WORKSPACE_SCRATCH_RETENTION_INTERVAL_MS,
  WORKSPACE_SCRATCH_RETENTION_MS,
} from "../electron/main/utils/workspace-scratch-retention";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 24, 12);
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function tempDir(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function writeAged(file: string, content: string, ageDays: number) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  const seconds = (NOW - ageDays * DAY) / 1000;
  await utimes(file, seconds, seconds);
}

async function exists(target: string) {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

describe("pruneWorkspaceScratch", () => {
  test("removes files older than 30 days and the folders it emptied, keeping newer files and .gitignore", async () => {
    const root = await tempDir("stave-scratch-retention-");
    const scratch = path.join(root, ".stave", "scratch");
    await writeAged(path.join(scratch, ".gitignore"), "*\n", 400);
    await writeAged(path.join(scratch, "old.log"), "12345", 31);
    await writeAged(path.join(scratch, "recent.log"), "x", 29);
    await writeAged(path.join(scratch, "agents", "a1", "old.png"), "png", 45);
    await writeAged(path.join(scratch, "agents", "a2", "new.png"), "png", 1);
    await mkdir(path.join(scratch, "empty-already"));

    const result = await pruneWorkspaceScratch({ rootPath: root, now: NOW });
    expect(result).toEqual({ removedFiles: 2, removedBytes: 8, removedFolders: 1 });
    expect(await exists(path.join(scratch, "old.log"))).toBe(false);
    expect(await exists(path.join(scratch, "agents", "a1"))).toBe(false);
    expect(await exists(path.join(scratch, "recent.log"))).toBe(true);
    expect(await exists(path.join(scratch, "agents", "a2", "new.png"))).toBe(true);
    expect(await exists(path.join(scratch, ".gitignore"))).toBe(true);
    // A folder this pass did not empty stays, and so does the scratch folder itself.
    expect(await exists(path.join(scratch, "empty-already"))).toBe(true);
    expect((await stat(scratch)).isDirectory()).toBe(true);
    expect(WORKSPACE_SCRATCH_RETENTION_MS).toBe(30 * DAY);
  });

  test("never follows or removes links, and never touches files outside the scratch folder", async () => {
    const root = await tempDir("stave-scratch-retention-");
    const outside = await tempDir("stave-scratch-outside-");
    const scratch = path.join(root, ".stave", "scratch");
    await writeAged(path.join(outside, "keep", "old.txt"), "outside", 90);
    await writeAged(path.join(outside, "old-target.txt"), "outside", 90);
    await writeAged(path.join(root, "src", "old.ts"), "workspace", 90);
    await writeAged(path.join(root, ".stave", "attachments", "old.png"), "attachment", 90);
    await mkdir(scratch, { recursive: true });
    await symlink(path.join(outside, "keep"), path.join(scratch, "linked-folder"));
    await symlink(path.join(outside, "old-target.txt"), path.join(scratch, "linked-file.txt"));

    expect(await pruneWorkspaceScratch({ rootPath: root, now: NOW })).toEqual({ removedFiles: 0, removedBytes: 0, removedFolders: 0 });
    expect(await exists(path.join(outside, "keep", "old.txt"))).toBe(true);
    expect(await exists(path.join(outside, "old-target.txt"))).toBe(true);
    expect(await readlink(path.join(scratch, "linked-file.txt"))).toBe(path.join(outside, "old-target.txt"));
    expect(await exists(path.join(root, "src", "old.ts"))).toBe(true);
    expect(await exists(path.join(root, ".stave", "attachments", "old.png"))).toBe(true);
  });

  test("a scratch folder reached through a link is left alone", async () => {
    const root = await tempDir("stave-scratch-retention-");
    const outside = await tempDir("stave-scratch-outside-");
    await writeAged(path.join(outside, "scratch", "old.log"), "outside", 90);
    await symlink(outside, path.join(root, ".stave"));
    expect(await pruneWorkspaceScratch({ rootPath: root, now: NOW })).toEqual({ removedFiles: 0, removedBytes: 0, removedFolders: 0 });
    expect(await exists(path.join(outside, "scratch", "old.log"))).toBe(true);
  });

  test("a workspace without a scratch folder is a no-op", async () => {
    const root = await tempDir("stave-scratch-retention-");
    expect(await pruneWorkspaceScratch({ rootPath: root, now: NOW })).toEqual({ removedFiles: 0, removedBytes: 0, removedFolders: 0 });
    expect(await exists(path.join(root, ".stave"))).toBe(false);
  });
});

describe("retention schedule", () => {
  test("covers each registered project's main checkout once, never worktree folders", () => {
    expect(
      mainCheckoutRoots([
        { repositoryPath: "/repos/app" },
        { repositoryPath: "/repos/app/" },
        { repositoryPath: "relative/repo" },
        { repositoryPath: "" },
        { repositoryPath: "/repos/lib" },
      ]),
    ).toEqual([path.resolve("/repos/app"), path.resolve("/repos/lib")]);
  });

  test("runs on first start and at most once a day", () => {
    expect(isScratchRetentionDue(null, NOW)).toBe(true);
    expect(isScratchRetentionDue(NOW - WORKSPACE_SCRATCH_RETENTION_INTERVAL_MS + 1, NOW)).toBe(false);
    expect(isScratchRetentionDue(NOW - WORKSPACE_SCRATCH_RETENTION_INTERVAL_MS, NOW)).toBe(true);
    // A clock moved backwards does not block the pass forever.
    expect(isScratchRetentionDue(NOW + DAY, NOW)).toBe(true);
  });

  test("one failing folder does not stop the others", async () => {
    const seen: string[] = [];
    const total = await runWorkspaceScratchRetention({
      roots: ["/a", "/b"],
      now: NOW,
      prune: async ({ rootPath }) => {
        seen.push(rootPath);
        if (rootPath === "/a") throw new Error("EACCES");
        return { removedFiles: 2, removedBytes: 10, removedFolders: 1 };
      },
    });
    expect(seen).toEqual(["/a", "/b"]);
    expect(total).toEqual({ removedFiles: 2, removedBytes: 10, removedFolders: 1 });
  });
});
