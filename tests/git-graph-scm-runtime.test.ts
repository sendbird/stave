import { describe, expect, test } from "bun:test";
import {
  buildCheckoutScmBranchArgs,
  getScmCommitDetails,
  getScmCommitDiff,
  getScmCommitFiles,
  getScmGraph,
  listScmBranches,
  type ScmCommandRunner,
} from "../electron/host-service/scm-runtime";

describe("buildCheckoutScmBranchArgs", () => {
  test("tracks remote refs, detaches tags, and attaches local branches", () => {
    expect(
      buildCheckoutScmBranchArgs("refs/remotes/origin/feature/git-graph"),
    ).toEqual([
      "checkout",
      "--track",
      "-b",
      "feature/git-graph",
      "refs/remotes/origin/feature/git-graph",
    ]);
    expect(buildCheckoutScmBranchArgs("refs/tags/v1.0.0")).toEqual([
      "checkout",
      "--detach",
      "refs/tags/v1.0.0",
    ]);
    expect(buildCheckoutScmBranchArgs("refs/heads/main")).toEqual([
      "checkout",
      "main",
    ]);
  });
});

interface CommandCall {
  command: string;
  commandArgs: string[];
  maxOutputChars?: number;
}

function createRunner(
  handle: (call: CommandCall) => Partial<{
    ok: boolean;
    code: number;
    stdout: string;
    stderr: string;
    stdoutTruncated: boolean;
  }>,
) {
  const calls: CommandCall[] = [];
  const runCommand: ScmCommandRunner = async (args) => {
    const call = {
      command: args.command,
      commandArgs: args.commandArgs ?? [],
      maxOutputChars: args.maxOutputChars,
    };
    calls.push(call);
    const result = handle(call);
    const ok = result.ok ?? true;
    return {
      ok,
      code: result.code ?? (ok ? 0 : 1),
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      stdoutTruncated: result.stdoutTruncated,
    };
  };
  return { calls, runCommand };
}

const HEAD_HASH = "a".repeat(40);
const PARENT_HASH = "b".repeat(40);
const OTHER_HASH = "c".repeat(40);

function graphLogRecord(parts: string[]) {
  return `${parts.join("\0")}\0`;
}

function graphRefRecord(parts: string[]) {
  return `${parts.join("\0")}\0\n`;
}

function graphCommandResponse(call: CommandCall) {
  switch (call.commandArgs[0]) {
    case "log":
      return {
        stdout: [
          graphLogRecord([
            HEAD_HASH,
            PARENT_HASH,
            "Ada Lovelace",
            "ada@example.com",
            "2026-07-31T10:00:00+09:00",
            "2026-07-31T10:01:00+09:00",
            "feat: graph snapshot",
          ]),
          graphLogRecord([
            PARENT_HASH,
            "",
            "Grace Hopper",
            "grace@example.com",
            "2026-07-30T10:00:00+09:00",
            "2026-07-30T10:01:00+09:00",
            "chore: root",
          ]),
        ].join("\0"),
      };
    case "for-each-ref":
      return {
        stdout: [
          graphRefRecord([HEAD_HASH, "", "refs/heads/main", "commit"]),
          graphRefRecord([HEAD_HASH, "", "refs/remotes/origin/main", "commit"]),
          graphRefRecord([OTHER_HASH, HEAD_HASH, "refs/tags/v1.0.0", "tag"]),
        ].join(""),
      };
    case "symbolic-ref":
      return { stdout: "main\n" };
    case "rev-parse":
      return { stdout: `${HEAD_HASH}\n` };
    case "status":
      return {
        stdout: [
          "M  staged.ts",
          " M unstaged.ts",
          "?? untracked.ts",
          "UU conflict.ts",
          "",
        ].join("\0"),
      };
    case "worktree":
      return {
        stdout: [
          "worktree /tmp/project",
          `HEAD ${HEAD_HASH}`,
          "branch refs/heads/main",
          "",
        ].join("\n"),
      };
    default:
      throw new Error(`Unexpected command: ${call.commandArgs.join(" ")}`);
  }
}

