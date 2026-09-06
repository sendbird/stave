/**
 * Which Lens guests to reclaim when there are too many.
 *
 * Every guest is a full renderer process, and Lens parks hidden ones with
 * `opacity: 0` rather than `visibility: hidden` on purpose: a guest Chromium
 * does not composite cannot answer `Page.captureScreenshot`, so an agent
 * session that has never been shown would stop working. The cost of that
 * decision is that a hidden guest is very nearly as expensive as a visible one,
 * and nothing else bounds how many exist — switching workspaces leaves every
 * Lens tab's session open behind it.
 *
 * The policy is a pure function so it can be argued with in tests rather than
 * inferred from a live process table.
 */

export interface LensGuestEvictionCandidate {
  workspaceId: string;
  lensSessionId: string;
  /** A panel is showing this session right now. */
  visible: boolean;
  /** Opened by an agent, which expects to keep addressing it. */
  managedByMcp: boolean;
  /** Already being torn down. */
  closing: boolean;
  /** Monotonic last-presented order; 0 for a session never shown. */
  lastVisibleAt: number;
  /** Monotonic creation order, used only to rank sessions never shown. */
  createdSequence: number;
  /** Wall-clock time when the session most recently became hidden. */
  lastHiddenAtMs: number;
  /** Wall-clock time when an agent most recently addressed the session. */
  lastAgentTouchedAtMs: number;
  /** Native CDP commands that must drain before the guest can be reclaimed. */
  cdpInFlight: number;
}

export interface LensGuestEvictionOptions {
  /** How many hidden, non-agent guests may stay alive. */
  maxHidden: number;
  /**
   * A session to spare regardless of rank.
   *
   * The cap is enforced when a guest binds, and a freshly bound guest is hidden
   * until its panel reports otherwise — so without this the newly opened tab is
   * the single best eviction candidate there is.
   */
  exempt?: { workspaceId: string; lensSessionId: string };
}

/**
 * Least-recently-presented first. A session that has never been presented
 * carries `lastVisibleAt: 0`, so those rank among themselves by creation order,
 * oldest first, rather than by whatever order the registry happens to yield.
 */
export function selectEvictableLensGuests<
  Candidate extends LensGuestEvictionCandidate,
>(
  candidates: ReadonlyArray<Candidate>,
  options: LensGuestEvictionOptions,
): Candidate[] {
  const { maxHidden, exempt } = options;
  // Protected guests still consume the budget. Protection chooses victims;
  // it must not make an allocated renderer disappear from the total.
  const hiddenCount = candidates.filter(
    (candidate) =>
      !candidate.visible && !candidate.managedByMcp && !candidate.closing,
  ).length;
  const evictable = candidates.filter(
    (candidate) =>
      !candidate.visible &&
      !candidate.managedByMcp &&
      !candidate.closing &&
      candidate.cdpInFlight === 0 &&
      !(
        exempt &&
        candidate.workspaceId === exempt.workspaceId &&
        candidate.lensSessionId === exempt.lensSessionId
      ),
  );
  const surplus = hiddenCount - Math.max(0, maxHidden);
  if (surplus <= 0) {
    return [];
  }
  return [...evictable]
    .sort(
      (left, right) =>
        left.lastVisibleAt - right.lastVisibleAt ||
        left.createdSequence - right.createdSequence,
    )
    .slice(0, surplus);
}

export function selectEvictableAgentLensGuests<
  Candidate extends LensGuestEvictionCandidate,
>(
  candidates: ReadonlyArray<Candidate>,
  options: LensGuestEvictionOptions,
): Candidate[] {
  const { maxHidden, exempt } = options;
  const hiddenAgentCount = candidates.filter(
    (candidate) =>
      !candidate.visible && candidate.managedByMcp && !candidate.closing,
  ).length;
  const evictable = candidates.filter(
    (candidate) =>
      !candidate.visible &&
      candidate.managedByMcp &&
      !candidate.closing &&
      candidate.cdpInFlight === 0 &&
      !(
        exempt &&
        candidate.workspaceId === exempt.workspaceId &&
        candidate.lensSessionId === exempt.lensSessionId
      ),
  );
  const surplus = hiddenAgentCount - Math.max(0, maxHidden);
  if (surplus <= 0) {
    return [];
  }
  return [...evictable]
    .sort(
      (left, right) =>
        left.lastAgentTouchedAtMs - right.lastAgentTouchedAtMs ||
        left.createdSequence - right.createdSequence,
    )
    .slice(0, surplus);
}

export function selectIdleLensGuests<
  Candidate extends LensGuestEvictionCandidate,
>(
  candidates: ReadonlyArray<Candidate>,
  options: {
    nowMs: number;
    idleTtlMs: number;
    agentIdleTtlMs: number;
  },
): Candidate[] {
  return candidates.filter((candidate) => {
    if (
      candidate.visible ||
      candidate.closing ||
      candidate.cdpInFlight > 0 ||
      candidate.lastHiddenAtMs <= 0
    ) {
      return false;
    }
    const lastActiveAtMs = candidate.managedByMcp
      ? Math.max(candidate.lastHiddenAtMs, candidate.lastAgentTouchedAtMs)
      : candidate.lastHiddenAtMs;
    const ttlMs = candidate.managedByMcp
      ? options.agentIdleTtlMs
      : options.idleTtlMs;
    return options.nowMs - lastActiveAtMs >= ttlMs;
  });
}
