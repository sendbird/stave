import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  FilesystemDirectoryArgsSchema,
  FilesystemFileArgsSchema,
  FilesystemRootArgsSchema,
  FilesystemWriteFileArgsSchema,
} from "../electron/main/ipc/schemas";
import {
  listDirectoryEntries,
  listFilesRecursive,
  resolveRootFilePath,
  revisionFromStat,
  writeFileWithExpectedRevision,
} from "../electron/main/utils/filesystem";

const tempDirs: string[] = [];

function createTempWorkspace() {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "stave-filesystem-utils-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

function writeText(filePath: string, value: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value);
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("filesystem IPC validation", () => {
  test("rejects requests with missing path fields before they reach path utilities", () => {
    expect(FilesystemRootArgsSchema.safeParse({}).success).toBe(false);
    expect(FilesystemFileArgsSchema.safeParse({ rootPath: "/tmp/project" }).success).toBe(false);
    expect(FilesystemDirectoryArgsSchema.safeParse({ rootPath: "/tmp/project", directoryPath: 123 }).success).toBe(false);
    expect(
      FilesystemWriteFileArgsSchema.safeParse({
        rootPath: "/tmp/project",
        filePath: "src/index.ts",
      }).success,
    ).toBe(false);
  });
});

describe("filesystem path helpers", () => {
  test("returns null instead of throwing when a file request omits a path value", () => {
    expect(resolveRootFilePath({ rootPath: undefined, filePath: "src/index.ts" })).toBeNull();
    expect(resolveRootFilePath({ rootPath: "/tmp/project", filePath: undefined })).toBeNull();
  });

  test("throws a descriptive error when listing files without a workspace root", async () => {
    await expect(listFilesRecursive({ rootPath: undefined })).rejects.toThrow("Workspace root path is required.");
  });

  test("keeps hidden files and useful dot-directories while still skipping ignored directories", async () => {
    const workspaceRoot = createTempWorkspace();
    writeText(path.join(workspaceRoot, ".env"), "A=1\n");
    writeText(path.join(workspaceRoot, ".github/workflows/ci.yml"), "name: ci\n");
    writeText(path.join(workspaceRoot, "src/index.ts"), "export {};\n");
    writeText(path.join(workspaceRoot, ".git/config"), "[core]\n");
    writeText(path.join(workspaceRoot, "node_modules/pkg/index.js"), "module.exports = {};\n");

    const files = await listFilesRecursive({ rootPath: workspaceRoot });

    expect(files).toContain(".env");
    expect(files).toContain(".github/workflows/ci.yml");
    expect(files).toContain("src/index.ts");
    expect(files).not.toContain(".git/config");
    expect(files).not.toContain("node_modules/pkg/index.js");
  });

  test("walks folders deeper than the original explorer depth limit", async () => {
    const workspaceRoot = createTempWorkspace();
    writeText(path.join(workspaceRoot, "a/b/c/d/e/f/g/h/i/j/file.txt"), "deep\n");

    const files = await listFilesRecursive({ rootPath: workspaceRoot });

    expect(files).toContain("a/b/c/d/e/f/g/h/i/j/file.txt");
  });

  test("lists visible directories before files and keeps empty folders available for lazy explorer loads", async () => {
    const workspaceRoot = createTempWorkspace();
    mkdirSync(path.join(workspaceRoot, ".github/workflows"), { recursive: true });
    mkdirSync(path.join(workspaceRoot, "empty-folder"), { recursive: true });
    mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
    mkdirSync(path.join(workspaceRoot, ".git/hooks"), { recursive: true });
    writeText(path.join(workspaceRoot, ".env"), "A=1\n");
    writeText(path.join(workspaceRoot, "src/index.ts"), "export {};\n");

    const rootEntries = await listDirectoryEntries({ rootPath: workspaceRoot });
    const githubEntries = await listDirectoryEntries({ rootPath: workspaceRoot, directoryPath: ".github" });

    expect(rootEntries.map((entry) => `${entry.type}:${entry.name}`)).toEqual([
      "folder:.github",
      "folder:empty-folder",
      "folder:src",
      "file:.env",
    ]);
    expect(rootEntries.some((entry) => entry.path === ".git")).toBe(false);
    expect(githubEntries).toEqual([
      { name: "workflows", path: ".github/workflows", type: "folder" },
    ]);
  });

  test("surfaces symlinked files and directories that resolve inside the workspace root", async () => {
    const workspaceRoot = createTempWorkspace();
    writeText(path.join(workspaceRoot, "dotfiles/config/nvim/init.lua"), "vim.o.number = true\n");
    writeText(path.join(workspaceRoot, "dotfiles/zshrc"), "export ZDOTDIR=$HOME\n");
    symlinkSync(path.join(workspaceRoot, "dotfiles/config"), path.join(workspaceRoot, ".config"));
    symlinkSync(path.join(workspaceRoot, "dotfiles/zshrc"), path.join(workspaceRoot, ".zshrc"));

    const files = await listFilesRecursive({ rootPath: workspaceRoot });
    const rootEntries = await listDirectoryEntries({ rootPath: workspaceRoot });
    const configEntries = await listDirectoryEntries({ rootPath: workspaceRoot, directoryPath: ".config" });

    expect(files).toContain(".config/nvim/init.lua");
    expect(files).toContain(".zshrc");
    expect(rootEntries).toContainEqual({ name: ".config", path: ".config", type: "folder" });
    expect(rootEntries).toContainEqual({ name: ".zshrc", path: ".zshrc", type: "file" });
    expect(configEntries).toEqual([
      { name: "nvim", path: ".config/nvim", type: "folder" },
    ]);
  });

  test("shows symlinked entries that resolve outside the workspace root in the explorer", async () => {
    const workspaceRoot = createTempWorkspace();
    const externalRoot = createTempWorkspace();
    writeText(path.join(externalRoot, "private/secret.txt"), "top-secret\n");
    symlinkSync(path.join(externalRoot, "private"), path.join(workspaceRoot, ".external"));
    symlinkSync(path.join(externalRoot, "private/secret.txt"), path.join(workspaceRoot, ".secret"));

    const files = await listFilesRecursive({ rootPath: workspaceRoot });
    const rootEntries = await listDirectoryEntries({ rootPath: workspaceRoot });

    // listFilesRecursive must NOT traverse external symlinks to avoid indexing the whole filesystem
    expect(files).not.toContain(".external/secret.txt");
    expect(files).not.toContain(".secret");

    // listDirectoryEntries (Explorer) MUST show external symlinks so dotfile repos are navigable
    expect(rootEntries).toContainEqual({ name: ".external", path: ".external", type: "folder" });
    expect(rootEntries).toContainEqual({ name: ".secret", path: ".secret", type: "file" });
  });

  test("allows expanding symlinked directories that resolve outside the workspace root", async () => {
    const workspaceRoot = createTempWorkspace();
    const externalRoot = createTempWorkspace();
    writeText(path.join(externalRoot, "nvim/init.lua"), "vim.o.number = true\n");
    symlinkSync(externalRoot, path.join(workspaceRoot, ".config"));

    const rootEntries = await listDirectoryEntries({ rootPath: workspaceRoot });
    const configEntries = await listDirectoryEntries({ rootPath: workspaceRoot, directoryPath: ".config" });

    expect(rootEntries).toContainEqual({ name: ".config", path: ".config", type: "folder" });
    expect(configEntries).toContainEqual({ name: "nvim", path: ".config/nvim", type: "folder" });
  });

  test("hides symlinked directories that would recurse back to an ancestor", async () => {
    const workspaceRoot = createTempWorkspace();
    mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
    symlinkSync(workspaceRoot, path.join(workspaceRoot, "src", "self"));

    const rootEntries = await listDirectoryEntries({ rootPath: workspaceRoot });
    const srcEntries = await listDirectoryEntries({ rootPath: workspaceRoot, directoryPath: "src" });

    expect(rootEntries).toContainEqual({ name: "src", path: "src", type: "folder" });
    expect(srcEntries.some((entry) => entry.path === "src/self")).toBe(false);
  });

  test("writes a brand-new file when no revision is expected", async () => {
    const workspaceRoot = createTempWorkspace();
    mkdirSync(path.join(workspaceRoot, ".stave"), { recursive: true });
    const filePath = path.join(workspaceRoot, ".stave", "scripts.json");

    const result = await writeFileWithExpectedRevision({
      filePath,
      content: "{\n  \"version\": 2\n}\n",
    });

    expect(result.ok).toBe(true);
    expect(result.conflict).toBeUndefined();
    expect(result.revision).toBeString();
  });

  test("treats a deleted file as a conflict when a prior revision is expected", async () => {
    const workspaceRoot = createTempWorkspace();
    mkdirSync(path.join(workspaceRoot, ".stave"), { recursive: true });
    const filePath = path.join(workspaceRoot, ".stave", "scripts.json");
    writeText(filePath, "{\n  \"version\": 1\n}\n");

    const currentStat = statSync(filePath);
    rmSync(filePath);

    const result = await writeFileWithExpectedRevision({
      filePath,
      content: "{\n  \"version\": 2\n}\n",
      expectedRevision: revisionFromStat({ size: currentStat.size, mtimeMs: currentStat.mtimeMs }),
    });

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
  });
});
