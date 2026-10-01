import { createHash } from "node:crypto";
import { lstat, open, readlink } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { runCommandArgs } from "../../main/utils/command";

export type WorkspaceRevision = { status: "known"; revision: string } | { status: "unknown"; reason: "unavailable" | "limit" | "changing" };
const LIMITS = { files: 200, bytes: 8 * 1024 * 1024, gitOutput: 256 * 1024 };

/** Host-only fingerprint: HEAD, index object IDs and bounded dirty/untracked contents.
 * Never returns file contents or filenames. Call at review boundaries, not every timer tick.
 */
export async function readWorkspaceRevision(cwd: string): Promise<WorkspaceRevision> {
  const unknown = (reason: "unavailable" | "limit" | "changing"): WorkspaceRevision => ({ status: "unknown", reason });
  async function state() {
    const results = await Promise.all([
      ["rev-parse", "--verify", "HEAD"], ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      ["diff", "--cached", "--raw", "--no-abbrev", "-z", "--no-ext-diff"],
    ].map(commandArgs => runCommandArgs({ command: "git", commandArgs, cwd, timeoutMs: 4000, maxOutputChars: LIMITS.gitOutput })));
    if (results.some(result => !result.ok)) return { error: "unavailable" as const };
    if (results.some(result => result.stdoutTruncated)) return { error: "limit" as const };
    return { values: results.map(result => result.stdout) };
  }
  try {
    const before = await state(); if (before.error) return unknown(before.error);
    const records = before.values![1]!.split("\0"); const files: string[] = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i]!; if (!record) continue;
      files.push(record.slice(3));
      if (/[RC]/.test(record.slice(0, 2))) i++; // -z puts the old name after the destination.
    }
    if (files.length > LIMITS.files) return unknown("limit");
    const hash = createHash("sha256").update(JSON.stringify(before.values));
    const signatures: Array<{ filename: string; value: string | null }> = [];
    let bytes = 0;
    const signature = (stat: Awaited<ReturnType<typeof lstat>>) => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.mode}`;
    for (const filename of files.sort()) {
      const absolute = path.resolve(cwd, filename);
      if (!absolute.startsWith(`${path.resolve(cwd)}${path.sep}`)) return unknown("unavailable");
      const stat = await lstat(absolute).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      hash.update(filename).update("\0");
      if (!stat) { hash.update("deleted"); signatures.push({ filename: absolute, value: null }); continue; }
      signatures.push({ filename: absolute, value: signature(stat) });
      hash.update(String(stat.mode)).update("\0");
      if (stat.isSymbolicLink()) { hash.update(await readlink(absolute)); continue; }
      if (!stat.isFile()) return unknown("unavailable");
      bytes += stat.size; if (bytes > LIMITS.bytes) return unknown("limit");
      const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        // Fixed size prevents concurrent appends from making the read unbounded.
        const buffer = Buffer.alloc(stat.size); let offset = 0;
        while (offset < buffer.length) { const read = await handle.read(buffer, offset, buffer.length - offset, offset); if (!read.bytesRead) break; offset += read.bytesRead; }
        if (offset !== buffer.length) return unknown("changing");
        hash.update(buffer);
      } finally { await handle.close(); }
    }
    const after = await state(); if (after.error) return unknown(after.error);
    if (JSON.stringify(before.values) !== JSON.stringify(after.values)) return unknown("changing");
    for (const item of signatures) {
      const stat = await lstat(item.filename).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if ((stat ? signature(stat) : null) !== item.value) return unknown("changing");
    }
    return { status: "known", revision: hash.digest("hex") };
  } catch { return unknown("unavailable"); }
}
