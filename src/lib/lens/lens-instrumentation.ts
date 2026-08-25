/**
 * Renderer-side counters for the Lens surface path.
 *
 * Everything measured here exists because the guest is composited above the
 * whole renderer instead of participating in the DOM: a cross-process round
 * trip per layout change, and a `MutationObserver` over `document.body` per
 * mounted panel to notice when React chrome would have overlapped the preview.
 *
 * These are the before/after evidence for the rendering-model change, and two
 * of them are release gates: once the guest is a DOM element, the occlusion
 * counters must read zero and the bounds histogram must stop being fed at all.
 * Keeping them in one module means the deletion is one import away.
 *
 * Counters are process-wide rather than per-hook so several mounted panels
 * aggregate, and are keyed by session where a count of *surfaces* is wanted.
 */

/**
 * Upper bucket bounds in milliseconds. The histogram carries one extra bucket
 * past the end for everything slower than the last bound.
 */
export const LENS_LATENCY_BUCKET_BOUNDS_MS = [
  1, 2, 4, 8, 16, 32, 64, 128, 256, 512,
] as const;

export type LensLatencyHistogram = {
  count: number;
  sumMs: number;
  maxMs: number;
  /**
   * One entry per bound in `LENS_LATENCY_BUCKET_BOUNDS_MS`, plus a final
   * overflow bucket. Cumulative counts are not stored; each bucket holds the
   * samples that fell inside it.
   */
  buckets: number[];
};

export type LensInstrumentationSnapshot = {
  /**
   * Placeholder rectangle -> guest bounds. One sample per IPC round trip,
   * measured from dispatch to settle, so it includes main-process work and the
   * reply hop rather than just the renderer's share.
   */
  boundsSync: LensLatencyHistogram;
  occlusion: {
    /** Observer callbacks that ran the overlap query. */
    observations: number;
    /** Callbacks that actually changed the suppression answer. */
    transitions: number;
    /** Wall time the counters have been accumulating over. */
    elapsedMs: number;
  };
  surfaces: {
    /**
     * Guests attached to a mounted Lens panel. Main-process totals, which also
     * count sessions opened headlessly for agents, arrive with the hidden-guest
     * cap that needs them.
     */
    attached: number;
    /** Attached guests currently hidden to let React chrome paint. */
    suppressed: number;
  };
};

function createHistogram(): LensLatencyHistogram {
  return {
    count: 0,
    sumMs: 0,
    maxMs: 0,
    buckets: new Array(LENS_LATENCY_BUCKET_BOUNDS_MS.length + 1).fill(0),
  };
}

const boundsSync = createHistogram();
let occlusionObservations = 0;
let occlusionTransitions = 0;
let startedAtMs = 0;
const attachedSurfaceIds = new Set<string>();
const suppressedSurfaceIds = new Set<string>();

function nowMs(): number {
  return typeof performance === "undefined" ? 0 : performance.now();
}

export function recordLensBoundsSyncLatency(latencyMs: number): void {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) {
    return;
  }
  boundsSync.count += 1;
  boundsSync.sumMs += latencyMs;
  boundsSync.maxMs = Math.max(boundsSync.maxMs, latencyMs);

  const found = LENS_LATENCY_BUCKET_BOUNDS_MS.findIndex(
    (bound) => latencyMs <= bound,
  );
  const index = found === -1 ? LENS_LATENCY_BUCKET_BOUNDS_MS.length : found;
  boundsSync.buckets[index] = (boundsSync.buckets[index] ?? 0) + 1;
}

/**
 * One occlusion-observer callback that ran the overlap query. `changed` marks
 * the callbacks that moved the answer — the ratio is how much of the observer's
 * cost buys anything.
 */
export function recordLensOcclusionObservation(changed: boolean): void {
  occlusionObservations += 1;
  if (changed) {
    occlusionTransitions += 1;
  }
}

export function setLensSurfaceAttached(
  lensSessionId: string,
  attached: boolean,
): void {
  if (attached) {
    attachedSurfaceIds.add(lensSessionId);
    return;
  }
  attachedSurfaceIds.delete(lensSessionId);
  suppressedSurfaceIds.delete(lensSessionId);
}

export function setLensSurfaceSuppressed(
  lensSessionId: string,
  suppressed: boolean,
): void {
  if (suppressed) {
    suppressedSurfaceIds.add(lensSessionId);
    return;
  }
  suppressedSurfaceIds.delete(lensSessionId);
}

export function readLensInstrumentation(): LensInstrumentationSnapshot {
  return {
    boundsSync: { ...boundsSync, buckets: [...boundsSync.buckets] },
    occlusion: {
      observations: occlusionObservations,
      transitions: occlusionTransitions,
      elapsedMs: Math.max(0, nowMs() - startedAtMs),
    },
    surfaces: {
      attached: attachedSurfaceIds.size,
      suppressed: suppressedSurfaceIds.size,
    },
  };
}

/** Clears every counter. Surface membership is state, not a counter, so it is
 * left alone: a reset must not make mounted panels disappear from the count. */
export function resetLensInstrumentationCounters(): void {
  boundsSync.count = 0;
  boundsSync.sumMs = 0;
  boundsSync.maxMs = 0;
  boundsSync.buckets.fill(0);
  occlusionObservations = 0;
  occlusionTransitions = 0;
  startedAtMs = nowMs();
}

/** Test-only: drop surface membership as well. */
export function resetLensInstrumentationForTests(): void {
  attachedSurfaceIds.clear();
  suppressedSurfaceIds.clear();
  resetLensInstrumentationCounters();
}

/**
 * Observer callbacks per second per mounted panel — the number that scales with
 * tab count and that the DOM-hosted guest is expected to drive to zero.
 * Returns 0 when nothing has been observed long enough to divide by.
 */
export function lensOcclusionCallbacksPerSecondPerSurface(
  snapshot: LensInstrumentationSnapshot,
): number {
  const seconds = snapshot.occlusion.elapsedMs / 1_000;
  const surfaces = snapshot.surfaces.attached;
  if (seconds <= 0 || surfaces <= 0) {
    return 0;
  }
  return snapshot.occlusion.observations / seconds / surfaces;
}

/** Mean bounds-sync round trip in ms, or 0 before the first sample. */
export function lensMeanBoundsSyncLatencyMs(
  snapshot: LensInstrumentationSnapshot,
): number {
  if (snapshot.boundsSync.count === 0) {
    return 0;
  }
  return snapshot.boundsSync.sumMs / snapshot.boundsSync.count;
}

/**
 * Global read hook. Exposed unconditionally: the snapshot is counters only, and
 * an end-to-end harness has no other way to assert that the occlusion path went
 * quiet. Read-only — nothing here mutates Lens state.
 */
export const LENS_INSTRUMENTATION_GLOBAL_KEY = "__staveLensInstrumentation";

if (typeof globalThis !== "undefined") {
  (globalThis as unknown as Record<string, unknown>)[
    LENS_INSTRUMENTATION_GLOBAL_KEY
  ] = readLensInstrumentation;
  startedAtMs = nowMs();
}
