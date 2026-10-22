import {
  mergeGraphFileChanges,
  parseGraphNameStatus,
  parseGraphNumstat,
} from "../../src/lib/git-graph/commit-details";
import type { ScmReviewBase, ScmReviewDiffResult, ScmReviewFileDiffResult } from "../../src/lib/review/review-diff-contract";
import { resolveCommandCwd, runCommandArgs } from "../main/utils/command";
import { readContainedFile } from "../main/utils/contained-file";
import { resolveRootFilePath } from "../main/utils/filesystem";
import { resolveOriginDefaultRef, SCM_READ_TIMEOUT_MS, type ScmCommandRunner } from "./scm-runtime";

/**
 * Review's reads of a diff against a base revision. The stage scope (base:
 * the stage's start commit) and the branch scope (base: the merge-base with
 * the default branch) compare that base with the working tree, so committed,
 * uncommitted and untracked changes all appear; the uncommitted scope uses
 * HEAD as its base. A file list comes first; a file's old and new content is
 * read only when it is opened, each side bounded.
 */
const OUTPUT_LIMIT = 512 * 1024;
export const SCM_REVIEW_CONTENT_LIMIT = 512 * 1024;
export const SCM_REVIEW_FILE_LIMIT = 2_000;
/**
 * A reply's bound once JSON-encoded, well under the host message frame: a
 * control character becomes six characters in JSON, so the content bound
 * alone does not bound the reply.
 */
export const SCM_REVIEW_SERIALIZED_LIMIT = 1_500_000;

function serializedSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
const SHA_PATTERN = /^[0-9a-f]{7,64}$/i;
const UNSAFE_REF = /[\x00-\x1f\x7f]|^-|\.\./;

interface Dependencies {
  runCommand?: ScmCommandRunner;
}

function gitRunner(cwd: string | undefined, dependencies: Dependencies, maxOutputChars = OUTPUT_LIMIT) {
  const run = dependencies.runCommand ?? runCommandArgs;
  return (commandArgs: string[]) => run({ command: "git", commandArgs, cwd, maxOutputChars, timeoutMs: SCM_READ_TIMEOUT_MS });
}

