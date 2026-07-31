import type {
  GraphCommit,
  GraphRef,
  GraphRepositoryRef,
  GraphWorkingTreeSummary,
} from "./types";

const LEGACY_FIELD = "\x1f";
const NUL = "\0";
const GRAPH_LOG_FIELD_COUNT = 7;

function stripRefPrefix(ref: string): string {
  for (const prefix of ["refs/heads/", "refs/remotes/", "refs/tags/"]) {
    if (ref.startsWith(prefix)) {
      return ref.slice(prefix.length);
    }
  }
  return ref;
}

/**
 * Compatibility parser for the legacy `%D`-based log contract.
 *
 * The new graph query reads refs independently with `git for-each-ref`, because
 * comma-separated decorations cannot represent every valid ref name. Keeping
 * this parser allows older persisted fixtures and callers to fail gracefully.
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
        const revision = part.slice("HEAD ->".length).trim();
        return {
          type: "localBranch",
          name: stripRefPrefix(revision),
          revision,
          isHead: true,
        };
      }
      if (part === "HEAD") {
        return {
          type: "head",
          name: "HEAD",
          revision: "HEAD",
          isHead: true,
        };
      }
      if (part.startsWith("tag:")) {
        const name = stripRefPrefix(part.slice(4).trim());
        return {
          type: "tag",
          name,
          revision: `refs/tags/${name}`,
          isHead: false,
        };
      }
      if (part.startsWith("refs/remotes/")) {
        const name = stripRefPrefix(part);
        return {
          type: "remoteBranch",
          name,
          revision: part,
          remote: name.split("/")[0] || undefined,
          isHead: false,
        };
      }
      if (part.startsWith("refs/heads/")) {
        return {
          type: "localBranch",
          name: stripRefPrefix(part),
          revision: part,
          isHead: false,
        };
      }
      if (part.startsWith("refs/tags/")) {
        return {
          type: "tag",
          name: stripRefPrefix(part),
          revision: part,
          isHead: false,
        };
      }
      return { type: "localBranch", name: part, isHead: false };
    });
}

function isPlausibleHash(value: string): boolean {
  return /^[0-9a-f]{7,64}$/i.test(value);
}

function parseNulGraphLog(stdout: string): GraphCommit[] {
  const commits: GraphCommit[] = [];
  const tokens = stdout.split(NUL);

  for (let index = 0; index + GRAPH_LOG_FIELD_COUNT <= tokens.length;) {
    const fields = tokens.slice(index, index + GRAPH_LOG_FIELD_COUNT);
    fields[0] = (fields[0] ?? "").replace(/^\n+/, "");
    index += GRAPH_LOG_FIELD_COUNT;

    // `git log -z` inserts one additional NUL between formatted records.
    // Consume that separator by position instead of searching for `\0\0`:
    // an empty legitimate field (for example a root commit's parent list)
    // also creates adjacent NUL bytes.
    if (tokens[index] === "") {
      index += 1;
    }

    const [
      hash = "",
      parents = "",
      author = "",
      authorEmail = "",
      authorDate = "",
      committerDate = "",
      subject = "",
    ] = fields;
    if (!isPlausibleHash(hash)) {
      continue;
    }
    commits.push({
      hash,
      parents: parents.split(" ").filter(isPlausibleHash),
      author,
      authorEmail,
      authorDate,
      committerDate,
      subject,
      refs: [],
    });
  }

  return commits;
}

function parseLegacyGraphLog(stdout: string): GraphCommit[] {
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): GraphCommit | null => {
      const [
        hash = "",
        parents = "",
        author = "",
        authorDate = "",
        decoration = "",
        subject = "",
      ] = line.split(LEGACY_FIELD);
      if (!hash) {
        return null;
      }
      return {
        hash,
        parents: parents.split(" ").filter(Boolean),
        author,
        authorEmail: "",
        authorDate,
        committerDate: authorDate,
        subject,
        refs: parseRefDecoration(decoration),
      };
    })
    .filter((commit): commit is GraphCommit => commit !== null);
}

/**
 * Parse graph log output.
 *
 * The primary format uses NUL-delimited fields and records (`git log -z`) so
 * Unicode, commas, tabs, and newlines in ref names or commit subjects never
 * become structural delimiters. The legacy line format remains readable while
 * older desktop and browser runtimes roll forward.
 */
