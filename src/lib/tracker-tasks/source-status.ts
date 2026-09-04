import { TRACKER_SOURCE_LABELS } from "@/lib/tracker-tasks/context";
import {
  TRACKER_SOURCE_IDS,
  type TrackerSourceAvailability,
  type TrackerSourceId,
  type TrackerSourceSyncStatus,
} from "@/lib/tracker-tasks/types";

/**
 * One vocabulary for "why is this source not giving me rows".
 *
 * It lives here rather than in the surface because three places have to agree:
 * the list, its empty state, and the Settings card. While the strings were
 * private to the list, Settings could only report the *enabled flag* — so a Jira
 * connector switched on but never given a credential showed as an enabled
 * source next to a permanently empty list, and nothing anywhere named the
 * missing credential.
 */

/**
 * What a source needs before it can return anything.
 *
 * Each string names the next action rather than the internal state, because the
 * only useful thing an empty list can say is what to do about it.
 */
export const TRACKER_AVAILABILITY_HINTS: Record<
  TrackerSourceAvailability,
  string
> = {
  ready: "Connected.",
  disabled: "Turned off in Settings → Tasks.",
  unpaired: "Pair this tracker in Settings → Integrations.",
  not_configured: "Add the site URL, account email, and API token in Settings.",
  secure_storage_unavailable:
    "The OS keychain is unavailable, so the credential cannot be read.",
};

/** Short label for the state itself, for a badge or a row heading. */
const AVAILABILITY_HEADLINES: Record<TrackerSourceAvailability, string> = {
  ready: "Connected",
  disabled: "Off",
  unpaired: "Not paired",
  not_configured: "Needs a credential",
  secure_storage_unavailable: "Keychain unavailable",
};

/**
 * Error codes worth translating.
 *
 * Anything unrecognised is shown verbatim: a code the user can quote in a bug
 * report beats a generic sentence that hides which call failed.
 */
export const TRACKER_ERROR_HINTS: Record<string, string> = {
  unauthorized: "The saved credential was rejected.",
  forbidden: "The account cannot see this list.",
  invalid_jql: "The saved JQL query was rejected.",
  rate_limited: "The tracker is rate-limiting requests.",
  network_unavailable: "The tracker could not be reached.",
  response_too_large:
    "Crane sent a page too large for this Stave. Refresh to try a smaller page. If it keeps failing, the host needs to pack fewer tickets per page.",
  invalid_response:
    "Crane sent a ticket page Stave could not read. This is a host problem, not your pairing.",
  not_found: "The tracker route Stave asked for does not exist.",
  tasks_api_unavailable:
    "This Crane installation does not serve the task list yet, so only its dispatched jobs work. Nothing is wrong with your pairing.",
  tasks_disabled:
    "This Crane installation has the task list turned off. Dispatched jobs still work.",
};

/**
 * Failures a retry cannot fix.
 *
 * These are states of the server or the configuration, not transient faults, so
 * they read as a note rather than an error and carry no Retry button: offering
 * one that is guaranteed to fail teaches the user to distrust the whole banner.
 */
const NOT_RETRYABLE: ReadonlySet<string> = new Set([
  "tasks_api_unavailable",
  "tasks_disabled",
  "invalid_jql",
  "unauthorized",
  "forbidden",
]);

/**
 * What the user can do about a source right now.
 *
 * `setup` and `blocked` both mean "no rows until something changes", but they
 * are answered in different places — Settings for one, the server or the
 * account for the other — so the surface must not merge them.
 */
export type TrackerSourceCondition =
  "producing" | "syncing" | "unknown" | "setup" | "error" | "blocked";

export interface TrackerSourceSummary {
  source: TrackerSourceId;
  label: string;
  condition: TrackerSourceCondition;
  /** Two or three words naming the state. */
  headline: string;
  /** One sentence naming the cause or the next action. */
  detail: string;
  /** Whether a Retry could plausibly change the outcome. */
  retryable: boolean;
  /** Whether the fix lives in Settings. */
  fixInSettings: boolean;
  taskCount: number;
  lastSyncedAt: string | null;
}

function describeError(code: string): string {
  return TRACKER_ERROR_HINTS[code] ?? code;
}

