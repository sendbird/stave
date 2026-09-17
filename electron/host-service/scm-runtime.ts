import { promises as fs } from "node:fs";
import {
  attachGraphRefs,
  parseGraphLog,
  parseGraphRefs,
  parseGraphWorkingTreeStatus,
} from "../../src/lib/git-graph/graph-log";
import {
  buildGraphCommitDetails,
  mergeGraphFileChanges,
  parseGraphNameStatus,
  parseGraphNumstat,
} from "../../src/lib/git-graph/commit-details";
import type {
  GraphCommitDetailsResult,
  GraphFileChange,
  GraphResult,
} from "../../src/lib/git-graph/types";
import { parseWorktreePathByBranch } from "../../src/lib/source-control-worktrees";
import type {
  ConcretePrMergeMethod,
  GitHubPrPayload,
  PrMergeMethod,
} from "../../src/lib/pr-status";
import type { DetachedCheckoutResult } from "../main/types";
import {
  buildSourceControlDiffPreview,
  resolveSourceControlDiffPaths,
} from "../../src/lib/source-control-diff";
import {
  hasConflictItems,
  parseStatusLines,
  resolveCommandCwd,
  runCommandArgs,
} from "../main/utils/command";
import { resolveRootFilePath } from "../main/utils/filesystem";
import { ensureGhAuth, invalidateGhAuthCache } from "./gh-auth";

const GIT_STATUS_PORCELAIN_ALL_UNTRACKED_ARGS = [
  "status",
  "--porcelain",
  "--untracked-files=all",
  // NUL-delimited so paths with spaces or non-ASCII bytes arrive verbatim
  // instead of the quoted/escaped display form.
  "-z",
];

const GITHUB_PR_JSON_FIELDS = [
  "number",
  "title",
  "state",
  "isDraft",
  "url",
  "reviewDecision",
  "mergeable",
  "mergeStateStatus",
  "statusCheckRollup",
  "mergedAt",
  "baseRefName",
  "headRefName",
  // Head commit, so an attached PR-context excerpt can tell when the PR moved
  // under it (`src/lib/pr-context.ts#isPrContextAttachmentStale`).
  "headRefOid",
].join(",");

function invalidateCachedGhAuthOnFailure(
  result: { ok: boolean; stdout?: string; stderr?: string },
  cwd?: string,
) {
  if (result.ok) {
    return;
  }
  const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (
    /authentication failed|not logged into|gh auth login|not authenticated/i.test(
      detail,
    )
  ) {
    invalidateGhAuthCache({ cwd });
  }
}

function describeGhAuthFailure(result: { stdout?: string; stderr?: string }) {
  const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (/spawn gh ENOENT|command not found|not recognized/i.test(detail)) {
    return "GitHub CLI is not installed. Install `gh` first.";
  }
  return "GitHub CLI is not authenticated. Run `gh auth login` first.";
}

async function readGitHeadFile(args: { cwd?: string; filePath: string }) {
  const result = await runCommandArgs({
    command: "git",
    commandArgs: ["show", `HEAD:${args.filePath}`],
    cwd: args.cwd,
  });
  return result.ok ? result.stdout : "";
}

async function readWorkingTreeFile(args: { cwd?: string; filePath: string }) {
  const cwd = resolveCommandCwd({ cwd: args.cwd });
  const absolutePath = resolveRootFilePath({
    rootPath: cwd,
    filePath: args.filePath,
  });
  if (!absolutePath) {
    return "";
  }

  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    return "";
  }
}

export async function discardSourceControlPath(args: {
  cwd?: string;
  path: string;
}) {
  const paths = resolveSourceControlDiffPaths({ rawPath: args.path });
  const restoreResult = await runCommandArgs({
    command: "git",
    commandArgs: ["restore", "--", ...paths.pathspecs],
    cwd: args.cwd,
  });

  if (restoreResult.ok) {
    return restoreResult;
  }

  const cleanResult = await runCommandArgs({
    command: "git",
    commandArgs: ["clean", "-f", "--", ...paths.pathspecs],
    cwd: args.cwd,
  });
  if (cleanResult.ok) {
    return cleanResult;
  }

  return {
    ok: false,
    code: cleanResult.code,
    stdout: [restoreResult.stdout, cleanResult.stdout]
      .filter(Boolean)
      .join("\n"),
    stderr: [restoreResult.stderr, cleanResult.stderr]
      .filter(Boolean)
      .join("\n")
      .trim(),
  };
}

type ScmCommandRunner = typeof runCommandArgs;

function parseGitHubPrPayload(raw: Record<string, unknown>): GitHubPrPayload {
  let checksRollup: "SUCCESS" | "FAILURE" | "PENDING" | null = null;
  const checks: unknown[] = Array.isArray(raw.statusCheckRollup)
    ? raw.statusCheckRollup
    : [];
  if (checks.length > 0) {
    const latestCheckRunByName = new Map<string, Record<string, unknown>>();
    const nonCheckRuns: Array<Record<string, unknown>> = [];
    for (const check of checks as Array<Record<string, unknown>>) {
      if (
        check.__typename === "CheckRun" &&
        typeof check.name === "string" &&
        check.name
      ) {
        const existing = latestCheckRunByName.get(check.name);
        if (!existing) {
          latestCheckRunByName.set(check.name, check);
        } else {
          const existingTime =
            typeof existing.startedAt === "string"
              ? new Date(existing.startedAt).getTime()
              : 0;
          const currentTime =
            typeof check.startedAt === "string"
              ? new Date(check.startedAt).getTime()
              : 0;
          if (currentTime > existingTime) {
            latestCheckRunByName.set(check.name, check);
          }
        }
      } else {
        nonCheckRuns.push(check);
      }
    }
    const dedupedChecks = [...latestCheckRunByName.values(), ...nonCheckRuns];

    const hasFailure = dedupedChecks.some((check) => {
      if (check.__typename === "CheckRun") {
        return (
          check.conclusion === "FAILURE" ||
          check.conclusion === "CANCELLED" ||
          check.conclusion === "TIMED_OUT" ||
          check.conclusion === "ACTION_REQUIRED"
        );
      }
      if (check.__typename === "StatusContext") {
        return check.state === "FAILURE" || check.state === "ERROR";
      }
      return false;
    });
    if (hasFailure) {
      checksRollup = "FAILURE";
    } else {
      const hasPending = dedupedChecks.some((check) => {
        if (check.__typename === "CheckRun") {
          return check.status !== "COMPLETED";
        }
        if (check.__typename === "StatusContext") {
          return check.state === "PENDING" || check.state === "EXPECTED";
        }
        return false;
      });
      checksRollup = hasPending ? "PENDING" : "SUCCESS";
    }
  }

  const payload: GitHubPrPayload = {
    number: typeof raw.number === "number" ? raw.number : 0,
    title: typeof raw.title === "string" ? raw.title : "",
    state: (raw.state as GitHubPrPayload["state"] | undefined) ?? "OPEN",
    isDraft: Boolean(raw.isDraft),
    url: typeof raw.url === "string" ? raw.url : "",
    reviewDecision:
      (raw.reviewDecision as GitHubPrPayload["reviewDecision"] | undefined) ??
      null,
    mergeable:
      (raw.mergeable as GitHubPrPayload["mergeable"] | undefined) ?? "UNKNOWN",
    mergeStateStatus:
      (raw.mergeStateStatus as GitHubPrPayload["mergeStateStatus"] | undefined) ??
      "UNKNOWN",
    checksRollup,
    mergedAt: typeof raw.mergedAt === "string" ? raw.mergedAt : null,
    baseRefName: typeof raw.baseRefName === "string" ? raw.baseRefName : "",
    headRefName: typeof raw.headRefName === "string" ? raw.headRefName : "",
    headRefOid:
      typeof raw.headRefOid === "string" && raw.headRefOid
        ? raw.headRefOid
        : null,
  };
  return payload;
}

async function resolveCurrentScmBranch(args: {
  cwd?: string;
  runCommand?: ScmCommandRunner;
}) {
  const result = await (args.runCommand ?? runCommandArgs)({
    command: "git",
    commandArgs: ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd: args.cwd,
  });
  const branch = result.ok ? result.stdout.trim() : "";
  return branch && branch !== "HEAD" ? branch : null;
}

/**
 * `gh pr view` without a number resolves the most recent PR for the branch
 * across every state, so a branch name reused after a merge keeps reporting
 * the old merged PR. When local HEAD has commits the terminal PR never saw,
 * the branch has moved on and the PR no longer describes this workspace.
 */
