import { describe, expect, it } from "bun:test";
import {
  attachGraphRefs,
  parseGraphLog,
  parseGraphRefs,
  parseGraphWorkingTreeStatus,
  parseRefDecoration,
} from "@/lib/git-graph/graph-log";

const US = "\x1f";
const NUL = "\0";

function legacyRow(parts: string[]) {
  return parts.join(US);
}

function nulLogRecord(parts: string[]) {
  return `${parts.join(NUL)}${NUL}${NUL}`;
}

function refRecord(parts: string[]) {
  return `${parts.join(NUL)}${NUL}\n`;
}

describe("parseRefDecoration", () => {
  it("returns empty array for empty decoration", () => {
    expect(parseRefDecoration("")).toEqual([]);
  });

  it("parses HEAD pointer, remote, and tag from full ref paths", () => {
    const refs = parseRefDecoration(
      "HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1.0",
    );
    expect(refs).toEqual([
      {
        type: "localBranch",
        name: "main",
        revision: "refs/heads/main",
        isHead: true,
      },
      {
        type: "remoteBranch",
        name: "origin/main",
        revision: "refs/remotes/origin/main",
        remote: "origin",
        isHead: false,
      },
      {
        type: "tag",
        name: "v1.0",
        revision: "refs/tags/v1.0",
        isHead: false,
      },
    ]);
  });

  it("parses detached HEAD", () => {
    const refs = parseRefDecoration("HEAD, refs/remotes/origin/dev");
    expect(refs[0]).toEqual({
      type: "head",
      name: "HEAD",
      revision: "HEAD",
      isHead: true,
    });
    expect(refs[1]).toEqual({
      type: "remoteBranch",
      name: "origin/dev",
      revision: "refs/remotes/origin/dev",
      remote: "origin",
      isHead: false,
    });
  });

  it("classifies a slash-containing local branch as local, not remote", () => {
    // Regression: short decoration (`feature/login`) could not be told apart
    // from a remote by the old `includes('/')` heuristic. Full ref paths fix it.
    expect(parseRefDecoration("refs/heads/feature/login")).toEqual([
      {
        type: "localBranch",
        name: "feature/login",
        revision: "refs/heads/feature/login",
        isHead: false,
      },
    ]);
    expect(parseRefDecoration("HEAD -> refs/heads/feature/login")).toEqual([
      {
        type: "localBranch",
        name: "feature/login",
        revision: "refs/heads/feature/login",
        isHead: true,
      },
    ]);
  });
});

describe("parseGraphLog", () => {
  it("returns empty array for empty stdout", () => {
    expect(parseGraphLog("")).toEqual([]);
  });

  it("parses NUL-delimited log records without treating text as structure", () => {
    const stdout = [
      nulLogRecord([
        "aaa1111aaa1111",
        "bbb2222bbb2222 ccc3333ccc3333",
        "Jane Dev",
        "jane@example.com",
        "2026-06-30T10:00:00+09:00",
        "2026-06-30T10:01:00+09:00",
        "fix: keep commas, tabs\tand 한글 intact",
      ]),
      nulLogRecord([
        "ddd4444ddd4444",
        "",
        "Root Author",
        "root@example.com",
        "2026-01-01T00:00:00Z",
        "2026-01-01T00:00:01Z",
        "initial commit",
      ]),
    ].join("\n");

    expect(parseGraphLog(stdout)).toEqual([
      {
        hash: "aaa1111aaa1111",
        parents: ["bbb2222bbb2222", "ccc3333ccc3333"],
        author: "Jane Dev",
        authorEmail: "jane@example.com",
        authorDate: "2026-06-30T10:00:00+09:00",
        committerDate: "2026-06-30T10:01:00+09:00",
        subject: "fix: keep commas, tabs\tand 한글 intact",
        refs: [],
      },
      {
        hash: "ddd4444ddd4444",
        parents: [],
        author: "Root Author",
        authorEmail: "root@example.com",
        authorDate: "2026-01-01T00:00:00Z",
        committerDate: "2026-01-01T00:00:01Z",
        subject: "initial commit",
        refs: [],
      },
    ]);
  });

  it("parses a single commit with two parents", () => {
    const stdout = legacyRow([
      "aaa111",
      "bbb222 ccc333",
      "Jane Dev",
      "2026-06-30T10:00:00+09:00",
      "HEAD -> refs/heads/main",
      "Merge feature",
    ]);
    const commits = parseGraphLog(stdout);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toEqual({
      hash: "aaa111",
      parents: ["bbb222", "ccc333"],
      author: "Jane Dev",
      authorEmail: "",
      authorDate: "2026-06-30T10:00:00+09:00",
      committerDate: "2026-06-30T10:00:00+09:00",
      subject: "Merge feature",
      refs: [
        {
          type: "localBranch",
          name: "main",
          revision: "refs/heads/main",
          isHead: true,
        },
      ],
    });
  });

  it("parses a root commit with no parents and no refs", () => {
    const stdout = legacyRow([
      "root0",
      "",
      "A",
      "2026-01-01T00:00:00Z",
      "",
      "init",
    ]);
    const commits = parseGraphLog(stdout);
    expect(commits[0]?.parents).toEqual([]);
    expect(commits[0]?.refs).toEqual([]);
  });

  it("keeps subjects containing the field delimiter-free commas intact", () => {
    const stdout = legacyRow([
      "h1",
      "p1",
      "A",
      "2026-01-01T00:00:00Z",
      "",
      "fix: a, b, c",
    ]);
    expect(parseGraphLog(stdout)[0]?.subject).toBe("fix: a, b, c");
  });
});

