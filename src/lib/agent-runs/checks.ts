/**
 * Watch checks, the pure half: normalize what GitHub reports for a pull
 * request and decide what the action does about it.
 *
 * Reads the raw check rows and the pull request's own merge fields, never the
 * renderer's derived pull request status, which reports draft, conflicts or
 * requested changes ahead of checks.
 *
 * Used by: `electron/host-service/supervision/agent-run-actions.ts`.
 */
import type { ActionResult } from "./domain";
import { AGENT_RUN_LIMITS } from "./domain";
import type { ActionOutcome } from "./policy";

/** One row of `gh pr checks --json name,state,link,startedAt`. */
export interface PullRequestCheck {
  name: string;
  state: string;
  link?: string;
  startedAt?: string;
}

/** The pull request fields the watch reads. */
export interface WatchedPullRequest {
  number: number;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  headRefOid: string | null;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: string;
  reviewDecision: string | null;
}

export type CheckBucket = "pass" | "fail" | "pending";

const PASSING_STATES = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const FAILING_STATES = new Set([
  "FAILURE",
  "ERROR",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "STALE",
]);

/** Unknown states count as pending: waiting is safer than a wrong verdict. */
export function bucketOfCheckState(state: string): CheckBucket {
  const normalized = state.trim().toUpperCase();
  if (PASSING_STATES.has(normalized)) return "pass";
  if (FAILING_STATES.has(normalized)) return "fail";
  return "pending";
}

export type ChecksObservation =
  | { kind: "no-pull-request" }
  | { kind: "closed"; state: "CLOSED" | "MERGED" }
  | { kind: "conflict"; behind: boolean }
  | { kind: "failing"; failing: PullRequestCheck[] }
  | { kind: "pending"; pending: PullRequestCheck[] }
  | { kind: "passed"; checks: PullRequestCheck[] }
  | { kind: "no-checks" };

export type ChecksObservationKind = ChecksObservation["kind"];

/**
 * What the checks say, in the design's order: without an open pull request
 * nothing can be watched; a conflict blocks before checks matter; any failure
 * outranks a pending check.
 */
export function observeChecks(args: {
  pr: WatchedPullRequest | null;
  checks: readonly PullRequestCheck[];
}): ChecksObservation {
  const { pr, checks } = args;
  if (!pr) return { kind: "no-pull-request" };
  if (pr.state !== "OPEN") return { kind: "closed", state: pr.state };
  if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") {
    return { kind: "conflict", behind: false };
  }
  if (pr.mergeStateStatus === "BEHIND") return { kind: "conflict", behind: true };
  const failing = checks.filter((check) => bucketOfCheckState(check.state) === "fail");
  if (failing.length > 0) return { kind: "failing", failing };
  const pending = checks.filter((check) => bucketOfCheckState(check.state) === "pending");
  if (pending.length > 0) return { kind: "pending", pending };
  return checks.length > 0 ? { kind: "passed", checks: [...checks] } : { kind: "no-checks" };
}

/** A pushed head may take a moment to register its checks. */
export const NO_CHECKS_GRACE_MS = 2 * 60_000;
/** How often the watch reads GitHub. */
export const CHECKS_POLL_INTERVAL_MS = 60_000;

function listNames(checks: readonly PullRequestCheck[]) {
  const names = checks.slice(0, 5).map((check) => check.name);
  const more = checks.length > 5 ? ` and ${checks.length - 5} more` : "";
  return `${names.join(", ")}${more}`;
}

