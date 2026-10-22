import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getScmReviewDiff, getScmReviewFileDiff } from "../electron/host-service/scm-review-diff";
import { readChangedPathsSince } from "../electron/host-service/supervision/stage-facts";
import { runCommandArgs } from "../electron/main/utils/command";
import { classifyStageFiles, reviewFileStatus } from "../src/lib/review/review-scope";

let repo: string;
let outside: string;
let stageStart: string;
let stagePaths: { paths: string[]; truncated: boolean } | null;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } }).trim();
}
const write = (name: string, content: string) => writeFileSync(path.join(repo, name), content);

beforeAll(async () => {
  repo = mkdtempSync(path.join(tmpdir(), "stave-review-diff-"));
  git("init", "-q", "-b", "main");
  write("a.ts", "export const a = 1;\n");
  write("b.ts", "export const b = 1;\n");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "feature");
  // The stage starts here, edits a.ts, adds new.ts and commits; it reports with these paths.
  stageStart = git("rev-parse", "HEAD");
  write("a.ts", "export const a = 2;\n");
  write("new.ts", "export const fresh = true;\n");
  git("add", ".");
  git("commit", "-q", "-m", "stage");
  stagePaths = await readChangedPathsSince({ cwd: repo, sha: stageStart, run: runCommandArgs });
  // After the stage: the user edits another file and leaves an untracked note.
  write("b.ts", "export const b = 2;\n");
  write("notes.md", "later\n");
});
afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  if (outside) rmSync(outside, { recursive: true, force: true });
});

describe("review diff reads", () => {
  test("the stage scope tells the stage's committed files from a later edit to another file", async () => {
    expect(stagePaths).toEqual({ paths: ["a.ts", "new.ts"], truncated: false });
    const result = await getScmReviewDiff({ cwd: repo, base: { kind: "commit", sha: stageStart } });
    expect(result.ok).toBe(true);
    expect(result.baseSha).toBe(stageStart);
    expect(result.headSha).toBe(git("rev-parse", "HEAD"));
    const files = result.files.map((entry) => ({ path: entry.path, status: reviewFileStatus(entry.status), additions: entry.additions, deletions: entry.deletions, ...(entry.untracked ? { untracked: true } : {}) }));
    const { files: classified } = classifyStageFiles(files, { changedPaths: stagePaths!.paths });
    expect(classified.map((entry) => [entry.path, entry.status, entry.origin])).toEqual([
      ["a.ts", "modified", "stage"], ["b.ts", "modified", "after-stage"], ["new.ts", "added", "stage"], ["notes.md", "added", "after-stage"],
    ]);
    expect(result.files.find((entry) => entry.path === "notes.md")?.untracked).toBe(true);
  });

  test("the branch scope starts where the branch left the default branch; the uncommitted scope at HEAD", async () => {
    const branch = await getScmReviewDiff({ cwd: repo, base: { kind: "merge-base" } });
    expect(branch.ok).toBe(true);
    expect(branch.baseRef).toBe("main");
    expect(branch.baseSha).toBe(git("merge-base", "main", "HEAD"));
    expect(branch.files.map((entry) => entry.path)).toEqual(["a.ts", "b.ts", "new.ts", "notes.md"]);
    const uncommitted = await getScmReviewDiff({ cwd: repo, base: { kind: "head" } });
    expect(uncommitted.files.map((entry) => entry.path)).toEqual(["b.ts", "notes.md"]);
  });

  test("a file's old content comes from the base and its new content from the working tree", async () => {
    expect(await getScmReviewFileDiff({ cwd: repo, baseSha: stageStart, path: "a.ts" })).toEqual({ ok: true, oldContent: "export const a = 1;\n", newContent: "export const a = 2;\n", stderr: "" });
    expect(await getScmReviewFileDiff({ cwd: repo, baseSha: stageStart, path: "new.ts" })).toMatchObject({ ok: true, oldContent: "", newContent: "export const fresh = true;\n" });
    expect(await getScmReviewFileDiff({ cwd: repo, baseSha: stageStart, path: "notes.md", untracked: true })).toMatchObject({ ok: true, oldContent: "", newContent: "later\n" });
  });

  test("an unknown base or an unsafe request fails with a reason instead of an empty list", async () => {
    const missing = await getScmReviewDiff({ cwd: repo, base: { kind: "commit", sha: "0".repeat(40) } });
    expect(missing).toMatchObject({ ok: false, files: [] });
    expect(missing.stderr).not.toBe("");
    expect((await getScmReviewDiff({ cwd: repo, base: { kind: "merge-base", ref: "--output=x" } })).ok).toBe(false);
    expect((await getScmReviewFileDiff({ cwd: repo, baseSha: "not-a-sha", path: "a.ts" })).ok).toBe(false);
    expect((await getScmReviewFileDiff({ cwd: repo, baseSha: stageStart, path: "../outside.ts" })).newContent).toBe("");
  });

  test("a link inside the workspace never reads a file outside it; a link to a file inside reads it", async () => {
    outside = mkdtempSync(path.join(tmpdir(), "stave-review-outside-"));
    writeFileSync(path.join(outside, "secret.txt"), "outside secret\n");
    symlinkSync(path.join(outside, "secret.txt"), path.join(repo, "leak.txt"));
    symlinkSync("a.ts", path.join(repo, "inner-link.ts"));
    const leaked = await getScmReviewFileDiff({ cwd: repo, baseSha: stageStart, path: "leak.txt", untracked: true });
    expect(leaked.ok).toBe(false);
    expect(leaked.newContent).not.toContain("outside secret");
    expect(leaked.stderr).not.toBe("");
    const inner = await getScmReviewFileDiff({ cwd: repo, baseSha: stageStart, path: "inner-link.ts", untracked: true });
    expect(inner).toMatchObject({ ok: true, newContent: "export const a = 2;\n" });
  });

  test("a binary file comes back as a binary marker, small enough for the host message frame", async () => {
    writeFileSync(path.join(repo, "zeros.bin"), Buffer.alloc(400 * 1024));
    const added = await getScmReviewFileDiff({ cwd: repo, baseSha: stageStart, path: "zeros.bin", untracked: true });
    expect(added).toMatchObject({ ok: true, binary: true, oldContent: "", newContent: "" });
    expect(Buffer.byteLength(JSON.stringify(added))).toBeLessThan(4 * 1024 * 1024);
    // A binary at the base is the same, even when the working tree no longer has it.
    git("add", "zeros.bin");
    git("commit", "-q", "-m", "binary");
    const base = git("rev-parse", "HEAD");
    git("rm", "-q", "zeros.bin");
    expect(await getScmReviewFileDiff({ cwd: repo, baseSha: base, path: "zeros.bin" })).toMatchObject({ ok: true, binary: true, oldContent: "" });
  });
});

