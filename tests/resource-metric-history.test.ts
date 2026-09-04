import { describe, expect, test } from "bun:test";
import {
  appendResourceMetricSample,
  summarizeResourceMetricSamples,
  type ResourceMetricSample,
} from "@/lib/performance/resource-metric-history";

function sample(
  sampledAt: number,
  rendererCpuPercent: number,
  gpuCpuPercent: number,
  rendererHeapUsedKB: number | null,
): ResourceMetricSample {
  return {
    sampledAt,
    rendererCpuPercent,
    gpuCpuPercent,
    rendererHeapUsedKB,
  };
}

describe("resource metric history", () => {
  test("keeps only the rolling window", () => {
    const history = appendResourceMetricSample(
      [sample(1_000, 1, 2, 100), sample(50_000, 3, 4, 110)],
      sample(70_001, 5, 6, 120),
      60_000,
    );
    expect(history.map((entry) => entry.sampledAt)).toEqual([50_000, 70_001]);
  });

  test("summarizes renderer and GPU pressure without retaining payloads", () => {
    expect(
      summarizeResourceMetricSamples([
        sample(1_000, 20, 10, 100),
        sample(4_000, 40, 30, 125),
        sample(7_000, 60, 20, 145),
      ]),
    ).toEqual({
      sampleCount: 3,
      durationMs: 6_000,
      rendererCpuAverage: 40,
      rendererCpuPeak: 60,
      gpuCpuAverage: 20,
      gpuCpuPeak: 30,
      rendererHeapDeltaKB: 45,
    });
  });

  test("does not invent a heap trend from one available sample", () => {
    expect(
      summarizeResourceMetricSamples([
        sample(1_000, 0, 0, null),
        sample(2_000, 0, 0, 100),
      ])?.rendererHeapDeltaKB,
    ).toBeNull();
  });
});
