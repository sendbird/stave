/**
 * Whether a run waiting between turns is still alive, in words.
 *
 * The waiting mark is a settled clock: it never moves, so on its own it cannot
 * tell a reader that anything is happening. These notes are what can: how long
 * the run has sat in its wait, when Stave last looked at what it waits for,
 * a delegate that needs the user, and delegated work that finished without
 * the run moving on. Every surface that shows a waiting run (the composer
 * shelf, the Fleet card, the Progress tab) reads them from here so the three
 * never disagree.
 *
 * Pure: the clock is an argument.
 */
import { i18n } from "@/i18n/runtime";
import { formatDuration, formatTime } from "@/i18n/format";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { taskCompletionSignalOf } from "@/lib/supervision/task-completion-signal";
import { pullRequestWatchPollIntervalMs } from "@/lib/supervision/pull-request-watch";
import { formatAge } from "./agent-run-view";
import { isPullRequestEventWait, type AgentRunEventWait } from "./event-wait";
import { selectFreshCompletions } from "./event-wait-observe";
import type { Tone } from "@/components/ads/utils/tone";

export interface WaitLivenessNote {
  text: string;
  /** `warning` when the reader should look: a failing read, a stale check, a delegate that needs them. */
  tone: Extract<Tone, "muted" | "warning">;
}

/**
 * Stave's host looks at a waiting run every few seconds and tells the window
 * at least once a minute. A look older than this means the host stopped
 * looking, not that the wait is slow.
 */
export const EVENT_WAIT_OBSERVATION_STALE_MS = 3 * 60_000;

/** How long after its delegated work ended a run is expected to have moved on. */
export const DELEGATED_WAIT_RESUME_GRACE_MS = 60_000;

/** How long a wait has run, in the shared duration words, as Fleet reads it. */
export function formatWaitDuration(ms: number): string {
  return formatDuration(ms);
}

/**
 * The waited count and its tooltip. The count starts when the run last
 * settled into its wait: a turn in between (a reply, say) starts it again,
 * and the tooltip names that moment instead of claiming the whole wait.
 */
export function describeEventWaitSince(
  wait: Pick<AgentRunEventWait, "waitingSince" | "registeredAt">,
  now: number,
): { text: string; title: string } {
  const since = wait.waitingSince ?? wait.registeredAt;
  return {
    text: formatWaitDuration(now - Date.parse(since)),
    title: i18n.t("agentRuns:eventWait.waitingSince", { time: formatTime(new Date(since), { hour: "numeric", minute: "2-digit" }) }),
  };
}

function checkedAgo(ago: number): string {
  return ago < 60_000
    ? i18n.t("agentRuns:eventWait.check.justNow")
    : i18n.t("agentRuns:eventWait.check.ago", { age: formatAge(ago) });
}

/**
 * The last sign that Stave is still looking: `Checked 2m ago`, a pull request
 * read that fails and when it is tried next, or that the host has not looked
 * for a while. `observedAt` is the host's last look at this wait
 * (`AgentRunDetail.eventWaitObservedAt`); older hosts send none.
 */
export function describeEventWaitCheck(
  wait: AgentRunEventWait,
  now: number,
  observedAt?: string | null,
): WaitLivenessNote | null {
  const observed = observedAt ? Date.parse(observedAt) : Number.NaN;
  if (Number.isFinite(observed) && now - observed > EVENT_WAIT_OBSERVATION_STALE_MS) {
    return { text: i18n.t("agentRuns:eventWait.check.stale", { age: formatAge(now - observed) }), tone: "warning" };
  }
  if (isPullRequestEventWait(wait.kind) && wait.watch) {
    const { consecutiveReadFailures: failures, lastCheckedAt } = wait.watch;
    const checkedAt = lastCheckedAt ? Date.parse(lastCheckedAt) : Number.NaN;
    if (failures > 0) {
      const next = Number.isFinite(checkedAt) ? checkedAt + pullRequestWatchPollIntervalMs(failures) - now : 0;
      return {
        text: next >= 60_000
          ? i18n.t("agentRuns:eventWait.check.failingNext", { count: failures, time: formatAge(next) })
          : i18n.t("agentRuns:eventWait.check.failingSoon", { count: failures }),
        tone: "warning",
      };
    }
    if (Number.isFinite(checkedAt)) return { text: checkedAgo(now - checkedAt), tone: "muted" };
  }
  return Number.isFinite(observed) ? { text: checkedAgo(now - observed), tone: "muted" } : null;
}

