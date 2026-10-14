/**
 * Reads the pull request a `pull_request` wake-up watches, through the GitHub
 * CLI, and reduces it to `PullRequestWatchRead`.
 *
 * Used by: `electron/host-service.ts` (wired into the wake-up runtime as
 * `readPullRequestWatch`).
 *
 * Calls GitHub only for what the watch asks for: the pull request itself on
 * every read, its check rows only when the rollup reports a failure, its
 * review threads only when review comments are watched, and its approvals and
 * change requests only when asked for. Every string is clipped to the read
 * schema so an oversized field can never turn into a read failure.
 *
 * Every command is bounded (`SCM_READ_TIMEOUT_MS` unless the call sets its
 * own), so a hung `gh` ends as a failed read instead of holding the watch, and
 * the caller's abort kills the running command and starts no later one.
 *
 * A pull request named by URL (`repository`) is read in that repository by
 * every call: `gh pr view` and `gh pr checks` with `--repo`, the GraphQL reads
 * with its owner and name. One it cannot address fails the read; it never
 * falls back to the workspace's repository.
 */
import { bucketOfCheckState } from "../../src/lib/agent-runs/checks";
import { parsePrContextUrl } from "../../src/lib/pr-context";
import {
  PULL_REQUEST_WATCH_LIMITS,
  type PullRequestWatchComment,
  type PullRequestWatchEvent,
  type PullRequestWatchRead,
  type PullRequestWatchReview,
} from "../../src/lib/supervision/pull-request-watch";
import { COMMAND_CANCELLED_MESSAGE, runCommandArgs } from "../main/utils/command";
import { ensureGhAuth } from "./gh-auth";
import { fetchPrContextIndex } from "./pr-context-runtime";
import {
  fetchGitHubPrStatus,
  readPullRequestChecks,
  SCM_READ_TIMEOUT_MS,
  type ScmCommandRunner,
} from "./scm-runtime";

export interface PullRequestWatchReaderDependencies {
  /** The checkout of the task's workspace, where its branch lives. */
  resolveWorkspacePath: (workspaceId: string) => Promise<string | null>;
  /** Injected in tests; production uses the real spawn. */
  runCommand?: ScmCommandRunner;
}

const DECISION_REVIEWS_QUERY = `query($owner:String!,$repo:String!,$pr:Int!,$last:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      reviews(last:$last,states:[APPROVED,CHANGES_REQUESTED]){
        nodes{ id state submittedAt author{ login } }
      }
    }
  }
}`;

