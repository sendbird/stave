import { beforeEach, describe, expect, test } from "bun:test";
import {
  fetchGitHubPullRequestReviewDetail,
  listGitHubPullRequests,
  submitGitHubPullRequestReview,
} from "../electron/host-service/github-pr-review-runtime";
import { invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import { githubPrDiffTabId } from "../src/lib/github-pr-review";
import { isSnapshotDiffEditorTab } from "../src/lib/editor/snapshot-diff-tabs";

const PR_URL = "https://github.com/sendbird/stave/pull/348";
const HEAD_OID = "88a73338498bed7d96bb21c7c7f6a3c3358d5f16";

function ok(stdout: string) {
  return { ok: true, code: 0, stdout, stderr: "" };
}

function fail(stderr: string) {
  return { ok: false, code: 1, stdout: "", stderr };
}

function makeRunner(
  responses: Array<{
    match: (args: string[]) => boolean;
    respond: () => ReturnType<typeof ok> | ReturnType<typeof fail>;
  }>,
) {
  const calls: Array<{ command: string; commandArgs: string[] }> = [];
  const runCommand = (async (args: {
    command: string;
    commandArgs?: string[];
  }) => {
    const commandArgs = args.commandArgs ?? [];
    calls.push({ command: args.command, commandArgs });
    const response = responses.find((candidate) =>
      candidate.match(commandArgs),
    );
    return response
      ? response.respond()
      : fail(`unexpected call: ${commandArgs.join(" ")}`);
  }) as unknown as Parameters<typeof listGitHubPullRequests>[0]["runCommand"];
  return { calls, runCommand };
}

const authOk = {
  match: (args: string[]) => args[0] === "auth",
  respond: () => ok("Logged in"),
};

const viewerOk = {
  match: (args: string[]) => args[0] === "api" && args[1] === "user",
  respond: () => ok("reviewer\n"),
};

beforeEach(() => {
  invalidateGhAuthCache();
});

describe("listGitHubPullRequests", () => {
  test("builds the review-requested inbox and maps bounded rows", async () => {
    const { calls, runCommand } = makeRunner([
      authOk,
      viewerOk,
      {
        match: (args) => args[0] === "search" && args[1] === "prs",
        respond: () =>
          ok(
            JSON.stringify([
              {
                number: 348,
                title: "Improve source control",
                url: PR_URL,
                repository: { nameWithOwner: "sendbird/stave" },
                author: { login: "author" },
                isDraft: false,
                createdAt: "2026-08-26T10:00:00Z",
                updatedAt: "2026-08-27T01:00:00Z",
                commentsCount: 4,
              },
            ]),
          ),
      },
    ]);

    const result = await listGitHubPullRequests({
      kind: "review-requested",
      runCommand,
    });

    expect(result.ok).toBe(true);
    expect(result.viewerLogin).toBe("reviewer");
    expect(result.items[0]).toMatchObject({
      number: 348,
      repositoryWithOwner: "sendbird/stave",
      authorLogin: "author",
      commentsCount: 4,
    });
    const searchArgs = calls.find(
      (call) => call.commandArgs[0] === "search",
    )?.commandArgs;
    expect(searchArgs).toContain("--review-requested=@me");
    expect(searchArgs).toContain("--state=open");
  });

  test("uses the authored filter for My PRs", async () => {
    const { calls, runCommand } = makeRunner([
      authOk,
      viewerOk,
      {
        match: (args) => args[0] === "search",
        respond: () => ok("[]"),
      },
    ]);
    await listGitHubPullRequests({ kind: "authored", runCommand });
    const searchArgs = calls.find(
      (call) => call.commandArgs[0] === "search",
    )?.commandArgs;
    expect(searchArgs).toContain("--author=@me");
    expect(searchArgs).not.toContain("--review-requested=@me");
  });
});

describe("fetchGitHubPullRequestReviewDetail", () => {
  test("combines PR metadata, checks, timeline, and bounded file patches", async () => {
    const { runCommand } = makeRunner([
      authOk,
      viewerOk,
      {
        match: (args) => args[0] === "pr" && args[1] === "view",
        respond: () =>
          ok(
            JSON.stringify({
              number: 348,
              title: "Improve source control",
              body: "Review this carefully.",
              url: PR_URL,
              author: { login: "author" },
              isDraft: false,
              createdAt: "2026-08-26T10:00:00Z",
              updatedAt: "2026-08-27T01:00:00Z",
              baseRefName: "main",
              baseRefOid: "1111111",
              headRefName: "feature/reviews",
              headRefOid: HEAD_OID,
              reviewDecision: "REVIEW_REQUIRED",
              mergeable: "MERGEABLE",
              mergeStateStatus: "BLOCKED",
              additions: 40,
              deletions: 8,
              changedFiles: 1,
              latestReviews: [
                {
                  id: "review-1",
                  author: { login: "reviewer" },
                  body: "One question.",
                  state: "COMMENTED",
                  submittedAt: "2026-08-26T12:00:00Z",
                  url: `${PR_URL}#pullrequestreview-1`,
                },
              ],
              comments: [],
              statusCheckRollup: [
                {
                  __typename: "CheckRun",
                  name: "test",
                  status: "COMPLETED",
                  conclusion: "SUCCESS",
                  detailsUrl: "https://github.com/check/1",
                },
              ],
            }),
          ),
      },
      {
        match: (args) =>
          args[0] === "api" &&
          args.some((arg) => arg.includes("pulls/348/files")),
        respond: () =>
          ok(
            JSON.stringify([
              {
                filename: "src/app.tsx",
                previous_filename: "",
                status: "modified",
                additions: 5,
                deletions: 2,
                patch: "@@ -1,2 +1,2 @@\n-old\n+new\n context",
              },
            ]),
          ),
      },
    ]);

    const result = await fetchGitHubPullRequestReviewDetail({
      prUrl: PR_URL,
      runCommand,
    });

    expect(result.ok).toBe(true);
    expect(result.detail).toMatchObject({
      repositoryWithOwner: "sendbird/stave",
      viewerLogin: "reviewer",
      headRefOid: HEAD_OID,
      changedFiles: 1,
      filesTruncated: false,
    });
    expect(result.detail?.files[0]?.path).toBe("src/app.tsx");
    expect(result.detail?.checks[0]?.conclusion).toBe("SUCCESS");
    expect(result.detail?.timeline[0]?.kind).toBe("review");
  });

  test("rejects non-GitHub PR urls before executing gh", async () => {
    const { calls, runCommand } = makeRunner([authOk]);
    const result = await fetchGitHubPullRequestReviewDetail({
      prUrl: "https://evil.example.com/owner/repo/pull/1",
      runCommand,
    });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("submitGitHubPullRequestReview", () => {
  test("does not submit when the head changed", async () => {
    const { calls, runCommand } = makeRunner([
      authOk,
      viewerOk,
      {
        match: (args) => args[0] === "pr" && args[1] === "view",
        respond: () =>
          ok(
            JSON.stringify({
              headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              author: { login: "author" },
            }),
          ),
      },
    ]);

    const result = await submitGitHubPullRequestReview({
      prUrl: PR_URL,
      expectedHeadOid: HEAD_OID,
      event: "APPROVE",
      runCommand,
    });

    expect(result.ok).toBe(false);
    expect(result.stale).toBe(true);
    expect(calls.some((call) => call.commandArgs.includes("POST"))).toBe(false);
  });

  test("pins an approval to the verified head commit", async () => {
    const { calls, runCommand } = makeRunner([
      authOk,
      viewerOk,
      {
        match: (args) => args[0] === "pr" && args[1] === "view",
        respond: () =>
          ok(
            JSON.stringify({
              headRefOid: HEAD_OID,
              author: { login: "author" },
            }),
          ),
      },
      {
        match: (args) => args[0] === "api" && args.includes("POST"),
        respond: () =>
          ok(
            JSON.stringify({
              id: 91,
              html_url: `${PR_URL}#pullrequestreview-91`,
            }),
          ),
      },
    ]);

    const result = await submitGitHubPullRequestReview({
      prUrl: PR_URL,
      expectedHeadOid: HEAD_OID,
      event: "APPROVE",
      body: "Looks good.",
      runCommand,
    });

    expect(result.ok).toBe(true);
    expect(result.reviewId).toBe(91);
    const submitArgs = calls.find(
      (call) =>
        call.commandArgs[0] === "api" && call.commandArgs.includes("POST"),
    )?.commandArgs;
    expect(submitArgs).toContain(`commit_id=${HEAD_OID}`);
    expect(submitArgs).toContain("event=APPROVE");
    expect(submitArgs).toContain("body=Looks good.");
  });

  test("blocks approving your own pull request before mutation", async () => {
    const { calls, runCommand } = makeRunner([
      authOk,
      viewerOk,
      {
        match: (args) => args[0] === "pr" && args[1] === "view",
        respond: () =>
          ok(
            JSON.stringify({
              headRefOid: HEAD_OID,
              author: { login: "reviewer" },
            }),
          ),
      },
    ]);
    const result = await submitGitHubPullRequestReview({
      prUrl: PR_URL,
      expectedHeadOid: HEAD_OID,
      event: "APPROVE",
      runCommand,
    });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("cannot approve your own");
    expect(calls.some((call) => call.commandArgs.includes("POST"))).toBe(false);
  });
});

test("GitHub PR diff tabs are immutable snapshot diffs", () => {
  const id = githubPrDiffTabId({
    repositoryWithOwner: "sendbird/stave",
    number: 348,
    headOid: HEAD_OID,
    filePath: "src/app.tsx",
  });
  expect(isSnapshotDiffEditorTab({ id })).toBe(true);
});
