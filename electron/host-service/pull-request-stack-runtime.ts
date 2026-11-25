import {
  buildPullRequestStack, DEFAULT_LONG_LIVED_BRANCH_PATTERNS, GetPrStackArgsSchema, GetPrStackResultSchema,
  isLongLivedParentHead, isStackParent, RetargetPrStackArgsSchema, RetargetPrStackResultSchema,
  type GetPrStackArgs, type GetPrStackResult, type RetargetChildResult, type RetargetPrStackArgs,
  type RetargetPrStackResult, type StackContext, type StackErrorCode, type StackPr,
} from "../../src/lib/pull-request-stack";
import { runCommandArgs } from "../main/utils/command";
import { ensureGhAuth } from "./gh-auth";
import { parseGitRemoteRepository } from "./git-remote-repository";
import {
  invalidateRepositoryPullRequests, OPEN_PULL_REQUEST_LIMIT, PullRequestReadError, readBranchPullRequests, readCurrentBranch, readPullRequest,
  readRepositoryInfo, readRepositoryPullRequests, readViewer,
} from "./pull-request-repo-cache";
import { updateScmPrBranch, type ScmCommandRunner } from "./scm-runtime";

function errorCode(error: unknown): StackErrorCode {
  return error instanceof PullRequestReadError ? error.code : "read-failed";
}

function pullRequestIdentity(url: string) {
  const repository = parseGitRemoteRepository(url);
  const number = Number(url.slice(url.lastIndexOf("/") + 1));
  if (!repository || !Number.isSafeInteger(number)) throw new PullRequestReadError("invalid-response", "Invalid pull request URL");
  return { selector: `${repository.host}/${repository.owner}/${repository.name}`, number };
}

/**
 * Builds a stack from shared repository PR lists and the displayed PR,
 * whose state can change before the list cache expires.
 */
export async function getPullRequestStack(raw: GetPrStackArgs, runCommand?: ScmCommandRunner): Promise<GetPrStackResult> {
  const args = GetPrStackArgsSchema.parse(raw);
  const cwd = args.cwd ?? process.cwd();
  try {
    const identity = args.prUrl ? pullRequestIdentity(args.prUrl) : null;
    const repository = await readRepositoryInfo({ cwd, selector: identity?.selector, run: runCommand });
    const [viewer, open, branch, selected] = await Promise.all([
      readViewer({ cwd, repository, run: runCommand }),
      readRepositoryPullRequests({ cwd, repository, state: "open", run: runCommand }),
      identity ? "" : args.branch ?? readCurrentBranch({ cwd, run: runCommand }),
      identity ? readPullRequest({ cwd, repository, number: identity.number, run: runCommand }) : null,
    ]);
    if (!identity && !branch) return { ok: true, stack: null, code: null };
    const context: StackContext = { defaultBranch: repository.defaultBranch, viewer, longLivedBranchPatterns: args.longLivedBranchPatterns ?? DEFAULT_LONG_LIVED_BRANCH_PATTERNS };
    const pick = (rows: readonly StackPr[]) => rows.filter(pr => pr.headRefName === branch).sort((a, b) => Number(b.sameRepository) - Number(a.sameRepository))[0];
    let current = selected ?? pick(open);
    if (!identity && !current && open.length >= OPEN_PULL_REQUEST_LIMIT) {
      // Large repositories: the branch's PR may sit past the shared list.
      current = pick((await readBranchPullRequests({ cwd, repository, branch, run: runCommand })).filter(pr => pr.state === "OPEN"));
    }
    // Merged PRs matter only for a merged current PR or a parent that is not open.
    const parentIsOpen = current ? current.baseRefName === repository.defaultBranch || open.some(pr => pr.headRefName === current!.baseRefName) : false;
    const merged = parentIsOpen ? [] : await readRepositoryPullRequests({ cwd, repository, state: "merged", run: runCommand });
    // A branch lookup serves the create dialog, which needs an open parent.
    if (!current && !args.branch) current = pick(merged);
    if (!current) return { ok: true, stack: null, code: null };
    const prs = new Map<number, StackPr>();
    for (const pr of [...merged, ...open, current]) prs.set(pr.number, pr);
    const stack = buildPullRequestStack(current.number, [...prs.values()], context);
    // An explicit branch lookup also serves the first child's create dialog:
    // its parent can be a standalone open PR before a stack exists.
    const candidate = !identity && args.branch && current.state === "OPEN" && current.sameRepository && !isLongLivedParentHead(current, [...prs.values()], context)
      ? { current: current.number, position: 1, total: 1, parent: null, children: [], members: [current], retarget: null }
      : null;
    return GetPrStackResultSchema.parse({ ok: true, stack: stack ?? candidate, code: null });
  } catch (error) {
    return { ok: false, stack: null, code: errorCode(error) };
  }
}

