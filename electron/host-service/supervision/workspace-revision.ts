import { createHash } from "node:crypto";
import { lstat, open, readlink } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { runCommandArgs } from "../../main/utils/command";
import type { WorkspaceRevision } from "../../../src/lib/agent-runs/verification-contract";

export type { WorkspaceRevision } from "../../../src/lib/agent-runs/verification-contract";
const LIMITS = { files: 200, bytes: 8 * 1024 * 1024, gitOutput: 256 * 1024, indexOutput: 4 * 1024 * 1024,
  contentFiles: 20_000, contentBytes: 128 * 1024 * 1024 };

/** The index supplies paths, never substitutes normalized blobs for tested bytes. */
function contentTree(index: string | null): Map<string, { mode: string; blob: string }> | null {
  if (index === null) return null;
  const entries = new Map<string, { mode: string; blob: string }>();
  for (const entry of index.split("\0").filter(Boolean)) {
    const parsed = /^(100644|100755|120000) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t([\s\S]+)$/.exec(entry);
    // Conflicts, submodules and other shapes cannot prove content equivalence.
    if (!parsed || entries.has(parsed[3]!)) return null;
    entries.set(parsed[3]!, { mode: parsed[1]!, blob: parsed[2]! });
  }
  return entries;
}

/** Host-only fingerprint: HEAD, index object IDs and bounded dirty/untracked contents.
 * Never returns file contents or filenames. Call at review boundaries, not every timer tick.
 */
export async function readWorkspaceRevision(cwd: string): Promise<WorkspaceRevision> {
  const unknown = (reason: "unavailable" | "limit" | "changing"): WorkspaceRevision => ({ status: "unknown", reason });
  async function state() {
    const results = await Promise.all([
      ["rev-parse", "--verify", "HEAD"], ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      ["diff", "--cached", "--raw", "--no-abbrev", "-z", "--no-ext-diff"],
      ["ls-files", "--stage", "-z"],
    ].map((commandArgs, index) => runCommandArgs({ command: "git", commandArgs: ["--no-optional-locks", ...commandArgs], cwd, timeoutMs: 4000, maxOutputChars: index === 3 ? LIMITS.indexOutput : LIMITS.gitOutput })));
    if (results.slice(0, 3).some(result => !result.ok)) return { error: "unavailable" as const };
    if (results.slice(0, 3).some(result => result.stdoutTruncated)) return { error: "limit" as const };
    const index = results[3]!;
    return { values: results.slice(0, 3).map(result => result.stdout), index: index.ok && !index.stdoutTruncated ? index.stdout : null };
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
    let tree = contentTree(before.index ?? null);
    const dirty = new Set(files);
    const candidates = new Set([...files, ...(tree?.keys() ?? [])]);
    if (candidates.size > LIMITS.contentFiles) tree = null;
    const updateTree = (filename: string, mode: string, contents: Buffer) => tree?.set(filename, {
      mode, blob: createHash("sha256").update(contents).digest("hex"),
    });
    const signatures: Array<{ filename: string; value: string | null; dirty: boolean }> = [];
    let bytes = 0, contentBytes = 0;
    const signature = (stat: Awaited<ReturnType<typeof lstat>>) => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.mode}`;
    for (const filename of [...candidates].sort()) {
      const isDirty = dirty.has(filename);
      if (!isDirty && !tree) continue;
      const absolute = path.resolve(cwd, filename);
      if (!absolute.startsWith(`${path.resolve(cwd)}${path.sep}`)) return unknown("unavailable");
      const stat = await lstat(absolute).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if (isDirty) hash.update(filename).update("\0");
      if (!stat) { if (isDirty) hash.update("deleted"); tree?.delete(filename); signatures.push({ filename: absolute, value: null, dirty: isDirty }); continue; }
      signatures.push({ filename: absolute, value: signature(stat), dirty: isDirty });
      if (isDirty) hash.update(String(stat.mode)).update("\0");
      if (stat.isSymbolicLink()) {
        const target = await readlink(absolute); if (isDirty) hash.update(target); updateTree(filename, "120000", Buffer.from(target)); continue;
      }
      if (!stat.isFile()) return unknown("unavailable");
      if (isDirty) bytes += stat.size;
      if (bytes > LIMITS.bytes) return unknown("limit");
      contentBytes += stat.size;
      if (contentBytes > LIMITS.contentBytes) { tree = null; if (!isDirty) continue; }
      const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        // Fixed size prevents concurrent appends from making the read unbounded.
        const buffer = Buffer.alloc(stat.size); let offset = 0;
        while (offset < buffer.length) { const read = await handle.read(buffer, offset, buffer.length - offset, offset); if (!read.bytesRead) break; offset += read.bytesRead; }
        if (offset !== buffer.length) return unknown("changing");
        if (isDirty) hash.update(buffer);
        updateTree(filename, stat.mode & 0o111 ? "100755" : "100644", buffer);
      } finally { await handle.close(); }
    }
    const after = await state(); if (after.error) return unknown(after.error);
    if (JSON.stringify(before.values) !== JSON.stringify(after.values) || before.index !== after.index) return unknown("changing");
    for (const item of signatures) {
      if (!item.dirty && !tree) continue;
      const stat = await lstat(item.filename).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if ((stat ? signature(stat) : null) !== item.value) return unknown("changing");
    }
    // Raw worktree bytes keep CRLF/clean-filter normalization from either falsely
    // invalidating a commit or equating different tested files.
    // Larger trees retain strict verification but cannot reuse commit-only checks.
    const contentRevision = tree ? createHash("sha256").update(JSON.stringify([...tree].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))).digest("hex") : undefined;
    if (contentRevision) hash.update(contentRevision);
    return { status: "known", revision: hash.digest("hex"), ...(contentRevision ? { contentRevision } : {}) };
  } catch { return unknown("unavailable"); }
}
