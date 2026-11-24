/**
 * Worktrees Claude Code sub-agents leave at `<project>/.claude/worktrees/agent-<id>`.
 *
 * Listing reads `git worktree list --porcelain -z` for each registered project
 * and keeps an entry only when its real path is exactly that folder and no
 * folder between the project and the worktree is a symbolic link. Stave's own
 * workspaces are never listed. Removal re-reads the worktree and runs every
 * check again, then runs `git worktree remove` without `--force` and
 * `git worktree prune`; the branch is never deleted.
 *
 * Used by: `workspace-cleanup-runtime.ts`.
 */
import { realpathSync } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { SubAgentWorktreeRemoveArgs, SubAgentWorktreeRemoveResult, SubAgentWorktreeRow } from "../../src/lib/workspace-cleanup-contract";

/** A worktree changed more recently than this may still be in use. */
export const SUBAGENT_WORKTREE_QUIET_MS = 30 * 60_000;
/** At most this many top-level entries are read for the last change time. */
export const SUBAGENT_WORKTREE_TOP_LEVEL_LIMIT = 2_000;
const AGENT_FOLDER = /^agent-[A-Za-z0-9_-]{1,120}$/;

export type SubAgentGit = (cwd: string, args: string[]) => Promise<{ ok: boolean; stdout: string }>;

export interface SubAgentWorktreeStore {
  loadRepositoryRegistry(): Array<{
    repositoryPath: string;
    repositoryName: string;
    workspacePathById: Record<string, string>;
    linkedWorkspacePaths?: string[];
    archivedWorkspacePaths?: string[];
  }>;
  listArchivedWorkspacesPersistence(): Array<{ path: string }>;
}

export interface ListedWorktree {
  path: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  locked: boolean;
}

/** A verified sub-agent worktree: `path` is its real folder, `gitPath` the path Git reported. */
export interface SubAgentWorktreeFolder extends ListedWorktree {
  gitPath: string;
  name: string;
  repositoryPath: string;
  repositoryName: string;
}

/** `git worktree list --porcelain -z`: one NUL-ended field per line, an empty field between entries. */
export function parseWorktreePorcelain(stdout: string): ListedWorktree[] {
  const entries: ListedWorktree[] = [];
  let current: ListedWorktree | null = null;
  for (const field of stdout.split("\0")) {
    if (field.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: field.slice("worktree ".length), head: null, branch: null, detached: false, locked: false };
    } else if (!current) continue;
    else if (field === "") { entries.push(current); current = null; }
    else if (field.startsWith("HEAD ")) current.head = field.slice("HEAD ".length);
    else if (field.startsWith("branch refs/heads/")) current.branch = field.slice("branch refs/heads/".length);
    else if (field === "detached") current.detached = true;
    else if (field === "locked" || field.startsWith("locked ")) current.locked = true;
  }
  if (current) entries.push(current);
  return entries;
}

const canonical = (path: string) => { try { return realpathSync(path); } catch { return resolve(path); } };

/**
 * The real folder of a listed worktree when it is `<project>/.claude/worktrees/agent-<id>`;
 * null for any other path, or when `.claude`, `worktrees` or the worktree itself is a link.
 */
export async function verifySubAgentWorktreePath(repositoryRealPath: string, listedPath: string): Promise<string | null> {
  if (!isAbsolute(listedPath)) return null;
  const name = basename(listedPath);
  if (!AGENT_FOLDER.test(name)) return null;
  const parent = join(repositoryRealPath, ".claude", "worktrees");
  const expected = join(parent, name);
  for (const folder of [join(repositoryRealPath, ".claude"), parent, expected]) {
    const stat = await lstat(folder).catch(() => null);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return null;
  }
  return (await realpath(listedPath).catch(() => null)) === expected ? expected : null;
}

/** Newest change time of the folder, its first top-level entries and its Git index and HEAD; null when the folder is unreadable. */
export async function worktreeLastModified(path: string, adminDir: string | null): Promise<number | null> {
  const own = await lstat(path).catch(() => null);
  if (!own) return null;
  const names = await readdir(path).catch(() => null);
  if (!names) return null;
  const files = [...names.slice(0, SUBAGENT_WORKTREE_TOP_LEVEL_LIMIT).map((name) => join(path, name)),
    ...(adminDir ? [join(adminDir, "index"), join(adminDir, "HEAD")] : [])];
  const stats = await Promise.all(files.map((file) => lstat(file).catch(() => null)));
  return Math.max(own.mtimeMs, ...stats.map((stat) => stat?.mtimeMs ?? 0));
}

