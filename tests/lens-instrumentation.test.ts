import { beforeEach, describe, expect, test } from "bun:test";
import {
  LENS_LATENCY_BUCKET_BOUNDS_MS,
  lensMeanBoundsSyncLatencyMs,
  lensOcclusionCallbacksPerSecondPerSurface,
  readLensInstrumentation,
  recordLensBoundsSyncLatency,
  recordLensOcclusionObservation,
  resetLensInstrumentationForTests,
  setLensSurfaceAttached,
  setLensSurfaceSuppressed,
} from "@/lib/lens/lens-instrumentation";

beforeEach(() => {
  resetLensInstrumentationForTests();
});

describe("bounds-sync histogram", () => {
  test("starts empty", () => {
    const snapshot = readLensInstrumentation();
    expect(snapshot.boundsSync.count).toBe(0);
    expect(snapshot.boundsSync.sumMs).toBe(0);
    expect(snapshot.boundsSync.maxMs).toBe(0);
    expect(snapshot.boundsSync.buckets).toHaveLength(
      LENS_LATENCY_BUCKET_BOUNDS_MS.length + 1,
    );
    expect(snapshot.boundsSync.buckets.every((count) => count === 0)).toBe(
      true,
    );
  });

  test("files a sample in the first bucket whose bound it does not exceed", () => {
    recordLensBoundsSyncLatency(1);
    recordLensBoundsSyncLatency(1.5);
    recordLensBoundsSyncLatency(16);

    const { buckets } = readLensInstrumentation().boundsSync;
    expect(buckets[0]).toBe(1);
    expect(buckets[1]).toBe(1);
    expect(buckets[LENS_LATENCY_BUCKET_BOUNDS_MS.indexOf(16)]).toBe(1);
  });

  test("collects everything past the last bound in the overflow bucket", () => {
    const beyond =
      LENS_LATENCY_BUCKET_BOUNDS_MS[LENS_LATENCY_BUCKET_BOUNDS_MS.length - 1]!;
    recordLensBoundsSyncLatency(beyond + 1);

    const { buckets } = readLensInstrumentation().boundsSync;
    expect(buckets[LENS_LATENCY_BUCKET_BOUNDS_MS.length]).toBe(1);
  });

  test("tracks count, sum, and max, and derives the mean", () => {
    recordLensBoundsSyncLatency(4);
    recordLensBoundsSyncLatency(12);

    const snapshot = readLensInstrumentation();
    expect(snapshot.boundsSync.count).toBe(2);
    expect(snapshot.boundsSync.sumMs).toBe(16);
    expect(snapshot.boundsSync.maxMs).toBe(12);
    expect(lensMeanBoundsSyncLatencyMs(snapshot)).toBe(8);
  });

  test("mean is zero before the first sample rather than NaN", () => {
    expect(lensMeanBoundsSyncLatencyMs(readLensInstrumentation())).toBe(0);
  });

  test("ignores non-finite and negative samples", () => {
    recordLensBoundsSyncLatency(Number.NaN);
    recordLensBoundsSyncLatency(Number.POSITIVE_INFINITY);
    recordLensBoundsSyncLatency(-1);

    expect(readLensInstrumentation().boundsSync.count).toBe(0);
  });
});

describe("occlusion counters", () => {
  test("separates observations from the ones that moved the answer", () => {
    recordLensOcclusionObservation(false);
    recordLensOcclusionObservation(false);
    recordLensOcclusionObservation(true);

    const { occlusion } = readLensInstrumentation();
    expect(occlusion.observations).toBe(3);
    expect(occlusion.transitions).toBe(1);
  });

  test("per-surface rate is zero while nothing is mounted", () => {
    recordLensOcclusionObservation(false);

    expect(
      lensOcclusionCallbacksPerSecondPerSurface(readLensInstrumentation()),
    ).toBe(0);
  });

  test("per-surface rate divides by mounted surfaces", () => {
    setLensSurfaceAttached("a", true);
    setLensSurfaceAttached("b", true);
    for (let index = 0; index < 40; index += 1) {
      recordLensOcclusionObservation(false);
    }

    const snapshot = readLensInstrumentation();
    const seconds = snapshot.occlusion.elapsedMs / 1_000;
    expect(lensOcclusionCallbacksPerSecondPerSurface(snapshot)).toBeCloseTo(
      40 / seconds / 2,
      5,
    );
  });
});

describe("surface counts", () => {
  test("counts each attached session once", () => {
    setLensSurfaceAttached("a", true);
    setLensSurfaceAttached("a", true);
    setLensSurfaceAttached("b", true);

    expect(readLensInstrumentation().surfaces.attached).toBe(2);
  });

  test("detaching drops the session from both counts", () => {
    setLensSurfaceAttached("a", true);
    setLensSurfaceSuppressed("a", true);
    expect(readLensInstrumentation().surfaces.suppressed).toBe(1);

    setLensSurfaceAttached("a", false);
    const snapshot = readLensInstrumentation();
    expect(snapshot.surfaces.attached).toBe(0);
    expect(snapshot.surfaces.suppressed).toBe(0);
  });

  test("suppression toggles without changing the attached count", () => {
    setLensSurfaceAttached("a", true);
    setLensSurfaceSuppressed("a", true);
    setLensSurfaceSuppressed("a", false);

    const snapshot = readLensInstrumentation();
    expect(snapshot.surfaces.attached).toBe(1);
    expect(snapshot.surfaces.suppressed).toBe(0);
  });
});

test("the global read hook returns the same snapshot shape", () => {
  setLensSurfaceAttached("a", true);
  recordLensBoundsSyncLatency(3);

  const read = (globalThis as unknown as Record<string, unknown>)
    .__staveLensInstrumentation as (() => unknown) | undefined;
  expect(typeof read).toBe("function");
  expect(read?.()).toMatchObject({
    boundsSync: { count: 1 },
    surfaces: { attached: 1 },
  });
});