export function parseGraphLog(stdout: string): GraphCommit[] {
  if (!stdout) {
    return [];
  }
  return stdout.includes(NUL)
    ? parseNulGraphLog(stdout)
    : parseLegacyGraphLog(stdout);
}

function refSortRank(ref: GraphRepositoryRef): number {
  switch (ref.type) {
    case "head":
      return 0;
    case "localBranch":
      return 1;
    case "remoteBranch":
      return 2;
    case "tag":
      return 3;
  }
}

/**
 * Parse `git for-each-ref` records formatted as:
 * object hash, peeled hash, full ref name, object type (all NUL-delimited).
 */
export function parseGraphRefs(
  stdout: string,
  args: { head: string | null; headHash: string | null },
): GraphRepositoryRef[] {
  const refs: GraphRepositoryRef[] = [];

  for (const rawLine of stdout.split("\n")) {
    const fields = rawLine.split(NUL);
    if (fields.at(-1) === "") {
      fields.pop();
    }
    if (fields.length !== 4) {
      continue;
    }
    const [objectHash = "", peeledHash = "", fullName = "", objectType = ""] =
      fields;
    const hash = isPlausibleHash(peeledHash) ? peeledHash : objectHash;
    if (!isPlausibleHash(hash)) {
      continue;
    }

    if (fullName.startsWith("refs/heads/")) {
      const name = stripRefPrefix(fullName);
      refs.push({
        hash,
        revision: fullName,
        type: "localBranch",
        name,
        isHead: name === args.head,
      });
      continue;
    }
    if (fullName.startsWith("refs/remotes/")) {
      const name = stripRefPrefix(fullName);
      if (name.endsWith("/HEAD")) {
        continue;
      }
      refs.push({
        hash,
        revision: fullName,
        type: "remoteBranch",
        name,
        remote: name.split("/")[0] || undefined,
        isHead: false,
      });
      continue;
    }
    if (fullName.startsWith("refs/tags/")) {
      refs.push({
        hash,
        revision: fullName,
        type: "tag",
        name: stripRefPrefix(fullName),
        annotated: objectType === "tag" || Boolean(peeledHash),
        isHead: false,
      });
    }
  }

  if (
    args.head === null &&
    args.headHash &&
    !refs.some((ref) => ref.type === "head" && ref.hash === args.headHash)
  ) {
    refs.push({
      hash: args.headHash,
      revision: "HEAD",
      type: "head",
      name: "HEAD",
      isHead: true,
    });
  }

  return refs.sort(
    (a, b) =>
      refSortRank(a) - refSortRank(b) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

export function attachGraphRefs(
  commits: GraphCommit[],
  repositoryRefs: GraphRepositoryRef[],
): GraphCommit[] {
  const refsByHash = new Map<string, GraphRef[]>();
  for (const { hash, ...ref } of repositoryRefs) {
    const refs = refsByHash.get(hash);
    if (refs) {
      refs.push(ref);
    } else {
      refsByHash.set(hash, [ref]);
    }
  }
  return commits.map((commit) => ({
    ...commit,
    refs: refsByHash.get(commit.hash) ?? [],
  }));
}

const CONFLICT_STATUSES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/** Parse `git status --porcelain=v1 -z` into the compact graph toolbar summary. */
export function parseGraphWorkingTreeStatus(
  stdout: string,
): GraphWorkingTreeSummary {
  const summary: GraphWorkingTreeSummary = {
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
  };
  if (!stdout) {
    return summary;
  }

  const records = stdout.includes(NUL) ? stdout.split(NUL) : stdout.split("\n");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (record.length < 3) {
      continue;
    }
    const status = record.slice(0, 2);
    const [indexStatus = " ", worktreeStatus = " "] = status;
    if (status === "??") {
      summary.untracked += 1;
    } else if (CONFLICT_STATUSES.has(status)) {
      summary.conflicts += 1;
    } else {
      if (indexStatus !== " ") {
        summary.staged += 1;
      }
      if (worktreeStatus !== " ") {
        summary.unstaged += 1;
      }
    }

    if (
      stdout.includes(NUL) &&
      (indexStatus === "R" ||
        indexStatus === "C" ||
        worktreeStatus === "R" ||
        worktreeStatus === "C")
    ) {
      index += 1;
    }
  }
  return summary;
}