export function isTerminalPullRequestSuperseded(ancestorCheck: {
  ok: boolean;
  code: number;
}) {
  if (ancestorCheck.ok) {
    return false;
  }
  // Exit 1 = HEAD is not an ancestor of the PR head. Any other exit (unknown
  // object, not a repository) is inconclusive, so keep the PR.
  return ancestorCheck.code === 1;
}

export async function fetchGitHubPrStatus(args: {
  cwd?: string;
  target?: string;
  runCommand?: ScmCommandRunner;
}) {
  const run = args.runCommand ?? runCommandArgs;
  const authResult = await ensureGhAuth({
    cwd: args.cwd,
    runCommand: args.runCommand,
  });
  if (!authResult.ok) {
    return {
      ok: false,
      pr: null,
      stderr: describeGhAuthFailure(authResult),
    };
  }

  if (!args.target) {
    // Prefer the open PR for this branch; the state-agnostic `gh pr view`
    // lookup below is only a fallback for merged/closed history.
    const branch = await resolveCurrentScmBranch({
      cwd: args.cwd,
      runCommand: args.runCommand,
    });
    if (branch) {
      const listResult = await run({
        command: "gh",
        commandArgs: [
          "pr",
          "list",
          "--head",
          branch,
          "--state",
          "open",
          "--limit",
          "1",
          "--json",
          GITHUB_PR_JSON_FIELDS,
        ],
        cwd: args.cwd,
      });
      invalidateCachedGhAuthOnFailure(listResult, args.cwd);
      if (listResult.ok) {
        try {
          const items = JSON.parse(listResult.stdout);
          const first = Array.isArray(items) ? items[0] : null;
          if (first && typeof first === "object") {
            return {
              ok: true,
              pr: parseGitHubPrPayload(first as Record<string, unknown>),
              stderr: "",
            };
          }
        } catch {
          // Fall through to `gh pr view`.
        }
      }
    }
  }

  const commandArgs = ["pr", "view"];
  if (args.target) {
    commandArgs.push(args.target);
  }
  commandArgs.push("--json", GITHUB_PR_JSON_FIELDS);

  const result = await run({
    command: "gh",
    commandArgs,
    cwd: args.cwd,
  });
  invalidateCachedGhAuthOnFailure(result, args.cwd);

  if (!result.ok) {
    const noPr =
      result.stderr.includes("no pull requests found") ||
      result.stderr.includes("Could not resolve") ||
      result.stderr.includes("no open pull requests");
    if (noPr) {
      return { ok: true, pr: null, stderr: "" };
    }
    return { ok: false, pr: null, stderr: result.stderr };
  }

  let pr: ReturnType<typeof parseGitHubPrPayload>;
  try {
    pr = parseGitHubPrPayload(JSON.parse(result.stdout));
  } catch {
    return { ok: false, pr: null, stderr: "Failed to parse PR status JSON." };
  }

  if (!args.target && pr.state !== "OPEN" && pr.headRefOid) {
    const ancestorCheck = await run({
      command: "git",
      commandArgs: ["merge-base", "--is-ancestor", "HEAD", pr.headRefOid],
      cwd: args.cwd,
    });
    if (isTerminalPullRequestSuperseded(ancestorCheck)) {
      return { ok: true, pr: null, stderr: "" };
    }
  }

  return { ok: true, pr, stderr: "" };
}

export async function getScmStatus(args: { cwd?: string }) {
  const statusResult = await runCommandArgs({
    command: "git",
    commandArgs: GIT_STATUS_PORCELAIN_ALL_UNTRACKED_ARGS,
    cwd: args.cwd,
  });
  const branchResult = await runCommandArgs({
    command: "git",
    commandArgs: ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd: args.cwd,
  });
  const items = statusResult.ok
    ? parseStatusLines({ stdout: statusResult.stdout })
    : [];
  return {
    ok: statusResult.ok && branchResult.ok,
    branch: branchResult.ok ? branchResult.stdout.trim() : "unknown",
    items,
    hasConflicts: hasConflictItems({ items }),
    stderr: [statusResult.stderr, branchResult.stderr]
      .filter(Boolean)
      .join("\n")
      .trim(),
  };
}

export function stageAllSourceControl(args: { cwd?: string }) {
  return runCommandArgs({
    command: "git",
    commandArgs: ["add", "-A"],
    cwd: args.cwd,
  });
}

/**
 * Attempt to auto-fix lint errors on staged files.
 * Runs `eslint --fix` and `prettier --write` on lintable staged files,
 * then re-stages the results. Returns whether a fix was attempted and
 * whether any remaining errors persist.
 */
export async function tryAutoFixLintErrors(args: {
  cwd?: string;
  paths?: string[];
}) {
  let files = [
    ...new Set(args.paths?.map((path) => path.trim()).filter(Boolean) ?? []),
  ];
  if (files.length === 0) {
    const stagedResult = await runCommandArgs({
      command: "git",
      commandArgs: ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
      cwd: args.cwd,
    });
    if (!stagedResult.ok || !stagedResult.stdout.trim()) {
      return {
        ok: false,
        fixAttempted: false,
        stderr: "No staged files to fix.",
      };
    }
    files = stagedResult.stdout.trim().split("\n").filter(Boolean);
  }

  if (files.length === 0) {
    return {
      ok: false,
      fixAttempted: false,
      stderr: "No staged files to fix.",
    };
  }

  const lintableFiles = files.filter((f) =>
    /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte)$/.test(f),
  );
  if (lintableFiles.length === 0) {
    return {
      ok: false,
      fixAttempted: false,
      stderr: "No lintable staged files.",
    };
  }

  // Try eslint --fix (best-effort; ignore exit code since unfixable errors remain)
  const eslintResult = await runCommandArgs({
    command: "bunx",
    commandArgs: ["--bun", "eslint", "--fix", ...lintableFiles],
    cwd: args.cwd,
  });

  // Try prettier --write (best-effort)
  const prettierResult = await runCommandArgs({
    command: "bunx",
    commandArgs: ["--bun", "prettier", "--write", ...lintableFiles],
    cwd: args.cwd,
  });

  // Re-stage only the files that were explicitly included in this operation.
  await runCommandArgs({
    command: "git",
    commandArgs: ["add", "--", ...lintableFiles],
    cwd: args.cwd,
  });

  return {
    ok: true,
    fixAttempted: true,
    eslintOk: eslintResult.ok,
    prettierOk: prettierResult.ok,
    stderr: [eslintResult.stderr, prettierResult.stderr]
      .filter(Boolean)
      .join("\n")
      .trim(),
  };
}

export function unstageAllSourceControl(args: { cwd?: string }) {
  return runCommandArgs({
    command: "git",
    commandArgs: ["restore", "--staged", "."],
    cwd: args.cwd,
  });
}

export function commitSourceControl(args: { message: string; cwd?: string }) {
  const message = args.message.trim();
  if (!message) {
    return Promise.resolve({
      ok: false,
      code: -1,
      stdout: "",
      stderr: "Commit message is required.",
    });
  }
  return runCommandArgs({
    command: "git",
    commandArgs: ["commit", "-m", message],
    cwd: args.cwd,
  });
}

export function stageSourceControlFile(args: { path: string; cwd?: string }) {
  const paths = resolveSourceControlDiffPaths({ rawPath: args.path });
  return runCommandArgs({
    command: "git",
    commandArgs: ["add", "--", ...paths.pathspecs],
    cwd: args.cwd,
  });
}

export function stageSourceControlFiles(args: {
  paths: string[];
  cwd?: string;
}) {
  const pathspecs = args.paths.flatMap(
    (path) => resolveSourceControlDiffPaths({ rawPath: path }).pathspecs,
  );
  if (pathspecs.length === 0) {
    return Promise.resolve({
      ok: false,
      code: -1,
      stdout: "",
      stderr: "At least one file path is required.",
    });
  }
  return runCommandArgs({
    command: "git",
    commandArgs: ["add", "--", ...new Set(pathspecs)],
    cwd: args.cwd,
  });
}

export function unstageSourceControlFile(args: { path: string; cwd?: string }) {
  const paths = resolveSourceControlDiffPaths({ rawPath: args.path });
  return runCommandArgs({
    command: "git",
    commandArgs: ["restore", "--staged", "--", ...paths.pathspecs],
    cwd: args.cwd,
  });
}

