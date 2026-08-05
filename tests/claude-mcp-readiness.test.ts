import { describe, expect, test } from "bun:test";
import type { McpServerStatus } from "@anthropic-ai/claude-agent-sdk";
import {
  buildClaudeMcpReadinessNotice,
  summarizeClaudeMcpReadiness,
  waitForClaudeMcpReadiness,
} from "../electron/providers/claude-sdk-runtime";

// Remote connectors (Figma, Slack) finish their handshake after the CLI reports
// `system:init`. Sending the turn's prompt before then makes the model answer
// from an incomplete tool list — it reports the connectors as disconnected,
// then a retry a moment later reports them as connected.

function server(
  name: string,
  status: McpServerStatus["status"],
  error?: string,
): McpServerStatus {
  return { name, status, ...(error ? { error } : {}) };
}

/** Deterministic clock/sleep so the tests never depend on wall time. */
function createFakeTimers() {
  let current = 0;
  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
    },
    // A responsive control channel: an individual probe never outlives its
    // budget, so it must not win the race in these tests.
    probeDeadline: () => new Promise<null>(() => {}),
  };
}

describe("summarizeClaudeMcpReadiness", () => {
  test("separates still-connecting servers from unusable ones", () => {
    const summary = summarizeClaudeMcpReadiness([
      server("claude_ai_Figma", "pending"),
      server("claude_ai_Slack", "connected"),
      server("linear", "needs-auth"),
      server("sentry", "failed", "boom"),
      // A disabled server is a deliberate user choice, not something to warn on.
      server("legacy", "disabled"),
    ]);

    expect(summary.pending).toEqual(["claude_ai_Figma"]);
    expect(summary.unavailable).toEqual([
      { name: "linear", status: "needs-auth" },
      { name: "sentry", status: "failed", error: "boom" },
    ]);
  });
});

describe("waitForClaudeMcpReadiness", () => {
  test("returns on the first probe when nothing is pending", async () => {
    let calls = 0;
    const timers = createFakeTimers();
    const readiness = await waitForClaudeMcpReadiness({
      stream: {
        mcpServerStatus: async () => {
          calls += 1;
          return [server("claude_ai_Figma", "connected")];
        },
      },
      timeoutMs: 8_000,
      now: timers.now,
      sleep: timers.sleep,
      probeDeadline: timers.probeDeadline,
    });

    // The gate must be free when connectors are already up.
    expect(calls).toBe(1);
    expect(readiness).toMatchObject({ timedOut: false, pending: [] });
    expect(readiness?.waitedMs).toBe(0);
  });

  test("waits for a pending connector to finish connecting", async () => {
    const statuses: McpServerStatus[][] = [
      [server("claude_ai_Figma", "pending"), server("claude_ai_Slack", "pending")],
      [server("claude_ai_Figma", "connected"), server("claude_ai_Slack", "pending")],
      [
        server("claude_ai_Figma", "connected"),
        server("claude_ai_Slack", "connected"),
      ],
    ];
    const timers = createFakeTimers();
    const readiness = await waitForClaudeMcpReadiness({
      stream: {
        mcpServerStatus: async () => statuses.shift() ?? [],
      },
      timeoutMs: 8_000,
      now: timers.now,
      sleep: timers.sleep,
      probeDeadline: timers.probeDeadline,
    });

    expect(statuses).toHaveLength(0);
    expect(readiness).toMatchObject({ timedOut: false, pending: [] });
    expect(readiness?.waitedMs).toBeGreaterThan(0);
  });

  test("gives up at the timeout and reports what is still pending", async () => {
    const timers = createFakeTimers();
    const readiness = await waitForClaudeMcpReadiness({
      stream: {
        mcpServerStatus: async () => [server("claude_ai_Figma", "pending")],
      },
      timeoutMs: 1_000,
      now: timers.now,
      sleep: timers.sleep,
      probeDeadline: timers.probeDeadline,
    });

    expect(readiness).toMatchObject({
      timedOut: true,
      pending: ["claude_ai_Figma"],
    });
    // Never overshoots the budget the caller allowed.
    expect(readiness?.waitedMs).toBeLessThanOrEqual(1_000);
  });

  test("never waits when the timeout budget is zero", async () => {
    const timers = createFakeTimers();
    const readiness = await waitForClaudeMcpReadiness({
      stream: {
        mcpServerStatus: async () => [server("claude_ai_Figma", "pending")],
      },
      timeoutMs: 0,
      now: timers.now,
      sleep: timers.sleep,
      probeDeadline: timers.probeDeadline,
    });

    expect(readiness).toMatchObject({ timedOut: true, waitedMs: 0 });
  });

  test("stops immediately when the turn is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const readiness = await waitForClaudeMcpReadiness({
      stream: {
        mcpServerStatus: async () => {
          calls += 1;
          return [server("claude_ai_Figma", "pending")];
        },
      },
      timeoutMs: 8_000,
      signal: controller.signal,
    });

    expect(calls).toBe(0);
    expect(readiness).toBeNull();
  });

  test("does not stall the turn when the CLI cannot report status", async () => {
    // Older CLI without the control request.
    expect(
      await waitForClaudeMcpReadiness({
        stream: {} as never,
        timeoutMs: 8_000,
      }),
    ).toBeNull();

    // Transport error on the very first probe.
    expect(
      await waitForClaudeMcpReadiness({
        stream: {
          mcpServerStatus: async () => {
            throw new Error("control channel closed");
          },
        },
        timeoutMs: 8_000,
      }),
    ).toBeNull();
  });

  test("gives up when the control channel accepts a probe but never answers", async () => {
    // Without racing each probe against the budget this hangs the turn
    // forever: the deadline is only reachable once a probe resolves.
    const timers = createFakeTimers();
    const readiness = await waitForClaudeMcpReadiness({
      stream: {
        mcpServerStatus: () => new Promise<never>(() => {}),
      },
      timeoutMs: 8_000,
      now: timers.now,
      sleep: timers.sleep,
      probeDeadline: async () => null,
    });

    expect(readiness).toBeNull();
  });

  test("keeps the last good snapshot when a later probe fails", async () => {
    const timers = createFakeTimers();
    let calls = 0;
    const readiness = await waitForClaudeMcpReadiness({
      stream: {
        mcpServerStatus: async () => {
          calls += 1;
          if (calls === 1) {
            return [server("claude_ai_Figma", "pending")];
          }
          throw new Error("control channel closed");
        },
      },
      timeoutMs: 8_000,
      now: timers.now,
      sleep: timers.sleep,
      probeDeadline: timers.probeDeadline,
    });

    expect(readiness).toMatchObject({
      pending: ["claude_ai_Figma"],
      timedOut: false,
    });
  });
});

