import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceCleanupTrashArgsSchema } from "../electron/main/ipc/schemas";
import { trashWorkspaceArchiveLeftover } from "../electron/host-service/workspace-archive-leftovers";
import type { ArchivedWorkspaceRecord } from "../electron/persistence/workspace-archive-store";

test("trash IPC accepts workspace identity only", () => {
  const args = { workspaceId: "work", repositoryPath: "/tmp/repo" };
  expect(WorkspaceCleanupTrashArgsSchema.safeParse(args).success).toBe(true);
  expect(WorkspaceCleanupTrashArgsSchema.safeParse({ ...args, path: "/tmp/alternate" }).success).toBe(false);
  expect(WorkspaceCleanupTrashArgsSchema.safeParse({ ...args, workspaceId: "" }).success).toBe(false);
});

test("only the recorded leftover can be moved, and roots, registered worktrees and substituted paths are refused", async () => {
  const root = mkdtempSync(join(tmpdir(), "archive-trash-"));
  try {
    const main = join(root, "main");
    const repositoryPath = join(root, "repository");
    const registered = join(root, "registered");
    const leftover = join(root, "leftover");
    const substitute = join(root, "substitute");
    const run = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    run(root, ["init", "-b", "main", main]);
    run(main, ["-c", "user.name=Test", "-c", "user.email=test@example.test", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "initial"]);
    run(main, ["worktree", "add", "-b", "feature", repositoryPath]);
    run(main, ["worktree", "add", "-b", "other", registered]);
    // Test registration independently from the checkout's Git marker.
    rmSync(join(registered, ".git"));
    mkdirSync(leftover);
    symlinkSync(leftover, substitute);
    const archive: ArchivedWorkspaceRecord = {
      workspaceId: "work", repositoryPath, path: leftover, branch: "work", name: "Work",
      archivedAt: "2026-11-22T00:00:00.000Z", readOnly: false,
    };
    const store = {
      listArchivedWorkspacesPersistence: () => [archive],
      loadRepositoryRegistry: () => [{ repositoryPath, workspacePathById: {} }] as ReturnType<Parameters<typeof trashWorkspaceArchiveLeftover>[1]["loadRepositoryRegistry"]>,
      readWorkspaceCleanupState: () => null,
      workspaceArchives: {
        recordLeftover: (_record: unknown, state: ArchivedWorkspaceRecord["leftoverWorktree"]) => { archive.leftoverWorktree = state; },
      },
    };
    const paths: string[] = [];
    const attempt = async (path: string, fail = false) => {
      const { dev, ino } = lstatSync(path);
      archive.path = path;
      archive.leftoverWorktree = { dev, ino };
      return trashWorkspaceArchiveLeftover({ workspaceId: "work", repositoryPath }, store,
        async (cwd, args) => ({ ok: true, stdout: run(cwd, args) }),
        async target => {
          paths.push(target);
          if (fail) throw new Error("fixture");
          rmSync(target, { recursive: true });
        });
    };
    for (const path of [repositoryPath, main, registered, substitute, root]) {
      expect(await attempt(path)).toEqual({ ok: false, reason: "leftoverTrashUnsafe" });
    }
    expect(paths).toEqual([]);
    expect(await attempt(leftover, true)).toEqual({ ok: false, reason: "leftoverTrashFailed" });
    expect(await attempt(leftover)).toEqual({ ok: true, reason: null });
    expect(paths).toEqual([leftover, leftover]);
    expect(archive.leftoverWorktree).toBe("cleared");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
