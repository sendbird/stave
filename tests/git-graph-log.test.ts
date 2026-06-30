import { describe, expect, it } from "bun:test";
import { parseGraphLog, parseRefDecoration } from "@/lib/git-graph/graph-log";

const US = "\x1f";
function row(parts: string[]) {
  return parts.join(US);
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
      { type: "localBranch", name: "main", isHead: true },
      { type: "remoteBranch", name: "origin/main", isHead: false },
      { type: "tag", name: "v1.0", isHead: false },
    ]);
  });

  it("parses detached HEAD", () => {
    const refs = parseRefDecoration("HEAD, refs/remotes/origin/dev");
    expect(refs[0]).toEqual({ type: "head", name: "HEAD", isHead: true });
    expect(refs[1]).toEqual({
      type: "remoteBranch",
      name: "origin/dev",
      isHead: false,
    });
  });

  it("classifies a slash-containing local branch as local, not remote", () => {
    // Regression: short decoration (`feature/login`) could not be told apart
    // from a remote by the old `includes('/')` heuristic. Full ref paths fix it.
    expect(parseRefDecoration("refs/heads/feature/login")).toEqual([
      { type: "localBranch", name: "feature/login", isHead: false },
    ]);
    expect(parseRefDecoration("HEAD -> refs/heads/feature/login")).toEqual([
      { type: "localBranch", name: "feature/login", isHead: true },
    ]);
  });
});

describe("parseGraphLog", () => {
  it("returns empty array for empty stdout", () => {
    expect(parseGraphLog("")).toEqual([]);
  });

  it("parses a single commit with two parents", () => {
    const stdout = row([
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
      authorDate: "2026-06-30T10:00:00+09:00",
      subject: "Merge feature",
      refs: [{ type: "localBranch", name: "main", isHead: true }],
    });
  });

  it("parses a root commit with no parents and no refs", () => {
    const stdout = row(["root0", "", "A", "2026-01-01T00:00:00Z", "", "init"]);
    const commits = parseGraphLog(stdout);
    expect(commits[0]?.parents).toEqual([]);
    expect(commits[0]?.refs).toEqual([]);
  });

  it("keeps subjects containing the field delimiter-free commas intact", () => {
    const stdout = row([
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
