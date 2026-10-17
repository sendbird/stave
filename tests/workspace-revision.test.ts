import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkspaceRevision } from "../electron/host-service/supervision/workspace-revision";
import { revisionsMatch } from "../src/lib/agent-runs/verification-contract";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function repository() {
  const cwd = mkdtempSync(join(tmpdir(), "stave-workspace-revision-")); directories.push(cwd);
  const git = (...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
  git("init"); writeFileSync(join(cwd, "tracked.txt"), "original"); git("add", ".");
  const commit = () => git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test: record workspace");
  commit(); return { cwd, git, commit };
}

test("workspace revisions detect new HEAD, staged state and repeated edits to the same dirty or untracked file", async () => {
  const h = repository();
  const clean = await readWorkspaceRevision(h.cwd); expect(clean.status).toBe("known");
  expect(await readWorkspaceRevision(h.cwd)).toEqual(clean);
  writeFileSync(join(h.cwd, "tracked.txt"), "first dirty value"); const first = await readWorkspaceRevision(h.cwd);
  writeFileSync(join(h.cwd, "tracked.txt"), "second dirty value"); const second = await readWorkspaceRevision(h.cwd);
  expect(first.status).toBe("known"); expect(second.status).toBe("known"); expect(second).not.toEqual(first);
  h.git("add", "tracked.txt"); const staged = await readWorkspaceRevision(h.cwd); expect(staged).not.toEqual(second);
  writeFileSync(join(h.cwd, "note.txt"), "first note"); const note = await readWorkspaceRevision(h.cwd);
  writeFileSync(join(h.cwd, "note.txt"), "second note"); expect(await readWorkspaceRevision(h.cwd)).not.toEqual(note);
  h.git("add", "."); h.commit(); const committed = await readWorkspaceRevision(h.cwd);
  expect(committed.status).toBe("known"); expect(committed).not.toEqual(clean);
  expect(JSON.stringify(committed)).not.toContain("dirty value"); expect(JSON.stringify(committed)).not.toContain("tracked.txt");
});

test("bounded or unavailable workspace state returns an honest unknown result", async () => {
  const h = repository(); writeFileSync(join(h.cwd, "large.bin"), Buffer.alloc(9 * 1024 * 1024));
  expect(await readWorkspaceRevision(h.cwd)).toEqual({ status: "unknown", reason: "limit" });
  const cwd = mkdtempSync(join(tmpdir(), "stave-not-a-repository-")); directories.push(cwd);
  expect(await readWorkspaceRevision(cwd)).toEqual({ status: "unknown", reason: "unavailable" });
});

test("content identity survives staging and a real commit while strict revisions and the user's index stay intact", async () => {
  const h = repository();
  writeFileSync(join(h.cwd, "tracked.txt"), "tested implementation");
  writeFileSync(join(h.cwd, "new.txt"), "tested new file");
  symlinkSync("new.txt", join(h.cwd, "link.txt"));
  const index = () => readFileSync(join(h.cwd, ".git", "index"));
  const indexBefore = index();
  const dirty = await readWorkspaceRevision(h.cwd);
  expect(index()).toEqual(indexBefore);
  h.git("add", ".");
  const stagedIndex = index();
  const staged = await readWorkspaceRevision(h.cwd);
  expect(index()).toEqual(stagedIndex);
  h.commit();
  const committedIndex = index();
  const committed = await readWorkspaceRevision(h.cwd);
  expect(index()).toEqual(committedIndex);
  if (dirty.status !== "known" || staged.status !== "known" || committed.status !== "known") throw new Error("Expected known revisions");
  expect(dirty.contentRevision).toBeDefined();
  expect(staged.contentRevision).toBe(dirty.contentRevision);
  expect(committed.contentRevision).toBe(dirty.contentRevision);
  expect(revisionsMatch(dirty, staged)).toBe(false);
  expect(revisionsMatch(dirty, committed)).toBe(false);
  expect(readFileSync(join(h.cwd, "tracked.txt"), "utf8")).toBe("tested implementation");
});

test("content identity changes for content, path, executable-mode and symlink-target changes", async () => {
  const h = repository();
  const first = await readWorkspaceRevision(h.cwd);
  if (first.status !== "known") throw new Error("Expected known revision");
  const content = async () => {
    const result = await readWorkspaceRevision(h.cwd);
    if (result.status !== "known") throw new Error("Expected known revision");
    return result.contentRevision;
  };
  writeFileSync(join(h.cwd, "tracked.txt"), "different"); expect(await content()).not.toBe(first.contentRevision);
  writeFileSync(join(h.cwd, "tracked.txt"), "original"); chmodSync(join(h.cwd, "tracked.txt"), 0o755);
  expect(await content()).not.toBe(first.contentRevision);
  chmodSync(join(h.cwd, "tracked.txt"), 0o644); unlinkSync(join(h.cwd, "tracked.txt"));
  writeFileSync(join(h.cwd, "renamed.txt"), "original"); expect(await content()).not.toBe(first.contentRevision);
  symlinkSync("renamed.txt", join(h.cwd, "link.txt")); const linked = await content();
  unlinkSync(join(h.cwd, "link.txt")); symlinkSync("other.txt", join(h.cwd, "link.txt"));
  expect(await content()).not.toBe(linked);
});

test("conflicted and submodule indexes never advertise content equivalence", async () => {
  for (const mode of ["100644", "160000"]) {
    const h = repository();
    const blob = h.git("rev-parse", "HEAD:tracked.txt").toString().trim();
    if (mode === "100644") {
      h.git("update-index", "--force-remove", "tracked.txt");
      execFileSync("git", ["update-index", "--index-info"], { cwd: h.cwd, input: `100644 ${blob} 1\ttracked.txt\n100644 ${blob} 2\ttracked.txt\n`, stdio: ["pipe", "pipe", "pipe"] });
    } else {
      h.git("update-index", "--add", "--cacheinfo", `160000,${h.git("rev-parse", "HEAD").toString().trim()},submodule`);
    }
    const revision = await readWorkspaceRevision(h.cwd);
    expect(revision.status === "unknown" || revision.contentRevision === undefined).toBe(true);
  }
});

for (const transform of ["line-endings", "clean-filter"]) {
  test(`content identity follows actual tested bytes across ${transform} staging and commits`, async () => {
    const h = repository();
    if (transform === "line-endings") h.git("config", "core.autocrlf", "true");
    else {
      writeFileSync(join(h.cwd, ".gitattributes"), "tracked.txt filter=uppercase\n");
      h.git("config", "filter.uppercase.clean", "tr '[:lower:]' '[:upper:]'");
    }
    const contents = transform === "line-endings" ? "tested implementation\r\n" : "tested implementation\n";
    writeFileSync(join(h.cwd, "tracked.txt"), contents);
    const dirty = await readWorkspaceRevision(h.cwd);
    h.git("add", ".");
    const staged = await readWorkspaceRevision(h.cwd);
    h.commit();
    const committed = await readWorkspaceRevision(h.cwd);
    expect(readFileSync(join(h.cwd, "tracked.txt"), "utf8")).toBe(contents);
    if (dirty.status !== "known" || staged.status !== "known" || committed.status !== "known") throw new Error("Expected known revisions");
    expect(dirty.contentRevision).toBeDefined();
    expect(staged.contentRevision).toBe(dirty.contentRevision);
    expect(committed.contentRevision).toBe(dirty.contentRevision);
    // Git's normalized blobs can remain the same while bytes used by a test change.
    writeFileSync(join(h.cwd, "tracked.txt"), transform === "line-endings" ? contents.replaceAll("\r\n", "\n") : contents.toUpperCase());
    const changed = await readWorkspaceRevision(h.cwd);
    if (changed.status !== "known") throw new Error("Expected known revision");
    expect(changed.contentRevision).not.toBe(committed.contentRevision);
    expect(revisionsMatch(changed, committed)).toBe(false);
  });
}