describe("getScmGraph", () => {
  test("loads a NUL graph snapshot and repository metadata in parallel", async () => {
    const { calls, runCommand } = createRunner(graphCommandResponse);

    const result = await getScmGraph(
      {
        cwd: "/tmp/project",
        limit: 1,
        refs: ["refs/heads/main", "refs/remotes/origin/main"],
      },
      { runCommand },
    );

    expect(calls).toHaveLength(6);
    expect(calls.every((call) => (call.maxOutputChars ?? 0) > 128_000)).toBe(
      true,
    );
    expect(
      calls.find((call) => call.commandArgs[0] === "log")?.commandArgs,
    ).toEqual(
      expect.arrayContaining([
        "refs/heads/main",
        "refs/remotes/origin/main",
        "-n",
        "2",
        "-z",
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.head).toBe("main");
    expect(result.headHash).toBe(HEAD_HASH);
    expect(result.hasMore).toBe(true);
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0]).toMatchObject({
      hash: HEAD_HASH,
      authorEmail: "ada@example.com",
      committerDate: "2026-07-31T10:01:00+09:00",
      refs: [
        {
          type: "localBranch",
          name: "main",
          isHead: true,
        },
        {
          type: "remoteBranch",
          name: "origin/main",
          remote: "origin",
          isHead: false,
        },
        {
          type: "tag",
          name: "v1.0.0",
          annotated: true,
          isHead: false,
        },
      ],
    });
    expect(result.availableRefs).toHaveLength(3);
    expect(result.workingTree).toEqual({
      staged: 1,
      unstaged: 1,
      untracked: 1,
      conflicts: 1,
    });
    expect(result.workingTreeAvailable).toBe(true);
    expect(result.worktreePathByBranch).toEqual({
      main: "/tmp/project",
    });
    expect(result.worktreePathsAvailable).toBe(true);
  });

  test("skips mutable repository state when loading another history page", async () => {
    const { calls, runCommand } = createRunner(graphCommandResponse);

    const result = await getScmGraph(
      {
        cwd: "/tmp/project",
        limit: 1,
        skip: 300,
        includeRepositoryState: false,
      },
      { runCommand },
    );

    expect(calls.map((call) => call.commandArgs[0])).toEqual([
      "log",
      "for-each-ref",
    ]);
    expect(result.ok).toBe(true);
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0]?.refs).toHaveLength(3);
    expect(result.head).toBeNull();
    expect(result.headHash).toBeNull();
    expect(result.workingTreeAvailable).toBe(false);
    expect(result.worktreePathsAvailable).toBe(false);
  });

  test("rejects option-like and control-character refs before spawning git", async () => {
    const { calls, runCommand } = createRunner(() => {
      throw new Error("git must not run");
    });

    const optionResult = await getScmGraph(
      { refs: ["--output=/tmp/log"] },
      { runCommand },
    );
    const controlResult = await getScmGraph(
      { scope: "main\n--all" },
      { runCommand },
    );

    expect(optionResult.ok).toBe(false);
    expect(controlResult.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("fails truncated history but marks oversized optional status unavailable", async () => {
    const truncatedLog = createRunner((call) => ({
      ...graphCommandResponse(call),
      stdoutTruncated: call.commandArgs[0] === "log",
    }));
    const logResult = await getScmGraph(
      { cwd: "/tmp/project", limit: 1 },
      { runCommand: truncatedLog.runCommand },
    );

    const truncatedStatus = createRunner((call) => ({
      ...graphCommandResponse(call),
      stdoutTruncated: call.commandArgs[0] === "status",
    }));
    const statusResult = await getScmGraph(
      { cwd: "/tmp/project", limit: 1 },
      { runCommand: truncatedStatus.runCommand },
    );

    expect(logResult.ok).toBe(false);
    expect(logResult.stderr).toContain("history page");
    expect(statusResult.ok).toBe(true);
    expect(statusResult.workingTreeAvailable).toBe(false);
    expect(statusResult.stderr).toContain("Working tree summary omitted");
  });
});

describe("listScmBranches", () => {
  function branchResponse(call: CommandCall) {
    if (call.commandArgs[0] === "fetch") {
      return {};
    }
    if (call.commandArgs[0] === "branch" && call.commandArgs[1] === "-r") {
      return { stdout: "origin/main\n" };
    }
    if (call.commandArgs[0] === "branch") {
      return { stdout: "main|\n" };
    }
    if (call.commandArgs[0] === "rev-parse") {
      return { stdout: "main\n" };
    }
    if (call.commandArgs[0] === "worktree") {
      return {
        stdout: [
          "worktree /tmp/project",
          `HEAD ${HEAD_HASH}`,
          "branch refs/heads/main",
          "",
        ].join("\n"),
      };
    }
    throw new Error(`Unexpected command: ${call.commandArgs.join(" ")}`);
  }

  test("does not contact or prune remotes for a read-only branch listing", async () => {
    const { calls, runCommand } = createRunner(branchResponse);

    const result = await listScmBranches(
      { cwd: "/tmp/project" },
      { runCommand },
    );

    expect(result.ok).toBe(true);
    expect(
      calls.some((call) =>
        ["fetch", "remote"].includes(call.commandArgs[0] ?? ""),
      ),
    ).toBe(false);
  });

  test("fetches and prunes only when refreshRemote is explicitly requested", async () => {
    const { calls, runCommand } = createRunner(branchResponse);

    const result = await listScmBranches(
      { cwd: "/tmp/project", refreshRemote: true },
      { runCommand },
    );

    expect(result.ok).toBe(true);
    expect(calls[0]?.commandArgs).toEqual(["fetch", "--all", "--prune"]);
  });
});

describe("commit detail runtime", () => {
  const metadata = [
    HEAD_HASH,
    PARENT_HASH,
    "feat: inspect commit",
    "Detailed body\n",
    "Ada Lovelace",
    "ada@example.com",
    "2026-07-31T10:00:00+09:00",
    "Grace Hopper",
    "grace@example.com",
    "2026-07-31T10:01:00+09:00",
    "N",
    "",
    "",
    "",
  ].join("\0");
  const nameStatus = [
    "R100",
    "src/old.ts",
    "src/new.ts",
    "M",
    "src/changed.ts",
    "A",
    "assets/image.png",
    "",
  ].join("\0");
  const numstat = [
    "3\t1\t",
    "src/old.ts",
    "src/new.ts",
    "5\t2\tsrc/changed.ts",
    "-\t-\tassets/image.png",
    "",
  ].join("\0");

  function detailResponse(call: CommandCall) {
    if (call.commandArgs[0] === "show") {
      return { stdout: metadata };
    }
    if (call.commandArgs.includes("--name-status")) {
      return { stdout: nameStatus };
    }
    if (call.commandArgs.includes("--numstat")) {
      return { stdout: numstat };
    }
    throw new Error(`Unexpected command: ${call.commandArgs.join(" ")}`);
  }

  test("loads metadata, rename-safe paths, and numstat together", async () => {
    const { calls, runCommand } = createRunner(detailResponse);

    const result = await getScmCommitDetails(
      { cwd: "/tmp/project", hash: HEAD_HASH },
      { runCommand },
    );

    expect(calls).toHaveLength(3);
    const fileCalls = calls.filter(
      (call) =>
        call.commandArgs.includes("--name-status") ||
        call.commandArgs.includes("--numstat"),
    );
    expect(
      fileCalls.every(
        (call) =>
          call.commandArgs.includes("--diff-merges=first-parent") &&
          call.commandArgs.includes("--root") &&
          call.commandArgs.includes("--no-commit-id") &&
          call.commandArgs.includes("-M") &&
          call.commandArgs.includes("-C") &&
          call.commandArgs.includes("-z") &&
          !call.commandArgs.includes("-m"),
      ),
    ).toBe(true);
    expect(
      calls
        .find((call) => call.commandArgs[0] === "show")
        ?.commandArgs.includes("--no-patch"),
    ).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.details).toMatchObject({
      hash: HEAD_HASH,
      body: "Detailed body",
      authorEmail: "ada@example.com",
      committer: "Grace Hopper",
      files: [
        {
          status: "R",
          oldPath: "src/old.ts",
          path: "src/new.ts",
          additions: 3,
          deletions: 1,
        },
        {
          status: "M",
          path: "src/changed.ts",
          additions: 5,
          deletions: 2,
        },
        {
          status: "A",
          path: "assets/image.png",
          additions: null,
          deletions: null,
        },
      ],
    });
  });

  test("keeps the legacy commit-files endpoint symmetric with detail files", async () => {
    const { calls, runCommand } = createRunner(detailResponse);

    const result = await getScmCommitFiles(
      { cwd: "/tmp/project", hash: HEAD_HASH },
      { runCommand },
    );

    expect(calls).toHaveLength(2);
    expect(result.ok).toBe(true);
    expect(result.files[0]).toEqual({
      status: "R",
      oldPath: "src/old.ts",
      path: "src/new.ts",
      additions: 3,
      deletions: 1,
    });
  });

  test("rejects a truncated detail stream before parsing it", async () => {
    const { calls, runCommand } = createRunner((call) => ({
      ...detailResponse(call),
      stdoutTruncated: call.commandArgs.includes("--numstat"),
    }));

    const result = await getScmCommitDetails(
      { cwd: "/tmp/project", hash: HEAD_HASH },
      { runCommand },
    );

    expect(calls).toHaveLength(3);
    expect(result).toEqual({
      ok: false,
      details: null,
      stderr:
        "Commit details are too large to load safely. Inspect this commit with Git directly.",
    });
  });

  test("rejects non-hash revisions before spawning git", async () => {
    const { calls, runCommand } = createRunner(() => {
      throw new Error("git must not run");
    });

    const result = await getScmCommitDetails({ hash: "--all" }, { runCommand });

    expect(result).toEqual({
      ok: false,
      details: null,
      stderr: "A valid commit hash is required.",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("commit diff runtime", () => {
  test("accepts added or deleted files when one side of the diff exists", async () => {
    const { calls, runCommand } = createRunner((call) =>
      call.commandArgs[1]?.startsWith(`${HEAD_HASH}^:`)
        ? { ok: false, stderr: "missing in parent" }
        : { stdout: "new content" },
    );

    const result = await getScmCommitDiff(
      { cwd: "/tmp/project", hash: HEAD_HASH, path: "src/new.ts" },
      { runCommand },
    );

    expect(calls).toHaveLength(2);
    expect(result).toEqual({
      ok: true,
      oldContent: "",
      newContent: "new content",
      stderr: "",
    });
  });

  test("rejects missing revisions and truncated file content", async () => {
    const missing = createRunner(() => ({
      ok: false,
      stderr: "unknown revision",
    }));
    const missingResult = await getScmCommitDiff(
      { hash: HEAD_HASH, path: "missing.ts" },
      { runCommand: missing.runCommand },
    );

    const truncated = createRunner(() => ({
      stdout: "tail only",
      stdoutTruncated: true,
    }));
    const truncatedResult = await getScmCommitDiff(
      { hash: HEAD_HASH, path: "large.ts" },
      { runCommand: truncated.runCommand },
    );

    expect(missingResult.ok).toBe(false);
    expect(missingResult.oldContent).toBe("");
    expect(missingResult.newContent).toBe("");
    expect(truncatedResult).toMatchObject({
      ok: false,
      oldContent: "",
      newContent: "",
    });
    expect(truncatedResult.stderr).toContain("too large");
  });
});