export async function diffSourceControlFile(args: {
  path: string;
  cwd?: string;
}) {
  const paths = resolveSourceControlDiffPaths({ rawPath: args.path });
  const [staged, unstaged, oldContent, newContent] = await Promise.all([
    runCommandArgs({
      command: "git",
      commandArgs: ["diff", "--cached", "--", ...paths.pathspecs],
      cwd: args.cwd,
    }),
    runCommandArgs({
      command: "git",
      commandArgs: ["diff", "--", ...paths.pathspecs],
      cwd: args.cwd,
    }),
    readGitHeadFile({ cwd: args.cwd, filePath: paths.headPath }),
    readWorkingTreeFile({ cwd: args.cwd, filePath: paths.workingTreePath }),
  ]);
  const content = buildSourceControlDiffPreview({
    stagedPatch: staged.stdout,
    unstagedPatch: unstaged.stdout,
  });

  return {
    ok: unstaged.ok || staged.ok,
    content,
    oldContent,
    newContent,
    stderr: [staged.stderr, unstaged.stderr].filter(Boolean).join("\n").trim(),
  };
}

const GRAPH_LOG_FORMAT = "%H%x00%P%x00%an%x00%ae%x00%aI%x00%cI%x00%s%x00";
const GRAPH_REF_FORMAT =
  "%(objectname)%00%(*objectname)%00%(refname)%00%(objecttype)%00";
// Git pretty-format placeholders, each terminated explicitly so free-form text
// cannot be mistaken for the boundary between metadata fields.
const GRAPH_COMMIT_METADATA_FIELDS = [
  "%H",
  "%P",
  "%s",
  "%b",
  "%an",
  "%ae",
  "%aI",
  "%cn",
  "%ce",
  "%cI",
  "%G?",
  "%GK",
  "%GS",
] as const;
const GRAPH_COMMIT_METADATA_FORMAT = `${GRAPH_COMMIT_METADATA_FIELDS.join("%x00")}%x00`;
const SCM_STRUCTURED_OUTPUT_LIMIT = 512 * 1024;
export const SCM_READ_TIMEOUT_MS = 30_000;
const SCM_COMMIT_DIFF_OUTPUT_LIMIT = 512 * 1024;
const SCM_SERIALIZED_RESULT_LIMIT = 1_500_000;
const GRAPH_REF_CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;
const GRAPH_HASH_PATTERN = /^[0-9a-f]{7,64}$/i;

export type ScmCommandRunner = typeof runCommandArgs;

interface ScmRuntimeDependencies {
  runCommand?: ScmCommandRunner;
}

interface ScmGraphArgs {
  cwd?: string;
  limit?: number;
  skip?: number;
  scope?: "current" | "all" | string;
  refs?: string[];
  includeRepositoryState?: boolean;
}

function emptyGraphWorkingTree() {
  return {
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
  };
}

function failedScmGraph(stderr: string): GraphResult {
  return {
    ok: false,
    commits: [],
    head: null,
    headHash: null,
    availableRefs: [],
    workingTree: emptyGraphWorkingTree(),
    workingTreeAvailable: false,
    worktreePathByBranch: {},
    worktreePathsAvailable: false,
    hasMore: false,
    stderr,
  };
}

function isSafeGraphRevision(value: string) {
  return (
    Boolean(value) &&
    !value.startsWith("-") &&
    !GRAPH_REF_CONTROL_CHAR_PATTERN.test(value)
  );
}

function resolveGraphRevisionArgs(
  args: ScmGraphArgs,
): { ok: true; revisions: string[] } | { ok: false; stderr: string } {
  const requestedRefs = args.refs?.map((ref) => ref.trim()) ?? [];
  if (requestedRefs.some((ref) => !isSafeGraphRevision(ref))) {
    return {
      ok: false,
      stderr:
        "Commit graph refs must not be empty, option-like, or contain control characters.",
    };
  }
  if (requestedRefs.length > 0) {
    return { ok: true, revisions: [...new Set(requestedRefs)] };
  }

  const scope = (args.scope ?? "all").trim();
  if (scope === "all") {
    return { ok: true, revisions: ["--all"] };
  }
  if (scope === "current") {
    return { ok: true, revisions: ["HEAD"] };
  }
  if (!isSafeGraphRevision(scope)) {
    return {
      ok: false,
      stderr:
        "Commit graph scope must not be empty, option-like, or contain control characters.",
    };
  }
  return { ok: true, revisions: [scope] };
}

