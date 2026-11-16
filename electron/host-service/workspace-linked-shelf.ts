import { lstat, mkdir, readdir, realpath, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";

const safeName = (name: string) => Boolean(name) && name !== "." && name !== ".." && !/[\\/\0]/.test(name);

async function shelfRoot(repositoryPath: string, create = false): Promise<string | null> {
  const parent = join(repositoryPath, ".stave");
  const root = join(parent, "workspaces");
  for (const path of [parent, root]) {
    if (create) {
      try { await mkdir(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    try {
      const stat = await lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("worktreeRestoreFailed");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  return root;
}

async function pointsTo(path: string, target: string): Promise<boolean> {
  try { return (await lstat(path)).isSymbolicLink() && await realpath(path) === await realpath(target); }
  catch { return false; }
}

/** Capture only verified symlinks in the repository's owned link directory. */
export async function listWorkspaceShelfLinks(repositoryPath: string, workspacePath: string): Promise<string[]> {
  const root = await shelfRoot(repositoryPath);
  if (!root) return [];
  const names: string[] = [];
  for (const name of await readdir(root)) {
    if (safeName(name) && await pointsTo(join(root, name), workspacePath)) names.push(name);
  }
  return names;
}

export async function removeWorkspaceShelfLinks(repositoryPath: string, workspacePath: string, names: readonly string[]): Promise<void> {
  const root = await shelfRoot(repositoryPath);
  if (!root) return;
  for (const name of names) {
    if (!safeName(name)) throw new Error("worktreeRemoveFailed");
    const path = join(root, name);
    if (await pointsTo(path, workspacePath)) await unlink(path);
  }
}

export async function restoreWorkspaceShelfLinks(repositoryPath: string, workspacePath: string, names: readonly string[]): Promise<void> {
  if (!names.length) return;
  if (names.some(name => !safeName(name))) throw new Error("worktreeRestoreFailed");
  const root = await shelfRoot(repositoryPath, true);
  if (!root) throw new Error("worktreeRestoreFailed");
  for (const name of names) {
    const path = join(root, name);
    if (await pointsTo(path, workspacePath)) continue;
    try { await symlink(workspacePath, path); } catch { throw new Error("worktreeRestoreFailed"); }
  }
}