/** The newest approvals and change requests, oldest first, by GitHub review id. */
async function readDecisionReviews(args: {
  cwd: string;
  url: string;
  run: ScmCommandRunner;
}): Promise<{ ok: true; reviews: PullRequestWatchReview[] } | { ok: false; detail: string }> {
  const ref = parsePrContextUrl(args.url);
  if (!ref) return { ok: false, detail: "" };
  const auth = await ensureGhAuth({ cwd: args.cwd, runCommand: args.run });
  if (!auth.ok) return { ok: false, detail: auth.stderr };
  const result = await args.run({
    command: "gh",
    commandArgs: [
      "api", "graphql",
      "-f", `query=${DECISION_REVIEWS_QUERY}`,
      "-f", `owner=${ref.owner}`,
      "-f", `repo=${ref.repo}`,
      "-F", `pr=${ref.number}`,
      "-F", `last=${PULL_REQUEST_WATCH_LIMITS.maxReviews}`,
    ],
    cwd: args.cwd,
  });
  if (!result.ok) return { ok: false, detail: result.stderr };
  try {
    const nodes = (JSON.parse(result.stdout) as {
      data?: { repository?: { pullRequest?: { reviews?: { nodes?: unknown[] } } } };
    }).data?.repository?.pullRequest?.reviews?.nodes;
    if (!Array.isArray(nodes)) return { ok: false, detail: "" };
    return {
      ok: true,
      reviews: nodes.flatMap((node): PullRequestWatchReview[] => {
        const value = (node ?? {}) as Record<string, unknown>;
        const id = typeof value.id === "string" ? value.id.trim() : "";
        const state = value.state;
        if (!id || (state !== "APPROVED" && state !== "CHANGES_REQUESTED")) return [];
        const login = (value.author as { login?: unknown } | null | undefined)?.login;
        return [{
          id: clip(id, PULL_REQUEST_WATCH_LIMITS.maxNameChars),
          state,
          author: typeof login === "string" ? clip(login, 100) : "",
          submittedAt: typeof value.submittedAt === "string" ? clip(value.submittedAt, 64) : "",
        }];
      }).slice(-PULL_REQUEST_WATCH_LIMITS.maxReviews),
    };
  } catch {
    return { ok: false, detail: "" };
  }
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

const REPOSITORY = /^([A-Za-z0-9.-]+(?::\d{1,5})?)\/([A-Za-z0-9._-]{1,100})\/([A-Za-z0-9._-]{1,100})$/;

/**
 * A `host/owner/repo` repository (as `parsePullRequestRef` gives it) the way
 * gh addresses it: `--repo` takes `owner/repo` on github.com and
 * `host/owner/repo` elsewhere; the GraphQL reads take a pull request URL.
 * Null when it names no repository gh can address.
 */
function addressRepository(repository: string) {
  const match = REPOSITORY.exec(repository.trim());
  if (!match) return null;
  const [, host, owner, repo] = match as unknown as [string, string, string, string];
  return {
    flag: host.toLowerCase() === "github.com" ? `${owner}/${repo}` : `${host}/${owner}/${repo}`,
    pullRequestUrl: (number: number) => `https://${host}/${owner}/${repo}/pull/${number}`,
  };
}

/** `gh auth status`: cached per checkout for every reader, so never cut short (a cancelled probe would read as signed out). */
function isSharedAuthProbe(request: Parameters<ScmCommandRunner>[0]) {
  return request.command === "gh" && request.commandArgs?.[0] === "auth";
}

export function createPullRequestWatchReader(
  dependencies: PullRequestWatchReaderDependencies,
) {
  const spawn = dependencies.runCommand ?? runCommandArgs;
  return async function readPullRequestWatch(args: {
    workspaceId: string;
    taskId: string;
    pullRequestNumber: number | null;
    /**
     * `host/owner/repo` of a pull request named by URL: every call reads it
     * there. Null or absent: the workspace's repository.
     */
    repository?: string | null;
    events: PullRequestWatchEvent[];
    /** Also read the newest approvals and change requests (a run's review wait). */
    reviews?: boolean;
    /** Aborted by the caller (a paused or stopped run): the running command is killed and no later one starts. */
    signal?: AbortSignal;
  }): Promise<PullRequestWatchRead> {
    const { signal } = args;
    const run: ScmCommandRunner = (request) => {
      const shared = isSharedAuthProbe(request);
      if (!shared && signal?.aborted) {
        return Promise.resolve({ ok: false, code: -1, stdout: "", stderr: COMMAND_CANCELLED_MESSAGE });
      }
      return spawn({
        ...request,
        timeoutMs: request.timeoutMs ?? SCM_READ_TIMEOUT_MS,
        ...(!shared && signal ? { signal } : {}),
      });
    };
    const aborted = () => failure("", "The pull request read was cancelled.");
    const cwd = await dependencies.resolveWorkspacePath(args.workspaceId);
    if (!cwd) {
      return failure("", "The task's workspace could not be found.");
    }
    const events = new Set(args.events);
    const named = args.repository ? addressRepository(args.repository) : null;
    if (args.repository && (!named || !args.pullRequestNumber)) {
      return failure("", "Stave could not address the pull request's repository.");
    }
    if (signal?.aborted) return aborted();

    // By number once the watch has one, so a merged pull request still reads
    // as merged even after the branch moved on; by branch until then. A pull
    // request named by URL is read in its own repository.
    const status = await fetchGitHubPrStatus({
      cwd,
      ...(args.pullRequestNumber ? { target: String(args.pullRequestNumber) } : {}),
      ...(named ? { repository: named.flag } : {}),
      runCommand: run,
    });
    if (signal?.aborted) return aborted();
    if (!status.ok) {
      return failure(status.stderr, "Stave could not read the pull request.");
    }
    const pr = status.pr;
    if (!pr || pr.number < 1) {
      return { ok: true, pullRequest: null };
    }
    // The GraphQL reads address the named repository too, never the checkout's.
    const pullRequestUrl = named ? named.pullRequestUrl(pr.number) : pr.url;

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
        ...(named ? { repository: named.flag } : {}),
        runCommand: run,
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
    if (open && events.has("review_comments") && pullRequestUrl) {
      if (signal?.aborted) return aborted();
      const index = await fetchPrContextIndex({
        cwd,
        prUrl: pullRequestUrl,
        runCommand: run,
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

    let reviews: PullRequestWatchReview[] | null = null;
    if (open && args.reviews && pullRequestUrl) {
      if (signal?.aborted) return aborted();
      const read = await readDecisionReviews({ cwd, url: pullRequestUrl, run });
      if (!read.ok) return failure(read.detail, "Stave could not read the pull request's reviews.");
      reviews = read.reviews;
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
        ...(open && events.has("checks_failed") && pr.checksRollup === "SUCCESS" ? { checksPassed: true } : {}),
        reviewComments,
        ...(reviews ? { reviews } : {}),
      },
    };
  };
}
