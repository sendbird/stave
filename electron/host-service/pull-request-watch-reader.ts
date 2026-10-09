/**
 * Reads the pull request a `pull_request` wake-up watches, through the GitHub
 * CLI, and reduces it to `PullRequestWatchRead`.
 *
 * Used by: `electron/host-service.ts` (wired into the wake-up runtime as
 * `readPullRequestWatch`).
 *
 * Calls GitHub only for what the watch asks for: the pull request itself on
 * every read, its check rows only when the rollup reports a failure, and its
 * review threads only when review comments are watched. Every string is clipped
 * to the read schema so an oversized field can never turn into a read failure.
 */
import { bucketOfCheckState } from "../../src/lib/agent-runs/checks";
import {
  PULL_REQUEST_WATCH_LIMITS,
  type PullRequestWatchComment,
  type PullRequestWatchEvent,
  type PullRequestWatchRead,
} from "../../src/lib/supervision/pull-request-watch";
import { fetchPrContextIndex } from "./pr-context-runtime";
import {
  fetchGitHubPrStatus,
  readPullRequestChecks,
  type ScmCommandRunner,
} from "./scm-runtime";

export interface PullRequestWatchReaderDependencies {
  /** The checkout of the task's workspace, where its branch lives. */
  resolveWorkspacePath: (workspaceId: string) => Promise<string | null>;
  /** Injected in tests; production uses the real spawn. */
  runCommand?: ScmCommandRunner;
}

function firstLine(text: string) {
  return text.trim().split("\n").find((line) => line.trim())?.trim() ?? "";
}

function clip(value: string, max: number) {
  return value.length > max ? value.slice(0, max) : value;
}

function failure(detail: string, fallback: string): PullRequestWatchRead {
  return {
    ok: false,
    error: clip(firstLine(detail) || fallback, PULL_REQUEST_WATCH_LIMITS.maxErrorChars),
  };
}

export function createPullRequestWatchReader(
  dependencies: PullRequestWatchReaderDependencies,
) {
  const run = dependencies.runCommand;
  return async function readPullRequestWatch(args: {
    workspaceId: string;
    taskId: string;
    pullRequestNumber: number | null;
    events: PullRequestWatchEvent[];
  }): Promise<PullRequestWatchRead> {
    const cwd = await dependencies.resolveWorkspacePath(args.workspaceId);
    if (!cwd) {
      return failure("", "The task's workspace could not be found.");
    }
    const events = new Set(args.events);

    // By number once the watch has one, so a merged pull request still reads
    // as merged even after the branch moved on; by branch until then.
    const status = await fetchGitHubPrStatus({
      cwd,
      ...(args.pullRequestNumber ? { target: String(args.pullRequestNumber) } : {}),
      ...(run ? { runCommand: run } : {}),
    });
    if (!status.ok) {
      return failure(status.stderr, "Stave could not read the pull request.");
    }
    const pr = status.pr;
    if (!pr || pr.number < 1) {
      return { ok: true, pullRequest: null };
    }

    const open = pr.state === "OPEN";
    let failingChecks: Array<{ name: string; link: string | null }> = [];
    if (
      open &&
      events.has("checks_failed") &&
      (pr.checksRollup === "FAILURE" || pr.mergeStateStatus === "UNSTABLE")
    ) {
      const checks = await readPullRequestChecks({
        cwd,
        target: String(pr.number),
        ...(run ? { runCommand: run } : {}),
      });
      if (!checks.ok) {
        return failure(checks.stderr, "Stave could not read the pull request's checks.");
      }
      failingChecks = checks.checks
        .filter((check) => bucketOfCheckState(check.state) === "fail" && check.name.trim())
        .slice(0, PULL_REQUEST_WATCH_LIMITS.maxFailingChecks)
        .map((check) => ({
          name: clip(check.name.trim(), PULL_REQUEST_WATCH_LIMITS.maxNameChars),
          link:
            check.link && /^https?:\/\//.test(check.link)
              ? clip(check.link, PULL_REQUEST_WATCH_LIMITS.maxUrlChars)
              : null,
        }));
    }

    let reviewComments: PullRequestWatchComment[] = [];
    if (open && events.has("review_comments") && pr.url) {
      const index = await fetchPrContextIndex({
        cwd,
        prUrl: pr.url,
        ...(run ? { runCommand: run } : {}),
      });
      if (!index.ok || !index.index) {
        return failure(index.stderr, "Stave could not read the pull request's review threads.");
      }
      // Unresolved and current only: a resolved thread is settled, and an
      // outdated one points at code that already changed under it.
      reviewComments = index.index.threads
        .filter((thread) => !thread.isResolved && !thread.isOutdated)
        .flatMap((thread) =>
          thread.comments
            .filter((comment) => comment.id.trim())
            .map((comment) => ({
              id: clip(comment.id.trim(), PULL_REQUEST_WATCH_LIMITS.maxNameChars),
              author: clip(comment.author, 100),
              path: clip(thread.path, 500),
              line: thread.line,
              body: clip(comment.body, 8_000),
              url: clip(comment.url, PULL_REQUEST_WATCH_LIMITS.maxUrlChars),
              createdAt: clip(comment.createdAt, 64),
            })),
        )
        .slice(0, PULL_REQUEST_WATCH_LIMITS.maxReviewComments);
    }

    return {
      ok: true,
      pullRequest: {
        number: pr.number,
        url: clip(pr.url, PULL_REQUEST_WATCH_LIMITS.maxUrlChars),
        title: clip(pr.title, PULL_REQUEST_WATCH_LIMITS.maxTitleChars),
        state: pr.state,
        headRefOid: pr.headRefOid ? clip(pr.headRefOid, 64) : null,
        baseRefName: clip(pr.baseRefName, 300),
        conflicting: pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY",
        failingChecks,
        checksPending: pr.checksRollup === "PENDING",
        reviewComments,
      },
    };
  };
}