function commandStderr(results: Array<{ stderr?: string }>, fallback = "") {
  const stderr = results
    .map((result) => result.stderr?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
  return stderr || fallback;
}

function commandOutputWasTruncated(
  results: Array<{ stdoutTruncated?: boolean }>,
) {
  return results.some((result) => result.stdoutTruncated === true);
}

function serializedResultIsTooLarge(value: unknown) {
  return (
    Buffer.byteLength(JSON.stringify(value), "utf8") >
    SCM_SERIALIZED_RESULT_LIMIT
  );
}

function normalizeHeadHash(stdout: string) {
  const hash = stdout.trim();
  return GRAPH_HASH_PATTERN.test(hash) ? hash : null;
}

export async function getScmGraph(
  args: ScmGraphArgs,
  dependencies: ScmRuntimeDependencies = {},
): Promise<GraphResult> {
  if (
    (args.limit !== undefined &&
      (!Number.isInteger(args.limit) || args.limit < 1)) ||
    (args.skip !== undefined && (!Number.isInteger(args.skip) || args.skip < 0))
  ) {
    return failedScmGraph(
      "Commit graph limit and skip must be non-negative integers.",
    );
  }

  const limit = Math.min(2000, args.limit ?? 500);
  const skip = args.skip ?? 0;
  const revisionResult = resolveGraphRevisionArgs(args);
  if (!revisionResult.ok) {
    return failedScmGraph(revisionResult.stderr);
  }

  const runCommand = dependencies.runCommand ?? runCommandArgs;
  const includeRepositoryState = args.includeRepositoryState !== false;
  const commandOptions = {
    cwd: args.cwd,
    maxOutputChars: SCM_STRUCTURED_OUTPUT_LIMIT,
    timeoutMs: SCM_READ_TIMEOUT_MS,
  };
  const skippedRepositoryStateResult = {
    ok: false,
    code: 0,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
  };
  const [
    logResult,
    refsResult,
    branchResult,
    headHashResult,
    statusResult,
    worktreeResult,
  ] = await Promise.all([
    runCommand({
      command: "git",
      commandArgs: [
        "log",
        "--parents",
        "--date-order",
        "--no-decorate",
        `--skip=${skip}`,
        "-n",
        String(limit + 1),
        "-z",
        `--pretty=format:${GRAPH_LOG_FORMAT}`,
        ...revisionResult.revisions,
      ],
      ...commandOptions,
    }),
    runCommand({
      command: "git",
      commandArgs: [
        "for-each-ref",
        `--format=${GRAPH_REF_FORMAT}`,
        "refs/heads",
        "refs/remotes",
        "refs/tags",
      ],
      ...commandOptions,
    }),
    includeRepositoryState
      ? runCommand({
          command: "git",
          commandArgs: ["symbolic-ref", "--quiet", "--short", "HEAD"],
          ...commandOptions,
        })
      : Promise.resolve(skippedRepositoryStateResult),
    includeRepositoryState
      ? runCommand({
          command: "git",
          commandArgs: ["rev-parse", "--verify", "HEAD"],
          ...commandOptions,
        })
      : Promise.resolve(skippedRepositoryStateResult),
    includeRepositoryState
      ? runCommand({
          command: "git",
          commandArgs: [
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
          ],
          ...commandOptions,
        })
      : Promise.resolve(skippedRepositoryStateResult),
    includeRepositoryState
      ? runCommand({
          command: "git",
          commandArgs: ["worktree", "list", "--porcelain"],
          ...commandOptions,
        })
      : Promise.resolve(skippedRepositoryStateResult),
  ]);

  const graphCommands = includeRepositoryState
    ? [
        logResult,
        refsResult,
        branchResult,
        headHashResult,
        statusResult,
        worktreeResult,
      ]
    : [logResult, refsResult];
  if (logResult.stdoutTruncated) {
    return failedScmGraph(
      "This history page is too large to load safely. Narrow the branch filter and try again.",
    );
  }
  if (refsResult.stdoutTruncated) {
    return failedScmGraph(
      "This repository has too many refs to load safely in the commit graph.",
    );
  }
  if (branchResult.stdoutTruncated || headHashResult.stdoutTruncated) {
    return failedScmGraph("Git returned oversized HEAD metadata.");
  }
  const optionalMetadataWarnings = includeRepositoryState
    ? [
        statusResult.stdoutTruncated
          ? "Working tree summary omitted because it is too large."
          : "",
        worktreeResult.stdoutTruncated
          ? "Worktree locations omitted because they are too large."
          : "",
      ].filter(Boolean)
    : [];

  const head = branchResult.ok ? branchResult.stdout.trim() || null : null;
  const headHash = headHashResult.ok
    ? normalizeHeadHash(headHashResult.stdout)
    : null;
  const repositoryRefs = refsResult.ok
    ? parseGraphRefs(refsResult.stdout, { head, headHash })
    : [];
  const parsedCommits = logResult.ok ? parseGraphLog(logResult.stdout) : [];
  const hasMore = parsedCommits.length > limit;
  const commits = attachGraphRefs(
    hasMore ? parsedCommits.slice(0, limit) : parsedCommits,
    repositoryRefs,
  );

  const result: GraphResult = {
    ok: logResult.ok && refsResult.ok,
    commits,
    head,
    headHash,
    availableRefs: repositoryRefs,
    workingTree:
      statusResult.ok && !statusResult.stdoutTruncated
        ? parseGraphWorkingTreeStatus(statusResult.stdout)
        : emptyGraphWorkingTree(),
    workingTreeAvailable:
      includeRepositoryState &&
      statusResult.ok &&
      !statusResult.stdoutTruncated,
    worktreePathByBranch:
      worktreeResult.ok && !worktreeResult.stdoutTruncated
        ? parseWorktreePathByBranch({ stdout: worktreeResult.stdout })
        : {},
    worktreePathsAvailable:
      includeRepositoryState &&
      worktreeResult.ok &&
      !worktreeResult.stdoutTruncated,
    hasMore,
    stderr: [commandStderr(graphCommands), ...optionalMetadataWarnings]
      .filter(Boolean)
      .join("\n"),
  };
  return serializedResultIsTooLarge(result)
    ? failedScmGraph(
        "Repository history is too large to send safely. Narrow the branch filter and try again.",
      )
    : result;
}

function isValidGraphCommitHash(hash: string) {
  return GRAPH_HASH_PATTERN.test(hash);
}

function buildGraphCommitFileCommandPlan(hash: string) {
  // Keep both machine-readable diff streams on the same tree comparison so
  // their records can be paired without relying on display-formatted paths.
  const commonArgs = [
    "diff-tree",
    "-r",
    "--root",
    "--no-commit-id",
    "--diff-merges=first-parent",
    "-M",
    "-C",
    "-z",
  ];
  const commandFor = (outputMode: "--name-status" | "--numstat") => [
    ...commonArgs,
    outputMode,
    hash,
  ];
  return {
    nameStatus: commandFor("--name-status"),
    numstat: commandFor("--numstat"),
  };
}

function buildGraphCommitDetailCommandPlan(hash: string) {
  return {
    metadata: [
      "show",
      "--no-patch",
      `--format=format:${GRAPH_COMMIT_METADATA_FORMAT}`,
      hash,
    ],
    ...buildGraphCommitFileCommandPlan(hash),
  };
}

export async function getScmCommitDetails(
  args: { hash: string; cwd?: string },
  dependencies: ScmRuntimeDependencies = {},
): Promise<GraphCommitDetailsResult> {
  const hash = args.hash.trim();
  if (!isValidGraphCommitHash(hash)) {
    return {
      ok: false,
      details: null,
      stderr: "A valid commit hash is required.",
    };
  }

  const runCommand = dependencies.runCommand ?? runCommandArgs;
  const commandOptions = {
    cwd: args.cwd,
    maxOutputChars: SCM_STRUCTURED_OUTPUT_LIMIT,
    timeoutMs: SCM_READ_TIMEOUT_MS,
  };
  const commandPlan = buildGraphCommitDetailCommandPlan(hash);
  const runPlannedCommand = (commandArgs: string[]) =>
    runCommand({ command: "git", commandArgs, ...commandOptions });
  const [metadataResult, nameStatusResult, numstatResult] = await Promise.all([
    runPlannedCommand(commandPlan.metadata),
    runPlannedCommand(commandPlan.nameStatus),
    runPlannedCommand(commandPlan.numstat),
  ]);

  const detailCommands = [metadataResult, nameStatusResult, numstatResult];
  if (commandOutputWasTruncated(detailCommands)) {
    return {
      ok: false,
      details: null,
      stderr:
        "Commit details are too large to load safely. Inspect this commit with Git directly.",
    };
  }
  const commandsOk =
    metadataResult.ok && nameStatusResult.ok && numstatResult.ok;
  const details = commandsOk
    ? buildGraphCommitDetails({
        metadataStdout: metadataResult.stdout,
        nameStatusStdout: nameStatusResult.stdout,
        numstatStdout: numstatResult.stdout,
      })
    : null;

  const result: GraphCommitDetailsResult = {
    ok: commandsOk && details !== null,
    details,
    stderr: commandStderr(
      detailCommands,
      commandsOk && !details ? "Failed to parse commit details." : "",
    ),
  };
  return serializedResultIsTooLarge(result)
    ? {
        ok: false,
        details: null,
        stderr:
          "Commit details are too large to send safely. Inspect this commit with Git directly.",
      }
    : result;
}

export async function getScmCommitFiles(
  args: { hash: string; cwd?: string },
  dependencies: ScmRuntimeDependencies = {},
): Promise<{ ok: boolean; files: GraphFileChange[]; stderr: string }> {
  const hash = args.hash.trim();
  if (!isValidGraphCommitHash(hash)) {
    return {
      ok: false,
      files: [],
      stderr: "A valid commit hash is required.",
    };
  }

  const runCommand = dependencies.runCommand ?? runCommandArgs;
  const commandOptions = {
    cwd: args.cwd,
    maxOutputChars: SCM_STRUCTURED_OUTPUT_LIMIT,
    timeoutMs: SCM_READ_TIMEOUT_MS,
  };
  const commandPlan = buildGraphCommitFileCommandPlan(hash);
  const runPlannedCommand = (commandArgs: string[]) =>
    runCommand({ command: "git", commandArgs, ...commandOptions });
  const [nameStatusResult, numstatResult] = await Promise.all([
    runPlannedCommand(commandPlan.nameStatus),
    runPlannedCommand(commandPlan.numstat),
  ]);
  const fileCommands = [nameStatusResult, numstatResult];
  if (commandOutputWasTruncated(fileCommands)) {
    return {
      ok: false,
      files: [],
      stderr:
        "The commit file list is too large to load safely. Inspect this commit with Git directly.",
    };
  }
  const ok = nameStatusResult.ok && numstatResult.ok;
  const files = ok
    ? mergeGraphFileChanges({
        nameStatus: parseGraphNameStatus(nameStatusResult.stdout),
        numstat: parseGraphNumstat(numstatResult.stdout),
      })
    : [];

  const result = {
    ok,
    files,
    stderr: commandStderr(fileCommands),
  };
  return serializedResultIsTooLarge(result)
    ? {
        ok: false,
        files: [],
        stderr:
          "The commit file list is too large to send safely. Inspect this commit with Git directly.",
      }
    : result;
}

export async function getScmCommitDiff(
  args: {
    hash: string;
    path: string;
    oldPath?: string;
    cwd?: string;
  },
  dependencies: ScmRuntimeDependencies = {},
) {
  const hash = args.hash.trim();
  const path = args.path.trim();
  const oldPath = args.oldPath?.trim();
  const invalidPath = (value: string) =>
    !value || value.length > 4096 || value.includes("\0");
  if (
    !isValidGraphCommitHash(hash) ||
    invalidPath(path) ||
    (oldPath !== undefined && invalidPath(oldPath))
  ) {
    return {
      ok: false,
      oldContent: "",
      newContent: "",
      stderr: "A valid commit hash and file path are required.",
    };
  }

  const runCommand = dependencies.runCommand ?? runCommandArgs;
  const commandOptions = {
    cwd: args.cwd,
    maxOutputChars: SCM_COMMIT_DIFF_OUTPUT_LIMIT,
    timeoutMs: SCM_READ_TIMEOUT_MS,
  };
  const [newResult, oldResult] = await Promise.all([
    runCommand({
      command: "git",
      commandArgs: ["show", `${hash}:${path}`],
      ...commandOptions,
    }),
    runCommand({
      command: "git",
      commandArgs: ["show", `${hash}^:${oldPath || path}`],
      ...commandOptions,
    }),
  ]);
  if (commandOutputWasTruncated([newResult, oldResult])) {
    return {
      ok: false,
      oldContent: "",
      newContent: "",
      stderr:
        "This file is too large to open safely in the built-in diff viewer.",
    };
  }

  const ok = newResult.ok || oldResult.ok;
  const result = {
    ok,
    oldContent: oldResult.ok ? oldResult.stdout : "",
    newContent: newResult.ok ? newResult.stdout : "",
    stderr: ok
      ? ""
      : commandStderr(
          [newResult, oldResult],
          "The file does not exist in this commit or its first parent.",
        ),
  };
  return serializedResultIsTooLarge(result)
    ? {
        ok: false,
        oldContent: "",
        newContent: "",
        stderr:
          "This file is too large to send safely to the built-in diff viewer.",
      }
    : result;
}

export async function getScmHistory(args: { cwd?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(50, args.limit ?? 20));
  const result = await runCommandArgs({
    command: "git",
    commandArgs: [
      "log",
      "-n",
      String(limit),
      "--pretty=format:%h%x09%ad%x09%s",
      "--date=relative",
    ],
    cwd: args.cwd,
    timeoutMs: SCM_READ_TIMEOUT_MS,
  });
  const items = result.ok
    ? result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash = "", relativeDate = "", subject = ""] = line.split("\t");
          return { hash, relativeDate, subject };
        })
    : [];

  return { ok: result.ok, items, stderr: result.stderr };
}

