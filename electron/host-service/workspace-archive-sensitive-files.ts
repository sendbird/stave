import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rm, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { sensitive } from "./worktree-dependencies";

const MAX_FILES = 50;
const MAX_BYTES = 1024 * 1024;

export function archiveSensitiveFilesPath(appDataPath: string, workspaceId: string) {
  return join(appDataPath, "workspace-archive-sensitive-files", createHash("sha256").update(workspaceId).digest("hex"));
}

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function directory(path: string, create: boolean, privateMode: boolean): Promise<boolean> {
  if (create) await mkdir(path, { mode: 0o700 }).catch(error => {
    if (error.code !== "EEXIST") throw error;
  });
  const stat = await lstat(path).catch(error => { if (missing(error)) return null; throw error; });
  if (!stat) return false;
  return stat.isDirectory() && (!privateMode || process.platform === "win32" || (stat.mode & 0o777) === 0o700);
}

async function parents(root: string, file: string, privateMode: boolean) {
  for (const part of file.split("/").slice(0, -1)) {
    root = join(root, part);
    if (!await directory(root, true, privateMode)) return false;
  }
  return true;
}

async function storedFiles(root: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const file = prefix + entry.name;
    if (entry.isDirectory()) {
      if (!await directory(join(root, file), false, true)) throw new Error("sensitiveFilesAccess");
      files.push(...await storedFiles(root, file + "/"));
    } else if (entry.isFile()) files.push(file);
    else throw new Error("sensitiveFilesAccess");
  }
  return files;
}

/** Read at most one byte over the limit, even when a file grows after inspection. */
async function readBounded(path: string): Promise<Buffer | null> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) {
        const after = await handle.stat();
        if (after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || after.size !== length) {
          throw new Error("sensitiveFilesAccess");
        }
        return buffer.subarray(0, length);
      }
      length += bytesRead;
    }
    return null;
  } finally { await handle.close(); }
}

/** Exclusive creation protects an existing file, including a dangling symlink. */
async function writeNew(path: string, bytes: Buffer) {
  const handle = await open(path, "wx", 0o600).catch(error => {
    if (error.code === "EEXIST") return null;
    throw error;
  });
  if (!handle) return false;
  try {
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
  } catch (error) {
    await unlink(path);
    throw error;
  }
  return true;
}

async function checkStore(path: string, create: boolean) {
  for (const dir of [dirname(path), path]) {
    if (await directory(dir, create, true)) continue;
    if (!create && !await lstat(dir).catch(error => { if (missing(error)) return null; throw error; })) return false;
    throw new Error("sensitiveFilesAccess");
  }
  return true;
}

export async function saveArchiveSensitiveFiles(cwd: string, store: string, ignored: string[]) {
  const candidates = ignored.filter(file => {
    const parts = file.split("/");
    return !parts.some(part => part.toLowerCase() === "node_modules") && parts.some(sensitive);
  });
  if (!candidates.length) return 0;
  const root = await realpath(cwd);
  let skipped = 0;
  const added: string[] = [];
  const files = new Set(await checkStore(store, false) ? await storedFiles(store) : []);
  try {
    for (const file of candidates) {
      const parts = file.split("/");
      if (file.includes("\uFFFD") || parts.some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git") ||
        (sep === "\\" && file.includes(sep))) throw new Error("sensitiveFilesAccess");
      if (files.size >= MAX_FILES && !files.has(file)) { skipped++; continue; }
      const source = join(root, file);
      // Regular paths are rechecked against the worktree after resolving links.
      const resolved = await realpath(source).catch(error => {
        if (missing(error) || error.code === "ELOOP") return null;
        throw error;
      });
      if (resolved === null) {
        if ((await lstat(source)).isSymbolicLink()) { skipped++; continue; }
        throw new Error("sensitiveFilesAccess");
      }
      const target = relative(root, resolved);
      if (!target || isAbsolute(target) || target === ".." || target.startsWith(`..${sep}`) ||
        target.split(sep).some(part => [".git", "node_modules"].includes(part.toLowerCase()))) { skipped++; continue; }
      const bytes = await readBounded(resolved);
      if (bytes === null) { skipped++; continue; }
      await checkStore(store, true);
      if (!await parents(store, file, true)) throw new Error("sensitiveFilesAccess");
      const destination = join(store, file);
      if (!await writeNew(destination, bytes)) {
        // A failed removal or unresolved restore may have left an earlier copy.
        if (!(await readBounded(destination))?.equals(bytes)) throw new Error("sensitiveFilesBackupConflict");
        continue;
      }
      added.push(destination);
      files.add(file);
    }
    return skipped;
  } catch (error) {
    // Previous recoverable files remain available when another archive attempt fails.
    await Promise.allSettled(added.map(file => unlink(file)));
    throw error;
  }
}

export async function restoreArchiveSensitiveFiles(cwd: string, store: string) {
  let conflict = false;
  let failed = false;
  if (!await checkStore(store, false)) return { conflict, failed };
  const root = await realpath(cwd);
  for (const file of await storedFiles(store)) {
    try {
      const bytes = await readBounded(join(store, file));
      if (bytes === null) { failed = true; continue; }
      if (!await parents(root, file, false) || !await writeNew(join(root, file), bytes)) conflict = true;
    } catch { failed = true; }
  }
  return { conflict, failed };
}

export async function deleteArchiveSensitiveFiles(store: string) {
  if (await checkStore(store, false)) await rm(store, { recursive: true, force: true });
}
