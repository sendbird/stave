import { constants, existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseGitWorktrees } from "../../src/lib/source-control-worktrees";
import { WorkspaceCleanupStateSchema, type WorkspaceCleanupTrashArgs } from "../../src/lib/workspace-cleanup-contract";
import type { SqliteStore } from "../persistence/sqlite-store";
import type { ArchivedWorkspaceRecord, WorkspaceArchiveStore } from "../persistence/workspace-archive-store";

export function hasWorkspaceArchiveLeftover(archive: ArchivedWorkspaceRecord, recent: { workspaceId: string; repositoryPath: string; reason: string | null; at: string; ok: boolean; action: string }[]) {
  if (archive.creationOptions?.linkedWorktree || archive.creationOptions?.keepWorktree || archive.leftoverWorktree === "cleared") return false;
  const recorded = archive.leftoverWorktree || recent.some(item => item.workspaceId === archive.workspaceId &&
    item.repositoryPath === archive.repositoryPath && item.ok && ["archive", "removeWorktree"].includes(item.action) && item.reason === "worktreeLeftoverFiles" && item.at >= archive.archivedAt);
  return Boolean(recorded && existsSync(archive.path));
}

const canonical = (path: string) => {
  try { return realpathSync(path); } catch { return resolve(path); }
};

function contains(directory: string, path: string) {
  const child = relative(directory, path);
  return child === "" || (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`));
}

/** Resolve the target exclusively from persisted ownership. Never accept a filesystem path from IPC. */
export async function trashWorkspaceArchiveLeftover(
  args: WorkspaceCleanupTrashArgs,
  store: Pick<SqliteStore, "listArchivedWorkspacesPersistence" | "loadRepositoryRegistry" | "readWorkspaceCleanupState"> & { workspaceArchives: Pick<WorkspaceArchiveStore, "recordLeftover"> },
  git: (cwd: string, args: string[]) => Promise<{ ok: boolean; stdout: string; stdoutTruncated?: boolean }>,
  trash: (path: string) => Promise<void>,
) {
  const refuse = (reason = "leftoverTrashUnsafe") => ({ ok: false, reason });
  try {
    const findArchive = () => store.listArchivedWorkspacesPersistence({ repositoryPath: args.repositoryPath }).find(row => row.workspaceId === args.workspaceId);
    const archive = findArchive();
    const recent = WorkspaceCleanupStateSchema.safeParse(store.readWorkspaceCleanupState()).data?.recent ?? [];
    if (!archive || !hasWorkspaceArchiveLeftover(archive, recent)) return refuse("leftoverTrashUnavailable");
    const repositories = store.loadRepositoryRegistry();
    if (!repositories.some(repo => repo.repositoryPath === archive.repositoryPath) || !isAbsolute(archive.path)) return refuse();
    const target = canonical(archive.path);
    const initial = lstatSync(archive.path);
    if (!initial.isDirectory()) return refuse();
    if (archive.leftoverWorktree && archive.leftoverWorktree !== "cleared" && (initial.dev !== archive.leftoverWorktree.dev || initial.ino !== archive.leftoverWorktree.ino)) return refuse();
    for (const repo of repositories) {
      if ([repo.repositoryPath, ...Object.values(repo.workspacePathById)].some(path => path && contains(target, canonical(path)))) return refuse();
    }
    const [listed, common] = await Promise.all([
      git(archive.repositoryPath, ["worktree", "list", "--porcelain", "-z"]),
      git(archive.repositoryPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    ]);
    if (!listed.ok || listed.stdoutTruncated || !listed.stdout.includes("\0") || listed.stdout.includes("\uFFFD")) return refuse();
    const commonPath = common.stdout.trim();
    if (!common.ok || common.stdoutTruncated || !isAbsolute(commonPath)) return refuse();
    const commonDir = canonical(commonPath);
    if (contains(target, commonDir) || contains(commonDir, target)) return refuse();
    const worktrees = parseGitWorktrees(listed);
    if (!worktrees.length || worktrees.some(worktree => contains(target, canonical(worktree.path)))) return refuse();
    // A failed Git removal can leave its own .git pointer behind. Accept only
    // a pointer to missing metadata in this repository's worktrees directory.
    try {
      const pointer = join(archive.path, ".git");
      const marker = lstatSync(pointer);
      if (!marker.isFile() || marker.size > 4096) return refuse();
      const gitdir = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(readFileSync(pointer, {
        encoding: "utf8", flag: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      }))?.[1];
      if (!gitdir) return refuse();
      const admin = resolve(archive.path, gitdir);
      if (canonical(dirname(admin)) !== canonical(join(commonDir, "worktrees")) || existsSync(admin)) return refuse();
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return refuse(); }
    const latest = findArchive();
    const stat = lstatSync(archive.path);
    if (!latest || latest.archivedAt !== archive.archivedAt || latest.path !== archive.path ||
      !hasWorkspaceArchiveLeftover(latest, recent) || !stat.isDirectory() ||
      stat.dev !== initial.dev || stat.ino !== initial.ino || canonical(archive.path) !== target) return refuse();
    await trash(archive.path);
    store.workspaceArchives.recordLeftover(archive, "cleared");
    return { ok: true, reason: null };
  } catch { return refuse("leftoverTrashFailed"); }
}
