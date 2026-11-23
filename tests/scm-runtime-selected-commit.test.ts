import { afterEach, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitSourceControl } from "../electron/host-service/scm-runtime";

let repo: string;

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function write(path: string, content: string) {
  writeFileSync(join(repo, path), content + "\n");
}

function commitSelected(...paths: string[]) {
  const request = { cwd: repo, message: "fix: commit selection", paths };
  return commitSourceControl(request);
}

function committedPaths() {
  return git("diff-tree", "--no-commit-id", "--no-renames", "--name-only", "-r", "HEAD")
    .split("\n");
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "stave-selected-commit-"));
  git("init", "--quiet");
  git("config", "user.name", "Stave Test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", ".git/hooks");
  for (const file of ["selected.txt", "unchecked.txt", "old.txt", "deleted.txt"]) {
    write(file, "original");
  }
  git("add", "--all");
  git("commit", "--quiet", "-m", "test: seed");
  write("unchecked.txt", "staged unchecked");
  git("add", "unchecked.txt");
  write("unchecked.txt", "unstaged unchecked");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

test("commits only the selected file and preserves the unchecked staged version", async () => {
  write("selected.txt", "selected");
  git("add", "selected.txt");
  const result = await commitSelected("selected.txt");
  expect(result.ok).toBe(true);
  expect(committedPaths()).toEqual(["selected.txt"]);
  expect(git("show", ":unchecked.txt")).toBe("staged unchecked");
  expect(git("diff", "--cached", "--name-only")).toBe("unchecked.txt");
  expect(git("diff", "--name-only")).toBe("unchecked.txt");
});

test("commits the full working-tree version of a mixed staged and unstaged file", async () => {
  write("selected.txt", "partial");
  git("add", "selected.txt");
  write("selected.txt", "full");
  const result = await commitSelected("selected.txt");
  expect(result.ok).toBe(true);
  expect(git("show", "HEAD:selected.txt")).toBe("full");
  expect(git("show", ":selected.txt")).toBe("full");
  expect(committedPaths()).toEqual(["selected.txt"]);
});

test("commits both paths of a selected staged rename", async () => {
  git("mv", "old.txt", "new -> name.txt");
  const result = await commitSelected("new -> name.txt", "old.txt");
  expect(result.ok).toBe(true);
  expect(committedPaths()).toEqual(["new -> name.txt", "old.txt"]);
  expect(git("diff", "--cached", "--name-only")).toBe("unchecked.txt");
});

test("commits a selected working-tree deletion", async () => {
  unlinkSync(join(repo, "deleted.txt"));
  const result = await commitSelected("deleted.txt");
  expect(result.ok).toBe(true);
  expect(committedPaths()).toEqual(["deleted.txt"]);
  expect(git("diff", "--cached", "--name-only")).toBe("unchecked.txt");
});

test("treats a selected untracked filename with pathspec metacharacters literally", async () => {
  write("new[1].txt", "selected");
  write("new1.txt", "unchecked");
  git("add", "new1.txt");
  const result = await commitSelected("new[1].txt");
  expect(result.ok).toBe(true);
  expect(committedPaths()).toEqual(["new[1].txt"]);
  expect(git("diff", "--cached", "--name-only")).toBe("new1.txt\nunchecked.txt");
});

test("a pre-commit failure and retry keep the same scope", async () => {
  write("selected.txt", "before fix");
  git("add", "selected.txt");
  const hook = join(repo, ".git/hooks/pre-commit");
  writeFileSync(hook, "#!/bin/sh\ngit diff --cached --name-only >&2\nexit 1\n", { mode: 0o755 });
  const before = git("rev-parse", "HEAD");
  const stagedBefore = git("diff", "--cached");
  const failure = await commitSelected("selected.txt");
  expect(failure.ok).toBe(false);
  expect(failure.stderr.trim()).toBe("selected.txt");
  expect(git("rev-parse", "HEAD")).toBe(before);
  expect(git("diff", "--cached")).toBe(stagedBefore);

  unlinkSync(hook);
  write("selected.txt", "after fix");
  const retry = await commitSelected("selected.txt");
  expect(retry.ok).toBe(true);
  expect(committedPaths()).toEqual(["selected.txt"]);
  expect(git("show", "HEAD:selected.txt")).toBe("after fix");
  expect(git("diff", "--cached", "--name-only")).toBe("unchecked.txt");
});

test("an untracked selection stays scoped if intent-to-add exposes a rename on retry", async () => {
  unlinkSync(join(repo, "old.txt"));
  write("new.txt", "original");
  const hook = join(repo, ".git/hooks/pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const failure = await commitSelected("new.txt");
  expect(failure.ok).toBe(false);
  expect(git("status", "--porcelain", "--renames")).toContain("R old.txt -> new.txt");

  unlinkSync(hook);
  const retry = await commitSelected("new.txt");
  expect(retry.ok).toBe(true);
  expect(committedPaths()).toEqual(["new.txt"]);
  expect(git("diff", "--name-only")).toBe("old.txt\nunchecked.txt");
  expect(git("diff", "--cached", "--name-only")).toBe("unchecked.txt");
});

test("an empty selection is rejected without falling back to an index commit", async () => {
  const before = git("rev-parse", "HEAD");
  const result = await commitSelected();
  expect(result.ok).toBe(false);
  expect(git("rev-parse", "HEAD")).toBe(before);
  expect(git("diff", "--cached", "--name-only")).toBe("unchecked.txt");
});
