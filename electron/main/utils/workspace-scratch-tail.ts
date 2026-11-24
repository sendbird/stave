/**
 * Reads the end of a text file in a workspace's scratch folder for the
 * Scratch panel's preview, so a growing multi-megabyte log costs one small
 * read per refresh instead of the whole file.
 *
 * The path must name a regular file inside `<root>/.stave/scratch/`, reached
 * only through real folders: a `..`, a link anywhere on the way, or a link
 * as the file itself is refused, so a preview can never read outside the
 * scratch folder.
 *
 * Used by: `electron/main/ipc/workspace-scratch.ts` (`fs:read-scratch-tail`).
 */
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import {
  WORKSPACE_SCRATCH_DIRECTORY,
  WORKSPACE_SCRATCH_TAIL_BYTES,
  type WorkspaceScratchTail,
} from "../../../src/lib/workspace-scratch";
import { WorkspaceScratchRefusedError, findWorkspaceScratchRoot } from "./workspace-scratch";

/** A cut inside a long first line is dropped up to the next line break within this many bytes. */
const LINE_START_LOOKAHEAD_BYTES = 4 * 1024;
const NEWLINE = 0x0a;

export class WorkspaceScratchFileMissingError extends Error {
  constructor() {
    super("The scratch file no longer exists.");
    this.name = "WorkspaceScratchFileMissingError";
  }
}

/**
 * The parts of `filePath` below the scratch folder. `filePath` is
 * workspace-relative with `/` separators, as the listing returns it.
 */
export function scratchRelativeParts(filePath: string): string[] {
  const prefix = `${WORKSPACE_SCRATCH_DIRECTORY}/`;
  if (!filePath.startsWith(prefix)) {
    throw new WorkspaceScratchRefusedError("The file is not in the workspace scratch folder.");
  }
  const parts = filePath.slice(prefix.length).split("/");
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.includes("\\") || part.includes("\0")) {
      throw new WorkspaceScratchRefusedError("The scratch file path is not valid.");
    }
  }
  return parts;
}

/**
 * The absolute path of a scratch file after checking every folder on the way
 * is a real folder and the file itself a regular file (never a link).
 */
export async function resolveWorkspaceScratchFile(rootPath: string, filePath: string): Promise<string> {
  const parts = scratchRelativeParts(filePath);
  const scratchRoot = await findWorkspaceScratchRoot(rootPath);
  if (!scratchRoot) throw new WorkspaceScratchFileMissingError();
  let current = scratchRoot;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new WorkspaceScratchFileMissingError();
      throw error;
    }
    const last = index === parts.length - 1;
    if (stat.isSymbolicLink() || (last ? !stat.isFile() : !stat.isDirectory())) {
      throw new WorkspaceScratchRefusedError("The scratch file is reached through a link or is not a regular file.");
    }
  }
  return current;
}

/**
 * Where text starts in a tail that begins mid-file: past any UTF-8
 * continuation bytes, and at the next line start when one is near.
 */
export function tailTextStart(bytes: Uint8Array): number {
  let start = 0;
  while (start < bytes.length && start < 3 && (bytes[start]! & 0xc0) === 0x80) start += 1;
  const newline = bytes.indexOf(NEWLINE, start);
  if (newline >= 0 && newline < LINE_START_LOOKAHEAD_BYTES) return newline + 1;
  return start;
}

/**
 * At most the last `maxBytes` of a scratch text file, decoded as UTF-8. A
 * file that fits is returned whole; a longer one from a line start near the
 * cut, with `truncated` set.
 */
export async function readWorkspaceScratchTail(args: {
  rootPath: string;
  filePath: string;
  maxBytes?: number;
}): Promise<WorkspaceScratchTail> {
  const maxBytes = Math.max(1, Math.min(args.maxBytes ?? WORKSPACE_SCRATCH_TAIL_BYTES, WORKSPACE_SCRATCH_TAIL_BYTES));
  const absolute = await resolveWorkspaceScratchFile(path.resolve(args.rootPath), args.filePath);
  // O_NOFOLLOW refuses a link swapped in after the check; O_NONBLOCK never
  // waits on a named pipe. Windows has neither flag, and needs neither here.
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
  let handle;
  try {
    handle = await fs.open(absolute, flags);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new WorkspaceScratchFileMissingError();
    if (code === "ELOOP") throw new WorkspaceScratchRefusedError("The scratch file is a link.");
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new WorkspaceScratchRefusedError("The scratch file is not a regular file.");
    const sizeBytes = stat.size;
    const length = Math.min(sizeBytes, maxBytes);
    const start = sizeBytes - length;
    const bytes = new Uint8Array(length);
    let read = 0;
    while (read < length) {
      const { bytesRead } = await handle.read(bytes, read, length - read, start + read);
      if (!bytesRead) break;
      read += bytesRead;
    }
    const truncated = start > 0;
    const view = bytes.subarray(0, read);
    const from = truncated ? tailTextStart(view) : 0;
    return {
      content: new TextDecoder("utf-8", { ignoreBOM: truncated }).decode(view.subarray(from)),
      sizeBytes,
      truncated,
    };
  } finally {
    await handle.close();
  }
}