function conflictReason(detail: string): RetargetChildResult["reason"] {
  return /conflict/i.test(detail) ? "merge-conflict" : "update-failed";
}

/**
 * Applies exactly the transitions the user confirmed, child by child. Each
 * child is revalidated first; one failure never stops the others. Merging the
 * new base into a child never rewrites history.
 */
export async function retargetPullRequestStack(raw: RetargetPrStackArgs, runCommand?: ScmCommandRunner): Promise<RetargetPrStackResult> {
  const args = RetargetPrStackArgsSchema.parse(raw);
  const cwd = args.cwd ?? process.cwd();
  const run = runCommand;
  let repository: Awaited<ReturnType<typeof readRepositoryInfo>> | null = null;
  try {
    const identity = args.parentUrl ? pullRequestIdentity(args.parentUrl) : null;
    if (identity && identity.number !== args.parentNumber) return { ok: false, code: "invalid-response", results: [] };
    const auth = await ensureGhAuth({ cwd, runCommand: run });
    if (!auth.ok) return { ok: false, code: "auth", results: [] };
    repository = await readRepositoryInfo({ cwd, selector: identity?.selector, run });
    const [viewer, open, parent] = await Promise.all([
      readViewer({ cwd, repository, run }),
      readRepositoryPullRequests({ cwd, repository, state: "open", run, fresh: true }),
      readPullRequest({ cwd, repository, number: args.parentNumber, run }),
    ]);
    const context: StackContext = { defaultBranch: repository.defaultBranch, viewer, longLivedBranchPatterns: args.longLivedBranchPatterns ?? DEFAULT_LONG_LIVED_BRANCH_PATTERNS };
    if (parent.state !== "MERGED") return { ok: false, code: "parent-not-merged", results: [] };
    if (!parent.sameRepository || isLongLivedParentHead(parent, open, context)) return { ok: false, code: "parent-ineligible", results: [] };
    const results: RetargetChildResult[] = [];
    const seen = new Set<number>();
    for (const confirmed of args.children) {
      if (seen.has(confirmed.number)) continue;
      seen.add(confirmed.number);
      const skip = (reason: RetargetChildResult["reason"]) => results.push({ number: confirmed.number, status: "skipped", reason });
      let child: StackPr;
      try { child = await readPullRequest({ cwd, repository, number: confirmed.number, run }); } catch { skip("read-failed"); continue; }
      if (child.state !== "OPEN") { skip("not-open"); continue; }
      if (!child.sameRepository) { skip("fork"); continue; }
      if (child.author.toLowerCase() !== viewer.toLowerCase()) { skip("not-yours"); continue; }
      if (confirmed.fromBase !== parent.headRefName || child.baseRefName !== confirmed.fromBase) { skip("base-changed"); continue; }
      if (confirmed.toBase !== parent.baseRefName) { skip("target-changed"); continue; }
      if (!isStackParent(parent, child, open, context)) { skip("not-a-child"); continue; }
      const prUrl = identity ? `https://${identity.selector}/pull/${child.number}` : undefined;
      const edit = await (run ?? runCommandArgs)({ command: "gh", commandArgs: ["pr", "edit", prUrl ?? String(child.number), "--base", confirmed.toBase], cwd });
      if (!edit.ok) { skip("edit-failed"); continue; }
      const update = await updateScmPrBranch({ cwd, targetPrNumber: child.number, prUrl, runCommand: run });
      results.push(update.ok
        ? { number: child.number, status: "updated", reason: null }
        : { number: child.number, status: "conflict", reason: conflictReason(update.stderr) });
    }
    return RetargetPrStackResultSchema.parse({ ok: results.every(result => result.status === "updated"), code: null, results });
  } catch (error) {
    return { ok: false, code: errorCode(error), results: [] };
  } finally {
    if (repository) invalidateRepositoryPullRequests(repository);
  }
}