export async function listScmBranches(
  args: { cwd?: string; refreshRemote?: boolean },
  dependencies: ScmRuntimeDependencies = {},
) {
  const runCommand = dependencies.runCommand ?? runCommandArgs;
  const refreshResult = args.refreshRemote
    ? await runCommand({
        command: "git",
        commandArgs: ["fetch", "--all", "--prune"],
        cwd: args.cwd,
      })
    : null;

  const [listResult, listRemoteResult, currentResult, worktreeResult] =
    await Promise.all([
      runCommand({
        command: "git",
        commandArgs: ["branch", "--format=%(refname:short)|%(upstream:track)"],
        cwd: args.cwd,
      }),
      runCommand({
        command: "git",
        commandArgs: ["branch", "-r", "--format=%(refname:short)"],
        cwd: args.cwd,
      }),
      runCommand({
        command: "git",
        commandArgs: ["rev-parse", "--abbrev-ref", "HEAD"],
        cwd: args.cwd,
      }),
      runCommand({
        command: "git",
        commandArgs: ["worktree", "list", "--porcelain"],
        cwd: args.cwd,
      }),
    ]);

  return {
    ok:
      listResult.ok &&
      currentResult.ok &&
      (!args.refreshRemote || refreshResult?.ok === true),
    current: currentResult.ok ? currentResult.stdout.trim() : "unknown",
    branches: listResult.ok
      ? listResult.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((line) => !line.endsWith("|[gone]"))
          .map((line) => line.split("|")[0] ?? line)
      : [],
    remoteBranches: listRemoteResult.ok
      ? listRemoteResult.stdout
          .split("\n")
          .map((name) => name.trim())
          .filter(
            (name) =>
              Boolean(name) && name.includes("/") && !name.endsWith("/HEAD"),
          )
      : [],
    worktreePathByBranch: worktreeResult.ok
      ? parseWorktreePathByBranch({ stdout: worktreeResult.stdout })
      : {},
    stderr: commandStderr([
      listResult,
      listRemoteResult,
      currentResult,
      worktreeResult,
      ...(refreshResult ? [refreshResult] : []),
    ]),
  };
}

async function assertScmBranchMatches(args: { cwd?: string; branch?: string }) {
  const expectedBranch = args.branch?.trim();
  if (!expectedBranch) {
    return { ok: true, currentBranch: "" };
  }

  const currentResult = await runCommandArgs({
    command: "git",
    commandArgs: ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd: args.cwd,
  });
  if (!currentResult.ok) {
    return {
      ok: false,
      currentBranch: "",
      stderr: currentResult.stderr || "Failed to detect current branch.",
    };
  }

  const currentBranch = currentResult.stdout.trim();
  if (currentBranch !== expectedBranch) {
    return {
      ok: false,
      currentBranch,
      stderr: `Workspace is on "${currentBranch}", not "${expectedBranch}".`,
    };
  }

  return { ok: true, currentBranch };
}

export async function fetchScmBranch(args: { cwd?: string; branch?: string }) {
  const branchCheck = await assertScmBranchMatches(args);
  if (!branchCheck.ok) {
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: branchCheck.stderr || "Branch does not match current checkout.",
    };
  }

  return runCommandArgs({
    command: "git",
    commandArgs: ["fetch", "--all", "--prune"],
    cwd: args.cwd,
  });
}

export function createScmBranch(args: {
  name: string;
  cwd?: string;
  from?: string;
}) {
  const name = args.name.trim();
  if (!name) {
    return Promise.resolve({
      ok: false,
      code: -1,
      stdout: "",
      stderr: "Branch name is required.",
    });
  }
  const fromRef = args.from?.trim();
  return runCommandArgs({
    command: "git",
    commandArgs: ["branch", name, ...(fromRef ? [fromRef] : [])],
    cwd: args.cwd,
  });
}

export function buildCheckoutScmBranchArgs(name: string) {
  if (name.startsWith("refs/remotes/")) {
    const remoteBranch = name.slice("refs/remotes/".length);
    const separator = remoteBranch.indexOf("/");
    const localBranch =
      separator === -1 ? remoteBranch : remoteBranch.slice(separator + 1);
    return ["checkout", "--track", "-b", localBranch, name];
  }
  if (name.startsWith("refs/tags/")) {
    return ["checkout", "--detach", name];
  }
  if (name.startsWith("refs/heads/")) {
    return ["checkout", name.slice("refs/heads/".length)];
  }
  return ["checkout", name];
}

export function checkoutScmBranch(args: { name: string; cwd?: string }) {
  const name = args.name.trim();
  if (!name) {
    return Promise.resolve({
      ok: false,
      code: -1,
      stdout: "",
      stderr: "Branch name is required.",
    });
  }
  return runCommandArgs({
    command: "git",
    commandArgs: buildCheckoutScmBranchArgs(name),
    cwd: args.cwd,
  });
}

export async function pullScmBranch(args: { cwd?: string; branch?: string }) {
  const branchCheck = await assertScmBranchMatches(args);
  if (!branchCheck.ok) {
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: branchCheck.stderr || "Branch does not match current checkout.",
    };
  }

  return runCommandArgs({
    command: "git",
    commandArgs: ["pull", "--ff-only"],
    cwd: args.cwd,
  });
}

const ORIGIN_DEFAULT_BRANCH_CANDIDATES = ["main", "master"] as const;

/**
 * Resolve the remote default branch ref, preferring `origin/main` and falling back to `origin/master`.
 * Assumes `git fetch` already ran, so it only inspects local remote-tracking refs.
 */
export async function resolveOriginDefaultRef(args: {
  cwd?: string;
  runCommand?: ScmCommandRunner;
}) {
  const runCommand = args.runCommand ?? runCommandArgs;
  const failures: string[] = [];

  for (const candidate of ORIGIN_DEFAULT_BRANCH_CANDIDATES) {
    const result = await runCommand({
      command: "git",
      commandArgs: [
        "rev-parse",
        "--verify",
        "--quiet",
        `refs/remotes/origin/${candidate}`,
      ],
      cwd: args.cwd,
    });
    if (result.ok) {
      return { ok: true, ref: `origin/${candidate}`, stderr: "" };
    }
    if (result.stderr) {
      failures.push(result.stderr);
    }
  }

  return {
    ok: false,
    ref: "",
    stderr: [
      `Neither "origin/main" nor "origin/master" is available.`,
      ...failures,
    ]
      .join("\n")
      .trim(),
  };
}

/**
 * Fetch `origin` and detach HEAD onto its default branch without creating or moving a local branch.
 * Refuses to run while the working tree is dirty so uncommitted work is never carried onto a detached HEAD.
 */
