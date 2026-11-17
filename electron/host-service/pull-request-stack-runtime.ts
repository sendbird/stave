import {
  buildPullRequestStack, GetPrStackArgsSchema, GetPrStackResultSchema,
  RetargetPrStackArgsSchema, RetargetPrStackResultSchema, StackPrSchema,
  type GetPrStackArgs, type GetPrStackResult, type RetargetPrStackArgs,
  type RetargetPrStackResult, type StackPr,
} from "../../src/lib/pull-request-stack";
import { runCommandArgs } from "../main/utils/command";
import { ensureGhAuth } from "./gh-auth";
import { SCM_READ_TIMEOUT_MS, updateScmPrBranch, type ScmCommandRunner } from "./scm-runtime";

const fields = "number,title,url,headRefName,baseRefName,state";
function runner(runCommand?: ScmCommandRunner): ScmCommandRunner {
  const run = runCommand ?? runCommandArgs;
  return args => run({ ...args, timeoutMs: args.timeoutMs ?? SCM_READ_TIMEOUT_MS });
}

/** Bounded branch lookups only when a PR surface asks for its stack. */
export async function getPullRequestStack(raw: GetPrStackArgs, runCommand?: ScmCommandRunner): Promise<GetPrStackResult> {
  const args = GetPrStackArgsSchema.parse(raw);
  const run = runner(runCommand);
  try {
    const auth = await ensureGhAuth({ cwd: args.cwd, runCommand: run });
    if (!auth.ok) throw new Error(auth.stderr);
    const command = async (commandArgs: string[]) => {
      const result = await run({ command: "gh", commandArgs, cwd: args.cwd });
      if (!result.ok) throw new Error(result.stderr || "Could not read the pull request stack.");
      return JSON.parse(result.stdout) as unknown;
    };
    const repo = await command(["repo", "view", "--json", "defaultBranchRef"]) as { defaultBranchRef?: { name?: string } };
    const defaultBranch = repo.defaultBranchRef?.name;
    if (!defaultBranch) throw new Error("Could not resolve the repository default branch.");
    const currentRead = await run({ command: "gh", commandArgs: ["pr", "view", ...(args.branch ? [args.branch] : []), "--json", fields], cwd: args.cwd });
    if (!currentRead.ok && /no pull requests found|no open pull requests/.test(currentRead.stderr)) return { ok: true, stack: null, stderr: "" };
    if (!currentRead.ok) throw new Error(currentRead.stderr);
    const current = StackPrSchema.parse(JSON.parse(currentRead.stdout));
    const prs = new Map<number, StackPr>([[current.number, current]]);
    let root = current;
    const seen = new Set<number>();
    for (let depth = 0; root.baseRefName !== defaultBranch; depth++) {
      if (depth >= 16 || seen.has(root.number)) throw new Error("The pull request stack is cyclic or exceeds the depth limit.");
      seen.add(root.number);
      const parents = StackPrSchema.array().max(10).parse(await command(["pr", "list", "--head", root.baseRefName, "--state", "all", "--limit", "10", "--json", fields]));
      const parent = parents.find(pr => pr.state === "OPEN") ?? parents.find(pr => pr.state === "MERGED");
      if (!parent) break;
      prs.set(parent.number, parent);
      root = parent;
    }
    const queue = [root];
    const visited = new Set<number>();
    while (queue.length) {
      const parent = queue.shift()!;
      if (visited.has(parent.number)) continue;
      visited.add(parent.number);
      const children = StackPrSchema.array().max(33).parse(await command(["pr", "list", "--base", parent.headRefName, "--state", "open", "--limit", "33", "--json", fields]));
      for (const child of children) {
        if (!prs.has(child.number) && prs.size >= 32) throw new Error("The pull request stack exceeds the 32 PR limit.");
        prs.set(child.number, child);
        if (!visited.has(child.number)) queue.push(child);
      }
    }
    const stack = buildPullRequestStack(current.number, [...prs.values()], defaultBranch);
    // An explicit branch lookup also serves the first child's create dialog.
    // Its parent can be a standalone open PR before a stack exists.
    const candidate = args.branch && current.state === "OPEN"
      ? { current: current.number, position: 1, total: 1, parent: null, children: [], members: [current] }
      : null;
    return GetPrStackResultSchema.parse({ ok: true, stack: stack ?? candidate, stderr: "" });
  } catch (error) {
    return { ok: false, stack: null, stderr: error instanceof Error ? error.message : String(error) };
  }
}

/** Retarget only direct children of the observed merged parent. Never rewrites history. */
export async function retargetPullRequestStack(raw: RetargetPrStackArgs, runCommand?: ScmCommandRunner): Promise<RetargetPrStackResult> {
  const args = RetargetPrStackArgsSchema.parse(raw);
  const run = runner(runCommand);
  const updated: number[] = [];
  try {
    const auth = await ensureGhAuth({ cwd: args.cwd, runCommand: run });
    if (!auth.ok) throw new Error(auth.stderr);
    const read = async (number: number) => {
      const result = await run({ command: "gh", commandArgs: ["pr", "view", String(number), "--json", fields], cwd: args.cwd });
      if (!result.ok) throw new Error(result.stderr);
      return StackPrSchema.parse(JSON.parse(result.stdout));
    };
    const parent = await read(args.parentNumber);
    if (parent.state !== "MERGED") throw new Error("The parent pull request has not merged.");
    // Validate the complete request before the first remote write.
    const children: StackPr[] = [];
    for (const number of new Set(args.childNumbers)) {
      const child = await read(number);
      if (child.state !== "OPEN" || child.number === parent.number || child.baseRefName !== parent.headRefName) throw new Error(`Pull request #${number} is no longer an open child of this parent.`);
      children.push(child);
    }
    for (const child of children) {
      const edit = await run({ command: "gh", commandArgs: ["pr", "edit", String(child.number), "--base", parent.baseRefName], cwd: args.cwd });
      if (!edit.ok) throw new Error(edit.stderr || `Could not retarget pull request #${child.number}.`);
      updated.push(child.number);
      const result = await updateScmPrBranch({ cwd: args.cwd, targetPrNumber: child.number, runCommand: run });
      if (!result.ok) throw new Error(`Pull request #${child.number} was already retargeted and now targets ${parent.baseRefName}, but updating its branch failed. Resolve conflicts and use Update branch on that pull request: ${result.stderr}`);
    }
    return RetargetPrStackResultSchema.parse({ ok: true, updated, stderr: "" });
  } catch (error) {
    return { ok: false, updated, stderr: error instanceof Error ? error.message : String(error) };
  }
}
