import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ensureWorkspaceScratch,
  listWorkspaceScratch,
  WorkspaceScratchRefusedError,
  workspaceScratchTimestamp,
  writeWorkspaceScratchFile,
} from "../electron/main/utils/workspace-scratch";
import {
  findWorkspaceRootInRegistry,
  isWorkspaceRootInRegistry,
} from "../electron/main/workspace-roots";
import {
  WORKSPACE_SCRATCH_DIRECTORY,
  WORKSPACE_SCRATCH_INSTRUCTION,
  WORKSPACE_SCRATCH_MAX_FILES,
} from "../src/lib/workspace-scratch";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function tempRoot(prefix = "stave-scratch-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function writeAt(root: string, relative: string, content: string, mtimeSeconds: number) {
  const absolute = path.join(root, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
  await utimes(absolute, mtimeSeconds, mtimeSeconds);
}

describe("ensureWorkspaceScratch", () => {
  test("creates the folder and a .gitignore of * once, keeping a later edit", async () => {
    const root = await tempRoot();
    const scratch = await ensureWorkspaceScratch(root);
    expect(scratch).toBe(path.join(root, ".stave", "scratch"));
    const ignorePath = path.join(scratch, ".gitignore");
    expect(await readFile(ignorePath, "utf8")).toBe("*\n");

    await writeFile(ignorePath, "*\n!keep.txt\n");
    await ensureWorkspaceScratch(root);
    expect(await readFile(ignorePath, "utf8")).toBe("*\n!keep.txt\n");
  });

  test("two turns starting at once both succeed", async () => {
    const root = await tempRoot();
    const results = await Promise.all([ensureWorkspaceScratch(root), ensureWorkspaceScratch(root)]);
    expect(results[0]).toBe(results[1]);
    expect(await readFile(path.join(results[0], ".gitignore"), "utf8")).toBe("*\n");
  });

  test("refuses a symlinked .stave or scratch folder and writes nothing outside", async () => {
    const root = await tempRoot();
    const outside = await tempRoot("stave-scratch-outside-");
    await symlink(outside, path.join(root, ".stave"));
    await expect(ensureWorkspaceScratch(root)).rejects.toBeInstanceOf(WorkspaceScratchRefusedError);
    await expect(lstat(path.join(outside, "scratch"))).rejects.toThrow();

    const second = await tempRoot();
    await mkdir(path.join(second, ".stave"));
    await symlink(outside, path.join(second, ".stave", "scratch"));
    await expect(ensureWorkspaceScratch(second)).rejects.toBeInstanceOf(WorkspaceScratchRefusedError);
    await expect(lstat(path.join(outside, ".gitignore"))).rejects.toThrow();
  });

  test("refuses a file where the folder should be, and a symlinked subfolder", async () => {
    const root = await tempRoot();
    await mkdir(path.join(root, ".stave"));
    await writeFile(path.join(root, ".stave", "scratch"), "not a folder");
    await expect(ensureWorkspaceScratch(root)).rejects.toBeInstanceOf(WorkspaceScratchRefusedError);

    const other = await tempRoot();
    const outside = await tempRoot("stave-scratch-outside-");
    await ensureWorkspaceScratch(other);
    await symlink(outside, path.join(other, ".stave", "scratch", "lens"));
    await expect(ensureWorkspaceScratch(other, { subdirectory: "lens" }))
      .rejects.toBeInstanceOf(WorkspaceScratchRefusedError);
    await expect(ensureWorkspaceScratch(other, { subdirectory: "../escape" }))
      .rejects.toBeInstanceOf(WorkspaceScratchRefusedError);
  });
});

describe("writeWorkspaceScratchFile", () => {
  test("writes a new timestamped file without overwriting and returns its relative path", async () => {
    const root = await tempRoot();
    const now = new Date(2026, 10, 24, 15, 30, 12);
    const first = await writeWorkspaceScratchFile({
      rootPath: root, subdirectory: "lens", extension: "png", data: new Uint8Array([1, 2, 3]), now,
    });
    const second = await writeWorkspaceScratchFile({
      rootPath: root, subdirectory: "lens", extension: "png", data: new Uint8Array([4]), now,
    });
    expect(first).toMatch(/^\.stave\/scratch\/lens\/20261124-153012-\d+\.png$/);
    expect(second).not.toBe(first);
    expect([...(await readFile(path.join(root, first)))]).toEqual([1, 2, 3]);
    expect(workspaceScratchTimestamp(now)).toBe("20261124-153012");
  });
});

describe("listWorkspaceScratch", () => {
  test("lists files newest first with totals, skipping the folder's .gitignore", async () => {
    const root = await tempRoot();
    await ensureWorkspaceScratch(root);
    await writeAt(root, ".stave/scratch/old.log", "old", 1_000);
    await writeAt(root, ".stave/scratch/lens/shot.png", "png!", 3_000);
    await writeAt(root, ".stave/scratch/api/response.json", "{}", 2_000);
    // A nested .gitignore is the agent's own file and is listed.
    await writeAt(root, ".stave/scratch/api/.gitignore", "x", 500);

    const listing = await listWorkspaceScratch(root);
    expect(listing.files.map((file) => file.path)).toEqual([
      ".stave/scratch/lens/shot.png",
      ".stave/scratch/api/response.json",
      ".stave/scratch/old.log",
      ".stave/scratch/api/.gitignore",
    ]);
    expect(listing.files[0]).toEqual({ path: ".stave/scratch/lens/shot.png", sizeBytes: 4, mtimeMs: 3_000_000 });
    expect(listing.fileCount).toBe(4);
    expect(listing.totalBytes).toBe(3 + 4 + 2 + 1);
    expect(listing.truncated).toBe(false);
  });

  test("a missing folder lists as empty", async () => {
    const root = await tempRoot();
    expect(await listWorkspaceScratch(root)).toEqual({ files: [], fileCount: 0, totalBytes: 0, truncated: false });
  });

  test("never follows a link: a linked scratch folder, subfolder or file is left out", async () => {
    const outside = await tempRoot("stave-scratch-outside-");
    await writeFile(path.join(outside, "secret.txt"), "outside");

    const linkedRoot = await tempRoot();
    await mkdir(path.join(linkedRoot, ".stave"));
    await symlink(outside, path.join(linkedRoot, ".stave", "scratch"));
    expect((await listWorkspaceScratch(linkedRoot)).files).toEqual([]);

    const root = await tempRoot();
    await ensureWorkspaceScratch(root);
    await writeAt(root, ".stave/scratch/real.txt", "real", 1_000);
    await symlink(outside, path.join(root, ".stave", "scratch", "linked-folder"));
    await symlink(path.join(outside, "secret.txt"), path.join(root, ".stave", "scratch", "linked.txt"));
    const listing = await listWorkspaceScratch(root);
    expect(listing.files.map((file) => file.path)).toEqual([".stave/scratch/real.txt"]);
  });

  test("looks four folders deep and no further", async () => {
    const root = await tempRoot();
    await ensureWorkspaceScratch(root);
    await writeAt(root, ".stave/scratch/a/b/c/d/deep.txt", "ok", 1_000);
    await writeAt(root, ".stave/scratch/a/b/c/d/e/too-deep.txt", "no", 2_000);
    const listing = await listWorkspaceScratch(root);
    expect(listing.files.map((file) => file.path)).toEqual([".stave/scratch/a/b/c/d/deep.txt"]);
  });

  test("returns the newest 300 and counts the rest", async () => {
    const root = await tempRoot();
    await ensureWorkspaceScratch(root);
    await writeAt(root, ".stave/scratch/brief.md", "x", 1);
    const total = WORKSPACE_SCRATCH_MAX_FILES * 2 + 5;
    for (let index = 0; index < total; index += 1) {
      await writeAt(root, `.stave/scratch/file-${String(index).padStart(3, "0")}.txt`, "x", 1_000 + index);
    }
    const listing = await listWorkspaceScratch(root);
    expect(listing.files).toHaveLength(WORKSPACE_SCRATCH_MAX_FILES);
    expect(listing.files[0]?.path).toBe(`.stave/scratch/file-${String(total - 1).padStart(3, "0")}.txt`);
    expect(listing.olderArtifacts?.map((file) => file.path)).toEqual([".stave/scratch/brief.md"]);
    expect(listing.fileCount).toBe(total + 1);
    expect(listing.totalBytes).toBe(total + 1);
    expect(listing.truncated).toBe(true);
  });
});

describe("workspace registry lookups", () => {
  const registry = [
    {
      repositoryPath: "/tmp/repo",
      workspaces: [{ id: "default", name: "main", updatedAt: "" }, { id: "feature", name: "feature", updatedAt: "" }],
      workspacePathById: { feature: "/tmp/repo/.stave/workspaces/feature" },
    },
  ];

  test("finds a workspace's folder, falling back to the repository for the default one", () => {
    expect(findWorkspaceRootInRegistry(registry, "feature")).toBe("/tmp/repo/.stave/workspaces/feature");
    expect(findWorkspaceRootInRegistry(registry, "default")).toBe("/tmp/repo");
    expect(findWorkspaceRootInRegistry(registry, "unknown")).toBeNull();
  });

  test("accepts only registered roots", () => {
    expect(isWorkspaceRootInRegistry(registry, "/tmp/repo")).toBe(true);
    expect(isWorkspaceRootInRegistry(registry, "/tmp/repo/.stave/workspaces/feature/")).toBe(true);
    expect(isWorkspaceRootInRegistry(registry, "/tmp")).toBe(false);
    expect(isWorkspaceRootInRegistry(registry, "/tmp/repo/../other")).toBe(false);
    expect(isWorkspaceRootInRegistry(registry, "tmp/repo")).toBe(false);
  });
});

test("the shared instruction names the folder by its relative path only", () => {
  expect(WORKSPACE_SCRATCH_DIRECTORY).toBe(".stave/scratch");
  expect(WORKSPACE_SCRATCH_INSTRUCTION).toContain("`.stave/scratch/`");
  expect(WORKSPACE_SCRATCH_INSTRUCTION).toContain("2>&1 | tee .stave/scratch/tests.log");
  expect(WORKSPACE_SCRATCH_INSTRUCTION).toMatch(/Never write secrets/);
  expect(WORKSPACE_SCRATCH_INSTRUCTION).not.toMatch(/\/Users\/|\/home\//);
});