/**
 * Reduce one source's raw status to something renderable.
 *
 * A `null` status means main has not reported yet, which is a real state on a
 * cold start. It gets its own condition rather than being dropped or filed as a
 * setup step: dropping it is how an unconfigured tracker became invisible, and
 * calling it a setup step would accuse a healthy install of being misconfigured
 * for the few hundred milliseconds before the first status arrives.
 */
export function summarizeTrackerSource(
  source: TrackerSourceId,
  status: TrackerSourceSyncStatus | null,
): TrackerSourceSummary {
  const label = TRACKER_SOURCE_LABELS[source];
  if (!status) {
    return {
      source,
      label,
      condition: "unknown",
      headline: "Checking",
      detail: "Stave has not checked this tracker yet.",
      retryable: false,
      fixInSettings: false,
      taskCount: 0,
      lastSyncedAt: null,
    };
  }

  const base = {
    source,
    label,
    taskCount: status.taskCount,
    lastSyncedAt: status.lastSyncedAt,
  };

  if (status.availability !== "ready") {
    return {
      ...base,
      condition: "setup",
      headline: AVAILABILITY_HEADLINES[status.availability],
      detail: TRACKER_AVAILABILITY_HINTS[status.availability],
      retryable: false,
      // The keychain is an OS-level problem. A Tasks toggle that is off is
      // already the control; sending people to Integrations would look like
      // the connector itself is broken.
      fixInSettings:
        status.availability !== "secure_storage_unavailable" &&
        status.availability !== "disabled",
    };
  }

  if (status.lastErrorCode !== null) {
    const retryable = !NOT_RETRYABLE.has(status.lastErrorCode);
    return {
      ...base,
      condition: retryable ? "error" : "blocked",
      headline: retryable ? "Did not sync" : "Unavailable",
      detail: describeError(status.lastErrorCode),
      retryable,
      // A rejected credential or query is fixed in Settings; a server that does
      // not serve the route is not.
      fixInSettings:
        status.lastErrorCode === "unauthorized" ||
        status.lastErrorCode === "forbidden" ||
        status.lastErrorCode === "invalid_jql",
    };
  }

  if (status.syncing) {
    return {
      ...base,
      condition: "syncing",
      headline: "Syncing",
      detail: "Fetching the latest tickets.",
      retryable: false,
      fixInSettings: false,
    };
  }

  return {
    ...base,
    condition: "producing",
    headline: "Connected",
    detail:
      status.taskCount === 1
        ? "1 ticket cached."
        : `${status.taskCount} tickets cached.`,
    retryable: true,
    fixInSettings: false,
  };
}

/** Every source, in a stable order, whether or not main has reported it. */
export function describeTrackerSources(
  syncBySource: Partial<
    Record<TrackerSourceId, TrackerSourceSyncStatus | null>
  >,
): TrackerSourceSummary[] {
  return TRACKER_SOURCE_IDS.map((source) =>
    summarizeTrackerSource(source, syncBySource[source] ?? null),
  );
}

/**
 * Whether any source could return a row right now.
 *
 * `producing` and `syncing` both count: a source mid-refresh is working, and an
 * empty list under it means "nothing assigned", not "nothing connected". This is
 * the distinction the empty state got wrong — it told a user with no working
 * tracker that they had no assigned work.
 */
export function hasProducingTrackerSource(
  summaries: readonly TrackerSourceSummary[],
): boolean {
  return summaries.some(
    (summary) =>
      summary.condition === "producing" || summary.condition === "syncing",
  );
}

/**
 * Whether any source has not answered yet.
 *
 * The surface uses this to hold its verdict: on a cold start the cache is empty
 * and no status has arrived, and announcing "no tracker is connected" in that
 * window would be a wrong answer that corrects itself a moment later.
 */
export function hasPendingTrackerSource(
  summaries: readonly TrackerSourceSummary[],
): boolean {
  return summaries.some((summary) => summary.condition === "unknown");
}

/** Sources the user has to act on, in the order they should be shown. */
export function listActionableTrackerSources(
  summaries: readonly TrackerSourceSummary[],
): TrackerSourceSummary[] {
  const rank: Record<TrackerSourceCondition, number> = {
    error: 0,
    blocked: 1,
    setup: 2,
    unknown: 3,
    syncing: 4,
    producing: 5,
  };
  return summaries
    .filter(
      (summary) =>
        summary.condition === "error" ||
        summary.condition === "blocked" ||
        summary.condition === "setup",
    )
    .sort((a, b) => rank[a.condition] - rank[b.condition]);
}
