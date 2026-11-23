import { isAbsolute } from "node:path";
import { z } from "zod";
import { isSafeGitBranchName, parseWorkspacePrReference, type WorkspacePrCheckoutArgs, type WorkspacePrCheckoutResult } from "../../src/lib/workspace-pr-checkout";
import { runCommandArgs } from "../main/utils/command";
import { createGitWorktree, runWorkspaceGit } from "../shared/git-worktree-create";
import { ensureGhAuth } from "./gh-auth";

const prFields = z.object({
  headRefName: z.string().refine(isSafeGitBranchName),
  baseRefName: z.string().min(1),
  isCrossRepository: z.boolean(),
  title: z.string(),
});

export async function checkoutWorkspacePr(
  args: WorkspacePrCheckoutArgs,
  { runGit = runWorkspaceGit(args), runGh = runCommandArgs } = {},
): Promise<WorkspacePrCheckoutResult> {
  const ref = parseWorkspacePrReference(args.reference);
  if (!ref || !isAbsolute(args.cwd) || !isAbsolute(args.path)) return { ok: false, code: "invalidReference" };
  const origin = await runGit(["config", "--get", "remote.origin.url"]);
  const repository = origin.ok
    ? /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w-]+\/[\w.-]+?)\/?$/i.exec(origin.stdout.trim().replace(/\.git\/?$/, ""))?.[1]
    : undefined;
  if (!repository || (ref.repository && ref.repository.toLowerCase() !== repository.toLowerCase())) {
    return { ok: false, code: "wrongRepository" };
  }

  const auth = await ensureGhAuth({ cwd: args.cwd, hostname: "github.com", runCommand: runGh });
  if (!auth.ok) {
    const detail = auth.stderr.trim().slice(0, 800);
    if (/ENOENT|command not found|not recognized/i.test(detail)) return { ok: false, code: "ghMissing" };
    if (/timeout|timed out|network|connection|could not resolve host/i.test(detail)) return { ok: false, code: "lookupFailed", detail };
    return { ok: false, code: "ghAuth" };
  }
  const result = await runGh({
    cwd: args.cwd,
    command: "gh",
    commandArgs: ["pr", "view", String(ref.number), "--repo", `github.com/${repository}`, "--json", "headRefName,baseRefName,isCrossRepository,title"],
    timeoutMs: 20_000,
  });
  if (!result.ok) {
    if (/Could not resolve to a PullRequest|no pull requests found|HTTP 404/i.test(result.stderr)) {
      return { ok: false, code: "notFound" };
    }
    return { ok: false, code: "lookupFailed", detail: result.stderr.trim().slice(0, 800) };
  }
  let pr: z.infer<typeof prFields>;
  try {
    pr = prFields.parse(JSON.parse(result.stdout));
  } catch {
    return { ok: false, code: "lookupFailed" };
  }

  const branch = args.branch ?? pr.headRefName;
  const fork = pr.isCrossRepository;
  const remote = fork ? `stave-pr-${ref.number}` : "origin";
  const head = fork ? `refs/pull/${ref.number}/head` : `refs/heads/${pr.headRefName}`;
  const trackingRef = `refs/remotes/${remote}/${fork ? "head" : pr.headRefName}`;
  const refspec = `+${head}:${trackingRef}`;

  if (fork) {
    // A dedicated fetch mapping gives Git a real upstream for the synthetic PR ref.
    const fetchUrl = origin.stdout.trim();
    const remotePrefix = `remote.${remote}`;
    const existing = await runGit(["config", "--local", "--get", `${remotePrefix}.url`]);
    if (existing.ok && existing.stdout.trim() !== fetchUrl) return { ok: false, code: "fetchFailed" };
    const configEntries = [["pushurl", "file:///dev/null"], ["fetch", refspec], ["url", fetchUrl]] as const;
    for (const [key, value] of configEntries) {
      const config = await runGit(["config", "--local", "--replace-all", `${remotePrefix}.${key}`, value]);
      if (!config.ok) return { ok: false, code: "fetchFailed", detail: config.stderr.trim().slice(0, 800) };
    }
  }

  const fetched = await runGit(["fetch", "--no-tags", "--", remote, refspec]);
  if (!fetched.ok) return { ok: false, code: "fetchFailed", detail: fetched.stderr.trim().slice(0, 800) };
  const failure = await createGitWorktree({ ...args, branch, baseRef: trackingRef }, runGit, { track: true });
  if (failure) return { ok: false, code: "worktree", failure };

  if (fork) {
    await runGit(["config", "--local", `branch.${branch}.pushRemote`, remote]);
  }
  const url = `https://github.com/${repository}/pull/${ref.number}`;
  const linked = await runGit(["config", "--local", `branch.${branch}.stave-pr-url`, url]);
  return { ok: true, branch, url, title: pr.title, base: pr.baseRefName, fork,
    ...(!linked.ok ? { linkWarning: linked.stderr.trim() } : {}),
  };
}
