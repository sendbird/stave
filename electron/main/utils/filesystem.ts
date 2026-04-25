import { promises as fs } from "node:fs";
import path from "node:path";
import type { RootFileEntry } from "../types";

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  ".next",
  ".nuxt",
  // macOS system directories
  ".Trash",
  ".Trashes",
  "Library",
  // Linux system directories
  ".local",
  ".cache",
]);

function normalizePathInput(value: string | null | undefined) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function resolveRealPath(targetPath: string) {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return null;
  }
}

async function statResolvedTarget(targetPath: string) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

function isPathInsideRoot(args: { rootRealPath: string; candidateRealPath: string }) {
  const relative = path.relative(args.rootRealPath, args.candidateRealPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function revisionFromStat(args: { size: number; mtimeMs: number }) {
  return `node:${args.size}:${Math.floor(args.mtimeMs)}`;
}

async function statIfExists(targetPath: string) {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeFileWithExpectedRevision(args: {
  filePath: string;
  content: string;
  expectedRevision?: string | null;
}) {
  const beforeStat = await statIfExists(args.filePath);
  if (beforeStat) {
    if (!beforeStat.isFile()) {
      return { ok: false as const, stderr: "A folder already exists at this path." };
    }
    const currentRevision = revisionFromStat({ size: beforeStat.size, mtimeMs: beforeStat.mtimeMs });
    if (args.expectedRevision && args.expectedRevision !== currentRevision) {
      return { ok: false as const, conflict: true as const, revision: currentRevision };
    }
  } else if (args.expectedRevision) {
    return { ok: false as const, conflict: true as const };
  }

  await fs.writeFile(args.filePath, args.content, "utf8");
  const nextStat = await fs.stat(args.filePath);
  return {
    ok: true as const,
    revision: revisionFromStat({ size: nextStat.size, mtimeMs: nextStat.mtimeMs }),
  };
}

export function isIgnoredDirectory(args: { name: string }) {
  return IGNORED_DIRECTORY_NAMES.has(args.name);
}

function toSafeRelativePath(value: string | null | undefined) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

export function resolveRootDirectoryPath(args: { rootPath?: string | null; directoryPath?: string | null }) {
  const rootPath = normalizePathInput(args.rootPath);
  if (!rootPath) {
    return null;
  }
  const normalizedRoot = path.resolve(rootPath);
  const directoryPath = toSafeRelativePath(args.directoryPath);
  if (!directoryPath) {
    return normalizedRoot;
  }
  const absolute = path.resolve(normalizedRoot, directoryPath);
  const relative = path.relative(normalizedRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return absolute;
}

export async function listFilesRecursive(args: { rootPath?: string | null; maxDepth?: number; maxFiles?: number }): Promise<string[]> {
  const rootPath = normalizePathInput(args.rootPath);
  if (!rootPath) {
    throw new Error("Workspace root path is required.");
  }
  const normalizedRootPath = path.resolve(rootPath);
  const rootRealPath = await fs.realpath(normalizedRootPath);
  const maxDepth = args.maxDepth ?? 32;
  const maxFiles = args.maxFiles ?? 25_000;
  const files: RootFileEntry[] = [];

  async function walk(currentPath: string, prefix: string, depth: number, ancestorRealPaths: Set<string>): Promise<void> {
    if (depth > maxDepth || files.length >= maxFiles) {
      return;
    }
    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      // Skip directories that cannot be read (EPERM, EACCES, etc.)
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        break;
      }
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (isIgnoredDirectory({ name: entry.name })) {
          continue;
        }
        const entryRealPath = await resolveRealPath(fullPath);
        if (!entryRealPath || !isPathInsideRoot({ rootRealPath, candidateRealPath: entryRealPath }) || ancestorRealPaths.has(entryRealPath)) {
          continue;
        }
        const nextAncestors = new Set(ancestorRealPaths);
        nextAncestors.add(entryRealPath);
        await walk(fullPath, relativePath, depth + 1, nextAncestors);
      } else if (entry.isFile()) {
        files.push({ relativePath });
      } else if (entry.isSymbolicLink()) {
        const entryRealPath = await resolveRealPath(fullPath);
        if (!entryRealPath || !isPathInsideRoot({ rootRealPath, candidateRealPath: entryRealPath })) {
          continue;
        }

        const targetStat = await statResolvedTarget(fullPath);
        if (!targetStat) {
          continue;
        }
        if (targetStat.isDirectory()) {
          if (isIgnoredDirectory({ name: entry.name }) || ancestorRealPaths.has(entryRealPath)) {
            continue;
          }
          const nextAncestors = new Set(ancestorRealPaths);
          nextAncestors.add(entryRealPath);
          await walk(fullPath, relativePath, depth + 1, nextAncestors);
        } else if (targetStat.isFile()) {
          files.push({ relativePath });
        }
      }
    }
  }

  await walk(normalizedRootPath, "", 0, new Set([rootRealPath]));
  return files.map((item) => item.relativePath).sort();
}

export function resolveRootFilePath(args: { rootPath?: string | null; filePath?: string | null }) {
  const filePath = normalizePathInput(args.filePath);
  if (!filePath) {
    return null;
  }
  return resolveRootDirectoryPath({
    rootPath: args.rootPath,
    directoryPath: filePath,
  });
}

export async function listDirectoryEntries(args: { rootPath?: string | null; directoryPath?: string | null }) {
  const absolutePath = resolveRootDirectoryPath(args);
  if (!absolutePath) {
    throw new Error("Invalid directory path.");
  }
  const rootPath = normalizePathInput(args.rootPath);
  if (!rootPath) {
    throw new Error("Workspace root path is required.");
  }
  const rootRealPath = await fs.realpath(path.resolve(rootPath));
  const directoryRealPath = await resolveRealPath(absolutePath);
  if (!directoryRealPath) {
    throw new Error("Directory path cannot be resolved.");
  }

  const relativeDirectoryPath = toSafeRelativePath(args.directoryPath);
  const ancestorRealPaths = new Set<string>([rootRealPath]);
  if (relativeDirectoryPath) {
    let currentPath = path.resolve(rootPath);
    for (const segment of relativeDirectoryPath.split("/").filter(Boolean)) {
      currentPath = path.join(currentPath, segment);
      const currentRealPath = await resolveRealPath(currentPath);
      if (!currentRealPath) {
        throw new Error("Directory path cannot be resolved.");
      }
      ancestorRealPaths.add(currentRealPath);
    }
  }

  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES") {
      return [];
    }
    throw error;
  }
  const resolvedEntries = await Promise.all(entries.map(async (entry) => {
    const relativePath = relativeDirectoryPath ? `${relativeDirectoryPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (isIgnoredDirectory({ name: entry.name })) {
        return null;
      }
      return { name: entry.name, path: relativePath, type: "folder" as const };
    }
    if (entry.isFile()) {
      return { name: entry.name, path: relativePath, type: "file" as const };
    }
    if (!entry.isSymbolicLink()) {
      return null;
    }

    const fullPath = path.join(absolutePath, entry.name);
    const entryRealPath = await resolveRealPath(fullPath);
    if (!entryRealPath) {
      return null;
    }

    const targetStat = await statResolvedTarget(fullPath);
    if (!targetStat) {
      return null;
    }
    if (targetStat.isDirectory()) {
      if (isIgnoredDirectory({ name: entry.name }) || ancestorRealPaths.has(entryRealPath)) {
        return null;
      }
      return { name: entry.name, path: relativePath, type: "folder" as const };
    }
    if (targetStat.isFile()) {
      return { name: entry.name, path: relativePath, type: "file" as const };
    }
    return null;
  }));

  return resolvedEntries
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

export function mimeTypeFromFilePath(args: { filePath: string }) {
  const lower = args.filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".avif")) return "image/avif";
  return "application/octet-stream";
}