export async function checkoutDefaultBranchDetached(args: {
  cwd?: string;
  runCommand?: ScmCommandRunner;
}): Promise<DetachedCheckoutResult> {
  const runCommand = args.runCommand ?? runCommandArgs;

  const fetchResult = await runCommand({
    command: "git",
    commandArgs: ["fetch", "origin", "--prune"],
    cwd: args.cwd,
  });
  if (!fetchResult.ok) {
    return {
      ok: false,
      code: fetchResult.code,
      stdout: fetchResult.stdout,
      stderr: fetchResult.stderr || "git fetch origin --prune failed.",
      ref: "",
      head: "",
    };
  }

  const refResult = await resolveOriginDefaultRef({
    cwd: args.cwd,
    runCommand,
  });
  if (!refResult.ok) {
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: refResult.stderr,
      ref: "",
      head: "",
    };
  }

  const statusResult = await runCommand({
    command: "git",
    commandArgs: GIT_STATUS_PORCELAIN_ALL_UNTRACKED_ARGS,
    cwd: args.cwd,
  });
  if (!statusResult.ok) {
    return {
      ok: false,
      code: statusResult.code,
      stdout: statusResult.stdout,
      stderr: statusResult.stderr || "Failed to inspect the working tree.",
      ref: refResult.ref,
      head: "",
    };
  }
  if (statusResult.stdout.trim()) {
    return {
      ok: false,
      code: -1,
      stdout: statusResult.stdout,
      stderr: `Cannot detach onto ${refResult.ref} while the working tree has uncommitted changes.`,
      ref: refResult.ref,
      head: "",
    };
  }

  const checkoutResult = await runCommand({
    command: "git",
    commandArgs: ["checkout", "--detach", refResult.ref],
    cwd: args.cwd,
  });
  if (!checkoutResult.ok) {
    return {
      ok: false,
      code: checkoutResult.code,
      stdout: checkoutResult.stdout,
      stderr:
        checkoutResult.stderr ||
        `git checkout --detach ${refResult.ref} failed.`,
      ref: refResult.ref,
      head: "",
    };
  }

  const headResult = await runCommand({
    command: "git",
    commandArgs: ["rev-parse", "--short", "HEAD"],
    cwd: args.cwd,
  });

  return {
    ok: true,
    code: 0,
    stdout: checkoutResult.stdout,
    stderr: checkoutResult.stderr,
    ref: refResult.ref,
    head: headResult.ok ? headResult.stdout.trim() : "",
  };
}

function runScmBranchCommand(args: {
  value: string;
  cwd?: string;
  args: (value: string) => string[];
  requiredMessage: string;
}) {
  const value = args.value.trim();
  if (!value) {
    return Promise.resolve({
      ok: false,
      code: -1,
      stdout: "",
      stderr: args.requiredMessage,
    });
  }
  return runCommandArgs({
    command: "git",
    commandArgs: args.args(value),
    cwd: args.cwd,
  });
}

export function mergeScmBranch(args: { branch: string; cwd?: string }) {
  return runScmBranchCommand({
    value: args.branch,
    cwd: args.cwd,
    args: (value) => ["merge", value],
    requiredMessage: "Branch name is required.",
  });
}

export function rebaseScmBranch(args: { branch: string; cwd?: string }) {
  return runScmBranchCommand({
    value: args.branch,
    cwd: args.cwd,
    args: (value) => ["rebase", value],
    requiredMessage: "Branch name is required.",
  });
}

export function cherryPickScmCommit(args: { commit: string; cwd?: string }) {
  return runScmBranchCommand({
    value: args.commit,
    cwd: args.cwd,
    args: (value) => ["cherry-pick", value],
    requiredMessage: "Commit hash is required.",
  });
}

export function revertScmCommit(args: { commit: string; cwd?: string }) {
  return runScmBranchCommand({
    value: args.commit,
    cwd: args.cwd,
    args: (value) => ["revert", "--no-edit", value],
    requiredMessage: "Commit hash is required.",
  });
}

export function resetScmCommit(args: {
  commit: string;
  mode: "soft" | "mixed" | "hard";
  cwd?: string;
}) {
  const mode =
    args.mode === "soft" || args.mode === "hard" ? args.mode : "mixed";
  return runScmBranchCommand({
    value: args.commit,
    cwd: args.cwd,
    args: (value) => ["reset", `--${mode}`, value],
    requiredMessage: "Commit hash is required.",
  });
}

/**
 * Build the `git tag` argument vector.
 *
 * When no message is supplied the UI wants a lightweight tag, so we pass
 * `--no-sign` explicitly. Without it, a user's `tag.gpgsign=true` git config
 * turns the bare `git tag <name>` into a signed/annotated tag, which then fails
 * with "fatal: no tag message?" because no `-m` was given.
 */
export function buildCreateTagArgs(args: {
  name: string;
  commit?: string;
  message?: string;
}): string[] {
  const name = args.name.trim();
  const target = args.commit?.trim();
  const message = args.message?.trim();
  const commandArgs = ["tag"];
  if (message) {
    commandArgs.push("-a", name, "-m", message);
  } else {
    commandArgs.push("--no-sign", name);
  }
  if (target) {
    commandArgs.push(target);
  }
  return commandArgs;
}

export function createScmTag(args: {
  name: string;
  commit?: string;
  message?: string;
  cwd?: string;
}) {
  const name = args.name.trim();
  if (!name) {
    return Promise.resolve({
      ok: false,
      code: -1,
      stdout: "",
      stderr: "Tag name is required.",
    });
  }
  return runCommandArgs({
    command: "git",
    commandArgs: buildCreateTagArgs(args),
    cwd: args.cwd,
  });
}

export function deleteScmTag(args: { name: string; cwd?: string }) {
  return runScmBranchCommand({
    value: args.name,
    cwd: args.cwd,
    args: (value) => ["tag", "-d", value],
    requiredMessage: "Tag name is required.",
  });
}

export function renameScmBranch(args: {
  from: string;
  to: string;
  cwd?: string;
}) {
  const from = args.from.trim();
  const to = args.to.trim();
  if (!from || !to) {
    return Promise.resolve({
      ok: false,
      code: -1,
      stdout: "",
      stderr: "Both branch names are required.",
    });
  }
  return runCommandArgs({
    command: "git",
    commandArgs: ["branch", "-m", from, to],
    cwd: args.cwd,
  });
}

export function deleteScmBranch(args: {
  name: string;
  force?: boolean;
  cwd?: string;
}) {
  const flag = args.force ? "-D" : "-d";
  return runScmBranchCommand({
    value: args.name,
    cwd: args.cwd,
    args: (value) => ["branch", flag, value],
    requiredMessage: "Branch name is required.",
  });
}

export function pushScmBranch(args: {
  branch?: string;
  remote?: string;
  force?: boolean;
  cwd?: string;
}) {
  const remote = (args.remote ?? "origin").trim();
  const branch = args.branch?.trim();
  return runCommandArgs({
    command: "git",
    commandArgs: [
      "push",
      ...(args.force ? ["--force-with-lease"] : []),
      remote,
      ...(branch ? [branch] : []),
    ],
    cwd: args.cwd,
  });
}

export async function setScmPrReady(args: { cwd?: string }) {
  const authResult = await ensureGhAuth({ cwd: args.cwd });
  if (!authResult.ok) {
    return { ok: false, stderr: describeGhAuthFailure(authResult) };
  }
  const result = await runCommandArgs({
    command: "gh",
    commandArgs: ["pr", "ready"],
    cwd: args.cwd,
  });
  invalidateCachedGhAuthOnFailure(result, args.cwd);
  return result;
}

interface PullRequestMergeSnapshot {
  state: string;
  mergedAt: string | null;
  headRefName: string;
}

async function readPullRequestMergeSnapshot(args: {
  cwd?: string;
  run: ScmCommandRunner;
}): Promise<PullRequestMergeSnapshot | null> {
  const result = await args.run({
    command: "gh",
    commandArgs: ["pr", "view", "--json", "state,mergedAt,headRefName"],
    cwd: args.cwd,
  });
  if (!result.ok) {
    return null;
  }
  try {
    const raw = JSON.parse(result.stdout) as Record<string, unknown>;
    return {
      state: typeof raw.state === "string" ? raw.state : "",
      mergedAt: typeof raw.mergedAt === "string" ? raw.mergedAt : null,
      headRefName: typeof raw.headRefName === "string" ? raw.headRefName : "",
    };
  } catch {
    return null;
  }
}

export function isPullRequestMergedSnapshot(
  snapshot: PullRequestMergeSnapshot | null,
) {
  return Boolean(snapshot && (snapshot.state === "MERGED" || snapshot.mergedAt));
}

export interface DirectPullRequestMergeResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  merged: boolean;
  mergeMethod: ConcretePrMergeMethod;
  remoteBranchDeleted: boolean;
  warning?: string;
}

/**
 * Merges the current branch's PR and reports the *GitHub* outcome. `gh` runs in
 * a linked worktree here, so any local cleanup it attempts after the merge can
 * fail (the base branch is checked out elsewhere); a non-zero exit therefore
 * is not proof that the merge failed and is re-checked against the PR state.
 */
