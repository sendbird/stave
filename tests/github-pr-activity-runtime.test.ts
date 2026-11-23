import { beforeEach, expect, test } from "bun:test";
import {
  boundedPrLogTail,
  buildPrCommentArgs,
  buildPrRerunArgs,
  buildPrThreadWriteArgs,
  parsePrWorkflowJobs,
  parsePrWorkflowRuns,
  runGitHubPrActivity,
} from "../electron/host-service/github-pr-activity-runtime";
import { invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import type { runCommandArgs } from "../electron/main/utils/command";
import { GITHUB_PR_LOG_MAX_BYTES } from "../src/lib/github-pr-activity";
import { GitHubPrActivityArgsSchema } from "../electron/main/ipc/schemas";

const prUrl = "https://github.com/acme/widgets/pull/42";
const ref = { owner: "acme", repo: "widgets", number: 42 };
const threadId = "PRRT_abc";
const workflow = (url: string, name: string) => ({ checkSuite: { workflowRun: { url, workflow: { name } } } });
const rollup = { data: { repository: { pullRequest: { commits: { nodes: [
  { commit: { statusCheckRollup: { contexts: {
    pageInfo: { hasNextPage: false },
    nodes: [
      workflow("https://github.com/Acme/Widgets/actions/runs/333", "Build"),
      workflow("https://github.com/acme/widgets/actions/runs/333", "Build"),
      workflow("https://github.com/acme/widgets/actions/runs/222", "Lint"),
      workflow("https://github.com/acme/other/actions/runs/444", "Other"),
      workflow("https://example.test/acme/widgets/actions/runs/555", "Spoof"),
      { detailsUrl: "https://github.com/acme/widgets/actions/runs/666/job/123", checkSuite: { workflowRun: null } },
    ],
  } } } },
] } } } } };
const failedJob = {
  id: 988, run_id: 333, name: "Linux", status: "completed", conclusion: "failure",
  steps: [
    { number: 1, name: "Checkout", conclusion: "success" },
    { number: 2, name: "Run tests", conclusion: "failure" },
    { number: 3, name: "Upload", conclusion: "skipped" },
  ],
};
const threadTarget = {
  repository: { nameWithOwner: "acme/widgets" }, pullRequest: { number: 42 },
  isResolved: false, viewerCanReply: true, viewerCanResolve: true, viewerCanUnresolve: false,
};

type Command = Parameters<typeof runCommandArgs>[0];
const ok = (payload: unknown) => ({ ok: true, code: 0, stdout: JSON.stringify(payload), stderr: "" });
const failed = (stderr: string) => ({ ok: false, code: -1, stdout: "", stderr });

function fixture(...responses: Awaited<ReturnType<typeof runCommandArgs>>[]) {
  const calls: Command[] = [];
  const runner: typeof runCommandArgs = async (command) => {
    calls.push(command);
    const result = responses.shift();
    if (!result) throw new Error("Unexpected gh command");
    return result;
  };
  return { calls, runner };
}

beforeEach(() => invalidateGhAuthCache());

test("accepts only explicit PR targets and strictly typed operations", () => {
  expect(GitHubPrActivityArgsSchema.safeParse({ action: "log", prUrl, runId: 333, jobId: 988 }).success).toBe(true);
  for (const args of [
    { action: "rerun", prUrl, runId: "--watch", attempt: 1 },
    { action: "discussion", prUrl: "https://github.com/acme/../pull/42" },
    { action: "comment", prUrl, body: "   " },
    { action: "reply", prUrl, threadId: "abc\n123", body: "Hello" },
    { action: "runs", prUrl, args: ["--repo", "unrelated"] },
  ]) {
    expect(GitHubPrActivityArgsSchema.safeParse(args).success).toBe(false);
  }
});

test("writes use explicit targets and transport comment bodies through stdin", () => {
  const body = "@local.txt\n--repo another/repository";
  expect(buildPrCommentArgs(ref, body)).toEqual({
    commandArgs: ["api", "repos/acme/widgets/issues/42/comments", "--hostname", "github.com", "--method", "POST", "--input", "-"],
    input: JSON.stringify({ body }),
  });
  const reply = buildPrThreadWriteArgs({ action: "reply", prUrl, threadId, body });
  expect(reply.commandArgs).toEqual(["api", "graphql", "--hostname", "github.com", "--method", "POST", "--input", "-"]);
  expect(JSON.parse(reply.input!)).toMatchObject({ variables: { id: threadId, body } });
  expect(JSON.parse(reply.input!).query).toContain("addPullRequestReviewThreadReply");
  const resolve = buildPrThreadWriteArgs({ action: "resolve", prUrl, threadId, resolved: true });
  const unresolve = buildPrThreadWriteArgs({ action: "resolve", prUrl, threadId, resolved: false });
  expect(resolve.commandArgs.join(" ")).toContain("resolveReviewThread(input:{threadId:$id})");
  expect(unresolve.commandArgs.join(" ")).toContain("unresolveReviewThread(input:{threadId:$id})");
  expect(buildPrRerunArgs(ref, 333)).toEqual(["run", "rerun", "333", "--repo", "github.com/acme/widgets", "--failed"]);
});

test("discussion preserves outdated locations, dates, permissions and truncation", async () => {
  const comment = { id: "comment-1", body: "Test the edge case.", createdAt: "2026-11-20T09:30:00Z", url: prUrl, author: { login: "reviewer" } };
  const { calls, runner } = fixture(ok(true), ok({
    data: { repository: { pullRequest: {
      comments: { nodes: [comment], totalCount: 3 },
      reviewThreads: { totalCount: 2, nodes: [{
        id: threadId, isResolved: false, isOutdated: true, path: "src/widget.ts", originalLine: 92, line: null,
        viewerCanReply: true, viewerCanResolve: true, viewerCanUnresolve: false,
        comments: { nodes: [comment], totalCount: 1 },
      }] },
    } } },
  }));
  expect(await runGitHubPrActivity({ action: "discussion", prUrl }, runner)).toMatchObject({
    ok: true, kind: "discussion", omittedThreads: 1, omittedComments: 2,
    comments: [{ author: "reviewer", createdAt: comment.createdAt }],
    threads: [{ originalLine: 92, line: null, isOutdated: true, viewerCanReply: true, viewerCanResolve: true }],
  });
  expect(calls[1]?.commandArgs).toEqual(expect.arrayContaining(["owner=acme", "repo=widgets", "pr=42", "discussion=true"]));
  expect(calls).toHaveLength(2);
});

test("rejects a thread from a different PR or repo before the mutation", async () => {
  for (const node of [
    { ...threadTarget, pullRequest: { number: 43 } },
    { ...threadTarget, repository: { nameWithOwner: "else/widgets" } },
  ]) {
    invalidateGhAuthCache();
    const { calls, runner } = fixture(ok(true), ok({ data: { node } }));
    expect(await runGitHubPrActivity({ action: "reply", prUrl, threadId, body: "Hi" }, runner))
      .toMatchObject({ ok: false, reason: "wrong-thread" });
    expect(calls).toHaveLength(2);
  }
});

test("checks thread permissions and recognizes a GraphQL error response", async () => {
  let mock = fixture(ok(true), ok({ data: { node: { ...threadTarget, viewerCanResolve: false } } }));
  expect(await runGitHubPrActivity({ action: "resolve", prUrl, threadId, resolved: true }, mock.runner))
    .toMatchObject({ ok: false, reason: "thread-permission" });
  expect(mock.calls).toHaveLength(2);
  invalidateGhAuthCache();
  mock = fixture(ok(true), ok({ data: { node: threadTarget } }), ok({ data: { addPullRequestReviewThreadReply: null }, errors: [{ message: "Denied" }] }));
  expect(await runGitHubPrActivity({ action: "reply", prUrl, threadId, body: "Hi" }, mock.runner))
    .toMatchObject({ ok: false, reason: "invalid-response" });
  expect(mock.calls).toHaveLength(3);
});

test("maps unique Actions runs for the right repository and failed job steps", () => {
  expect(parsePrWorkflowRuns(ref, rollup.data)).toEqual({
    runs: [{ id: 333, name: "Build" }, { id: 222, name: "Lint" }],
    partial: false,
  });
  expect(parsePrWorkflowJobs({ total_count: 51, jobs: [failedJob] })).toEqual({
    omitted: 50,
    jobs: [{
      id: 988, name: "Linux", status: "completed", conclusion: "failure",
      failedSteps: [{ name: "Run tests", number: 2 }],
    }],
  });
});

test("refreshes run association and reads jobs for the current attempt only", async () => {
  const { calls, runner } = fixture(ok(true), ok(rollup), ok({ run_attempt: 2, status: "completed", conclusion: "failure" }), ok({ total_count: 1, jobs: [failedJob] }));
  expect(await runGitHubPrActivity({ action: "jobs", prUrl, runId: 333 }, runner))
    .toMatchObject({ ok: true, kind: "jobs", attempt: 2, jobs: [{ id: 988 }] });
  expect(calls[1]?.commandArgs).toEqual(expect.arrayContaining(["graphql", "--hostname", "github.com", "owner=acme", "repo=widgets", "pr=42"]));
  expect(calls[1]?.commandArgs?.join(" ")).toContain("checkSuite{workflowRun");
  expect(calls[3]?.commandArgs).toContain("repos/acme/widgets/actions/runs/333/attempts/2/jobs?per_page=50");
});

test("stale attempts and runs without PR association cannot be re-run", async () => {
  let mock = fixture(ok(true), ok(rollup));
  expect(await runGitHubPrActivity({ action: "rerun", prUrl, runId: 444, attempt: 1 }, mock.runner))
    .toMatchObject({ ok: false, reason: "unlinked-run" });
  expect(mock.calls).toHaveLength(2);
  invalidateGhAuthCache();
  mock = fixture(ok(true), ok(rollup), ok({ run_attempt: 2, status: "completed", conclusion: "failure" }));
  expect(await runGitHubPrActivity({ action: "rerun", prUrl, runId: 333, attempt: 1 }, mock.runner))
    .toMatchObject({ ok: false, reason: "stale-run" });
  expect(mock.calls).toHaveLength(3);
  invalidateGhAuthCache();
  mock = fixture(ok(true), ok(rollup), ok({ run_attempt: 2, status: "completed", conclusion: "failure" }), ok(null));
  expect(await runGitHubPrActivity({ action: "rerun", prUrl, runId: 333, attempt: 2 }, mock.runner))
    .toEqual({ ok: true, kind: "written" });
  expect(mock.calls[3]?.commandArgs).toEqual(buildPrRerunArgs(ref, 333));
});

test("a job from another run cannot be used to request log output", async () => {
  const { calls, runner } = fixture(ok(true), ok(rollup), ok({ ...failedJob, run_id: 444 }));
  expect(await runGitHubPrActivity({ action: "log", prUrl, runId: 333, jobId: 988 }, runner))
    .toMatchObject({ ok: false, reason: "invalid-job" });
  expect(calls).toHaveLength(3);
});

test("only a failed job's bounded and redacted UTF-8 log tail crosses the bridge", async () => {
  const log = "🧪".repeat(GITHUB_PR_LOG_MAX_BYTES) + "\n\u001b[31mfailed\u001b[0m";
  const { calls, runner } = fixture(ok(true), ok(rollup), ok(failedJob), { ...ok(null), stdout: log });
  const response = await runGitHubPrActivity({ action: "log", prUrl, runId: 333, jobId: 988 }, runner);
  expect(response).toMatchObject({ ok: true, kind: "log", truncated: true });
  if (!response.ok || response.kind !== "log") throw new Error("Missing log");
  expect(Buffer.byteLength(response.text)).toBeLessThanOrEqual(GITHUB_PR_LOG_MAX_BYTES);
  expect(response.text.endsWith("\nfailed")).toBe(true);
  expect(response.text).not.toMatch(/[\u001b\ufffd]/);
  expect(boundedPrLogTail("partial sensitive line\nAPI_KEY=abcdef1234567890\nfailed", true))
    .toEqual({ text: "[redacted: line matched credential-assignment]\nfailed", truncated: true });
  expect(calls[3]?.commandArgs).toEqual(["run", "view", "--repo", "github.com/acme/widgets", "--job", "988", "--log-failed"]);
});

test("reports missing CLI, auth, timeout and malformed responses separately", async () => {
  for (const [stderr, reason] of [
    ["Error: spawn gh ENOENT", "missing-gh"],
    ["You are not logged into any GitHub hosts. Run gh auth login.", "unauthenticated"],
    ["Command timed out after 10000ms.", "timeout"],
  ]) {
    invalidateGhAuthCache();
    const { calls, runner } = fixture(failed(stderr));
    expect(await runGitHubPrActivity({ action: "runs", prUrl }, runner)).toMatchObject({ ok: false, reason });
    expect(calls[0]?.commandArgs).toEqual(["auth", "status", "--hostname", "github.com"]);
    expect(calls).toHaveLength(1);
  }
  invalidateGhAuthCache();
  const { runner } = fixture(ok(true), ok({ unexpectedly: "empty" }));
  expect(await runGitHubPrActivity({ action: "runs", prUrl }, runner))
    .toMatchObject({ ok: false, reason: "invalid-response" });
});

test("posts a top-level comment once and reports uncertain delivery on timeout", async () => {
  const args = { action: "comment", prUrl, body: "Ready for review." } as const;
  const mock = fixture(ok(true), ok({ id: 42 }));
  expect(await runGitHubPrActivity(args, mock.runner)).toEqual({ ok: true, kind: "written" });
  expect(mock.calls[1]).toMatchObject(buildPrCommentArgs(ref, args.body));
  invalidateGhAuthCache();
  const timeout = fixture(ok(true), failed("Command timed out after 18000ms."));
  expect(await runGitHubPrActivity(args, timeout.runner)).toMatchObject({ ok: false, reason: "timeout" });
  expect(timeout.calls).toHaveLength(2);
});
