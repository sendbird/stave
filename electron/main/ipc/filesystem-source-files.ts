import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveRootFilePath } from "../utils/filesystem";
import { collectFocusedWorkspaceInspectContext } from "./filesystem-code-inspect";

export async function readWorkspaceSourceFiles(args: { rootPath?: string | null; entryFilePath?: string | null }) {
  const rootPath = resolveRootFilePath({ rootPath: args.rootPath, filePath: "." });
  if (!rootPath) {
    throw new Error("Workspace root path is required.");
  }
  const files: Array<{ content: string; filePath: string }> = [];
  const MAX_TOTAL = 2000;
  const EXCLUDED_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "out",
    "build",
    ".next",
    ".nuxt",
    "coverage",
    "docs",
    "cypress",
    "tests",
    "test",
    "__tests__",
    "__mocks__",
    ".storybook",
    "storybook-static",
    "static",
    "public",
    "raw-icons",
  ]);
  const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|d\.[cm]?ts)$/;
  const EXCLUDED_FILE_PATTERN = /\.(?:test|spec|stories)\.(?:[cm]?[jt]sx?)$/;

  function toWorkspaceModelUri(filePath: string) {
    const normalized = filePath.replaceAll("\\", "/").replace(/^\/+/, "");
    return `file:///${normalized}`;
  }

  if (args.entryFilePath) {
    const focusedContext = await collectFocusedWorkspaceInspectContext({
      rootPath,
      entryFilePath: args.entryFilePath,
      maxSourceFileCount: MAX_TOTAL,
    });
    return focusedContext.sourceFiles.map((file) => ({
      content: file.content,
      filePath: toWorkspaceModelUri(file.filePath),
    }));
  }

  const directoryQueue: Array<{ dir: string; relativeDir: string }> = [{ dir: rootPath, relativeDir: "" }];

  while (directoryQueue.length > 0 && files.length < MAX_TOTAL) {
    const current = directoryQueue.shift();
    if (!current) {
      continue;
    }

    let entries;
    try {
      entries = await fs.readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (!entry.isFile() || !SOURCE_FILE_PATTERN.test(entry.name) || EXCLUDED_FILE_PATTERN.test(entry.name)) {
        continue;
      }
      try {
        const relativePath = current.relativeDir ? `${current.relativeDir}/${entry.name}` : entry.name;
        const content = await fs.readFile(path.join(current.dir, entry.name), "utf-8");
        files.push({ content, filePath: toWorkspaceModelUri(relativePath) });
        if (files.length >= MAX_TOTAL) {
          break;
        }
      } catch {
        // Skip unreadable files.
      }
    }

    if (files.length >= MAX_TOTAL) {
      break;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      directoryQueue.push({
        dir: path.join(current.dir, entry.name),
        relativeDir: current.relativeDir ? `${current.relativeDir}/${entry.name}` : entry.name,
      });
    }
  }

  return files;
}
