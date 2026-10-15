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
        // Every check finished and none failed: what a run waiting on the checks wakes on.
        checksPassed: true,
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
    expect(pr?.checksPassed).toBeUndefined();
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

  test("reads approvals and change requests by review id only when asked", async () => {
    invalidateGhAuthCache();
    const queries: string[] = [];
    const { run } = scripted((command, args) => {
      if (command === "gh" && args[1] === "view") return ok(JSON.stringify(pullRequest({ reviewDecision: "APPROVED" })));
      if (command === "gh" && args[0] === "api" && args[1] === "graphql") {
        const query = args.find((arg) => arg.startsWith("query=")) ?? "";
        queries.push(query.includes("states:[APPROVED,CHANGES_REQUESTED]") ? "reviews" : "threads");
        if (query.includes("states:[APPROVED,CHANGES_REQUESTED]")) {
          expect(args).toEqual(expect.arrayContaining(["owner=acme", "repo=app", "pr=7"]));
          return ok(JSON.stringify({ data: { repository: { pullRequest: { reviews: { nodes: [
            { id: "PRR_1", state: "CHANGES_REQUESTED", submittedAt: "2026-10-09T00:00:00Z", author: { login: "bob" } },
            { id: "PRR_2", state: "APPROVED", submittedAt: "2026-10-10T00:00:00Z", author: { login: "bob" } },
            { id: "PRR_3", state: "COMMENTED", submittedAt: "2026-10-10T01:00:00Z", author: { login: "carol" } },
          ] } } } } }));
        }
        return ok(JSON.stringify({ data: { repository: { pullRequest: {
          title: "feat: uploads", headRefOid: "abc123", url: "https://github.com/acme/app/pull/7",
          reviewThreads: { totalCount: 0, nodes: [] },
        } } } }));
      }
      if (command === "gh" && args[0] === "api") return ok(JSON.stringify({ check_runs: [] }));
      return undefined;
    });
    const asked = await reader(run)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: 7, events: ["review_comments"], reviews: true });
    expect(asked.ok ? asked.pullRequest?.reviews : "unread").toEqual([
      { id: "PRR_1", state: "CHANGES_REQUESTED", author: "bob", submittedAt: "2026-10-09T00:00:00Z" },
      { id: "PRR_2", state: "APPROVED", author: "bob", submittedAt: "2026-10-10T00:00:00Z" },
    ]);
    expect(queries).toEqual(["threads", "reviews"]);
    // A wake-up's review watch does not ask, so it makes no extra call.
    const watched = await reader(run)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: 7, events: ["review_comments"] });
    expect(watched.ok ? watched.pullRequest?.reviews : "unread").toBeUndefined();
    expect(queries).toEqual(["threads", "reviews", "threads"]);
  });

  test("bounds every command it runs, so a hung gh ends as a failed read", async () => {
    invalidateGhAuthCache();
    const timeouts: Array<[string, number | undefined]> = [];
    const run: ScmCommandRunner = async (request) => {
      const args = request.commandArgs ?? [];
      timeouts.push([`${request.command} ${args.slice(0, 2).join(" ")}`, request.timeoutMs]);
      if (request.command === "gh" && args[0] === "auth") return ok("logged in");
      if (request.command === "git") return ok("feature\n");
      if (request.command === "gh" && args[1] === "list") return ok("[]");
      if (request.command === "gh" && args[1] === "view") {
        return ok(JSON.stringify(pullRequest({ statusCheckRollup: [{ __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "FAILURE" }] })));
      }
      if (request.command === "gh" && args[1] === "checks") return ok("[]");
      if (request.command === "gh" && args[1] === "graphql") {
        return ok(JSON.stringify({ data: { repository: { pullRequest: {
          title: "", headRefOid: "abc123", url: "https://github.com/acme/app/pull/7", reviewThreads: { totalCount: 0, nodes: [] },
          reviews: { nodes: [] },
        } } } }));
      }
      return ok(JSON.stringify({ check_runs: [] }));
    };
    const read = await reader(run)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: null,
      events: ["checks_failed", "review_comments"], reviews: true });
    expect(read.ok).toBe(true);
    expect(timeouts.map(([call]) => call)).toEqual(expect.arrayContaining(["gh auth status", "gh pr view", "gh pr checks", "gh api graphql"]));
    for (const [call, timeoutMs] of timeouts) {
      expect({ call, bounded: typeof timeoutMs === "number" && timeoutMs > 0 && timeoutMs <= 60_000 }).toEqual({ call, bounded: true });
    }
  });

  test("an aborted read starts no further command", async () => {
    invalidateGhAuthCache();
    const controller = new AbortController();
    const { run, calls } = scripted((command, args) => {
      if (command === "gh" && args[1] === "view") {
        controller.abort();
        return ok(JSON.stringify(pullRequest({ statusCheckRollup: [{ __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "FAILURE" }] })));
      }
      return undefined;
    });
    const read = await reader(run)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: 7,
      events: ["checks_failed", "review_comments"], reviews: true, signal: controller.signal });
    expect(read).toEqual({ ok: false, error: "The pull request read was cancelled." });
    expect(calls.filter((call) => !call.startsWith("gh auth"))).toEqual(["gh pr view"]);
  });

  test("hands its signal to every gh read, so an abort kills the running one, but never to the shared auth probe", async () => {
    invalidateGhAuthCache();
    const controller = new AbortController();
    const signals: Array<[string, AbortSignal | undefined]> = [];
    const run: ScmCommandRunner = async (request) => {
      const args = request.commandArgs ?? [];
      signals.push([`${request.command} ${args.slice(0, 2).join(" ")}`, request.signal]);
      if (args[0] === "auth") return ok("logged in");
      // The running command is killed on abort, as `runCommandArgs` does.
      controller.abort();
      return request.signal?.aborted ? fail("Command was cancelled.") : ok("[]");
    };
    const read = await reader(run)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: 7, events: ["checks_failed"], signal: controller.signal });
    expect(read).toMatchObject({ ok: false });
    expect(signals).toEqual([["gh auth status", undefined], ["gh pr view", controller.signal]]);
  });

  test("a pull request of another repository is read there by every call; #7 stays on the workspace's", async () => {
    invalidateGhAuthCache();
    const commands: string[][] = [];
    const run: ScmCommandRunner = async (request) => {
      const args = request.commandArgs ?? [];
      commands.push([request.command, ...args]);
      if (args[0] === "auth") return ok("logged in");
      if (request.command === "gh" && args[1] === "view") {
        const repository = args.includes("--repo") ? args[args.indexOf("--repo") + 1] : "acme/app";
        return ok(JSON.stringify(pullRequest({
          url: `https://github.com/${repository}/pull/7`,
          statusCheckRollup: [{ __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "FAILURE" }],
        })));
      }
      if (request.command === "gh" && args[1] === "checks") return ok(JSON.stringify([{ name: "lint", state: "FAILURE" }]));
      if (request.command === "gh" && args[1] === "graphql") {
        return ok(JSON.stringify({ data: { repository: { pullRequest: {
          title: "", headRefOid: "abc123", url: "https://github.com/other/lib/pull/7", reviewThreads: { totalCount: 0, nodes: [] },
          reviews: { nodes: [] },
        } } } }));
      }
      return fail(`unexpected ${request.command} ${args.join(" ")}`);
    };
    const read = await reader(run)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: 7, repository: "github.com/other/lib",
      events: ["checks_failed", "review_comments"], reviews: true });
    expect(read).toMatchObject({ ok: true, pullRequest: { number: 7, url: "https://github.com/other/lib/pull/7", failingChecks: [{ name: "lint" }] } });
    const view = commands.find((command) => command[2] === "view")!;
    const checks = commands.find((command) => command[2] === "checks")!;
    expect(view).toEqual(expect.arrayContaining(["7", "--repo", "other/lib"]));
    expect(checks).toEqual(expect.arrayContaining(["7", "--repo", "other/lib"]));
    const graphql = commands.filter((command) => command[2] === "graphql");
    expect(graphql).toHaveLength(2);
    for (const command of graphql) expect(command).toEqual(expect.arrayContaining(["owner=other", "repo=lib", "pr=7"]));
    // Never the checkout's branch or repository.
    expect(commands.some((command) => command[0] === "git" || command[2] === "list")).toBe(false);

    // `#7` (no repository): the workspace's repository, as before.
    commands.length = 0;
    await reader(run)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: 7, repository: null, events: ["checks_failed"] });
    expect(commands.filter((command) => command[0] === "gh" && command[1] === "pr").every((command) => !command.includes("--repo"))).toBe(true);
    expect(commands.find((command) => command[2] === "view")).toEqual(expect.arrayContaining(["7"]));
  });

  test("a repository it cannot address fails the read and never falls back to the workspace's", async () => {
    invalidateGhAuthCache();
    const commands: string[][] = [];
    let viewStderr: string | null = null;
    const run: ScmCommandRunner = async (request) => {
      const args = request.commandArgs ?? [];
      commands.push([request.command, ...args]);
      if (args[0] === "auth") return ok("logged in");
      if (request.command === "gh" && args[1] === "view") {
        if (viewStderr) return fail(viewStderr);
        return ok(JSON.stringify(pullRequest({ url: "https://ghe.example.com/other/lib/pull/7" })));
      }
      return fail(`unexpected ${request.command} ${args.join(" ")}`);
    };
    const read = (repository: string, events: Array<"checks_failed" | "review_comments"> = ["checks_failed"]) =>
      reader(run)({ workspaceId: "ws-1", taskId: "t", pullRequestNumber: 7, repository, events });
    // Not a repository gh can address: no gh read starts at all.
    expect(await read("github.com/acme app/lib")).toMatchObject({ ok: false });
    expect(commands.filter((command) => command[1] !== "auth")).toEqual([]);
    // gh cannot resolve the repository: a failed read (retried), not "no pull request".
    viewStderr = "GraphQL: Could not resolve to a Repository with the name 'other/lib'. (repository)";
    expect(await read("github.com/other/lib")).toEqual({ ok: false, error: viewStderr });
    // Another host: gh is pointed there, and the github.com-only GraphQL read fails instead of reading elsewhere.
    viewStderr = null;
    commands.length = 0;
    expect(await read("ghe.example.com/other/lib", ["review_comments"])).toMatchObject({ ok: false });
    expect(commands.find((command) => command[2] === "view")).toEqual(expect.arrayContaining(["--repo", "ghe.example.com/other/lib"]));
    expect(commands.some((command) => command[0] === "git" || command[2] === "list" || command[2] === "graphql")).toBe(false);
  });
});
