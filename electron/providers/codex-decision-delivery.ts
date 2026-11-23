import type { ProviderResponderResult } from "./types";

export function createCodexDecisionDelivery<JsonRpcId extends string | number>(
  write: (id: JsonRpcId, result: unknown, signal: AbortSignal) => Promise<void>,
) {
  const lifetime = new AbortController();
  const answering = new Set<string>();
  const answered = new Set<string>();
  const deadlines = new Map<string, {
    timer: ReturnType<typeof setTimeout>;
    expire: () => void;
    elapsed: boolean;
  }>();

  const clearDeadline = (requestId: string) => {
    clearTimeout(deadlines.get(requestId)?.timer);
    deadlines.delete(requestId);
  };

  return {
    scheduleExpiry(requestId: string, timeoutMs: number, expire: () => void) {
      const deadline = {
        timer: setTimeout(() => {
          // A write started in time owns the request until it settles. If
          // it fails after the deadline, run the original expiry then.
          if (answering.has(requestId)) {
            deadline.elapsed = true;
            return;
          }
          deadlines.delete(requestId);
          if (!lifetime.signal.aborted) expire();
        }, timeoutMs),
        expire,
        elapsed: false,
      };
      clearDeadline(requestId);
      deadlines.set(requestId, deadline);
    },
    async respond<Pending extends { serverRequestId: JsonRpcId }>(
      requestId: string,
      requests: Map<string, Pending>,
      payload: (pending: Pending) => unknown,
    ): Promise<ProviderResponderResult> {
      const failure = (reason: Exclude<ProviderResponderResult, { ok: true }>["reason"]): ProviderResponderResult =>
        ({ ok: false, reason, pendingRequestIds: [...requests.keys()] });
      if (answered.has(requestId)) return failure("already-answered");
      if (lifetime.signal.aborted) return failure("request-interrupted");
      if (answering.has(requestId)) return failure("already-answering");
      const pending = requests.get(requestId);
      if (!pending) return failure("unknown-request");

      answering.add(requestId);
      try {
        await write(pending.serverRequestId, payload(pending), lifetime.signal);
        if (lifetime.signal.aborted) return failure("request-interrupted");
        requests.delete(requestId);
        clearDeadline(requestId);
        answered.add(requestId);
        return { ok: true };
      } catch {
        if (lifetime.signal.aborted) return failure("request-interrupted");
        const deadline = deadlines.get(requestId);
        if (deadline?.elapsed) {
          clearDeadline(requestId);
          deadline.expire();
          return failure("request-interrupted");
        }
        return failure("write-failed");
      } finally {
        // A canceled write may already have reached the pipe. Cleanup must
        // not send a competing decline for that same request.
        if (lifetime.signal.aborted) requests.delete(requestId);
        answering.delete(requestId);
      }
    },
    clearDeadline,
    isAnswering: (requestId: string) => answering.has(requestId),
    interrupt() {
      lifetime.abort();
    },
  };
}
