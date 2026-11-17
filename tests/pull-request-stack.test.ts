import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPullRequestStack, GetPrStackArgsSchema, RetargetPrStackArgsSchema, type StackPr } from "../src/lib/pull-request-stack";
import { getPullRequestStack, retargetPullRequestStack } from "../electron/host-service/pull-request-stack-runtime";
import type { ScmCommandRunner } from "../electron/host-service/scm-runtime";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
const pr = (number: number, head: string, base: string, state: StackPr["state"] = "OPEN"): StackPr => ({ number, headRefName: head, baseRefName: base, state, title: `Change ${number}`, url: `https://example.test/repo/pull/${number}` });
const chain = [pr(1, "first", "main"), pr(2, "second", "first"), pr(3, "third", "second")];
const ok = (value: unknown = "") => ({ ok: true, code: 0, stdout: typeof value === "string" ? value : JSON.stringify(value), stderr: "" });
function git(cwd: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}
function repository() {
  const cwd = mkdtempSync(join(tmpdir(), "pr-stack-")); roots.push(cwd);
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.email", "test@example.test"); git(cwd, "config", "user.name", "Test");
  writeFileSync(join(cwd, "file"), "base\n"); git(cwd, "add", "."); git(cwd, "commit", "-m", "test: base");
  return cwd;
}
function fakeGh(prs: StackPr[], options: { conflict?: boolean } = {}) {
  const calls: string[][] = [];
  const run: ScmCommandRunner = async request => {
    const args = request.commandArgs ?? [];
    if (request.command === "git") {
      const result = Bun.spawnSync(["git", ...args], { cwd: request.cwd, stdout: "pipe", stderr: "pipe" });
      return { ok: result.exitCode === 0, code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
    }
    calls.push(args);
    if (args[0] === "auth") return ok();
    if (args[0] === "repo") return ok({ defaultBranchRef: { name: "main" } });
    if (args[1] === "view") {
      const target = args[2] === "--json" ? 2 : Number(args[2]);
      const selected = prs.find(item => item.number === target || item.headRefName === args[2]);
      if (!selected) return { ok: false, code: 1, stdout: "", stderr: "no pull requests found" };
      return ok(args.at(-1) === "headRefName,baseRefName" ? { headRefName: selected.headRefName, baseRefName: selected.baseRefName } : selected);
    }
    if (args[1] === "list") {
      const flag = args.includes("--head") ? "--head" : "--base";
      const branch = args[args.indexOf(flag) + 1];
      return ok(prs.filter(item => (flag === "--head" ? item.headRefName : item.baseRefName) === branch && (args.includes("all") || item.state === "OPEN")));
    }
    if (args[1] === "edit") {
      const selected = prs.find(item => item.number === Number(args[2]))!;
      selected.baseRefName = args.at(-1)!;
      return ok();
    }
    if (args[1] === "update-branch") {
      if (options.conflict) {
        const merge = Bun.spawnSync(["git", "merge", "main"], { cwd: request.cwd, stdout: "pipe", stderr: "pipe" });
        return merge.exitCode === 0 ? ok() : { ok: false, code: merge.exitCode, stdout: merge.stdout.toString(), stderr: "CONFLICT: resolve the child branch conflicts before updating." };
      }
      return ok();
    }
    throw new Error(`Unexpected command ${args.join(" ")}`);
  };
  return { run, calls };
}

describe("pull request stacks", () => {
  test("orders a chain and supplies direct parent and child links", () => {
    const stack = buildPullRequestStack(2, chain, "main")!;
    expect(stack.position).toBe(2); expect(stack.total).toBe(3);
    expect(stack.parent?.number).toBe(1); expect(stack.children.map(item => item.number)).toEqual([3]);
  });
  test("does not classify unrelated default-base PRs as a stack", () => {
    expect(buildPullRequestStack(1, [chain[0]!, pr(2, "other", "main")], "main")).toBeNull();
  });
  test("keeps a merged parent available for a retarget offer", () => {
    expect(buildPullRequestStack(2, [pr(1, "first", "main", "MERGED"), chain[1]!], "main")?.parent?.state).toBe("MERGED");
  });
  test("rejects cycles rather than displaying misleading positions", () => {
    expect(buildPullRequestStack(1, [pr(1, "a", "b"), pr(2, "b", "a")], "main")).toBeNull();
  });
  test("strict requests reject force flags and invalid refs", () => {
    expect(RetargetPrStackArgsSchema.safeParse({ parentNumber: 1, childNumbers: [2], force: true }).success).toBe(false);
    expect(GetPrStackArgsSchema.safeParse({ branch: "--unsafe" }).success).toBe(false);
    expect(GetPrStackArgsSchema.safeParse({ branch: "bad name" }).success).toBe(false);
  });
  test("detects the stack through bounded fake gh reads in a real checkout", async () => {
    const cwd = repository(); const { run, calls } = fakeGh(structuredClone(chain));
    const result = await getPullRequestStack({ cwd }, run);
    expect(result.ok).toBe(true); expect(result.stack?.position).toBe(2); expect(result.stack?.total).toBe(3);
    expect(calls.filter(args => args[1] === "list").every(args => args.includes("--limit"))).toBe(true);
  });
  test("a standalone open PR can be selected as the first child's parent", async () => {
    const cwd = repository(); const { run } = fakeGh([pr(1, "first", "main")]);
    const result = await getPullRequestStack({ cwd, branch: "first" }, run);
    expect(result.stack?.current).toBe(1); expect(result.stack?.total).toBe(1);
    expect((await getPullRequestStack({ cwd, branch: "missing" }, run)).stack).toBeNull();
  });
  test("retargets the direct child after merge through the existing update path", async () => {
    const cwd = repository(); const prs = [pr(1, "first", "main", "MERGED"), pr(2, "second", "first")];
    const { run, calls } = fakeGh(prs);
    expect(await retargetPullRequestStack({ cwd, parentNumber: 1, childNumbers: [2] }, run)).toEqual({ ok: true, updated: [2], stderr: "" });
    expect(prs[1]?.baseRefName).toBe("main");
    expect(calls).toContainEqual(["pr", "edit", "2", "--base", "main"]);
    expect(calls).toContainEqual(["pr", "update-branch", "2"]);
    expect(calls.flat().some(arg => arg.includes("force") || arg === "--rebase")).toBe(false);
    expect(git(cwd, "branch", "--show-current")).toBe("main");
  });
  test("validates all children before writes and refuses an unmerged parent", async () => {
    const cwd = repository(); const first = fakeGh(structuredClone(chain));
    expect((await retargetPullRequestStack({ cwd, parentNumber: 1, childNumbers: [2] }, first.run)).ok).toBe(false);
    expect(first.calls.some(args => args[1] === "edit")).toBe(false);
    const second = fakeGh([pr(1, "first", "main", "MERGED"), pr(2, "second", "first"), pr(3, "unrelated", "main")]);
    expect((await retargetPullRequestStack({ cwd, parentNumber: 1, childNumbers: [2, 3] }, second.run)).ok).toBe(false);
    expect(second.calls.some(args => args[1] === "edit")).toBe(false);
  });
  test("reports a real merge conflict after retarget without force or reset", async () => {
    const cwd = repository(); git(cwd, "checkout", "-b", "second");
    writeFileSync(join(cwd, "file"), "child\n"); git(cwd, "commit", "-am", "test: child");
    git(cwd, "checkout", "main"); writeFileSync(join(cwd, "file"), "parent\n"); git(cwd, "commit", "-am", "test: parent"); git(cwd, "checkout", "second");
    const before = git(cwd, "rev-parse", "HEAD");
    const { run, calls } = fakeGh([pr(1, "first", "main", "MERGED"), pr(2, "second", "first")], { conflict: true });
    const result = await retargetPullRequestStack({ cwd, parentNumber: 1, childNumbers: [2] }, run);
    expect(result.ok).toBe(false); expect(result.stderr).toContain("CONFLICT"); expect(result.stderr).toContain("now targets main");
    expect(result.updated).toEqual([2]); expect(result.stderr).toContain("already retargeted"); expect(git(cwd, "rev-parse", "HEAD")).toBe(before);
    expect(git(cwd, "status", "--porcelain")).toContain("UU file");
    expect(calls.flat().some(arg => arg.includes("force"))).toBe(false);
  });
});
