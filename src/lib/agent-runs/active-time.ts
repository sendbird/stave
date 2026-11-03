import type { AgentRun, AgentRunEvent, AgentRunEventKind } from "./domain";

/**
 * How long an agent run has worked: the time it was running, not paused, not
 * waiting on the user and with the host up. The host projects it from the
 * run's recorded transitions on every read (`detailOf` in
 * `electron/host-service/supervision/agent-run-runtime.ts`), because a window
 * only holds the newest events and would miss the early pauses of a long run.
 *
 * The transitions it reads:
 * - `agent-run-started` starts the clock, unless the run was prepared for a
 *   delegation, which starts paused until it is activated;
 * - `paused` and `resumed`;
 * - `user-wait-started` and `user-wait-ended`, which the host writes when the
 *   lead task starts or stops holding an approval or question open, or the
 *   current stage starts or stops waiting for its sign-off;
 * - `host-stopped` and `host-started`; after a crash (`host-started` without a
 *   `host-stopped`) the clock stops at the last moment the host was seen alive
 *   (`detail.lastSeenAt`), so the time Stave was closed is not counted;
 * - `agent-run-ended` stops it for good.
 *
 * The host never prunes these transitions (it keeps only the newest 2,000 of
 * the other unkeyed events), so a long run still subtracts its early pauses.
 */

/** The run's transitions the active time reads, in the order the host recorded them. */
export const AGENT_RUN_CLOCK_EVENT_KINDS = [
  "agent-run-started",
  "paused",
  "resumed",
  "user-wait-started",
  "user-wait-ended",
  "host-stopped",
  "host-started",
  "agent-run-ended",
] as const satisfies readonly AgentRunEventKind[];

/**
 * Events that only keep the clock: no surface shows them as something the run
 * did, so "the run's latest event" skips them.
 */
export const AGENT_RUN_CLOCK_ONLY_EVENT_KINDS: ReadonlySet<AgentRunEventKind> = new Set([
  "user-wait-started",
  "user-wait-ended",
  "host-stopped",
  "host-started",
]);

/** Why a run waits on the user, as the host saw it. */
export type AgentRunUserWaitReason = "approval" | "question" | "sign-off";

export interface AgentRunActiveTime {
  /** Active milliseconds in the spans that have closed. */
  activeMs: number;
  /**
   * When the span still counting began; null while the clock stands (paused,
   * waiting on the user, the host down, or the run ended). A surface adds
   * `now - activeSince` to `activeMs` while it is set.
   */
  activeSince: string | null;
}

function parseTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Projects the active time from the run and its clock events. Events are read
 * in sequence order; kinds outside `AGENT_RUN_CLOCK_EVENT_KINDS` are ignored.
 */
export function projectAgentRunActiveTime(
  agentRun: Pick<AgentRun, "createdAt" | "updatedAt" | "state">,
  events: readonly AgentRunEvent[],
): AgentRunActiveTime {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const createdAt = parseTime(agentRun.createdAt) ?? 0;
  const start = ordered.find((event) => event.kind === "agent-run-started");
  // A run prepared for a delegation starts paused; its activation resumes it.
  let paused = start?.detail.delegation !== undefined;
  let waiting = false;
  let down = false;
  let ended = false;
  let activeMs = 0;
  let since: number | null = paused ? null : createdAt;
  const counting = () => !paused && !waiting && !down && !ended;
  const close = (at: number) => {
    if (since === null) return;
    activeMs += Math.max(0, at - since);
    since = null;
  };
  const settle = (at: number, apply: () => void) => {
    const was = counting();
    apply();
    const is = counting();
    if (was && !is) close(at);
    if (!was && is) since = Math.max(at, createdAt);
  };
  for (const event of ordered) {
    const at = parseTime(event.createdAt);
    if (at === null) continue;
    switch (event.kind) {
      case "paused":
        settle(at, () => { paused = true; });
        break;
      case "resumed":
        settle(at, () => { paused = false; });
        break;
      case "user-wait-started":
        settle(at, () => { waiting = true; });
        break;
      case "user-wait-ended":
        settle(at, () => { waiting = false; });
        break;
      case "host-stopped":
        settle(at, () => { down = true; });
        break;
      case "host-started": {
        if (down) {
          settle(at, () => { down = false; });
          break;
        }
        // The host did not stop cleanly: stop the clock where it was last seen, then go on from here.
        if (since !== null) {
          const lastSeen = parseTime(event.detail.lastSeenAt);
          close(Math.max(since, Math.min(lastSeen ?? at, at)));
          if (counting()) since = at;
        }
        break;
      }
      case "agent-run-ended":
        settle(at, () => { ended = true; });
        break;
      default:
        break;
    }
  }
  // An ended run whose end event was not read stops where it last changed.
  if (since !== null && agentRun.state !== "running" && agentRun.state !== "paused") {
    close(Math.max(since, parseTime(agentRun.updatedAt) ?? since));
  }
  return { activeMs, activeSince: since === null ? null : new Date(since).toISOString() };
}

/** The active milliseconds at `now`: the closed spans and the one still counting. */
export function activeMsAt(activeTime: AgentRunActiveTime, now: number): number {
  const since = activeTime.activeSince ? Date.parse(activeTime.activeSince) : Number.NaN;
  return activeTime.activeMs + (Number.isFinite(since) ? Math.max(0, now - since) : 0);
}
