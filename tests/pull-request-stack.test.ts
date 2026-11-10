import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPullRequestStack, GetPrStackArgsSchema, isLongLivedBranchName, RetargetPrStackArgsSchema,
  DEFAULT_LONG_LIVED_BRANCH_PATTERNS, type StackPr,
} from "../src/lib/pull-request-stack";
import { getPullRequestStack, retargetPullRequestStack } from "../electron/host-service/pull-request-stack-runtime";
import { resetPullRequestRepoCache } from "../electron/host-service/pull-request-repo-cache";
import { invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import { createFakeGh, fakePr, gitRepository, type FakeGhPr, type FakeGhState } from "./fixtures/fake-gh";

const roots: string[] = [];
beforeEach(() => { resetPullRequestRepoCache(); invalidateGhAuthCache(); });
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

const base = { repo: { owner: "example", name: "repo", defaultBranch: "main" }, viewer: "me" } as const;
const T = (minute: number) => `2026-11-17T00:${String(minute).padStart(2, "0")}:00Z`;
function setup(prs: FakeGhPr[], branch: string, extra: Partial<FakeGhState> = {}) {
  const root = mkdtempSync(join(tmpdir(), "pr-stack-")); roots.push(root);
  const cwd = join(root, "repository");
  Bun.spawnSync(["mkdir", "-p", cwd]);
  const repo = gitRepository(cwd);
  if (branch !== "main") repo.git(cwd, "checkout", "-b", branch);
  const gh = createFakeGh(root, { ...base, prs, ...extra });
  return { cwd, gh, repo, root };
}
const pr = (number: number, head: string, baseRef: string, overrides: Partial<FakeGhPr> = {}) =>
  fakePr({ number, headRefName: head, baseRefName: baseRef, ...overrides }, base);
const stackPr = (number: number, head: string, baseRef: string, state: StackPr["state"] = "OPEN", extra: Partial<StackPr> = {}): StackPr => ({
  number, headRefName: head, baseRefName: baseRef, state, title: `Change ${number}`, url: `https://github.com/example/repo/pull/${number}`,
  createdAt: T(number), mergedAt: state === "MERGED" ? T(50) : null, author: "me", sameRepository: true, ...extra,
});
const context = { defaultBranch: "main", viewer: "me", longLivedBranchPatterns: [...DEFAULT_LONG_LIVED_BRANCH_PATTERNS] };

describe("pull request stack shape", () => {
  test("orders a chain and supplies direct parent and child links", () => {
    const stack = buildPullRequestStack(2, [stackPr(1, "first", "main"), stackPr(2, "second", "first"), stackPr(3, "third", "second")], context)!;
    expect(stack.position).toBe(2); expect(stack.total).toBe(3);
    expect(stack.parent?.number).toBe(1); expect(stack.children.map(item => item.number)).toEqual([3]);
  });
  test("does not classify unrelated default-base PRs as a stack and stops on cyclic bases", () => {
    expect(buildPullRequestStack(1, [stackPr(1, "first", "main"), stackPr(2, "other", "main")], context)).toBeNull();
    const cyclic = buildPullRequestStack(1, [stackPr(1, "a", "b"), stackPr(2, "b", "a")], context);
    expect(cyclic === null || cyclic.total <= 2).toBe(true);
  });
  test("long-lived names match the default list and configured globs", () => {
    for (const name of ["main", "master", "develop", "staging", "release/1.2"]) expect(isLongLivedBranchName(name, DEFAULT_LONG_LIVED_BRANCH_PATTERNS)).toBe(true);
    expect(isLongLivedBranchName("feature/release", DEFAULT_LONG_LIVED_BRANCH_PATTERNS)).toBe(false);
    expect(isLongLivedBranchName("qa/eu", ["qa/*"])).toBe(true);
  });
  test("strict requests reject force flags, invalid refs and unsafe patterns", () => {
    expect(RetargetPrStackArgsSchema.safeParse({ parentNumber: 1, children: [{ number: 2, fromBase: "a", toBase: "main" }], force: true }).success).toBe(false);
    expect(GetPrStackArgsSchema.safeParse({ branch: "--unsafe" }).success).toBe(false);
    expect(GetPrStackArgsSchema.safeParse({ branch: "bad name" }).success).toBe(false);
    expect(GetPrStackArgsSchema.safeParse({ longLivedBranchPatterns: ["$(rm)"] }).success).toBe(false);
  });
});

describe("stack parents exclude long-lived integration branches (critical)", () => {
  test("a merged develop release PR is not the parent of PRs targeting develop", async () => {
    const { cwd, gh } = setup([
      pr(10, "develop", "main", { state: "MERGED", createdAt: T(5), mergedAt: T(30) }),
      pr(11, "feature", "develop", { createdAt: T(10) }),
    ], "feature");
    const result = await getPullRequestStack({ cwd }, gh.run);
    expect(result.ok).toBe(true);
    expect(result.stack?.parent ?? null).toBeNull();
    expect(result.stack?.retarget ?? null).toBeNull();
  });
  test("release/* and configured patterns are long-lived too", async () => {
    const release = setup([pr(20, "release/2.0", "main", { state: "MERGED", createdAt: T(1), mergedAt: T(30) }), pr(21, "fix", "release/2.0", { createdAt: T(2) })], "fix");
    expect((await getPullRequestStack({ cwd: release.cwd }, release.gh.run)).stack?.retarget ?? null).toBeNull();
    resetPullRequestRepoCache();
    const custom = setup([pr(30, "qa", "main", { state: "MERGED", createdAt: T(1), mergedAt: T(30) }), pr(31, "fix", "qa", { createdAt: T(2) })], "fix");
    expect((await getPullRequestStack({ cwd: custom.cwd, longLivedBranchPatterns: ["qa"] }, custom.gh.run)).stack?.retarget ?? null).toBeNull();
  });
  test("a branch that already served as the base of older open PRs is long-lived", async () => {
    const { cwd, gh } = setup([
      pr(40, "integration", "main", { state: "MERGED", createdAt: T(20), mergedAt: T(40) }),
      pr(41, "older", "integration", { createdAt: T(5), author: { id: "o", login: "other", is_bot: false } }),
      pr(42, "mine", "integration", { createdAt: T(25) }),
    ], "mine");
    expect((await getPullRequestStack({ cwd }, gh.run)).stack?.retarget ?? null).toBeNull();
  });
  test("a parent merged before the child existed, or opened from a fork, is not a parent", async () => {
    const early = setup([pr(50, "topic", "main", { state: "MERGED", createdAt: T(1), mergedAt: T(2) }), pr(51, "next", "topic", { createdAt: T(10) })], "next");
    expect((await getPullRequestStack({ cwd: early.cwd }, early.gh.run)).stack?.parent ?? null).toBeNull();
    resetPullRequestRepoCache();
    const fork = setup([pr(60, "topic", "main", { state: "MERGED", createdAt: T(1), mergedAt: T(30), isCrossRepository: true, headRepositoryOwner: { id: "f", login: "fork" } }), pr(61, "next", "topic", { createdAt: T(10) })], "next");
    expect((await getPullRequestStack({ cwd: fork.cwd }, fork.gh.run)).stack?.parent ?? null).toBeNull();
  });
  test("children are only the viewer's same-repository PRs; others are listed and never touched", async () => {
    const { cwd, gh } = setup([
      pr(1, "first", "main", { state: "MERGED", createdAt: T(1), mergedAt: T(30) }),
      pr(2, "second", "first", { createdAt: T(2) }),
      pr(3, "theirs", "first", { createdAt: T(3), author: { id: "o", login: "other", is_bot: false } }),
      pr(4, "forked", "first", { createdAt: T(4), isCrossRepository: true, headRepositoryOwner: { id: "f", login: "fork" } }),
    ], "second");
    const result = await getPullRequestStack({ cwd }, gh.run);
    expect(result.stack?.retarget?.parent.number).toBe(1);
    expect(result.stack?.retarget?.toBase).toBe("main");
    expect(result.stack?.retarget?.children.map(child => child.number)).toEqual([2]);
    expect(result.stack?.retarget?.excluded.map(row => [row.pr.number, row.reason])).toEqual([[3, "not-yours"], [4, "fork"]]);
    const retarget = await retargetPullRequestStack({ cwd, parentNumber: 1, children: [
      { number: 2, fromBase: "first", toBase: "main" }, { number: 3, fromBase: "first", toBase: "main" }, { number: 4, fromBase: "first", toBase: "main" },
    ] }, gh.run);
    expect(retarget.results).toEqual([
      { number: 2, status: "updated", reason: null },
      { number: 3, status: "skipped", reason: "not-yours" },
      { number: 4, status: "skipped", reason: "fork" },
    ]);
    expect(gh.calls().filter(args => args[1] === "edit").map(args => args[2])).toEqual(["2"]);
    expect(gh.state().prs.find(row => row.number === 3)?.baseRefName).toBe("first");
  });
  test("the host refuses to retarget children of a long-lived parent even when asked", async () => {
    const { cwd, gh } = setup([pr(10, "develop", "main", { state: "MERGED", createdAt: T(5), mergedAt: T(30) }), pr(11, "feature", "develop", { createdAt: T(10) })], "feature");
    const result = await retargetPullRequestStack({ cwd, parentNumber: 10, children: [{ number: 11, fromBase: "develop", toBase: "main" }] }, gh.run);
    expect(result).toMatchObject({ ok: false, code: "parent-ineligible", results: [] });
    expect(gh.calls().some(args => args[1] === "edit" || args[1] === "update-branch")).toBe(false);
  });
});

describe("retarget recovers per child", () => {
  test("each child is independent and only the remaining children are offered again", async () => {
    const { cwd, gh } = setup([
      pr(1, "first", "main", { state: "MERGED", createdAt: T(1), mergedAt: T(30) }),
      pr(2, "a", "first", { createdAt: T(2) }), pr(5, "b", "first", { createdAt: T(5) }), pr(6, "c", "first", { createdAt: T(6) }),
    ], "b", { failEdit: [5], conflict: [6] });
    const children = [5, 6, 2].map(number => ({ number, fromBase: "first", toBase: "main" }));
    const first = await retargetPullRequestStack({ cwd, parentNumber: 1, children }, gh.run);
    expect(first.ok).toBe(false);
    expect(first.results).toEqual([
      { number: 5, status: "skipped", reason: "edit-failed" },
      { number: 6, status: "conflict", reason: "merge-conflict" },
      { number: 2, status: "updated", reason: null },
    ]);
    // A refresh after the failure offers only what is still based on the merged parent.
    const refreshed = await getPullRequestStack({ cwd }, gh.run);
    expect(refreshed.stack?.retarget?.children.map(child => child.number)).toEqual([5]);
    gh.update(state => { state.failEdit = []; });
    const retry = await retargetPullRequestStack({ cwd, parentNumber: 1, children: [{ number: 5, fromBase: "first", toBase: "main" }] }, gh.run);
    expect(retry).toEqual({ ok: true, code: null, results: [{ number: 5, status: "updated", reason: null }] });
    expect(gh.calls().flat().some(arg => arg.includes("force") || arg === "--rebase")).toBe(false);
  });
  test("a child whose base changed after confirmation is skipped, not rewritten", async () => {
    const { cwd, gh } = setup([pr(1, "first", "main", { state: "MERGED", createdAt: T(1), mergedAt: T(30) }), pr(2, "a", "other-base", { createdAt: T(2) })], "a");
    const result = await retargetPullRequestStack({ cwd, parentNumber: 1, children: [{ number: 2, fromBase: "first", toBase: "main" }] }, gh.run);
    expect(result.results).toEqual([{ number: 2, status: "skipped", reason: "base-changed" }]);
    expect(gh.calls().some(args => args[1] === "edit")).toBe(false);
  });
});