describe("buildClaudeMcpReadinessNotice", () => {
  test("stays silent when every connector came up", () => {
    expect(
      buildClaudeMcpReadinessNotice({
        pending: [],
        unavailable: [],
        waitedMs: 12,
        timedOut: false,
      }),
    ).toBeUndefined();
  });

  test("names the connectors whose tools are missing", () => {
    const notice = buildClaudeMcpReadinessNotice({
      pending: ["claude_ai_Figma"],
      unavailable: [{ name: "sentry", status: "failed", error: "boom" }],
      waitedMs: 8_000,
      timedOut: true,
    });

    expect(notice).toContain("claude_ai_Figma");
    expect(notice).toContain("failed to connect: sentry");
    expect(notice).toContain("boom");
  });

  test("stays quiet about standing needs-auth connectors", () => {
    // An account can carry dozens of unauthorized connectors; repeating them on
    // every turn would bury the signal. The settings pane owns that state.
    expect(
      buildClaudeMcpReadinessNotice({
        pending: [],
        unavailable: [
          { name: "claude_ai_Linear", status: "needs-auth" },
          { name: "claude_ai_Notion", status: "needs-auth" },
        ],
        waitedMs: 40,
        timedOut: false,
      }),
    ).toBeUndefined();
  });

  test("does not claim a timeout when the wait succeeded", () => {
    const notice = buildClaudeMcpReadinessNotice({
      pending: [],
      unavailable: [{ name: "sentry", status: "failed" }],
      waitedMs: 40,
      timedOut: false,
    });

    expect(notice).toContain("failed to connect: sentry");
    expect(notice).not.toContain("still connecting");
  });

  test("truncates long lists instead of dumping every server name", () => {
    const notice = buildClaudeMcpReadinessNotice({
      pending: ["one", "two", "three", "four", "five", "six", "seven"],
      unavailable: [],
      waitedMs: 8_000,
      timedOut: true,
    });

    expect(notice).toContain("one, two, three, four, five (+2 more)");
    expect(notice).not.toContain("seven");
  });
});