function delegateNames(rows: readonly DelegationExchange[]): string {
  return rows.map((row) => row.title).join(", ");
}

/** The delegated work a run waits on, as its window lists it. */
export interface DelegatedWaitSources {
  /** The run's delegates, for their states. */
  rows: readonly DelegationExchange[];
  /** The ledger rows behind them, for the completions the host reads. */
  children?: readonly DelegatedTaskSummary[];
  /** The run's lead task: delegated work names it as its parent. */
  parentTaskId?: string;
}

/**
 * When delegated work should have woken the run, or null. The same
 * completions the host reads, by the host's own rule
 * (`selectFreshCompletions`, with its delivered keys), from the same ledger
 * rows; the clock starts no earlier than the run's last settle into its wait,
 * since the host only reads while the run sits in it.
 */
function unresumedSince(wait: AgentRunEventWait, sources: DelegatedWaitSources): number | null {
  if (!sources.children?.length || !sources.parentTaskId) return null;
  const completions = sources.children.map(taskCompletionSignalOf).filter((signal) => signal != null);
  const fresh = selectFreshCompletions({ wait, completions, parentTaskId: sources.parentTaskId });
  const ends = fresh.map((signal) => Date.parse(signal.completedAt)).filter(Number.isFinite);
  if (!ends.length) return null;
  return Math.max(Math.min(...ends), Date.parse(wait.waitingSince ?? wait.registeredAt));
}

/**
 * What the run's delegates say about its wait: one that needs the user (the
 * one case the reader must act on, whatever the run waits for), or delegated
 * work that should have woken the run a while ago.
 */
export function describeDelegatedWait(args: DelegatedWaitSources & {
  wait: AgentRunEventWait | null;
  now: number;
}): WaitLivenessNote | null {
  const blocked = args.rows.filter((row) => row.outcome.needsUser);
  if (blocked.length) {
    return { text: i18n.t("agentRuns:eventWait.delegateNeedsYou", { count: blocked.length, names: delegateNames(blocked) }), tone: "warning" };
  }
  const { wait } = args;
  if (!wait || wait.kind !== "delegated_completion") return null;
  const since = unresumedSince(wait, args);
  if (since == null) return null;
  const ago = args.now - since;
  return ago > DELEGATED_WAIT_RESUME_GRACE_MS
    ? { text: i18n.t("agentRuns:eventWait.delegatedFinishedNotResumed", { age: formatAge(ago) }), tone: "warning" }
    : null;
}

/**
 * Everything a compact surface (a Fleet card, the Progress tab's status line)
 * says about a waiting run: the waited count and the notes, warnings first.
 * Null `since` when the run does not wait for an event.
 */
export function describeRunWaitLiveness(args: {
  eventWait: AgentRunEventWait | null;
  observedAt?: string | null;
  delegates?: DelegatedWaitSources | null;
  now: number;
}): { since: { text: string; title: string } | null; notes: WaitLivenessNote[] } {
  const { eventWait, now } = args;
  const delegates = args.delegates;
  const delegate = delegates && (delegates.rows.length || delegates.children?.length)
    ? describeDelegatedWait({ ...delegates, wait: eventWait, now })
    : null;
  const check = eventWait ? describeEventWaitCheck(eventWait, now, args.observedAt) : null;
  const notes = [delegate, check].filter((note): note is WaitLivenessNote => note != null);
  return {
    since: eventWait ? describeEventWaitSince(eventWait, now) : null,
    notes: [...notes.filter((note) => note.tone === "warning"), ...notes.filter((note) => note.tone !== "warning")],
  };
}
