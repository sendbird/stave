import { beforeEach, describe, expect, test } from "bun:test";
import { invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import {
  buildGitHubPrManageArgs,
  buildGitHubPrReviewerCandidateArgs,
  parseGitHubPrManageDetails,
  parseGitHubPrManageTarget,
  parseGitHubPrReviewerCandidates,
  runGitHubPrManage,
} from "../electron/host-service/github-pr-manage-runtime";
import { GitHubPrManageArgsSchema } from "../electron/main/ipc/schemas";
import type { runCommandArgs } from "../electron/main/utils/command";
import {
  diffGitHubPrReviewers,
  normalizeGitHubReviewerHandle,
  type GitHubPrManageArgs,
} from "../src/lib/github-pr-manage";

const prUrl = "https://github.com/acme/widgets/pull/42";
const headOid = "88a73338498bed7d96bb21c7c7f6a3c3358d5f16";

type Command = Parameters<typeof runCommandArgs>[0];
type Outcome = Awaited<ReturnType<typeof runCommandArgs>>;
const ok = (payload: unknown = ""): Outcome => ({
  ok: true, code: 0, stdout: typeof payload === "string" ? payload : JSON.stringify(payload), stderr: "",
});
const failed = (stderr: string, code = 1): Outcome => ({ ok: false, code, stdout: "", stderr });

function fixture(...responses: Outcome[]) {
  const calls: Command[] = [];
  const runner: typeof runCommandArgs = async (command) => {
    calls.push(command);
    const result = responses.shift();
    if (!result) throw new Error("Unexpected gh command");
    return result;
  };
  return { calls, runner };
}

const view = {
  number: 42,
  title: "feat: add widgets",
  body: "Adds widgets.",
  state: "OPEN",
  isDraft: false,
  author: { login: "octocat" },
  autoMergeRequest: { mergeMethod: "SQUASH", enabledBy: { login: "octocat" } },
  reviewRequests: [
    { __typename: "User", login: "hubot" },
    { __typename: "Team", name: "Core", slug: "acme/core" },
    { __typename: "Team", name: "Docs", slug: "docs" },
    { __typename: "Bot", login: "review-helper[bot]" },
  ],
  latestReviews: [{ author: { login: "monalisa" }, state: "APPROVED" }, { author: null, state: "COMMENTED" }],
  headRefOid: headOid,
  baseRefName: "main",
};

const WRITES: GitHubPrManageArgs[] = [
  { action: "edit", prUrl, title: "fix: rename" },
  { action: "edit", prUrl, body: "" },
  { action: "edit", prUrl, title: "fix: rename", body: "New body" },
  { action: "reviewers", prUrl, add: ["hubot", "acme/core"], remove: ["monalisa"] },
  { action: "reviewers", prUrl, add: [], remove: ["monalisa"] },
  { action: "draft", prUrl },
  { action: "auto-merge", prUrl, enabled: true, method: "squash", expectedHeadOid: headOid },
  { action: "auto-merge", prUrl, enabled: false },
  { action: "close", prUrl },
  { action: "reopen", prUrl },
];

beforeEach(() => invalidateGhAuthCache());

describe("request validation", () => {
  test("accepts every action with an explicit pull request URL", () => {
    for (const args of [{ action: "details", prUrl }, { action: "reviewer-candidates", prUrl, query: "mona" }, ...WRITES]) {
      expect(GitHubPrManageArgsSchema.safeParse(args).success).toBe(true);
    }
  });

  test("rejects targets that are not a pull request URL", () => {
    for (const target of [
      "42",
      "feature/widgets",
      "--repo=acme/other",
      "http://github.com/acme/widgets/pull/42",
      "https://github.com/acme/widgets/pull/0",
      "https://github.com/acme/widgets/pull/42/files",
      "https://github.com/acme/widgets/issues/42",
      "https://github.com/acme/widgets/pull/42 --delete-branch",
    ]) {
      expect(GitHubPrManageArgsSchema.safeParse({ action: "close", prUrl: target }).success).toBe(false);
    }
    expect(GitHubPrManageArgsSchema.safeParse({ action: "close" }).success).toBe(false);
  });

  test("rejects reviewer handles that are not a login or org/team", () => {
    for (const handle of ["-R", "--repo", "a b", "octo cat", "x".repeat(40), "acme/core/extra", "/core", "acme/", "octo;cat", "@octocat"]) {
      expect(GitHubPrManageArgsSchema.safeParse({ action: "reviewers", prUrl, add: [handle], remove: [] }).success).toBe(false);
    }
    expect(GitHubPrManageArgsSchema.safeParse({ action: "reviewers", prUrl, add: [], remove: [] }).success).toBe(false);
    expect(GitHubPrManageArgsSchema.safeParse({ action: "reviewers", prUrl, add: ["hubot"], remove: ["Hubot"] }).success).toBe(false);
  });

  test("rejects incomplete, mixed or unknown fields", () => {
    for (const args of [
      { action: "edit", prUrl },
      { action: "edit", prUrl, title: "   " },
      { action: "edit", prUrl, title: "one\ntwo" },
      { action: "auto-merge", prUrl, enabled: true, method: "squash" },
      { action: "auto-merge", prUrl, enabled: true, expectedHeadOid: headOid },
      { action: "auto-merge", prUrl, enabled: true, method: "fast-forward", expectedHeadOid: headOid },
      { action: "auto-merge", prUrl, enabled: true, method: "squash", expectedHeadOid: "$(whoami)" },
      { action: "auto-merge", prUrl, enabled: false, method: "squash" },
      { action: "close", prUrl, deleteBranch: true },
      { action: "reviewer-candidates", prUrl, query: "a\nb" },
      { action: "merge", prUrl },
    ]) {
      expect(GitHubPrManageArgsSchema.safeParse(args).success).toBe(false);
    }
  });

  test("normalizes a typed reviewer and computes the request diff", () => {
    expect(normalizeGitHubReviewerHandle(" @octocat ")).toBe("octocat");
    expect(normalizeGitHubReviewerHandle("acme/core")).toBe("acme/core");
    expect(normalizeGitHubReviewerHandle("-R")).toBeNull();
    expect(normalizeGitHubReviewerHandle("octo cat")).toBeNull();
    expect(diffGitHubPrReviewers(["hubot", "acme/core"], ["Hubot", "monalisa"])).toEqual({
      add: ["monalisa"],
      remove: ["acme/core"],
    });
  });
});

describe("command building", () => {
  test("every action targets the pull request URL", () => {
    expect(buildGitHubPrManageArgs({ action: "details", prUrl })).toEqual([
      "pr", "view", prUrl, "--json",
      "number,title,body,state,isDraft,author,autoMergeRequest,reviewRequests,latestReviews,headRefOid,baseRefName",
    ]);
    expect(buildGitHubPrManageArgs({ action: "edit", prUrl, title: "fix: rename" })).toEqual(["pr", "edit", prUrl, "--title", "fix: rename"]);
    expect(buildGitHubPrManageArgs({ action: "edit", prUrl, body: "" })).toEqual(["pr", "edit", prUrl, "--body", ""]);
    expect(buildGitHubPrManageArgs({ action: "edit", prUrl, title: "t", body: "b" })).toEqual(["pr", "edit", prUrl, "--title", "t", "--body", "b"]);
    expect(buildGitHubPrManageArgs({ action: "reviewers", prUrl, add: ["hubot", "acme/core"], remove: ["monalisa"] })).toEqual([
      "pr", "edit", prUrl, "--add-reviewer", "hubot,acme/core", "--remove-reviewer", "monalisa",
    ]);
    expect(buildGitHubPrManageArgs({ action: "reviewers", prUrl, add: [], remove: ["monalisa"] })).toEqual([
      "pr", "edit", prUrl, "--remove-reviewer", "monalisa",
    ]);
    expect(buildGitHubPrManageArgs({ action: "draft", prUrl })).toEqual(["pr", "ready", prUrl, "--undo"]);
    expect(buildGitHubPrManageArgs({ action: "auto-merge", prUrl, enabled: true, method: "rebase", expectedHeadOid: headOid })).toEqual([
      "pr", "merge", prUrl, "--auto", "--rebase", "--match-head-commit", headOid,
    ]);
    expect(buildGitHubPrManageArgs({ action: "auto-merge", prUrl, enabled: false })).toEqual(["pr", "merge", prUrl, "--disable-auto"]);
    expect(buildGitHubPrManageArgs({ action: "close", prUrl })).toEqual(["pr", "close", prUrl]);
    expect(buildGitHubPrManageArgs({ action: "reopen", prUrl })).toEqual(["pr", "reopen", prUrl]);
  });

  test("no command ever asks GitHub to delete the branch", async () => {
    for (const args of WRITES) {
      expect(buildGitHubPrManageArgs(args as Parameters<typeof buildGitHubPrManageArgs>[0])).not.toContain("--delete-branch");
      const { calls, runner } = fixture(ok(), ok());
      expect(await runGitHubPrManage(args, runner)).toEqual({ ok: true, kind: "written" });
      expect(calls.flatMap((call) => call.commandArgs ?? []).some((part) => /delete-branch/.test(part))).toBe(false);
      invalidateGhAuthCache();
    }
  });

  test("reviewer suggestions search the pull request's own repository", () => {
    const target = parseGitHubPrManageTarget("https://github.example.com/Acme/Widgets/pull/7");
    expect(target).toEqual({ host: "github.example.com", owner: "Acme", repo: "Widgets", number: 7 });
    const args = buildGitHubPrReviewerCandidateArgs(target!, " @mona ");
    expect(args.slice(0, 4)).toEqual(["api", "graphql", "--hostname", "github.example.com"]);
    expect(args).toContain("owner=Acme");
    expect(args).toContain("repo=Widgets");
    expect(args).toContain("number=7");
    expect(args.slice(-2)).toEqual(["-f", "search=@mona"]);
    expect(args.join(" ")).toContain("suggestedReviewers");
    expect(args.join(" ")).toContain("assignableUsers");
    expect(buildGitHubPrReviewerCandidateArgs(target!).some((part) => part.startsWith("search="))).toBe(false);
    expect(parseGitHubPrManageTarget("acme/widgets#7")).toBeNull();
  });
});

describe("runGitHubPrManage", () => {
  test("checks authentication, then runs gh against the URL in the workspace folder", async () => {
    const { calls, runner } = fixture(ok(), ok());
    expect(await runGitHubPrManage({ action: "close", prUrl, cwd: "/tmp/widgets" }, runner)).toEqual({ ok: true, kind: "written" });
    expect(calls.map((call) => [call.command, call.commandArgs, call.cwd])).toEqual([
      ["gh", ["auth", "status"], "/tmp/widgets"],
      ["gh", ["pr", "close", prUrl], "/tmp/widgets"],
    ]);
  });

  test("refuses an invalid target before running anything", async () => {
    const { calls, runner } = fixture();
    const args = { action: "close", prUrl: "--delete-branch" } as GitHubPrManageArgs;
    expect(await runGitHubPrManage(args, runner)).toEqual({ ok: false, reason: "invalid-target" });
    expect(calls).toEqual([]);
  });

  test("reports a missing sign-in without running the action", async () => {
    const { calls, runner } = fixture(failed("You are not logged into any GitHub hosts. To log in, run: gh auth login"));
    expect(await runGitHubPrManage({ action: "draft", prUrl }, runner)).toEqual({ ok: false, reason: "unauthenticated" });
    expect(calls).toHaveLength(1);
  });

  test("reports a missing gh binary", async () => {
    const { runner } = fixture(failed("spawn gh ENOENT", -1));
    expect(await runGitHubPrManage({ action: "reopen", prUrl }, runner)).toEqual({ ok: false, reason: "missing-gh" });
  });

  test("drops the cached sign-in when the action itself hits an authentication failure", async () => {
    const { calls, runner } = fixture(
      ok(),
      failed("HTTP 401: Bad credentials\nauthentication failed"),
      failed("not logged into any GitHub hosts"),
    );
    expect(await runGitHubPrManage({ action: "close", prUrl }, runner)).toEqual({ ok: false, reason: "unauthenticated" });
    // The next call asks gh again instead of trusting the cached success.
    expect(await runGitHubPrManage({ action: "close", prUrl }, runner)).toEqual({ ok: false, reason: "unauthenticated" });
    expect(calls.map((call) => call.commandArgs?.[0])).toEqual(["auth", "pr", "auth"]);
  });

  test("returns the first stderr line, capped", async () => {
    const { runner } = fixture(ok(), failed(`\nGraphQL: ${"x".repeat(400)}\nsecond line`));
    const result = await runGitHubPrManage({ action: "edit", prUrl, title: "fix: rename" }, runner);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.reason).toBe("failed");
    expect(result.detail?.startsWith("GraphQL: xxx")).toBe(true);
    expect(result.detail?.length).toBe(300);
    expect(result.detail).not.toContain("second line");
  });

  test("reports a timeout", async () => {
    const { runner } = fixture(ok(), failed("Command timed out after 30000ms.", -1));
    expect(await runGitHubPrManage({ action: "close", prUrl }, runner)).toEqual({ ok: false, reason: "timeout" });
  });

  test("never throws when the runner does", async () => {
    const runner: typeof runCommandArgs = async () => { throw new Error("spawn failed"); };
    expect(await runGitHubPrManage({ action: "close", prUrl }, runner)).toEqual({ ok: false, reason: "failed" });
  });

  test("reads details", async () => {
    const { calls, runner } = fixture(ok(), ok(view));
    expect(await runGitHubPrManage({ action: "details", prUrl }, runner)).toEqual({
      ok: true,
      kind: "details",
      details: {
        number: 42,
        title: "feat: add widgets",
        body: "Adds widgets.",
        state: "OPEN",
        isDraft: false,
        authorLogin: "octocat",
        autoMerge: { mergeMethod: "SQUASH", enabledBy: "octocat" },
        reviewRequests: [
          { handle: "hubot", kind: "user" },
          { handle: "acme/core", kind: "team" },
          { handle: "acme/docs", kind: "team" },
        ],
        latestReviews: [{ login: "monalisa", state: "APPROVED" }],
        headRefOid: headOid,
        baseRefName: "main",
      },
    });
    expect(calls[1]?.commandArgs?.slice(0, 3)).toEqual(["pr", "view", prUrl]);
  });

  test("reads auto-merge as off when GitHub reports none", () => {
    expect(parseGitHubPrManageDetails({ ...view, autoMergeRequest: null, reviewRequests: null, latestReviews: null, body: null }, "acme")).toMatchObject({
      autoMerge: null, reviewRequests: [], latestReviews: [], body: "",
    });
  });

  test("reports unreadable details", async () => {
    const { runner } = fixture(ok(), ok("not json"));
    expect(await runGitHubPrManage({ action: "details", prUrl }, runner)).toEqual({ ok: false, reason: "invalid-response" });
  });
});