async function resolveBase(args: { cwd?: string; base: ScmReviewBase }, dependencies: Dependencies): Promise<{ ok: true; sha: string; ref: string | null } | { ok: false; ref: string | null; stderr: string }> {
  const git = gitRunner(args.cwd, dependencies);
  const verify = async (revision: string, ref: string | null) => {
    const result = await git(["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]);
    const sha = result.stdout.trim();
    return result.ok && SHA_PATTERN.test(sha) ? { ok: true as const, sha, ref } : { ok: false as const, ref, stderr: result.stderr.trim() || `${ref ?? revision} is not a commit in this repository.` };
  };
  if (args.base.kind === "head") return verify("HEAD", "HEAD");
  if (args.base.kind === "commit") {
    const sha = args.base.sha.trim();
    return SHA_PATTERN.test(sha) ? verify(sha, null) : { ok: false, ref: null, stderr: "A valid commit hash is required." };
  }
  let ref = args.base.ref?.trim() ?? "";
  if (!ref) {
    const origin = await resolveOriginDefaultRef({ cwd: args.cwd, runCommand: dependencies.runCommand });
    ref = origin.ok ? origin.ref : "";
  }
  if (!ref) {
    for (const candidate of ["main", "master"]) {
      if ((await git(["rev-parse", "--verify", "--quiet", `refs/heads/${candidate}`])).ok) { ref = candidate; break; }
    }
  }
  if (!ref) return { ok: false, ref: null, stderr: "No default branch (origin/main, origin/master, main or master) is available." };
  if (UNSAFE_REF.test(ref)) return { ok: false, ref, stderr: "The default branch name is not a safe Git reference." };
  const mergeBase = await git(["merge-base", ref, "HEAD"]);
  const sha = mergeBase.stdout.trim();
  return mergeBase.ok && SHA_PATTERN.test(sha) ? { ok: true, sha, ref } : { ok: false, ref, stderr: mergeBase.stderr.trim() || `This branch shares no history with ${ref}.` };
}

export async function getScmReviewDiff(args: { cwd?: string; base: ScmReviewBase }, dependencies: Dependencies = {}): Promise<ScmReviewDiffResult> {
  const git = gitRunner(args.cwd, dependencies);
  const head = await git(["rev-parse", "--verify", "--quiet", "HEAD"]);
  const headSha = head.ok && SHA_PATTERN.test(head.stdout.trim()) ? head.stdout.trim() : null;
  const base = await resolveBase(args, dependencies);
  const failed = (stderr: string, ref: string | null = null): ScmReviewDiffResult => ({ ok: false, baseSha: null, baseRef: ref, headSha, files: [], stderr });
  if (!base.ok) return failed(base.stderr, base.ref);
  const [nameStatus, numstat, untracked] = await Promise.all([
    git(["diff", "-M", "-z", "--name-status", base.sha, "--"]),
    git(["diff", "-M", "-z", "--numstat", base.sha, "--"]),
    git(["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  if ([nameStatus, numstat, untracked].some((result) => result.stdoutTruncated === true))
    return failed("The change list is too large to load safely. Inspect it with Git directly.", base.ref);
  if (!nameStatus.ok || !numstat.ok || !untracked.ok)
    return failed([nameStatus, numstat, untracked].map((result) => result.stderr.trim()).filter(Boolean).join("\n") || "Git could not read the changes.", base.ref);
  const tracked = mergeGraphFileChanges({ nameStatus: parseGraphNameStatus(nameStatus.stdout), numstat: parseGraphNumstat(numstat.stdout) });
  const known = new Set(tracked.map((file) => file.path));
  const added = untracked.stdout.split("\0").filter((path) => path && !known.has(path))
    .map((path) => ({ path, status: "A", additions: null, deletions: null, untracked: true as const }));
  const files = [...tracked, ...added].sort((left, right) => left.path.localeCompare(right.path));
  if (files.length > SCM_REVIEW_FILE_LIMIT)
    return failed(`More than ${SCM_REVIEW_FILE_LIMIT} files changed. Inspect them with Git directly.`, base.ref);
  const result: ScmReviewDiffResult = { ok: true, baseSha: base.sha, baseRef: base.ref, headSha, files, stderr: "" };
  return serializedSize(result) > SCM_REVIEW_SERIALIZED_LIMIT ? failed("The change list is too large to send safely. Inspect it with Git directly.", base.ref) : result;
}

function invalidPath(value: string | undefined): boolean {
  return value !== undefined && (!value.trim() || value.length > 4096 || value.includes("\0"));
}

/**
 * A working-tree file's content, or null when it is missing or not a file. A
 * link is followed only while it stays inside the workspace; one that leads
 * outside is refused, never read.
 */
async function readWorkingFile(cwd: string | undefined, filePath: string): Promise<string | null | "too-large" | "outside" | "changed"> {
  const root = resolveCommandCwd({ cwd });
  const absolutePath = resolveRootFilePath({ rootPath: root, filePath });
  if (!absolutePath) return "outside";
  const read = await readContainedFile({ root, filePath: absolutePath, maxBytes: SCM_REVIEW_CONTENT_LIMIT });
  if (read.ok) return read.content.toString("utf8");
  return read.reason === "missing" || read.reason === "not-file" ? null : read.reason;
}

export async function getScmReviewFileDiff(
  args: { cwd?: string; baseSha: string; path: string; oldPath?: string; untracked?: boolean },
  dependencies: Dependencies = {},
): Promise<ScmReviewFileDiffResult> {
  const sha = args.baseSha.trim();
  if (!SHA_PATTERN.test(sha) || invalidPath(args.path) || invalidPath(args.oldPath))
    return { ok: false, oldContent: "", newContent: "", stderr: "A valid base commit and file path are required." };
  const git = gitRunner(args.cwd, dependencies, SCM_REVIEW_CONTENT_LIMIT);
  const [old, current] = await Promise.all([
    args.untracked ? Promise.resolve(null) : git(["show", `${sha}:${args.oldPath ?? args.path}`]),
    readWorkingFile(args.cwd, args.path),
  ]);
  if (current === "outside")
    return { ok: false, code: "outside", oldContent: "", newContent: "", stderr: "This path leads outside the workspace, so it is not opened." };
  if (current === "changed")
    return { ok: false, code: "changed", oldContent: "", newContent: "", stderr: "The file changed while it was being read." };
  if (current === "too-large" || old?.stdoutTruncated === true)
    return { ok: false, code: "too-large", oldContent: "", newContent: "", stderr: "This file is too large to open safely in the built-in diff viewer." };
  // A path missing at the base was added; one missing now was deleted.
  const oldContent = old?.ok ? old.stdout : "";
  const newContent = current ?? "";
  // Binary content is not shown, and would not fit a reply once JSON-encoded.
  if (oldContent.includes("\0") || newContent.includes("\0")) return { ok: true, binary: true, oldContent: "", newContent: "", stderr: "" };
  const result: ScmReviewFileDiffResult = { ok: true, oldContent, newContent, stderr: "" };
  return serializedSize(result) > SCM_REVIEW_SERIALIZED_LIMIT
    ? { ok: false, code: "too-large", oldContent: "", newContent: "", stderr: "This file is too large to send safely to the built-in diff viewer." }
    : result;
}