function toResultChecks(checks: readonly PullRequestCheck[]) {
  return checks.slice(0, AGENT_RUN_LIMITS.facts.checks).map((check) => ({
    name: check.name.slice(0, 200),
    state: check.state.slice(0, 40) || "UNKNOWN",
    ...(check.link && /^https?:\/\//.test(check.link) ? { url: check.link } : {}),
  }));
}

/** The prompt of a repair turn: the failing checks and where their logs are. */
export function buildChecksRepairPrompt(args: {
  pr: Pick<WatchedPullRequest, "url">;
  failing: readonly PullRequestCheck[];
  repair: number;
  repairAttempts: number;
}): string {
  const lines = args.failing
    .slice(0, 10)
    .map((check) => `- ${check.name}${check.link ? `: ${check.link}` : ""}`);
  return [
    `These checks fail on the pull request ${args.pr.url}:`,
    lines.join("\n"),
    "Find the cause in the job logs, for example with `gh run view --log-failed`. Fix what this branch caused, run the matching checks locally, and commit the fix on the workspace branch.",
    "Do not skip, disable or loosen a check to make it pass. If a failure is not caused by this branch, say so and leave it.",
    `This is repair ${args.repair} of ${args.repairAttempts}. Stave pushes the branch and watches the checks again when this turn ends.`,
  ].join("\n\n");
}

const EARLIEST_REAL_START = Date.UTC(2000, 0, 1);

function minutesBetween(from: number, to: number) {
  return Math.max(0, Math.floor((to - from) / 60_000));
}

/**
 * What the watch does about one observation. `watchStartedAt` is when the
 * watch began or last pushed a repair, so the grace period and the pending
 * timeout run from the head being watched.
 */
export function decideWatchChecks(args: {
  observation: ChecksObservation;
  pr: WatchedPullRequest | null;
  now: Date;
  watchStartedAt: Date;
  timeoutMinutes: number;
  repairsUsed: number;
  repairAttempts: number;
}): ActionOutcome {
  const { observation, now } = args;
  switch (observation.kind) {
    case "passed": {
      const result: ActionResult = {
        type: "watch-checks",
        outcome: "passed",
        checks: toResultChecks(observation.checks),
      };
      return { status: "succeeded", result };
    }
    case "no-checks":
      if (now.getTime() - args.watchStartedAt.getTime() < NO_CHECKS_GRACE_MS) {
        return { status: "in-progress" };
      }
      return {
        status: "succeeded",
        result: { type: "watch-checks", outcome: "no-checks", checks: [] },
      };
    case "pending": {
      const oldest = observation.pending
        .map((check) => {
          const started = check.startedAt ? Date.parse(check.startedAt) : Number.NaN;
          return {
            check,
            // A queued check reports year 1 as its start; it has not started.
            since:
              Number.isFinite(started) && started >= EARLIEST_REAL_START
                ? started
                : args.watchStartedAt.getTime(),
          };
        })
        .sort((left, right) => left.since - right.since)[0]!;
      const age = minutesBetween(oldest.since, now.getTime());
      if (age >= args.timeoutMinutes) {
        return {
          status: "stuck",
          detail: `${oldest.check.name} has been pending for ${age} minutes.`,
        };
      }
      return { status: "in-progress" };
    }
    case "failing":
      if (args.repairsUsed < args.repairAttempts && args.pr) {
        return {
          status: "needs-turn",
          reason: "repair-checks",
          prompt: buildChecksRepairPrompt({
            pr: args.pr,
            failing: observation.failing,
            repair: args.repairsUsed + 1,
            repairAttempts: args.repairAttempts,
          }),
          detail: `Checks failed: ${listNames(observation.failing)}.`,
        };
      }
      return {
        status: "failed",
        detail:
          args.repairAttempts === 0
            ? `Checks failed: ${listNames(observation.failing)}.`
            : `Checks still fail after ${args.repairsUsed} ${args.repairsUsed === 1 ? "repair" : "repairs"}: ${listNames(observation.failing)}.`,
      };
    case "conflict":
      return {
        status: "failed",
        detail: observation.behind
          ? "The pull request is behind its base branch and must be updated before it can merge. Rebase it, or ask the agent to, then retry this stage."
          : "The pull request conflicts with its base branch. Rebase it, or ask the agent to, then retry this stage.",
      };
    case "no-pull-request":
      return {
        status: "failed",
        detail:
          "This workspace has no open pull request to watch. Open one, or add an Open draft PR stage before this one.",
      };
    case "closed":
      return {
        status: "failed",
        detail: `The pull request is ${observation.state === "MERGED" ? "merged" : "closed"}, so there are no checks to watch.`,
      };
  }
}

/**
 * A short, bounded record of one observation for the agent run's events. The
 * watch records one only when this signature changes.
 */
export function summarizeChecksObservation(args: {
  observation: ChecksObservation;
  pr: WatchedPullRequest | null;
  checks: readonly PullRequestCheck[];
}) {
  return {
    kind: args.observation.kind,
    headSha: args.pr?.headRefOid ?? null,
    reviewDecision: args.pr?.reviewDecision || null,
    checks: args.checks.slice(0, AGENT_RUN_LIMITS.facts.checks).map((check) => ({
      name: check.name.slice(0, 100),
      state: check.state.slice(0, 40),
    })),
  };
}