export function createSubAgentWorktrees(ports: { store: () => SubAgentWorktreeStore; git: SubAgentGit; now?: () => number }) {
  const now = ports.now ?? Date.now;

  /** Every path a Stave workspace, archive or project occupies, in real form. */
  function staveWorkspacePaths() {
    const store = ports.store();
    const paths = new Set<string>();
    const add = (path: string | undefined) => { if (path) paths.add(canonical(path)); };
    for (const repository of store.loadRepositoryRegistry()) {
      add(repository.repositoryPath);
      for (const path of Object.values(repository.workspacePathById)) add(path);
      for (const path of repository.linkedWorkspacePaths ?? []) add(path);
      for (const path of repository.archivedWorkspacePaths ?? []) add(path);
    }
    for (const archive of store.listArchivedWorkspacesPersistence()) add(archive.path);
    return paths;
  }

  /** One project's sub-agent worktrees, Stave workspaces included and marked. Null when Git cannot list them. */
  async function discoverRepository(repository: { repositoryPath: string; repositoryName: string }, stave: ReadonlySet<string>) {
    const listed = await ports.git(repository.repositoryPath, ["worktree", "list", "--porcelain", "-z"]);
    if (!listed.ok) return null;
    const real = canonical(repository.repositoryPath);
    const folders: Array<SubAgentWorktreeFolder & { staveWorkspace: boolean }> = [];
    for (const entry of parseWorktreePorcelain(listed.stdout)) {
      const path = await verifySubAgentWorktreePath(real, entry.path);
      if (!path) continue;
      folders.push({ ...entry, path, gitPath: entry.path, name: basename(path), repositoryPath: repository.repositoryPath,
        repositoryName: repository.repositoryName, staveWorkspace: stave.has(path) });
    }
    return folders;
  }

  /** Sub-agent worktrees of every registered project, without Stave's own workspaces. */
  async function discover(): Promise<SubAgentWorktreeFolder[]> {
    const stave = staveWorkspacePaths();
    const folders: SubAgentWorktreeFolder[] = [];
    for (const repository of ports.store().loadRepositoryRegistry()) {
      for (const { staveWorkspace, ...folder } of await discoverRepository(repository, stave) ?? []) if (!staveWorkspace) folders.push(folder);
    }
    return folders;
  }

  /**
   * What blocks removing a worktree now. The last change time is read before
   * Git runs, and Git runs without optional locks, so the check itself
   * neither changes the index nor waits on an agent's Git command.
   */
  async function inspect(folder: SubAgentWorktreeFolder, running: ReadonlySet<string>, staveWorkspace = false) {
    const blockers: string[] = [];
    if (staveWorkspace) blockers.push("staveWorkspace");
    if (folder.locked) blockers.push("worktreeLocked");
    if (running.has(folder.path)) blockers.push("agentRunning");
    const admin = await ports.git(folder.path, ["rev-parse", "--absolute-git-dir"]);
    const modified = await worktreeLastModified(folder.path, admin.ok ? admin.stdout.trim() : null);
    if (!admin.ok || modified === null) blockers.push("checksUnavailable");
    else if (now() - modified < SUBAGENT_WORKTREE_QUIET_MS) blockers.push("recentlyModified");
    const status = await ports.git(folder.path, ["--no-optional-locks", "status", "--porcelain", "--untracked-files=normal"]);
    if (!status.ok) blockers.push("checksUnavailable");
    else if (status.stdout.trim()) blockers.push("changedFiles");
    if (folder.detached) {
      // Commits reachable only from this detached HEAD would be lost with the worktree.
      const loose = folder.head ? await ports.git(folder.path, ["rev-list", "--count", folder.head, "--not", "--branches"]) : null;
      const count = loose?.ok ? loose.stdout.trim() : "";
      if (!/^\d+$/.test(count)) blockers.push("checksUnavailable");
      else if (Number(count) > 0) blockers.push("unreachableCommits");
    }
    return { blockers: [...new Set(blockers)], lastModified: modified === null ? null : new Date(modified).toISOString() };
  }

  const runningSet = (paths: readonly string[]) => new Set(paths.map(canonical));

  /** Rows for the cleanup dialog, four worktrees checked at a time. */
  async function list(runningAgentWorktrees: readonly string[], bytes: (folder: SubAgentWorktreeFolder) => Promise<number | null> | number | null): Promise<SubAgentWorktreeRow[]> {
    const folders = await discover();
    const running = runningSet(runningAgentWorktrees);
    const rows = new Array<SubAgentWorktreeRow>(folders.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, folders.length) }, async () => {
      while (cursor < folders.length) {
        const index = cursor++;
        const folder = folders[index]!;
        const checked = await inspect(folder, running).catch(() => ({ blockers: ["checksUnavailable"], lastModified: null }));
        rows[index] = { repositoryPath: folder.repositoryPath, repositoryName: folder.repositoryName, path: folder.path, name: folder.name,
          branch: folder.detached ? null : folder.branch, head: folder.head, lastModified: checked.lastModified, blockers: checked.blockers,
          bytes: await Promise.resolve(bytes(folder)).catch(() => null) };
      }
    }));
    return rows;
  }

  /** Removes one worktree when it is still listed and nothing blocks it. Never forced; the branch stays. */
  async function remove(args: SubAgentWorktreeRemoveArgs, runningAgentWorktrees: readonly string[]): Promise<SubAgentWorktreeRemoveResult> {
    const fail = (reason: string): SubAgentWorktreeRemoveResult => ({ ok: false, path: args.path, reason });
    try {
      const repository = ports.store().loadRepositoryRegistry().find((entry) => canonical(entry.repositoryPath) === canonical(args.repositoryPath));
      if (!repository) return fail("ownershipChanged");
      const folders = await discoverRepository(repository, staveWorkspacePaths());
      if (!folders) return fail("checksUnavailable");
      const folder = folders.find((entry) => entry.path === args.path);
      if (!folder) return fail("subAgentWorktreeMissing");
      const { blockers } = await inspect(folder, runningSet(runningAgentWorktrees), folder.staveWorkspace);
      if (blockers.length) return fail(blockers.join(","));
      // Git itself refuses a worktree with changes, untracked files or a lock.
      const removed = await ports.git(repository.repositoryPath, ["worktree", "remove", "--", folder.gitPath]);
      if (!removed.ok) return fail("worktreeRemoveFailed");
      await ports.git(repository.repositoryPath, ["worktree", "prune"]);
      return { ok: true, path: args.path, reason: null };
    } catch {
      return fail("checksUnavailable");
    }
  }

  return { discover, list, remove };
}

export type SubAgentWorktrees = ReturnType<typeof createSubAgentWorktrees>;
