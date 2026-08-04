import { describe, expect, test } from "bun:test";
import {
  getRendererHealthMetrics,
  recordRendererProcessGone,
  recordRendererResponsive,
  recordRendererUnresponsive,
} from "../electron/main/runtime-health-metrics";

describe("renderer health metrics", () => {
  test("records stalls, recovery, and renderer exits without retaining payloads", () => {
    recordRendererUnresponsive();
    expect(getRendererHealthMetrics()).toMatchObject({
      currentlyUnresponsive: true,
      unresponsiveEvents: 1,
      renderProcessGoneEvents: 0,
    });

    recordRendererResponsive();
    expect(getRendererHealthMetrics().currentlyUnresponsive).toBe(false);

    recordRendererProcessGone("crashed");
    expect(getRendererHealthMetrics()).toEqual({
      currentlyUnresponsive: false,
      unresponsiveEvents: 1,
      renderProcessGoneEvents: 1,
      lastRenderProcessGoneReason: "crashed",
    });
  });
});
