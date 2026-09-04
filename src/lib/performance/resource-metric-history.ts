export const RESOURCE_METRIC_HISTORY_WINDOW_MS = 60_000;
const RESOURCE_METRIC_HISTORY_LIMIT = 64;

export interface ResourceMetricSample {
  sampledAt: number;
  rendererCpuPercent: number;
  gpuCpuPercent: number;
  rendererHeapUsedKB: number | null;
}

export interface ResourceMetricSummary {
  sampleCount: number;
  durationMs: number;
  rendererCpuAverage: number;
  rendererCpuPeak: number;
  gpuCpuAverage: number;
  gpuCpuPeak: number;
  rendererHeapDeltaKB: number | null;
}

export function appendResourceMetricSample(
  samples: readonly ResourceMetricSample[],
  sample: ResourceMetricSample,
  windowMs = RESOURCE_METRIC_HISTORY_WINDOW_MS,
): ResourceMetricSample[] {
  const cutoff = sample.sampledAt - Math.max(0, windowMs);
  return [...samples.filter((entry) => entry.sampledAt >= cutoff), sample].slice(
    -RESOURCE_METRIC_HISTORY_LIMIT,
  );
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeResourceMetricSamples(
  samples: readonly ResourceMetricSample[],
): ResourceMetricSummary | null {
  if (samples.length === 0) {
    return null;
  }
  const rendererCpu = samples.map((sample) => sample.rendererCpuPercent);
  const gpuCpu = samples.map((sample) => sample.gpuCpuPercent);
  const heapSamples = samples.flatMap((sample) =>
    sample.rendererHeapUsedKB == null ? [] : [sample.rendererHeapUsedKB],
  );
  return {
    sampleCount: samples.length,
    durationMs: Math.max(
      0,
      samples[samples.length - 1]!.sampledAt - samples[0]!.sampledAt,
    ),
    rendererCpuAverage: average(rendererCpu),
    rendererCpuPeak: Math.max(...rendererCpu),
    gpuCpuAverage: average(gpuCpu),
    gpuCpuPeak: Math.max(...gpuCpu),
    rendererHeapDeltaKB:
      heapSamples.length > 1
        ? heapSamples[heapSamples.length - 1]! - heapSamples[0]!
        : null,
  };
}
