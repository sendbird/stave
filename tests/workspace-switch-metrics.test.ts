import { describe, expect, test } from "bun:test";
import {
  getLatestWorkspaceSwitchPerformance,
  getWorkspaceSwitchMetricNow,
  recordWorkspaceSwitchPhase,
  registerWorkspaceSwitchMetric,
} from "../src/lib/performance/workspace-switch-metrics";

describe("workspace switch performance metrics", () => {
  test("retains the latest switch timings for the resource monitor", () => {
    const startedAt = getWorkspaceSwitchMetricNow() - 25;
    registerWorkspaceSwitchMetric({
      token: 101,
      workspaceId: "ws-metric",
      startedAt,
      cacheHit: false,
      flushResolvedAt: startedAt + 5,
      shellResolvedAt: startedAt + 8,
      setRootResolvedAt: startedAt + 12,
    });

    recordWorkspaceSwitchPhase({
      workspaceId: "ws-metric",
      token: 101,
      phase: "active",
    });
    recordWorkspaceSwitchPhase({
      workspaceId: "ws-metric",
      token: 101,
      phase: "files",
    });

    const metric = getLatestWorkspaceSwitchPerformance();
    expect(metric).not.toBeNull();
    expect(metric?.workspaceId).toBe("ws-metric");
    expect(metric?.cacheHit).toBe(false);
    expect(metric?.flushMs).toBe(5);
    expect(metric?.shellMs).toBe(8);
    expect(metric?.setRootMs).toBe(12);
    expect(metric?.totalMs).toBeGreaterThanOrEqual(25);
    expect(metric?.filesMs).toBeGreaterThanOrEqual(metric?.totalMs ?? 0);
    expect(metric?.messagesMs).toBeUndefined();
  });

  test("ignores stale background phases from an older switch token", () => {
    const startedAt = getWorkspaceSwitchMetricNow() - 10;
    registerWorkspaceSwitchMetric({
      token: 202,
      workspaceId: "ws-stale-metric",
      startedAt,
      cacheHit: true,
    });
    recordWorkspaceSwitchPhase({
      workspaceId: "ws-stale-metric",
      token: 202,
      phase: "active",
    });
    recordWorkspaceSwitchPhase({
      workspaceId: "ws-stale-metric",
      token: 201,
      phase: "messages",
    });

    expect(getLatestWorkspaceSwitchPerformance()?.messagesMs).toBeUndefined();
  });
});
