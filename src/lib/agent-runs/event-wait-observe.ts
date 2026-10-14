/**
 * What a run's event wait makes of this tick's reads: nothing yet, the event
 * (with the input its woken turn receives), or a pull request that can no
 * longer be read. The reads are the ones wake-ups already make: the pull
 * request watch reader and the delegated-task completion feed; `time` reads
 * the clock. No poller of its own.
 *
 * One receipt per event: every event has a stable key, and a key the wait
 * already delivered never wakes the run again (a failing check is keyed by
 * head and name, a review comment or an approval or change request by its
 * GitHub id, a merged or closed pull request by its state, a finished child by
 * run, step, attempt and status). A pull request event's key starts with the
 * repository and number of the pull request this read returned
 * (`pr:<host/owner/repo>#<number>|`), so one pull request's events never
 * stand in for another's, however the wait named it.
 *
 * Used by: `electron/host-service/supervision/agent-run-runtime.ts`.
 * Pure: no clock, no I/O.
 */
import {
  advancePullRequestWatchState,
  buildPullRequestWatchPrompt,
  collectPullRequestWatchSignals,
  decidePullRequestWatchStop,
  isPullRequestWatchPollDue,
  type PullRequestWatchEvent,
  type PullRequestWatchRead,
  type PullRequestWatchSnapshot,
} from "@/lib/supervision/pull-request-watch";
import { buildTaskCompletionSignalKey, type TaskCompletionSignal } from "@/lib/supervision/wake-up-policy";
import { extractDelegatedTaskDelegationKey } from "@/lib/runs/delegated-task";
import {
  AGENT_RUN_EVENT_WAIT_LIMITS,
  isPullRequestEventWait,
  parsePullRequestRef,
  type AgentRunEventWait,
  type EventWaitFact,
} from "./event-wait";

/** An event that wakes the run, with what its turn is told. */
export interface EventWaitWake {
  waitId: string;
  /** Keys this wake delivers; they never wake the run again. */
  keys: string[];
  fact: EventWaitFact;
  /** Model-facing: the woken turn's account of the event. */
  summary: string;
  /** The wait ends with this wake: a time, a named child, a merged or closed pull request. */
  final: boolean;
}

export type EventWaitOutcome =
  | { kind: "none" }
  | { kind: "event"; wake: EventWaitWake }
  /** The pull request stayed unreadable past the watch's limit. */
  | { kind: "unreadable"; detail: string };

/** What the runtime reads this tick for a wait. */
export interface EventWaitReadPlan {
  pullRequest: {
    pullRequestNumber: number | null;
    /**
     * `host/owner/repo` of a pull request the wait named by URL: every read
     * addresses that repository. Null: the workspace's repository (its
     * branch's pull request, or `#n` there).
     */
    repository: string | null;
    events: PullRequestWatchEvent[];
    reviews: boolean;
  } | null;
  completions: boolean;
}

export function planEventWaitRead(wait: AgentRunEventWait, now: Date): EventWaitReadPlan {
  if (isPullRequestEventWait(wait.kind)) {
    const due = isPullRequestWatchPollDue({ state: wait.watch ?? null, now, hasActiveTurn: false });
    const review = wait.kind === "pull_request_review";
    const named = wait.target ? parsePullRequestRef(wait.target) : null;
    return {
      pullRequest: due
        ? {
            pullRequestNumber: named?.number ?? wait.watch?.pullRequest?.number ?? null,
            repository: named?.repository ?? null,
            events: review ? ["review_comments"] : ["checks_failed"],
            reviews: review,
          }
        : null,
      completions: false,
    };
  }
  return { pullRequest: null, completions: wait.kind === "delegated_completion" };
}

/**
 * The prefix of every key an event on this pull request gets: the repository
 * and number of the pull request read, so `#7`, its URL and the branch's
 * pull request #7 share keys and pull request #8 never matches them.
 */
function pullRequestScope(args: { number: number; url: string | null | undefined; repository: string | null }): string {
  const repository = (args.url ? parsePullRequestRef(args.url)?.repository : null) ?? args.repository ?? "";
  return `pr:${repository}#${args.number}|`;
}

