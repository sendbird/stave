const REPOSITORY_PART = /^[A-Za-z0-9_.-]+$/;
const HOST = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

/**
 * The host, owner and name of the repository a remote URL (ssh, scp-like or
 * https, with optional user, port and `.git`) or a pull request URL names,
 * lowercased; the port is not part of the host, so an ssh remote and an https
 * pull request URL on one server name the same repository. Null when any part
 * cannot be determined, such as for a local path.
 */
export function parseGitRemoteRepository(remote: string): { host: string; owner: string; name: string } | null {
  const trimmed = remote.trim();
  const match = /^https:\/\/(?:[^@/]+@)?([^/:@]+)(?::\d+)?\/([^/]+)\/([^/]+)\/pull\/\d+(?:[/?#]|$)/i.exec(trimmed)
    ?? /^(?:ssh|git\+ssh|ssh\+git|https?|git):\/\/(?:[^@/]+@)?([^/:@]+)(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/*$/i.exec(trimmed)
    ?? /^(?:[^@/:]+@)?([^/:@]+):([^/]+)\/([^/]+?)(?:\.git)?\/*$/.exec(trimmed);
  if (!match) return null;
  const [host, owner, name] = [match[1]!.toLowerCase(), match[2]!, match[3]!];
  if (!HOST.test(host) || !/[a-z]/.test(host) || !REPOSITORY_PART.test(owner) || !REPOSITORY_PART.test(name) || name === "." || name === "..") return null;
  return { host, owner: owner.toLowerCase(), name: name.toLowerCase() };
}
