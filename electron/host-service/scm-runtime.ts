import { promises as fs } from "node:fs";
import { parseWorktreePathByBranch } from "../../src/lib/source-control-worktrees";
import {
  buildSourceControlDiffPreview,
  resolveSourceControlDiffPaths,
} from "../../src/lib/source-control-diff";
import {
  hasConflictItems,
  parseStatusLines,
  quotePath,
  resolveCommandCwd,
  runCommand,
  runCommandArgs,
} from "../main/utils/command";
import { resolveRootFilePath } from "../main/utils/filesystem";

const GIT_STATUS_PORCELAIN_ALL_UNTRACKED =
  "git status --porcelain --untracked-files=all";

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

function toGitPathspecArg(paths: string[]) {
  return paths
    .map((filePath) => `"${quotePath({ value: filePath })}"`)
    .join(" ");
}

async function readGitHeadFile(args: { cwd?: string; filePath: string }) {
  const result = await runCommand({
    command: `git show HEAD:"${quotePath({ value: args.filePath })}"`,
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
  const pathspecArg = toGitPathspecArg(paths.pathspecs);
  const restoreResult = await runCommand({
    command: `git restore -- ${pathspecArg}`,
    cwd: args.cwd,
  });

  if (restoreResult.ok) {
    return restoreResult;
  }

  const cleanResult = await runCommand({
    command: `git clean -f -- ${pathspecArg}`,
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

export async function fetchGitHubPrStatus(args: {
  cwd?: string;
  target?: string;
}) {
  const authResult = await runCommand({
    command: "gh auth status",
    cwd: args.cwd,
  });
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
  const statusResult = await runCommand({
    command: GIT_STATUS_PORCELAIN_ALL_UNTRACKED,
    cwd: args.cwd,
  });
  const branchResult = await runCommand({
    command: "git rev-parse --abbrev-ref HEAD",
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
  return runCommand({ command: "git add -A", cwd: args.cwd });
}

/**
 * Attempt to auto-fix lint errors on staged files.
 * Runs `eslint --fix` and `prettier --write` on lintable staged files,
 * then re-stages the results. Returns whether a fix was attempted and
 * whether any remaining errors persist.
 */
export async function tryAutoFixLintErrors(args: { cwd?: string }) {
  const stagedResult = await runCommand({
    command: "git diff --cached --name-only --diff-filter=ACMR",
    cwd: args.cwd,
  });
  if (!stagedResult.ok || !stagedResult.stdout.trim()) {
    return {
      ok: false,
      fixAttempted: false,
      stderr: "No staged files to fix.",
    };
  }

  const files = stagedResult.stdout.trim().split("\n").filter(Boolean);
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

  const fileArgs = lintableFiles
    .map((f) => `"${quotePath({ value: f })}"`)
    .join(" ");

  // Try eslint --fix (best-effort; ignore exit code since unfixable errors remain)
  const eslintResult = await runCommand({
    command: `npx eslint --fix ${fileArgs}`,
    cwd: args.cwd,
  });

  // Try prettier --write (best-effort)
  const prettierResult = await runCommand({
    command: `npx prettier --write ${fileArgs}`,
    cwd: args.cwd,
  });

  // Re-stage the auto-fixed files
  await runCommand({ command: "git add -A", cwd: args.cwd });

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
  return runCommand({ command: "git restore --staged .", cwd: args.cwd });
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
  const escapedMessage = message.replaceAll('"', '\\"');
  return runCommand({
    command: `git commit -m "${escapedMessage}"`,
    cwd: args.cwd,
  });
}

export function stageSourceControlFile(args: { path: string; cwd?: string }) {
  const paths = resolveSourceControlDiffPaths({ rawPath: args.path });
  const pathspecArg = toGitPathspecArg(paths.pathspecs);
  return runCommand({
    command: `git add -- ${pathspecArg}`,
    cwd: args.cwd,
  });
}

export function unstageSourceControlFile(args: { path: string; cwd?: string }) {
  const paths = resolveSourceControlDiffPaths({ rawPath: args.path });
  const pathspecArg = toGitPathspecArg(paths.pathspecs);
  return runCommand({
    command: `git restore --staged -- ${pathspecArg}`,
    cwd: args.cwd,
  });
}

export async function diffSourceControlFile(args: {
  path: string;
  cwd?: string;
}) {
  const paths = resolveSourceControlDiffPaths({ rawPath: args.path });
  const pathspecArg = toGitPathspecArg(paths.pathspecs);
  const [staged, unstaged, oldContent, newContent] = await Promise.all([
    runCommand({
      command: `git diff --cached -- ${pathspecArg}`,
      cwd: args.cwd,
    }),
    runCommand({ command: `git diff -- ${pathspecArg}`, cwd: args.cwd }),
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

export async function getScmHistory(args: { cwd?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(50, args.limit ?? 20));
  const result = await runCommand({
    command: `git log -n ${limit} --pretty=format:%h%x09%ad%x09%s --date=relative`,
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

export async function listScmBranches(args: {
  cwd?: string;
  refreshRemote?: boolean;
}) {
  const refreshResult = await runCommand({
    command: args.refreshRemote
      ? "git fetch --all --prune"
      : "git remote prune origin",
    cwd: args.cwd,
  });

  const [listResult, listRemoteResult, currentResult, worktreeResult] =
    await Promise.all([
      runCommand({
        command: "git branch --format='%(refname:short)|%(upstream:track)'",
        cwd: args.cwd,
      }),
      runCommand({
        command: "git branch -r --format='%(refname:short)'",
        cwd: args.cwd,
      }),
      runCommand({
        command: "git rev-parse --abbrev-ref HEAD",
        cwd: args.cwd,
      }),
      runCommand({
        command: "git worktree list --porcelain",
        cwd: args.cwd,
      }),
    ]);

  return {
    ok: listResult.ok && currentResult.ok,
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
    stderr: [listResult.stderr, currentResult.stderr]
      .concat(refreshResult.stderr ? [refreshResult.stderr] : [])
      .filter(Boolean)
      .join("\n")
      .trim(),
  };
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
  const safeName = quotePath({ value: name });
  const fromRef = args.from?.trim();
  const command = fromRef
    ? `git branch "${safeName}" "${quotePath({ value: fromRef })}"`
    : `git branch "${safeName}"`;
  return runCommand({ command, cwd: args.cwd });
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
  const safeName = quotePath({ value: name });
  return runCommand({
    command: `git checkout "${safeName}"`,
    cwd: args.cwd,
  });
}

function runScmBranchCommand(args: {
  value: string;
  cwd?: string;
  template: (quotedValue: string) => string;
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
  return runCommand({
    command: args.template(quotePath({ value })),
    cwd: args.cwd,
  });
}

export function mergeScmBranch(args: { branch: string; cwd?: string }) {
  return runScmBranchCommand({
    value: args.branch,
    cwd: args.cwd,
    template: (quotedValue) => `git merge "${quotedValue}"`,
    requiredMessage: "Branch name is required.",
  });
}

export function rebaseScmBranch(args: { branch: string; cwd?: string }) {
  return runScmBranchCommand({
    value: args.branch,
    cwd: args.cwd,
    template: (quotedValue) => `git rebase "${quotedValue}"`,
    requiredMessage: "Branch name is required.",
  });
}

export function cherryPickScmCommit(args: { commit: string; cwd?: string }) {
  return runScmBranchCommand({
    value: args.commit,
    cwd: args.cwd,
    template: (quotedValue) => `git cherry-pick "${quotedValue}"`,
    requiredMessage: "Commit hash is required.",
  });
}

export async function setScmPrReady(args: { cwd?: string }) {
  const authResult = await runCommand({
    command: "gh auth status",
    cwd: args.cwd,
  });
  if (!authResult.ok) {
    return { ok: false, stderr: "GitHub CLI is not authenticated." };
  }
  return runCommand({ command: "gh pr ready", cwd: args.cwd });
}

export async function mergeScmPr(args: {
  method?: "merge" | "squash" | "rebase";
  cwd?: string;
}) {
  const authResult = await runCommand({
    command: "gh auth status",
    cwd: args.cwd,
  });
  if (!authResult.ok) {
    return { ok: false, stderr: "GitHub CLI is not authenticated." };
  }
  const method = args.method ?? "squash";
  return runCommand({
    command: `gh pr merge --${method} --delete-branch`,
    cwd: args.cwd,
  });
}

export async function updateScmPrBranch(args: { cwd?: string }) {
  const authResult = await runCommand({
    command: "gh auth status",
    cwd: args.cwd,
  });
  if (!authResult.ok) {
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: "GitHub CLI is not authenticated.",
    };
  }

  const baseResult = await runCommand({
    command: "gh pr view --json baseRefName -q .baseRefName",
    cwd: args.cwd,
  });
  const baseBranch = baseResult.ok ? baseResult.stdout.trim() : "main";

  const fetchResult = await runCommand({
    command: "git fetch origin",
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

  return runCommand({
    command: `git rebase "origin/${baseBranch}"`,
    cwd: args.cwd,
  });
}

export async function createScmPullRequest(args: {
  title: string;
  body?: string;
  baseBranch?: string;
  draft?: boolean;
  cwd?: string;
}) {
  const { title, body, baseBranch, draft, cwd } = args;
  const commandArgs = ["pr", "create", "--title", title];

  if (body) {
    commandArgs.push("--body", body);
  }

  if (baseBranch) {
    commandArgs.push("--base", baseBranch);
  }

  if (draft) {
    commandArgs.push("--draft");
  }

  const result = await runCommandArgs({ command: "gh", commandArgs, cwd });

  if (!result.ok) {
    const stderr = `${result.stderr}\n${result.stdout}`.trim();
    if (/spawn gh ENOENT|command not found|not recognized/i.test(stderr)) {
      return {
        ok: false,
        stderr: "GitHub CLI is not installed. Install `gh` first.",
      };
    }
    if (/authentication failed|not logged into|gh auth login/i.test(stderr)) {
      return {
        ok: false,
        stderr: "GitHub CLI is not authenticated. Run `gh auth login` first.",
      };
    }
    return { ok: false, stderr: stderr || "Failed to create pull request." };
  }

  const prUrl = result.stdout.trim().split("\n").pop()?.trim();
  return { ok: true, prUrl, stderr: "" };
}
