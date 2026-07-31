import type { GraphCommit } from "./types";

function normalizeSearchValue(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

export function commitMatchesGraphQuery(
  commit: GraphCommit,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearchValue(query.trim());
  if (!normalizedQuery) {
    return false;
  }
  return [
    commit.hash,
    commit.subject,
    commit.author,
    commit.authorEmail,
    commit.authorDate,
    commit.committerDate,
    ...commit.refs.map((ref) => ref.name),
  ].some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

export function findGraphCommitMatches(
  commits: GraphCommit[],
  query: string,
): string[] {
  if (!query.trim()) {
    return [];
  }
  return commits
    .filter((commit) => commitMatchesGraphQuery(commit, query))
    .map((commit) => commit.hash);
}
