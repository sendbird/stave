/**
 * Creates and lists a workspace's scratch folder, `<workspace>/.stave/scratch/`
 * (see `src/lib/workspace-scratch.ts`).
 *
 * Every folder from the workspace root down to the scratch folder must be a
 * real folder: a symbolic link anywhere on that path would let a write (or a
 * listing) reach outside the workspace, so the folder is refused instead.
 * Listings never follow links either.
 *
 * Used by: `electron/providers/runtime.ts` (before each turn),
 * `electron/main/browser/browser-tools.ts` (Lens screenshots) and
 * `electron/main/ipc/filesystem.ts` (`fs:list-scratch`).
 */
import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import {
  WORKSPACE_SCRATCH_DIRECTORY,
  WORKSPACE_SCRATCH_MAX_DEPTH,
  WORKSPACE_SCRATCH_MAX_FILES,
  type WorkspaceScratchFile,
  type WorkspaceScratchListing,
} from "../../../src/lib/workspace-scratch";

/** Stops a runaway folder from making each listing walk forever. */
const WORKSPACE_SCRATCH_MAX_SCANNED_FILES = 5_000;

const GITIGNORE_NAME = ".gitignore";

export class WorkspaceScratchRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceScratchRefusedError";
  }
}

function errorCode(error: unknown) {
  return (error as NodeJS.ErrnoException | null)?.code;
}

async function lstatIfExists(target: string) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
}

function scratchParts(subdirectory?: string) {
  const parts = WORKSPACE_SCRATCH_DIRECTORY.split("/");
  if (subdirectory) {
    for (const part of subdirectory.split("/")) {
      if (!part || part === "." || part === ".." || part.includes("\\")) {
        throw new WorkspaceScratchRefusedError(`Invalid scratch subfolder: ${subdirectory}`);
      }
      parts.push(part);
    }
  }
  return parts;
}

/**
 * Walks from the root down `parts`, creating each missing folder. Refuses a
 * part that is a link or anything other than a folder.
 */
async function ensureRealDirectories(root: string, parts: string[]) {
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    let stat = await lstatIfExists(current);
    if (!stat) {
      try {
        await fs.mkdir(current);
      } catch (error) {
        // Another turn created it first; check what is there now.
        if (errorCode(error) !== "EEXIST") throw error;
      }
      stat = await fs.lstat(current);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new WorkspaceScratchRefusedError(
        `${path.relative(root, current)} is not a real folder, so the workspace scratch folder is not used.`,
      );
    }
  }
  return current;
}

/**
 * Makes `<root>/.stave/scratch` (and `subdirectory` inside it) and writes the
 * folder's `.gitignore` the first time. Returns the absolute folder path.
 * Throws `WorkspaceScratchRefusedError` when a part of the path is a link.
 */
export async function ensureWorkspaceScratch(
  rootPath: string,
  options: { subdirectory?: string } = {},
): Promise<string> {
  const root = path.resolve(rootPath);
  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) {
    throw new WorkspaceScratchRefusedError("The workspace root is not a folder.");
  }
  const scratchRoot = await ensureRealDirectories(root, scratchParts());
  try {
    // `wx` never replaces a file the user changed and never follows a link.
    await fs.writeFile(path.join(scratchRoot, GITIGNORE_NAME), "*\n", { flag: "wx" });
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
  }
  if (!options.subdirectory) return scratchRoot;
  return ensureRealDirectories(root, scratchParts(options.subdirectory));
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

/** `20261124-153012`, local time, for file names that sort by when they were made. */
export function workspaceScratchTimestamp(date = new Date()) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

let scratchFileSequence = 0;

/**
 * Writes `data` to a new file `<timestamp>-<n>.<extension>` in a scratch
 * subfolder and returns its workspace-relative path. Never overwrites a file.
 */
export async function writeWorkspaceScratchFile(args: {
  rootPath: string;
  subdirectory: string;
  extension: string;
  data: Uint8Array;
  now?: Date;
}): Promise<string> {
  const root = path.resolve(args.rootPath);
  const directory = await ensureWorkspaceScratch(root, { subdirectory: args.subdirectory });
  const stamp = workspaceScratchTimestamp(args.now);
  const extension = args.extension.replace(/^\.+/, "");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    scratchFileSequence += 1;
    const name = `${stamp}-${scratchFileSequence}.${extension}`;
    try {
      await fs.writeFile(path.join(directory, name), args.data, { flag: "wx" });
      return path.relative(root, path.join(directory, name)).split(path.sep).join("/");
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
  }
  throw new Error("Could not find a free scratch file name.");
}

function emptyListing(): WorkspaceScratchListing {
  return { files: [], fileCount: 0, totalBytes: 0, truncated: false };
}

/**
 * The scratch folder's files, newest first: at most 300, at most four folders
 * deep, links skipped, the folder's own `.gitignore` left out. A missing
 * folder, or one reached through a link, lists as empty.
 */
export async function listWorkspaceScratch(rootPath: string): Promise<WorkspaceScratchListing> {
  const root = path.resolve(rootPath);
  let current = root;
  for (const part of scratchParts()) {
    current = path.join(current, part);
    const stat = await lstatIfExists(current);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return emptyListing();
  }
  const scratchRoot = current;

  const files: WorkspaceScratchFile[] = [];
  let totalBytes = 0;
  let scanLimitReached = false;

  async function walk(directory: string, depth: number): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (scanLimitReached) return;
      // `Dirent` reports a link as a link; it is never followed.
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < WORKSPACE_SCRATCH_MAX_DEPTH) await walk(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (depth === 0 && entry.name === GITIGNORE_NAME) continue;
      let stat;
      try {
        stat = await fs.lstat(absolute);
      } catch {
        continue; // Removed between the read and the stat.
      }
      if (!stat.isFile()) continue;
      files.push({
        path: path.relative(root, absolute).split(path.sep).join("/"),
        sizeBytes: stat.size,
        mtimeMs: Math.floor(stat.mtimeMs),
      });
      totalBytes += stat.size;
      if (files.length >= WORKSPACE_SCRATCH_MAX_SCANNED_FILES) scanLimitReached = true;
    }
  }

  await walk(scratchRoot, 0);
  files.sort((left, right) => right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path));
  return {
    files: files.slice(0, WORKSPACE_SCRATCH_MAX_FILES),
    fileCount: files.length,
    totalBytes,
    truncated: files.length > WORKSPACE_SCRATCH_MAX_FILES || scanLimitReached,
  };
}
