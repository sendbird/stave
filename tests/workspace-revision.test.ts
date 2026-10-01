import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkspaceRevision } from "../electron/host-service/supervision/workspace-revision";

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