function clip(text: string) {
  const max = AGENT_RUN_EVENT_WAIT_LIMITS.maxSummaryChars;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function headOf(pullRequest: PullRequestWatchSnapshot) {
  return pullRequest.headRefOid || "unknown-head";
}

// i18n-ignore: model-facing standing instruction for a woken run turn
const CHECKS_FAILED_INSTRUCTION =
  "The pull request checks you waited for finished, and some failed. Find the cause, fix it on this branch within the permissions you already have, run the matching checks locally, then continue your plan. Do not skip, disable or loosen a check to make it pass. If a failure is not caused by this branch, say so.";
// i18n-ignore: model-facing standing instruction for a woken run turn
const REVIEW_INSTRUCTION = "New review activity arrived on the pull request you waited for.";

function pullRequestLine(pullRequest: PullRequestWatchSnapshot) {
  return `Pull request #${pullRequest.number}: ${pullRequest.title} — ${pullRequest.url}`;
}

function observePullRequest(args: {
  wait: AgentRunEventWait;
  read: PullRequestWatchRead;
  now: Date;
}): { wait: AgentRunEventWait; outcome: EventWaitOutcome } {
  const { read } = args;
  const consumed = new Set(args.wait.consumedKeys);
  const watchedNumber = args.wait.watch?.pullRequest?.number ?? null;
  const watch = { ...advancePullRequestWatchState({ previous: args.wait.watch ?? null, read, now: args.now }), pendingSince: null };
  const wait: AgentRunEventWait = { ...args.wait, watch };
  const none = { wait, outcome: { kind: "none" } as const };
  if (!read.ok) {
    const stop = decidePullRequestWatchStop({ kind: "read-failed", error: read.error, consecutiveFailures: watch.consecutiveReadFailures });
    return stop ? { wait, outcome: { kind: "unreadable", detail: stop.detail } } : none;
  }
  const pullRequest = read.pullRequest;
  const namedRepository = args.wait.target ? parsePullRequestRef(args.wait.target)?.repository ?? null : null;
  const stop = decidePullRequestWatchStop({ kind: "read", pullRequest, watchedNumber, signals: [] });
  if (stop && stop.reason !== "pull-request-unreadable") {
    const number = pullRequest?.number ?? watchedNumber ?? 0;
    const merged = stop.reason === "pull-request-merged";
    const scope = pullRequestScope({
      number,
      url: pullRequest?.url ?? args.wait.watch?.pullRequest?.url,
      repository: namedRepository,
    });
    const key = `${scope}pull_request:${merged ? "merged" : "closed"}`;
    if (consumed.has(key)) return none;
    return {
      wait,
      outcome: {
        kind: "event",
        wake: {
          waitId: wait.id,
          keys: [key],
          fact: { fact: merged ? "pull-request-merged" : "pull-request-closed", count: 1, pullRequestNumber: number || null },
          // i18n-ignore: model-facing event summary
          summary: `Pull request #${number} was ${merged ? "merged" : "closed without merging"}, so this wait ended.${pullRequest ? `\n${pullRequestLine(pullRequest)}` : ""}`,
          final: true,
        },
      },
    };
  }
  if (!pullRequest || pullRequest.state !== "OPEN") return none;
  const head = headOf(pullRequest);
  const scope = pullRequestScope({ number: pullRequest.number, url: pullRequest.url, repository: namedRepository });

  if (wait.kind === "pull_request_checks") {
    const failing = collectPullRequestWatchSignals({ events: ["checks_failed"], pullRequest });
    const fresh = failing.filter((signal) => !consumed.has(`${scope}${signal.key}`));
    if (fresh.length > 0) {
      return {
        wait,
        outcome: {
          kind: "event",
          wake: {
            waitId: wait.id,
            keys: failing.map((signal) => `${scope}${signal.key}`),
            fact: { fact: "checks-failed", count: pullRequest.failingChecks.length, pullRequestNumber: pullRequest.number },
            summary: clip(buildPullRequestWatchPrompt({ instruction: CHECKS_FAILED_INSTRUCTION, pullRequest, signals: fresh })),
            final: false,
          },
        },
      };
    }
    const passedKey = `${scope}checks_passed:${head}`;
    if (pullRequest.checksPassed && failing.length === 0 && !consumed.has(passedKey)) {
      return {
        wait,
        outcome: {
          kind: "event",
          wake: {
            waitId: wait.id,
            keys: [passedKey],
            fact: { fact: "checks-passed", count: 0, pullRequestNumber: pullRequest.number },
            // i18n-ignore: model-facing event summary
            summary: `${pullRequestLine(pullRequest)}\nEvery check on head ${head.slice(0, 7)} passed.`,
            final: false,
          },
        },
      };
    }
    return none;
  }

  // pull_request_review: comments, approvals and change requests submitted
  // since the wait began. Each is its own event by GitHub id, so one submitted
  // before the first read still counts, and a new approval after a change
  // request wakes the run again.
  const since = Date.parse(wait.since);
  const isNew = (at: string) => {
    const time = Date.parse(at);
    return !Number.isFinite(time) || !Number.isFinite(since) || time >= since;
  };
  const comments = collectPullRequestWatchSignals({ events: ["review_comments"], pullRequest }).filter((signal) =>
    signal.kind === "review_comments" && !consumed.has(`${scope}${signal.key}`) && isNew(signal.comment.createdAt));
  const reviews = (pullRequest.reviews ?? []).filter((review) => !consumed.has(`${scope}${reviewKey(review.id)}`) && isNew(review.submittedAt));
  if (comments.length === 0 && reviews.length === 0) return none;
  const latest = reviews.at(-1);
  const fact: EventWaitFact = comments.length > 0 || !latest
    ? { fact: "review-comments", count: comments.length, pullRequestNumber: pullRequest.number }
    : { fact: latest.state === "APPROVED" ? "review-approved" : "review-changes-requested", count: reviews.length, pullRequestNumber: pullRequest.number };
  const body = buildPullRequestWatchPrompt({ instruction: REVIEW_INSTRUCTION, pullRequest, signals: comments });
  // i18n-ignore: model-facing event summary
  const reviewLines = reviews.length > 0
    ? `\n\nNew reviews${pullRequest.headRefOid ? ` (head ${head.slice(0, 7)})` : ""}:\n${reviews.map((review) =>
      `- ${review.author ? `@${review.author}` : "A reviewer"} ${review.state === "APPROVED" ? "approved" : "requested changes"}.`).join("\n")}`
    : "";
  return {
    wait,
    outcome: {
      kind: "event",
      wake: {
        waitId: wait.id,
        keys: [...comments.map((signal) => `${scope}${signal.key}`), ...reviews.map((review) => `${scope}${reviewKey(review.id)}`)],
        fact,
        summary: clip(`${body}${reviewLines}`),
        final: false,
      },
    },
  };
}

function reviewKey(id: string) {
  return `review:${id}`;
}

function completionKey(signal: TaskCompletionSignal) {
  return `completion:${buildTaskCompletionSignalKey(signal)}`;
}

function matchesDelegatedTarget(signal: TaskCompletionSignal, target: string, parentTaskId: string) {
  return (
    signal.delegatedTaskId === target ||
    signal.runId === target ||
    extractDelegatedTaskDelegationKey({ runId: signal.runId, parentTaskId }) === target
  );
}

function observeCompletions(args: {
  wait: AgentRunEventWait;
  completions: readonly TaskCompletionSignal[];
  parentTaskId: string;
}): EventWaitOutcome {
  const { wait } = args;
  const consumed = new Set(wait.consumedKeys);
  const since = Date.parse(wait.since);
  const fresh = args.completions.filter((signal) => {
    if (consumed.has(completionKey(signal))) return false;
    // A named child wakes the run whenever it finished; any child only when it finished after the wait began.
    if (wait.target) return matchesDelegatedTarget(signal, wait.target, args.parentTaskId);
    const completed = Date.parse(signal.completedAt);
    return !Number.isFinite(completed) || !Number.isFinite(since) || completed >= since;
  });
  if (fresh.length === 0) return { kind: "none" };
  const lines = fresh.map((signal) => {
    const who = signal.delegatedTaskId ?? signal.runId;
    const why = signal.reason ? ` — ${signal.reason}` : "";
    return `- ${who} (${signal.providerId}): ${signal.status}${why}`;
  });
  return {
    kind: "event",
    wake: {
      waitId: wait.id,
      keys: fresh.map(completionKey),
      fact: { fact: "delegated-finished", count: fresh.length, pullRequestNumber: null },
      // i18n-ignore: model-facing event summary
      summary: clip([
        fresh.length === 1 ? "Delegated work you waited for finished:" : `${fresh.length} delegated tasks you waited for finished:`,
        ...lines,
        "Their answers are under Subagent results in this turn's context. Review each result before you rely on it.",
      ].join("\n")),
      final: Boolean(wait.target),
    },
  };
}

/**
 * Folds this tick's reads into the wait (the pull request watch's state, a
 * review baseline) and says what happened. Expiry and the wake cap are the
 * policy's; this only finds events.
 */
export function observeEventWait(args: {
  wait: AgentRunEventWait;
  now: Date;
  /** The task the run works on: delegated work names it as its parent. */
  parentTaskId: string;
  /** This tick's pull request read, when one was due. */
  pullRequestRead?: PullRequestWatchRead;
  /** This tick's delegated-task completion feed, for a completion wait. */
  completions?: readonly TaskCompletionSignal[];
}): { wait: AgentRunEventWait; outcome: EventWaitOutcome } {
  const { wait, now } = args;
  switch (wait.kind) {
    case "time": {
      if (!wait.at || Date.parse(wait.at) > now.getTime()) return { wait, outcome: { kind: "none" } };
      const key = `time:${wait.at}`;
      if (wait.consumedKeys.includes(key)) return { wait, outcome: { kind: "none" } };
      return {
        wait,
        outcome: {
          kind: "event",
          wake: {
            waitId: wait.id,
            keys: [key],
            fact: { fact: "time-reached", count: 1, pullRequestNumber: null },
            // i18n-ignore: model-facing event summary
            summary: `The time you waited for, ${wait.at}, has come.`,
            final: true,
          },
        },
      };
    }
    case "delegated_completion":
      return {
        wait,
        outcome: args.completions
          ? observeCompletions({ wait, completions: args.completions, parentTaskId: args.parentTaskId })
          : { kind: "none" },
      };
    case "pull_request_checks":
    case "pull_request_review":
      return args.pullRequestRead
        ? observePullRequest({ wait, read: args.pullRequestRead, now })
        : { wait, outcome: { kind: "none" } };
  }
}
