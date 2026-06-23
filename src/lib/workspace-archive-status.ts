/**
 * Paths that Stave itself creates inside a workspace worktree and that must NOT
 * count as "local changes" when deciding whether archiving may remove the
 * worktree.
 *
 * The repo root `node_modules` is linked into each workspace as a *symlink*.
 * `.gitignore` uses the directory-only pattern `node_modules/`, which does not
 * match a symlink, so `git status --porcelain` always reports the symlink as an
 * untracked entry (`?? node_modules`). Without excluding it, every symlinked
 * workspace looks dirty → archive preserves its worktree instead of removing it
 * → the worktree is later re-discovered by `refreshWorkspaces` and the archived
 * workspace "resurrects".
 */
const SELF_MANAGED_UNTRACKED_PATHS = new Set(["node_modules", "node_modules/"]);

/**
 * Extract the path from a `git status --porcelain` v1 line.
 * Format: `XY <path>` (2 status chars, a space, then the path). Renames use
 * `XY <orig> -> <dest>`; we keep the whole `orig -> dest` string, which never
 * matches a self-managed path, so renames always count as real changes.
 */
function parsePorcelainPath(line: string): string {
  const rawPath = line.slice(2).trim();
  // Porcelain quotes paths containing special characters.
  return rawPath.replace(/^"(.*)"$/, "$1");
}

/**
 * Given `git status --porcelain` output, return whether any entry is a real
 * local change — i.e. anything other than Stave's self-managed untracked
 * symlinks (the linked `node_modules`). Used by the workspace-archive flow so a
 * pristine worktree can actually be removed on archive.
 */
export function worktreeStatusHasMeaningfulChanges(
  porcelainStdout: string,
): boolean {
  return porcelainStdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .some((line) => !SELF_MANAGED_UNTRACKED_PATHS.has(parsePorcelainPath(line)));
}
