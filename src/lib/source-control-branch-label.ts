/**
 * The value `git rev-parse --abbrev-ref HEAD` reports for a detached checkout. Stored as-is
 * so persisted workspace branch state stays a faithful mirror of git.
 */
export const DETACHED_HEAD_BRANCH = "HEAD";

export const DETACHED_HEAD_LABEL = "Detached HEAD";

/**
 * `git rev-parse --abbrev-ref HEAD` reports the literal string `HEAD` on a detached HEAD,
 * so that value means "no branch" rather than a branch named HEAD.
 */
export function isDetachedHead(branch?: string | null) {
  return branch?.trim() === DETACHED_HEAD_BRANCH;
}

/**
 * Render a stored branch value for display. A detached checkout is persisted as the raw
 * `HEAD` sentinel, which is meaningless to a reader, so surface it as a human label instead.
 */
export function formatBranchLabel(branch?: string | null) {
  const normalized = branch?.trim() ?? "";
  if (!normalized) {
    return "";
  }
  return isDetachedHead(normalized) ? DETACHED_HEAD_LABEL : normalized;
}