async function runDirectPullRequestMerge(args: {
  method: ConcretePrMergeMethod;
  cwd?: string;
  expectedHeadOid?: string | null;
  deleteRemoteBranch?: boolean;
  run: ScmCommandRunner;
}): Promise<DirectPullRequestMergeResult> {
  const mergeResult = await args.run({
    command: "gh",
    commandArgs: buildMergePullRequestArgs(args.method, {
      matchHeadCommit: args.expectedHeadOid,
    }),
    cwd: args.cwd,
  });
  invalidateCachedGhAuthOnFailure(mergeResult, args.cwd);
  const mergeDetail = `${mergeResult.stderr}\n${mergeResult.stdout}`.trim();

  const snapshot = await readPullRequestMergeSnapshot({
    cwd: args.cwd,
    run: args.run,
  });
  let warning: string | undefined;
  if (!mergeResult.ok) {
    if (!isPullRequestMergedSnapshot(snapshot)) {
      return {
        ok: false,
        code: mergeResult.code,
        stdout: mergeResult.stdout,
        stderr: mergeDetail || "gh pr merge failed.",
        merged: false,
        mergeMethod: args.method,
        remoteBranchDeleted: false,
      };
    }
    warning = `GitHub merged the pull request, but gh exited with an error afterwards: ${mergeDetail || "unknown error"}`;
  }

  let remoteBranchDeleted = false;
  if (args.deleteRemoteBranch !== false && snapshot?.headRefName) {
    const deleteResult = await args.run({
      command: "git",
      commandArgs: ["push", "origin", "--delete", snapshot.headRefName],
      cwd: args.cwd,
    });
    const deleteDetail = `${deleteResult.stderr}\n${deleteResult.stdout}`;
    // GitHub may already have auto-deleted the head branch.
    remoteBranchDeleted =
      deleteResult.ok || /remote ref does not exist/i.test(deleteDetail);
    if (!remoteBranchDeleted) {
      warning = [
        warning,
        `Merged, but the remote branch ${snapshot.headRefName} could not be deleted: ${deleteDetail.trim() || "git push --delete failed."}`,
      ]
        .filter(Boolean)
        .join(" ");
    }
  }

  return {
    ok: true,
    code: 0,
    stdout: mergeResult.stdout,
    stderr: "",
    merged: true,
    mergeMethod: args.method,
    remoteBranchDeleted,
    warning,
  };
}

export async function mergeScmPr(args: {
  method?: PrMergeMethod;
  cwd?: string;
  /** Head commit the PR must still point at; guards against merging a newer push. */
  expectedHeadOid?: string | null;
  deleteRemoteBranch?: boolean;
  runCommand?: ScmCommandRunner;
}): Promise<DirectPullRequestMergeResult | { ok: false; stderr: string }> {
  const run = args.runCommand ?? runCommandArgs;
  const authResult = await ensureGhAuth({
    cwd: args.cwd,
    runCommand: args.runCommand,
  });
  if (!authResult.ok) {
    return { ok: false, stderr: describeGhAuthFailure(authResult) };
  }
  const { method, remapped } = await resolveScmMergeMethod({
    method: args.method,
    cwd: args.cwd,
    runCommand: args.runCommand,
  });
  const result = await runDirectPullRequestMerge({
    method,
    cwd: args.cwd,
    expectedHeadOid: args.expectedHeadOid,
    deleteRemoteBranch: args.deleteRemoteBranch,
    run,
  });
  if (remapped) {
    const note = `The repository does not allow ${args.method} merges, so ${method} was used instead.`;
    if (result.ok) {
      result.warning = [note, result.warning].filter(Boolean).join(" ");
    } else {
      result.stderr = `${note} ${result.stderr}`.trim();
    }
  }
  return result;
}

export interface UpdatePullRequestBranchResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  /** GitHub accepted the update (false when the branch was already current). */
  remoteUpdated: boolean;
  /** The local worktree fast-forwarded to the updated head. */
  localSynced: boolean;
  warning?: string;
}

export function isPullRequestBranchAlreadyCurrent(detail: string) {
  return /already up.?to.?date|already contains|nothing to update/i.test(detail);
}

/**
 * Update the PR branch on GitHub (merge commit from base, no history rewrite),
 * then fast-forward the local worktree when it is clean. Doing the update
 * server-side is what actually clears GitHub's BEHIND state; a local-only
 * rebase never reaches the PR.
 */
export async function updateScmPrBranch(args: {
  cwd?: string;
  runCommand?: ScmCommandRunner;
}): Promise<UpdatePullRequestBranchResult> {
  const run = args.runCommand ?? runCommandArgs;
  const failure = (
    stderr: string,
    partial?: Partial<UpdatePullRequestBranchResult>,
  ): UpdatePullRequestBranchResult => ({
    ok: false,
    code: -1,
    stdout: "",
    stderr,
    remoteUpdated: false,
    localSynced: false,
    ...partial,
  });

  const authResult = await ensureGhAuth({
    cwd: args.cwd,
    runCommand: args.runCommand,
  });
  if (!authResult.ok) {
    return failure(describeGhAuthFailure(authResult));
  }

  const viewResult = await run({
    command: "gh",
    commandArgs: ["pr", "view", "--json", "headRefName,baseRefName"],
    cwd: args.cwd,
  });
  invalidateCachedGhAuthOnFailure(viewResult, args.cwd);
  if (!viewResult.ok) {
    return failure(
      viewResult.stderr.trim() ||
        "Could not resolve the pull request for this branch.",
      { code: viewResult.code },
    );
  }
  let headRefName = "";
  try {
    const raw = JSON.parse(viewResult.stdout) as Record<string, unknown>;
    headRefName = typeof raw.headRefName === "string" ? raw.headRefName : "";
  } catch {
    return failure("Failed to parse pull request details.");
  }
  if (!headRefName) {
    return failure("The pull request has no head branch.");
  }

  const updateResult = await run({
    command: "gh",
    commandArgs: ["pr", "update-branch"],
    cwd: args.cwd,
  });
  invalidateCachedGhAuthOnFailure(updateResult, args.cwd);
  const updateDetail = `${updateResult.stderr}\n${updateResult.stdout}`.trim();
  const alreadyCurrent = isPullRequestBranchAlreadyCurrent(updateDetail);
  if (!updateResult.ok && !alreadyCurrent) {
    return failure(updateDetail || "gh pr update-branch failed.", {
      code: updateResult.code,
      stdout: updateResult.stdout,
    });
  }

  const statusResult = await run({
    command: "git",
    commandArgs: ["status", "--porcelain"],
    cwd: args.cwd,
  });
  let localSynced = false;
  let warning: string | undefined;
  if (!statusResult.ok || statusResult.stdout.trim().length > 0) {
    warning =
      "The branch was updated on GitHub. Commit or stash local changes, then pull to sync this worktree.";
  } else {
    const fetchResult = await run({
      command: "git",
      commandArgs: ["fetch", "origin"],
      cwd: args.cwd,
    });
    if (!fetchResult.ok) {
      warning =
        "The branch was updated on GitHub, but fetching it locally failed. Pull manually to sync this worktree.";
    } else {
      const ffResult = await run({
        command: "git",
        commandArgs: ["merge", "--ff-only", `origin/${headRefName}`],
        cwd: args.cwd,
      });
      localSynced = ffResult.ok;
      if (!ffResult.ok) {
        warning =
          "The branch was updated on GitHub, but the local branch could not fast-forward. Pull manually to sync this worktree.";
      }
    }
  }

  return {
    ok: true,
    code: 0,
    stdout: updateResult.stdout,
    stderr: "",
    remoteUpdated: !alreadyCurrent,
    localSynced,
    warning,
  };
}

export function buildCreatePullRequestArgs(args: {
  title: string;
  body?: string;
  baseBranch?: string;
  draft?: boolean;
}) {
  const commandArgs = ["pr", "create", "--title", args.title];

  if (args.body) {
    commandArgs.push("--body", args.body);
  }

  if (args.baseBranch) {
    commandArgs.push("--base", args.baseBranch);
  }

  if (args.draft) {
    commandArgs.push("--draft");
  }

  return commandArgs;
}

export function buildAutoMergePullRequestArgs(
  method: ConcretePrMergeMethod = "squash",
) {
  // With --auto, gh does not touch the local checkout; --delete-branch only
  // asks GitHub to remove the remote branch once the queued merge lands.
  return ["pr", "merge", "--auto", `--${method}`, "--delete-branch"];
}

export function buildMergePullRequestArgs(
  method: ConcretePrMergeMethod = "squash",
  options?: { matchHeadCommit?: string | null },
) {
  // No --delete-branch: after merging, gh would try to check out the base
  // branch in this worktree, which fails when the base is checked out in the
  // primary worktree and turns a successful merge into a non-zero exit.
  // Remote deletion is handled separately after the merge is confirmed.
  const commandArgs = ["pr", "merge", `--${method}`];
  if (options?.matchHeadCommit) {
    commandArgs.push("--match-head-commit", options.matchHeadCommit);
  }
  return commandArgs;
}

