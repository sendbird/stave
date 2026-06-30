import type { GraphCommit, GraphRef } from "./types";

const FIELD = "\x1f";

/**
 * Strip a fully-qualified ref prefix (`refs/heads/`, `refs/remotes/`,
 * `refs/tags/`) emitted by `git log --decorate=full`, leaving the human-readable
 * ref name (which may itself contain slashes, e.g. `feature/login`).
 */
function stripRefPrefix(ref: string): string {
  for (const prefix of ["refs/heads/", "refs/remotes/", "refs/tags/"]) {
    if (ref.startsWith(prefix)) {
      return ref.slice(prefix.length);
    }
  }
  return ref;
}

/**
 * Parse a `%D` decoration produced with `--decorate=full`. Full ref paths let us
 * classify refs unambiguously by prefix — a local branch whose name contains a
 * slash (`feature/login`) is no longer mistaken for a remote branch.
 */
export function parseRefDecoration(decoration: string): GraphRef[] {
  const trimmed = decoration.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): GraphRef => {
      if (part.startsWith("HEAD ->")) {
        return {
          type: "localBranch",
          name: stripRefPrefix(part.slice("HEAD ->".length).trim()),
          isHead: true,
        };
      }
      if (part === "HEAD") {
        return { type: "head", name: "HEAD", isHead: true };
      }
      if (part.startsWith("tag:")) {
        return {
          type: "tag",
          name: stripRefPrefix(part.slice(4).trim()),
          isHead: false,
        };
      }
      if (part.startsWith("refs/remotes/")) {
        return {
          type: "remoteBranch",
          name: stripRefPrefix(part),
          isHead: false,
        };
      }
      if (part.startsWith("refs/heads/")) {
        return {
          type: "localBranch",
          name: stripRefPrefix(part),
          isHead: false,
        };
      }
      if (part.startsWith("refs/tags/")) {
        return { type: "tag", name: stripRefPrefix(part), isHead: false };
      }
      // Fallback for short decorations (no --decorate=full). Names cannot be
      // reliably split local-vs-remote here, so default to local rather than
      // guessing from a slash, which previously misclassified `feature/login`.
      return { type: "localBranch", name: part, isHead: false };
    });
}

export function parseGraphLog(stdout: string): GraphCommit[] {
  if (!stdout.trim()) {
    return [];
  }
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): GraphCommit => {
      const [
        hash = "",
        parents = "",
        author = "",
        authorDate = "",
        decoration = "",
        subject = "",
      ] = line.split(FIELD);
      return {
        hash,
        parents: parents.split(" ").filter(Boolean),
        author,
        authorDate,
        subject,
        refs: parseRefDecoration(decoration),
      };
    });
}