describe("parseGraphRefs", () => {
  it("preserves commas in independently queried branch names", () => {
    const localHash = "aaa1111aaa1111";
    const remoteHash = "bbb2222bbb2222";
    const refs = parseGraphRefs(
      refRecord([localHash, "", "refs/heads/release,2026", "commit"]) +
        refRecord([
          remoteHash,
          "",
          "refs/remotes/origin/release,2026",
          "commit",
        ]),
      { head: "release,2026", headHash: localHash },
    );

    expect(refs).toEqual([
      {
        hash: localHash,
        revision: "refs/heads/release,2026",
        type: "localBranch",
        name: "release,2026",
        isHead: true,
      },
      {
        hash: remoteHash,
        revision: "refs/remotes/origin/release,2026",
        type: "remoteBranch",
        name: "origin/release,2026",
        remote: "origin",
        isHead: false,
      },
    ]);
  });

  it("peels annotated tags while retaining lightweight tag targets", () => {
    const annotatedObjectHash = "aaa1111aaa1111";
    const annotatedCommitHash = "bbb2222bbb2222";
    const lightweightCommitHash = "ccc3333ccc3333";
    const refs = parseGraphRefs(
      refRecord([
        annotatedObjectHash,
        annotatedCommitHash,
        "refs/tags/v1.0.0",
        "tag",
      ]) + refRecord([lightweightCommitHash, "", "refs/tags/v2.0.0", "commit"]),
      { head: null, headHash: null },
    );

    expect(refs).toEqual([
      {
        hash: annotatedCommitHash,
        revision: "refs/tags/v1.0.0",
        type: "tag",
        name: "v1.0.0",
        annotated: true,
        isHead: false,
      },
      {
        hash: lightweightCommitHash,
        revision: "refs/tags/v2.0.0",
        type: "tag",
        name: "v2.0.0",
        annotated: false,
        isHead: false,
      },
    ]);
  });

  it("adds a synthetic HEAD ref when the repository is detached", () => {
    const detachedHash = "aaa1111aaa1111";
    const refs = parseGraphRefs(
      refRecord([detachedHash, "", "refs/heads/main", "commit"]),
      { head: null, headHash: detachedHash },
    );

    expect(refs).toEqual([
      {
        hash: detachedHash,
        revision: "HEAD",
        type: "head",
        name: "HEAD",
        isHead: true,
      },
      {
        hash: detachedHash,
        revision: "refs/heads/main",
        type: "localBranch",
        name: "main",
        isHead: false,
      },
    ]);
  });

  it("attaches independently parsed refs to their commit", () => {
    const hash = "aaa1111aaa1111";
    const [commit] = parseGraphLog(
      nulLogRecord([
        hash,
        "",
        "A",
        "a@example.com",
        "2026-01-01T00:00:00Z",
        "2026-01-01T00:00:00Z",
        "subject",
      ]),
    );
    const refs = parseGraphRefs(
      refRecord([hash, "", "refs/heads/topic,one", "commit"]),
      { head: "topic,one", headHash: hash },
    );

    expect(attachGraphRefs([commit!], refs)[0]?.refs).toEqual([
      {
        type: "localBranch",
        name: "topic,one",
        revision: "refs/heads/topic,one",
        isHead: true,
      },
    ]);
  });
});

describe("parseGraphWorkingTreeStatus", () => {
  it("returns a zero summary for empty porcelain output", () => {
    expect(parseGraphWorkingTreeStatus("")).toEqual({
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicts: 0,
    });
  });

  it("counts porcelain -z renames and conflicts without reading rename paths as records", () => {
    const stdout = [
      "R  src/new-name.ts",
      "src/old-name.ts",
      "UU src/conflicted.ts",
      "?? src/untracked.ts",
      " M src/modified.ts",
      "A  src/staged.ts",
      "",
    ].join(NUL);

    expect(parseGraphWorkingTreeStatus(stdout)).toEqual({
      staged: 2,
      unstaged: 1,
      untracked: 1,
      conflicts: 1,
    });
  });

  it("counts staged and unstaged changes separately for one MM file", () => {
    expect(parseGraphWorkingTreeStatus("MM src/both.ts\0")).toEqual({
      staged: 1,
      unstaged: 1,
      untracked: 0,
      conflicts: 0,
    });
  });
});
