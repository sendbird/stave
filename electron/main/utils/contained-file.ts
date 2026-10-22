import { constants, promises as fs } from "node:fs";
import path from "node:path";

export type ContainedReadFailure =
  /** Nothing at the path. */
  | "missing"
  /** The path, through a link, leads outside the root. */
  | "outside"
  /** A directory, socket or other non-file. */
  | "not-file"
  | "too-large"
  /** The path changed between resolving it and reading it. */
  | "changed";

export type ContainedReadResult = { ok: true; content: Buffer } | { ok: false; reason: ContainedReadFailure };

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
}

/**
 * Reads a file only when the file actually opened lies inside `root`. Links
 * are resolved first, and the resolved path must stay inside the root's own
 * resolved path. The file is then opened without following a final link, and
 * after opening, the path must still resolve to that same file (device and
 * inode), so a path swapped between the check and the read is refused. Type
 * and size are checked on the open file.
 */
export async function readContainedFile(args: { root: string; filePath: string; maxBytes: number }): Promise<ContainedReadResult> {
  let rootReal: string;
  let real: string;
  try {
    rootReal = await fs.realpath(args.root);
    real = await fs.realpath(args.filePath);
  } catch {
    return { ok: false, reason: "missing" };
  }
  if (!isInside(rootReal, real)) return { ok: false, reason: "outside" };
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(real, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    return { ok: false, reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "changed" };
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) return { ok: false, reason: "not-file" };
    const again = await fs.realpath(args.filePath).catch(() => null);
    const current = again === real ? await fs.stat(real).catch(() => null) : null;
    if (!current || current.dev !== opened.dev || current.ino !== opened.ino) return { ok: false, reason: "changed" };
    if (opened.size > args.maxBytes) return { ok: false, reason: "too-large" };
    const content = await handle.readFile();
    return content.length > args.maxBytes ? { ok: false, reason: "too-large" } : { ok: true, content };
  } finally {
    await handle.close();
  }
}