export function classifyAutoMergeFailure(stderr: string) {
  if (/clean status|already mergeable|already (?:been )?merged/i.test(stderr)) {
    return "clean-status" as const;
  }
  if (
    /auto.?merge (?:is )?(?:not allowed|disabled|not enabled|unsupported)|repository.*(?:does not allow|has disabled).*auto.?merge/i.test(
      stderr,
    )
  ) {
    return "unsupported" as const;
  }
  return "other" as const;
}

/** `gh pr create` refuses to duplicate a PR and prints the existing URL. */
export function parseExistingPullRequestUrl(detail: string) {
  if (!/already exists/i.test(detail)) {
    return null;
  }
  return detail.match(/https?:\/\/\S+\/pull\/\d+/)?.[0] ?? null;
}

const REPO_MERGE_SETTINGS_TTL_MS = 10 * 60_000;
const repoMergeSettingsCache = new Map<
  string,
  {
    expiresAt: number;
    settings: {
      squashMergeAllowed: boolean;
      mergeCommitAllowed: boolean;
      rebaseMergeAllowed: boolean;
      autoMergeAllowed: boolean;
    };
  }
>();

export async function fetchRepoMergeSettings(args: {
  cwd?: string;
  runCommand?: ScmCommandRunner;
}) {
  const run = args.runCommand ?? runCommandArgs;
  const cacheKey = resolveCommandCwd({ cwd: args.cwd });
  const cached = repoMergeSettingsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true as const, ...cached.settings, stderr: "" };
  }

  const authResult = await ensureGhAuth({
    cwd: args.cwd,
    runCommand: args.runCommand,
  });
  if (!authResult.ok) {
    return {
      ok: false as const,
      stderr: describeGhAuthFailure(authResult),
    };
  }

  const result = await run({
    command: "gh",
    commandArgs: ["api", "repos/{owner}/{repo}"],
    cwd: args.cwd,
  });
  if (!result.ok) {
    const detail = `${result.stderr}\n${result.stdout}`.trim();
    if (/authentication failed|not logged into|gh auth login/i.test(detail)) {
      invalidateGhAuthCache({ cwd: args.cwd });
    }
    return {
      ok: false as const,
      stderr: detail || "Failed to read repository merge settings.",
    };
  }

  try {
    const raw = JSON.parse(result.stdout) as Record<string, unknown>;
    const settings = {
      squashMergeAllowed: raw.allow_squash_merge === true,
      mergeCommitAllowed: raw.allow_merge_commit === true,
      rebaseMergeAllowed: raw.allow_rebase_merge === true,
      autoMergeAllowed: raw.allow_auto_merge === true,
    };
    repoMergeSettingsCache.set(cacheKey, {
      expiresAt: Date.now() + REPO_MERGE_SETTINGS_TTL_MS,
      settings,
    });
    return { ok: true as const, ...settings, stderr: "" };
  } catch {
    return {
      ok: false as const,
      stderr: "GitHub returned invalid repository merge settings.",
    };
  }
}

const MERGE_METHOD_PREFERENCE = ["squash", "merge", "rebase"] as const;

/**
 * `gh pr merge` refuses to run without an explicit strategy flag when it is not
 * attached to a TTY, so "default" has to be resolved to a concrete strategy
 * before the command is spawned. The repository's allowed merge methods decide
 * which one wins — an explicit choice the repository forbids would only make
 * GitHub reject the merge, so it is remapped too. Falls back to squash when
 * the settings cannot be read.
 */
export function pickAllowedMergeMethod(args: {
  method?: PrMergeMethod;
  settings?: {
    squashMergeAllowed?: boolean;
    mergeCommitAllowed?: boolean;
    rebaseMergeAllowed?: boolean;
  };
}): ConcretePrMergeMethod {
  const allowed: Record<ConcretePrMergeMethod, boolean> = {
    squash: args.settings?.squashMergeAllowed ?? true,
    merge: args.settings?.mergeCommitAllowed ?? true,
    rebase: args.settings?.rebaseMergeAllowed ?? true,
  };
  if (args.method && args.method !== "default" && allowed[args.method]) {
    return args.method;
  }
  return MERGE_METHOD_PREFERENCE.find((method) => allowed[method]) ?? "squash";
}

async function resolveScmMergeMethod(args: {
  method?: PrMergeMethod;
  cwd?: string;
  runCommand?: ScmCommandRunner;
}): Promise<{ method: ConcretePrMergeMethod; remapped: boolean }> {
  const settings = await fetchRepoMergeSettings({
    cwd: args.cwd,
    runCommand: args.runCommand,
  }).catch(() => undefined);
  const method = pickAllowedMergeMethod({
    method: args.method,
    settings: settings?.ok ? settings : undefined,
  });
  return {
    method,
    remapped: Boolean(
      args.method && args.method !== "default" && args.method !== method,
    ),
  };
}

export async function createScmPullRequest(args: {
  title: string;
  body?: string;
  baseBranch?: string;
  draft?: boolean;
  autoMerge?: boolean;
  mergeMethod?: PrMergeMethod;
  cwd?: string;
  runCommand?: ScmCommandRunner;
}) {
  const {
    title,
    body,
    baseBranch,
    draft,
    autoMerge,
    mergeMethod = "default",
    cwd,
  } = args;
  const run = args.runCommand ?? runCommandArgs;
  const authResult = await ensureGhAuth({ cwd, runCommand: args.runCommand });
  if (!authResult.ok) {
    return {
      ok: false,
      stderr: describeGhAuthFailure(authResult),
    };
  }

  const commandArgs = buildCreatePullRequestArgs({
    title,
    body,
    baseBranch,
    draft,
  });

  const result = await run({ command: "gh", commandArgs, cwd });
  invalidateCachedGhAuthOnFailure(result, cwd);

  if (!result.ok) {
    const stderr = `${result.stderr}\n${result.stdout}`.trim();
    if (/spawn gh ENOENT|command not found|not recognized/i.test(stderr)) {
      return {
        ok: false,
        stderr: "GitHub CLI is not installed. Install `gh` first.",
      };
    }
    if (/authentication failed|not logged into|gh auth login/i.test(stderr)) {
      invalidateGhAuthCache({ cwd });
      return {
        ok: false,
        stderr: "GitHub CLI is not authenticated. Run `gh auth login` first.",
      };
    }
    const existingPrUrl = parseExistingPullRequestUrl(stderr);
    if (existingPrUrl) {
      return {
        ok: false,
        stderr: "A pull request for this branch already exists.",
        existingPrUrl,
      };
    }
    return { ok: false, stderr: stderr || "Failed to create pull request." };
  }

  const prUrl = result.stdout.trim().split("\n").pop()?.trim();
  if (!autoMerge) {
    return { ok: true, prUrl, autoMergeEnabled: false, stderr: "" };
  }

  const { method: resolvedMergeMethod } = await resolveScmMergeMethod({
    method: mergeMethod,
    cwd,
    runCommand: args.runCommand,
  });
  const autoMergeResult = await run({
    command: "gh",
    commandArgs: buildAutoMergePullRequestArgs(resolvedMergeMethod),
    cwd,
  });
  invalidateCachedGhAuthOnFailure(autoMergeResult, cwd);
  if (!autoMergeResult.ok) {
    const autoMergeStderr =
      `${autoMergeResult.stderr}\n${autoMergeResult.stdout}`.trim();
    const failure = classifyAutoMergeFailure(autoMergeStderr);
    if (failure === "clean-status") {
      // Nothing is pending, so GitHub refuses to *queue* a merge; merge now.
      const mergeResult = await runDirectPullRequestMerge({
        method: resolvedMergeMethod,
        cwd,
        run,
      });
      if (mergeResult.ok) {
        return {
          ok: true,
          prUrl,
          autoMergeEnabled: false,
          merged: true,
          stderr: mergeResult.warning ?? "",
        };
      }
    }
    if (failure === "unsupported") {
      return {
        ok: true,
        prUrl,
        autoMergeEnabled: false,
        autoMergeUnsupported: true,
        stderr: "",
      };
    }
    return {
      ok: true,
      prUrl,
      autoMergeEnabled: false,
      stderr: `Pull request created, but auto-merge could not be enabled: ${autoMergeStderr || "gh pr merge failed."}`,
    };
  }

  return { ok: true, prUrl, autoMergeEnabled: true, stderr: "" };
}
