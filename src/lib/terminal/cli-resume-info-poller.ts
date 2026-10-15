import { OPENCODE_NATIVE_SESSION_DISCOVERY } from "./native-session-discovery-window";

export interface CliResumeInfoPollingPlan {
  intervalMs: number;
  maxAttempts: number;
}

const DEFAULT_PLAN: CliResumeInfoPollingPlan = { intervalMs: 500, maxAttempts: 60 };

/**
 * How long the renderer asks the host for a CLI tab's native session id. Most
 * CLIs report it within seconds, so 30 seconds is enough. OpenCode 1.x learns
 * it only after the first message, for up to five minutes on the host, so its
 * tabs keep asking a little longer than the host keeps looking.
 */
export function resolveCliResumeInfoPolling(
  providerId: string | undefined,
): CliResumeInfoPollingPlan {
  if (providerId === "opencode") {
    return {
      intervalMs: OPENCODE_NATIVE_SESSION_DISCOVERY.pollMs,
      maxAttempts: OPENCODE_NATIVE_SESSION_DISCOVERY.maxAttempts + 5,
    };
  }
  return DEFAULT_PLAN;
}

/**
 * Polls `read` until it returns a session id or the plan runs out. Returns a
 * cancel function. A read that throws stops polling, matching the previous
 * inline behavior.
 */
export function startCliResumeInfoPolling(args: {
  plan: CliResumeInfoPollingPlan;
  read: () => Promise<string | undefined>;
  onFound: (nativeSessionId: string) => void;
  schedule?: (callback: () => void, delayMs: number) => () => void;
  isCurrent?: () => boolean;
}) {
  const schedule =
    args.schedule ??
    ((callback: () => void, delayMs: number) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    });
  let cancelled = false;
  let cancelScheduled: (() => void) | null = null;
  let attempts = 0;

  const poll = async () => {
    let nativeSessionId: string | undefined;
    try {
      nativeSessionId = (await args.read())?.trim();
    } catch {
      return;
    }
    if (cancelled || args.isCurrent?.() === false) {
      return;
    }
    if (nativeSessionId) {
      args.onFound(nativeSessionId);
      return;
    }
    attempts += 1;
    if (attempts >= args.plan.maxAttempts) {
      return;
    }
    cancelScheduled = schedule(() => {
      void poll();
    }, args.plan.intervalMs);
  };

  void poll();
  return () => {
    cancelled = true;
    cancelScheduled?.();
  };
}
