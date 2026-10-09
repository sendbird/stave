import { describe, expect, test } from "bun:test";
import { invalidateGhAuthCache } from "../electron/host-service/gh-auth";
import { createPullRequestWatchReader } from "../electron/host-service/pull-request-watch-reader";
import type { ScmCommandRunner } from "../electron/host-service/scm-runtime";

const CWD = "/tmp/stave-pr-watch-reader";

const ok = (stdout = "") => ({ ok: true, code: 0, stdout, stderr: "" });
const fail = (stderr: string) => ({ ok: false, code: 1, stdout: "", stderr });

function pullRequest(patch: Record<string, unknown> = {}) {
  return {
    number: 7,
    title: "feat: uploads",
    state: "OPEN",
    isDraft: false,
    url: "https://github.com/acme/app/pull/7",
    reviewDecision: "",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    statusCheckRollup: [{ __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "SUCCESS" }],
    mergedAt: null,
    baseRefName: "main",
    headRefName: "feature",
    headRefOid: "abc123",
    ...patch,
  };
}

function scripted(handler: (command: string, args: string[]) => ReturnType<typeof ok> | undefined) {
  const calls: string[] = [];
  const run: ScmCommandRunner = async (request) => {
    const args = request.commandArgs ?? [];
    calls.push(`${request.command} ${args.slice(0, 2).join(" ")}`);
    if (request.command === "gh" && args[0] === "auth") return ok("logged in");
    return handler(request.command, args) ?? fail(`unexpected ${request.command} ${args.join(" ")}`);
  };
  return { run, calls };
}

function reader(run: ScmCommandRunner, cwd: string | null = CWD) {
  return createPullRequestWatchReader({ resolveWorkspacePath: async () => cwd, runCommand: run });
}

describe("pull request watch reader", () => {
  test("reads the branch's pull request and asks for checks only when the rollup failed", async () => {
    invalidateGhAuthCache();
    const { run, calls } = scripted((command, args) => {
      if (command === "git" && args[0] === "rev-parse") return ok("feature\n");
      if (command === "gh" && args[1] === "list") return ok(JSON.stringify([pullRequest()]));
      return undefined;
    });
    const read = await reader(run)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: null, events: ["checks_failed", "merge_conflict"] });
    expect(read).toEqual({
      ok: true,
      pullRequest: {
        number: 7,
        url: "https://github.com/acme/app/pull/7",
        title: "feat: uploads",
        state: "OPEN",
        headRefOid: "abc123",
        baseRefName: "main",
        conflicting: false,
        failingChecks: [],
        checksPending: false,
        reviewComments: [],
      },
    });
    expect(calls.some((call) => call.startsWith("gh pr checks"))).toBe(false);
    expect(calls.some((call) => call.startsWith("gh api"))).toBe(false);
  });

  test("by number once locked on, with failing checks, the conflict and unresolved review comments", async () => {
    invalidateGhAuthCache();
    const { run, calls } = scripted((command, args) => {
      if (command === "gh" && args[0] === "pr" && args[1] === "view") {
        expect(args[2]).toBe("7");
        return ok(
          JSON.stringify(
            pullRequest({
              mergeable: "CONFLICTING",
              statusCheckRollup: [{ __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "FAILURE" }],
            }),
          ),
        );
      }
      if (command === "gh" && args[1] === "checks") {
        return ok(
          JSON.stringify([
            { name: "lint", state: "FAILURE", link: "https://github.com/acme/app/actions/runs/1/job/2" },
            { name: "unit", state: "SUCCESS", link: "https://x" },
            { name: "e2e", state: "IN_PROGRESS" },
          ]),
        );
      }
      if (command === "gh" && args[0] === "api" && args[1] === "graphql") {
        return ok(
          JSON.stringify({
            data: {
              repository: {
                pullRequest: {
                  title: "feat: uploads",
                  headRefOid: "abc123",
                  url: "https://github.com/acme/app/pull/7",
                  reviewThreads: {
                    totalCount: 3,
                    nodes: [
                      { id: "t1", isResolved: false, isOutdated: false, path: "src/a.ts", line: 4, comments: { totalCount: 1, nodes: [{ id: "c1", body: "Rename this.", createdAt: "2026-10-09T00:00:00Z", url: "https://x/c1", author: { login: "alice" } }] } },
                      { id: "t2", isResolved: true, isOutdated: false, path: "src/b.ts", line: 1, comments: { totalCount: 1, nodes: [{ id: "c2", body: "Done.", createdAt: "", url: "", author: { login: "bob" } }] } },
                      { id: "t3", isResolved: false, isOutdated: true, path: "src/c.ts", line: 1, comments: { totalCount: 1, nodes: [{ id: "c3", body: "Old.", createdAt: "", url: "", author: { login: "bob" } }] } },
                    ],
                  },
                },
              },
            },
          }),
        );
      }
      if (command === "gh" && args[0] === "api") return ok(JSON.stringify({ check_runs: [] }));
      return undefined;
    });
    const read = await reader(run)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: 7, events: ["checks_failed", "merge_conflict", "review_comments"] });
    expect(read.ok).toBe(true);
    const pr = read.ok ? read.pullRequest : null;
    expect(pr?.conflicting).toBe(true);
    expect(pr?.failingChecks).toEqual([{ name: "lint", link: "https://github.com/acme/app/actions/runs/1/job/2" }]);
    expect(pr?.reviewComments.map((comment) => comment.id)).toEqual(["c1"]);
    expect(pr?.reviewComments[0]).toMatchObject({ author: "alice", path: "src/a.ts", line: 4 });
    expect(calls.some((call) => call.startsWith("gh pr list"))).toBe(false);
  });

  test("reports a failed read instead of an empty pull request", async () => {
    invalidateGhAuthCache();
    const { run } = scripted((command, args) => {
      if (command === "gh" && args[1] === "view") return fail("HTTP 502: Bad Gateway\nmore");
      return undefined;
    });
    expect(await reader(run)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: 7, events: ["checks_failed"] })).toEqual({
      ok: false,
      error: "HTTP 502: Bad Gateway",
    });
    expect(await reader(run, null)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: 7, events: ["checks_failed"] })).toMatchObject({
      ok: false,
    });
  });
});