describe("reviewer candidates", () => {
  const payload = {
    data: {
      repository: {
        pullRequest: {
          author: { login: "octocat" },
          suggestedReviewers: [
            { reviewer: { login: "monalisa", name: "Mona Lisa" } },
            { reviewer: { login: "octocat", name: "The Author" } },
            null,
          ],
        },
        assignableUsers: { nodes: [{ login: "Monalisa", name: "Mona Lisa" }, { login: "hubot", name: null }, { login: "octocat", name: "" }] },
      },
    },
  };

  test("lists suggestions first, without the author or duplicates", () => {
    expect(parseGitHubPrReviewerCandidates(payload)).toEqual([
      { login: "monalisa", name: "Mona Lisa", suggested: true },
      { login: "hubot", name: "", suggested: false },
    ]);
    expect(parseGitHubPrReviewerCandidates(payload, "hub")).toEqual([
      { login: "Monalisa", name: "Mona Lisa", suggested: false },
      { login: "hubot", name: "", suggested: false },
    ]);
  });

  test("returns the list through gh", async () => {
    const { calls, runner } = fixture(ok(), ok(payload));
    const result = await runGitHubPrManage({ action: "reviewer-candidates", prUrl, query: "mona" }, runner);
    expect(result).toEqual({
      ok: true,
      kind: "reviewer-candidates",
      candidates: [
        { login: "monalisa", name: "Mona Lisa", suggested: true },
        { login: "hubot", name: "", suggested: false },
      ],
    });
    expect(calls[1]?.commandArgs?.slice(-2)).toEqual(["-f", "search=mona"]);
  });

  test("degrades to an empty list with a reason instead of failing", async () => {
    const cases: [Outcome[], string][] = [
      [[failed("not logged into any GitHub hosts")], "unauthenticated"],
      [[ok(), failed("GraphQL: Resource not accessible by integration")], "failed"],
      [[ok(), ok("not json")], "invalid-response"],
    ];
    for (const [responses, reason] of cases) {
      invalidateGhAuthCache();
      const { runner } = fixture(...responses);
      const result = await runGitHubPrManage({ action: "reviewer-candidates", prUrl }, runner);
      expect(result).toMatchObject({ ok: true, kind: "reviewer-candidates", candidates: [], unavailable: { reason } });
    }
    const throwing: typeof runCommandArgs = async () => { throw new Error("spawn failed"); };
    invalidateGhAuthCache();
    expect(await runGitHubPrManage({ action: "reviewer-candidates", prUrl }, throwing)).toMatchObject({
      ok: true, candidates: [], unavailable: { reason: "failed" },
    });
    const invalid = { action: "reviewer-candidates", prUrl: "octocat" } as GitHubPrManageArgs;
    expect(await runGitHubPrManage(invalid, throwing)).toMatchObject({ ok: true, candidates: [], unavailable: { reason: "invalid-target" } });
  });

  test("keeps the part GitHub answered when another field is refused", async () => {
    const partial: Outcome = { ok: false, code: 1, stdout: JSON.stringify(payload), stderr: "GraphQL: Resource not accessible" };
    const { runner } = fixture(ok(), partial);
    const result = await runGitHubPrManage({ action: "reviewer-candidates", prUrl }, runner);
    expect(result).toMatchObject({ ok: true, kind: "reviewer-candidates" });
    if (!result.ok || result.kind !== "reviewer-candidates") throw new Error("expected candidates");
    expect(result.candidates).toHaveLength(2);
    expect(result.unavailable).toBeUndefined();
  });
});
