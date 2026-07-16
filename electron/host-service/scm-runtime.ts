import { promises as fs } from "node:fs";
import { parseGraphLog } from "../../src/lib/git-graph/graph-log";
import { parseWorktreePathByBranch } from "../../src/lib/source-control-worktrees";
import type { PrMergeMethod } from "../../src/lib/pr-status";
import { buildSourceControlDiffPreview, resolveSourceControlDiffPaths } from "../../src/lib/source-control-diff";
import { hasConflictItems, parseStatusLines, resolveCommandCwd, runCommandArgs } from "../main/utils/command";
import { resolveRootFilePath } from "../main/utils/filesystem";
import { ensureGhAuth, invalidateGhAuthCache } from "./gh-auth";

const GIT_STATUS_PORCELAIN_ALL_UNTRACKED_ARGS = ["status", "--porcelain", "--untracked-files=all"];

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
].join(",");

function invalidateCachedGhAuthOnFailure(result: { ok: boolean; stdout?: string; stderr?: string }, cwd?: string) {
  if (result.ok) {
    return;
  }
  const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (/authentication failed|not logged into|gh auth login|not authenticated/i.test(detail)) {
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

export async function discardSourceControlPath(args: { cwd?: string; path: string }) {
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
    stdout: [restoreResult.stdout, cleanResult.stdout].filter(Boolean).join("\n"),
    stderr: [restoreResult.stderr, cleanResult.stderr].filter(Boolean).join("\n").trim(),
  };
}

export async function fetchGitHubPrStatus(args: { cwd?: string; target?: string }) {
  const authResult = await ensureGhAuth({ cwd: args.cwd });
  if (!authResult.ok) {
    return { ok: false, pr: null, stderr: "GitHub CLI is not authenticated." };
  }

  const commandArgs = ["pr", "view"];
  if (args.target) {
    commandArgs.push(args.target);
  }
  commandArgs.push("--json", GITHUB_PR_JSON_FIELDS);

  const result = await runCommandArgs({
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

  try {
    const raw = JSON.parse(result.stdout);

    let checksRollup: "SUCCESS" | "FAILURE" | "PENDING" | null = null;
    const checks: unknown[] = Array.isArray(raw.statusCheckRollup) ? raw.statusCheckRollup : [];
    if (checks.length > 0) {
      const latestCheckRunByName = new Map<string, Record<string, unknown>>();
      const nonCheckRuns: Array<Record<string, unknown>> = [];
      for (const check of checks as Array<Record<string, unknown>>) {
        if (check.__typename === "CheckRun" && typeof check.name === "string" && check.name) {
          const existing = latestCheckRunByName.get(check.name);
          if (!existing) {
            latestCheckRunByName.set(check.name, check);
          } else {
            const existingTime = typeof existing.startedAt === "string" ? new Date(existing.startedAt).getTime() : 0;
            const currentTime = typeof check.startedAt === "string" ? new Date(check.startedAt).getTime() : 0;
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

    return {
      ok: true,
      pr: {
        number: raw.number ?? 0,
        title: raw.title ?? "",
        state: raw.state ?? "OPEN",
        isDraft: Boolean(raw.isDraft),
        url: raw.url ?? "",
        reviewDecision: raw.reviewDecision ?? null,
        mergeable: raw.mergeable ?? "UNKNOWN",
        mergeStateStatus: raw.mergeStateStatus ?? "UNKNOWN",
        checksRollup,
        mergedAt: raw.mergedAt ?? null,
        baseRefName: raw.baseRefName ?? "",
        headRefName: raw.headRefName ?? "",
      },
      stderr: "",
    };
  } catch {
    return { ok: false, pr: null, stderr: "Failed to parse PR status JSON." };
  }
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
  const items = statusResult.ok ? parseStatusLines({ stdout: statusResult.stdout }) : [];
  return {
    ok: statusResult.ok && branchResult.ok,
    branch: branchResult.ok ? branchResult.stdout.trim() : "unknown",
    items,
    hasConflicts: hasConflictItems({ items }),
    stderr: [statusResult.stderr, branchResult.stderr].filter(Boolean).join("\n").trim(),
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
export async function tryAutoFixLintErrors(args: { cwd?: string; paths?: string[] }) {
  let files = [...new Set(args.paths?.map((path) => path.trim()).filter(Boolean) ?? [])];
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

  const lintableFiles = files.filter((f) => /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte)$/.test(f));
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
    stderr: [eslintResult.stderr, prettierResult.stderr].filter(Boolean).join("\n").trim(),
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

export function stageSourceControlFiles(args: { paths: string[]; cwd?: string }) {
  const pathspecs = args.paths.flatMap((path) => resolveSourceControlDiffPaths({ rawPath: path }).pathspecs);
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

export async function diffSourceControlFile(args: { path: string; cwd?: string }) {
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

const GRAPH_LOG_FORMAT = "%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s";

export async function getScmGraph(args: {
  cwd?: string;
  limit?: number;
  skip?: number;
  scope?: "current" | "all" | string;
}) {
  const limit = Math.max(1, Math.min(2000, args.limit ?? 500));
  const skip = Math.max(0, args.skip ?? 0);
  const scope = args.scope ?? "all";

  let rangeArg = "--all";
  if (scope === "current") {
    rangeArg = "HEAD";
  } else if (scope !== "all") {
    // a specific branch/ref name
    rangeArg = scope;
  }

  // request limit+1 to detect hasMore without a second query
  const logResult = await runCommandArgs({
    command: "git",
    commandArgs: [
      "log",
      rangeArg,
      "--parents",
      "--date-order",
      // Full ref paths (refs/heads/…, refs/remotes/…, refs/tags/…) so the parser
      // can classify refs by prefix instead of guessing from a slash, which
      // misclassified slash-containing local branches like `feature/login`.
      "--decorate=full",
      `--skip=${skip}`,
      "-n",
      String(limit + 1),
      `--pretty=format:${GRAPH_LOG_FORMAT}`,
    ],
    cwd: args.cwd,
  });
  const branchResult = await runCommandArgs({
    command: "git",
    commandArgs: ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd: args.cwd,
  });

  const parsed = logResult.ok ? parseGraphLog(logResult.stdout) : [];
  const hasMore = parsed.length > limit;
  const commits = hasMore ? parsed.slice(0, limit) : parsed;
  const head = branchResult.ok && branchResult.stdout.trim() !== "HEAD" ? branchResult.stdout.trim() : null;

  return {
    ok: logResult.ok,
    commits,
    head,
    hasMore,
    stderr: [logResult.stderr, branchResult.stderr].filter(Boolean).join("\n").trim(),
  };
}

export async function getScmCommitFiles(args: { hash: string; cwd?: string }) {
  const hash = args.hash.trim();
  if (!hash) {
    return { ok: false, files: [], stderr: "Commit hash is required." };
  }
  const result = await runCommandArgs({
    command: "git",
    commandArgs: ["show", "--name-status", "--pretty=format:", hash],
    cwd: args.cwd,
  });
  const files = result.ok
    ? result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split("\t");
          const status = parts[0] ?? "";
          // Rename/copy lines: "R100\told-path\tnew-path" — use new path as
          // the canonical path; preserve old path in oldPath for display.
          if ((status.startsWith("R") || status.startsWith("C")) && parts.length >= 3) {
            const oldPath = parts[1] ?? "";
            const newPath = parts[2] ?? "";
            return { status: status.charAt(0), path: newPath, oldPath };
          }
          const path = parts[1] ?? "";
          return { status, path };
        })
        .filter((f) => f.path)
    : [];
  return { ok: result.ok, files, stderr: result.stderr };
}

export async function getScmCommitDiff(args: { hash: string; path: string; oldPath?: string; cwd?: string }) {
  const hash = args.hash.trim();
  const path = args.path.trim();
  if (!hash || !path) {
    return {
      ok: false,
      oldContent: "",
      newContent: "",
      stderr: "hash and path are required.",
    };
  }

  // newContent: content of the file in this commit
  const newResult = await runCommandArgs({
    command: "git",
    commandArgs: ["show", `${hash}:${path}`],
    cwd: args.cwd,
  });
  const newContent = newResult.ok ? newResult.stdout : "";

  // oldContent: content in parent commit (use oldPath for rename case)
  const oldPathOrPath = args.oldPath?.trim() || path;
  const oldResult = await runCommandArgs({
    command: "git",
    commandArgs: ["show", `${hash}^:${oldPathOrPath}`],
    cwd: args.cwd,
  });
  const oldContent = oldResult.ok ? oldResult.stdout : "";

  // Collect stderr only from unexpected failures (not added/deleted/root cases)
  const stderrParts: string[] = [];
  if (!newResult.ok && newResult.stderr && newContent === "") {
    stderrParts.push(newResult.stderr.trim());
  }
  if (!oldResult.ok && oldResult.stderr && oldContent === "") {
    stderrParts.push(oldResult.stderr.trim());
  }

  return {
    ok: true,
    oldContent,
    newContent,
    stderr: stderrParts.join("\n").trim(),
  };
}

export async function getScmHistory(args: { cwd?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(50, args.limit ?? 20));
  const result = await runCommandArgs({
    command: "git",
    commandArgs: ["log", "-n", String(limit), "--pretty=format:%h%x09%ad%x09%s", "--date=relative"],
    cwd: args.cwd,
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

export async function listScmBranches(args: { cwd?: string; refreshRemote?: boolean }) {
  const refreshResult = await runCommandArgs({
    command: "git",
    commandArgs: args.refreshRemote ? ["fetch", "--all", "--prune"] : ["remote", "prune", "origin"],
    cwd: args.cwd,
  });

  const [listResult, listRemoteResult, currentResult, worktreeResult] = await Promise.all([
    runCommandArgs({
      command: "git",
      commandArgs: ["branch", "--format=%(refname:short)|%(upstream:track)"],
      cwd: args.cwd,
    }),
    runCommandArgs({
      command: "git",
      commandArgs: ["branch", "-r", "--format=%(refname:short)"],
      cwd: args.cwd,
    }),
    runCommandArgs({
      command: "git",
      commandArgs: ["rev-parse", "--abbrev-ref", "HEAD"],
      cwd: args.cwd,
    }),
    runCommandArgs({
      command: "git",
      commandArgs: ["worktree", "list", "--porcelain"],
      cwd: args.cwd,
    }),
  ]);

  return {
    ok: listResult.ok && currentResult.ok && (!args.refreshRemote || refreshResult.ok),
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
          .filter((name) => Boolean(name) && name.includes("/") && !name.endsWith("/HEAD"))
      : [],
    worktreePathByBranch: worktreeResult.ok ? parseWorktreePathByBranch({ stdout: worktreeResult.stdout }) : {},
    stderr: [listResult.stderr, currentResult.stderr]
      .concat(refreshResult.stderr ? [refreshResult.stderr] : [])
      .filter(Boolean)
      .join("\n")
      .trim(),
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

export function createScmBranch(args: { name: string; cwd?: string; from?: string }) {
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
    commandArgs: ["checkout", name],
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

export function resetScmCommit(args: { commit: string; mode: "soft" | "mixed" | "hard"; cwd?: string }) {
  const mode = args.mode === "soft" || args.mode === "hard" ? args.mode : "mixed";
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
export function buildCreateTagArgs(args: { name: string; commit?: string; message?: string }): string[] {
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

export function createScmTag(args: { name: string; commit?: string; message?: string; cwd?: string }) {
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

export function renameScmBranch(args: { from: string; to: string; cwd?: string }) {
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

export function deleteScmBranch(args: { name: string; force?: boolean; cwd?: string }) {
  const flag = args.force ? "-D" : "-d";
  return runScmBranchCommand({
    value: args.name,
    cwd: args.cwd,
    args: (value) => ["branch", flag, value],
    requiredMessage: "Branch name is required.",
  });
}

export function pushScmBranch(args: { branch?: string; remote?: string; force?: boolean; cwd?: string }) {
  const remote = (args.remote ?? "origin").trim();
  const branch = args.branch?.trim();
  return runCommandArgs({
    command: "git",
    commandArgs: ["push", ...(args.force ? ["--force-with-lease"] : []), remote, ...(branch ? [branch] : [])],
    cwd: args.cwd,
  });
}

export async function setScmPrReady(args: { cwd?: string }) {
  const authResult = await ensureGhAuth({ cwd: args.cwd });
  if (!authResult.ok) {
    return { ok: false, stderr: "GitHub CLI is not authenticated." };
  }
  const result = await runCommandArgs({
    command: "gh",
    commandArgs: ["pr", "ready"],
    cwd: args.cwd,
  });
  invalidateCachedGhAuthOnFailure(result, args.cwd);
  return result;
}

export async function mergeScmPr(args: { method?: PrMergeMethod; cwd?: string }) {
  const authResult = await ensureGhAuth({ cwd: args.cwd });
  if (!authResult.ok) {
    return { ok: false, stderr: "GitHub CLI is not authenticated." };
  }
  const method = args.method ?? "default";
  const result = await runCommandArgs({
    command: "gh",
    commandArgs: ["pr", "merge", ...(method === "default" ? [] : [`--${method}`]), "--delete-branch"],
    cwd: args.cwd,
  });
  invalidateCachedGhAuthOnFailure(result, args.cwd);
  return result;
}

export async function updateScmPrBranch(args: { cwd?: string }) {
  const authResult = await ensureGhAuth({ cwd: args.cwd });
  if (!authResult.ok) {
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: "GitHub CLI is not authenticated.",
    };
  }

  const baseResult = await runCommandArgs({
    command: "gh",
    commandArgs: ["pr", "view", "--json", "baseRefName", "-q", ".baseRefName"],
    cwd: args.cwd,
  });
  invalidateCachedGhAuthOnFailure(baseResult, args.cwd);
  const baseBranch = baseResult.ok ? baseResult.stdout.trim() : "main";

  const fetchResult = await runCommandArgs({
    command: "git",
    commandArgs: ["fetch", "origin"],
    cwd: args.cwd,
  });
  if (!fetchResult.ok) {
    return {
      ok: false,
      code: fetchResult.code,
      stdout: fetchResult.stdout,
      stderr: fetchResult.stderr || "git fetch failed.",
    };
  }

  return runCommandArgs({
    command: "git",
    commandArgs: ["rebase", `origin/${baseBranch}`],
    cwd: args.cwd,
  });
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

export function buildAutoMergePullRequestArgs(method: PrMergeMethod = "default") {
  return ["pr", "merge", "--auto", ...(method === "default" ? [] : [`--${method}`]), "--delete-branch"];
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

export async function fetchRepoMergeSettings(args: { cwd?: string }) {
  const cacheKey = resolveCommandCwd({ cwd: args.cwd });
  const cached = repoMergeSettingsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, ...cached.settings, stderr: "" };
  }

  const authResult = await ensureGhAuth({ cwd: args.cwd });
  if (!authResult.ok) {
    return {
      ok: false,
      stderr: describeGhAuthFailure(authResult),
    };
  }

  const result = await runCommandArgs({
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
      ok: false,
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
    return { ok: true, ...settings, stderr: "" };
  } catch {
    return {
      ok: false,
      stderr: "GitHub returned invalid repository merge settings.",
    };
  }
}

export async function createScmPullRequest(args: {
  title: string;
  body?: string;
  baseBranch?: string;
  draft?: boolean;
  autoMerge?: boolean;
  mergeMethod?: PrMergeMethod;
  cwd?: string;
}) {
  const { title, body, baseBranch, draft, autoMerge, mergeMethod = "default", cwd } = args;
  const authResult = await ensureGhAuth({ cwd });
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

  const result = await runCommandArgs({ command: "gh", commandArgs, cwd });
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
    return { ok: false, stderr: stderr || "Failed to create pull request." };
  }

  const prUrl = result.stdout.trim().split("\n").pop()?.trim();
  if (!autoMerge) {
    return { ok: true, prUrl, autoMergeEnabled: false, stderr: "" };
  }

  const autoMergeResult = await runCommandArgs({
    command: "gh",
    commandArgs: buildAutoMergePullRequestArgs(mergeMethod),
    cwd,
  });
  invalidateCachedGhAuthOnFailure(autoMergeResult, cwd);
  if (!autoMergeResult.ok) {
    const autoMergeStderr = `${autoMergeResult.stderr}\n${autoMergeResult.stdout}`.trim();
    const failure = classifyAutoMergeFailure(autoMergeStderr);
    if (failure === "clean-status") {
      const mergeResult = await runCommandArgs({
        command: "gh",
        commandArgs: ["pr", "merge", ...(mergeMethod === "default" ? [] : [`--${mergeMethod}`]), "--delete-branch"],
        cwd,
      });
      invalidateCachedGhAuthOnFailure(mergeResult, cwd);
      if (mergeResult.ok) {
        return {
          ok: true,
          prUrl,
          autoMergeEnabled: false,
          merged: true,
          stderr: "",
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
