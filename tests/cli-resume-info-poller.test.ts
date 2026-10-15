import { describe, expect, test } from "bun:test";
import {
  resolveCliResumeInfoPolling,
  startCliResumeInfoPolling,
} from "@/lib/terminal/cli-resume-info-poller";
import { OPENCODE_NATIVE_SESSION_DISCOVERY } from "@/lib/terminal/native-session-discovery-window";

/** Runs the poller on a manual clock and reports when (if ever) the id arrived. */
async function runPoller(args: { providerId: string; hostFindsIdAfterMs: number }) {
  const plan = resolveCliResumeInfoPolling(args.providerId);
  let now = 0;
  let pending: (() => void) | null = null;
  let found: { nativeSessionId: string; atMs: number } | null = null;
  startCliResumeInfoPolling({
    plan,
    read: async () =>
      now >= args.hostFindsIdAfterMs ? "ses_late" : undefined,
    onFound: (nativeSessionId) => {
      found = { nativeSessionId, atMs: now };
    },
    schedule: (callback, delayMs) => {
      pending = () => {
        now += delayMs;
        callback();
      };
      return () => {
        pending = null;
      };
    },
  });
  // Drain: each scheduled poll runs once; stop when the poller stops scheduling.
  for (let step = 0; step < 10_000; step += 1) {
    await Promise.resolve();
    await Promise.resolve();
    const next = pending as (() => void) | null;
    if (!next) break;
    pending = null;
    next();
  }
  return found as { nativeSessionId: string; atMs: number } | null;
}

describe("CLI resume info polling", () => {
  test("keeps the default 30-second window for other CLIs", async () => {
    expect(resolveCliResumeInfoPolling("kiro")).toEqual({ intervalMs: 500, maxAttempts: 60 });
    expect(resolveCliResumeInfoPolling("codex")).toEqual({ intervalMs: 500, maxAttempts: 60 });
    await expect(runPoller({ providerId: "kiro", hostFindsIdAfterMs: 45_000 })).resolves.toBeNull();
  });

  test("stores an OpenCode session id the host finds after the first 30 seconds", async () => {
    const found = await runPoller({ providerId: "opencode", hostFindsIdAfterMs: 45_000 });
    expect(found?.nativeSessionId).toBe("ses_late");
    expect(found?.atMs).toBeGreaterThanOrEqual(45_000);
  });

  test("polls OpenCode at least as long as the host keeps discovering", () => {
    const renderer = resolveCliResumeInfoPolling("opencode");
    expect(renderer.intervalMs * renderer.maxAttempts).toBeGreaterThan(
      OPENCODE_NATIVE_SESSION_DISCOVERY.pollMs * OPENCODE_NATIVE_SESSION_DISCOVERY.maxAttempts,
    );
  });
});
