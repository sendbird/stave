export interface PendingCodexAppServerResponse {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abortListener?: () => void;
}

export function takePendingCodexAppServerResponse(args: {
  pendingResponses: Map<number | string, PendingCodexAppServerResponse>;
  requestId: number | string;
}) {
  const pending = args.pendingResponses.get(args.requestId);
  if (!pending) {
    return undefined;
  }
  args.pendingResponses.delete(args.requestId);
  if (pending.timeoutHandle !== undefined) {
    clearTimeout(pending.timeoutHandle);
  }
  if (pending.signal && pending.abortListener) {
    pending.signal.removeEventListener("abort", pending.abortListener);
  }
  return pending;
}

export function registerPendingCodexAppServerResponse(args: {
  pendingResponses: Map<number | string, PendingCodexAppServerResponse>;
  requestId: number | string;
  method: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}): boolean {
  if (args.signal?.aborted) {
    return false;
  }
  const pending: PendingCodexAppServerResponse = {
    resolve: args.resolve,
    reject: args.reject,
  };
  if (args.signal) {
    pending.signal = args.signal;
    pending.abortListener = () => {
      if (args.pendingResponses.get(args.requestId) !== pending) return;
      takePendingCodexAppServerResponse(args)?.reject(
        new Error(`Codex App Server ${args.method} was canceled.`),
      );
    };
  }
  if (args.timeoutMs !== undefined) {
    pending.timeoutHandle = setTimeout(() => {
      const expired = takePendingCodexAppServerResponse(args);
      expired?.reject(
        new Error(
          `Codex App Server ${args.method} timed out after ${args.timeoutMs}ms.`,
        ),
      );
    }, args.timeoutMs);
  }
  args.pendingResponses.set(args.requestId, pending);
  if (pending.signal && pending.abortListener) {
    pending.signal.addEventListener("abort", pending.abortListener, { once: true });
  }
  return true;
}

export function rejectAllPendingCodexAppServerResponses(args: {
  pendingResponses: Map<number | string, PendingCodexAppServerResponse>;
  error: Error;
}) {
  for (const requestId of [...args.pendingResponses.keys()]) {
    takePendingCodexAppServerResponse({
      pendingResponses: args.pendingResponses,
      requestId,
    })?.reject(args.error);
  }
}
