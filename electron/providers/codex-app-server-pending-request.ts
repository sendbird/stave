export interface PendingCodexAppServerResponse {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutHandle?: ReturnType<typeof setTimeout>;
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
  return pending;
}

export function registerPendingCodexAppServerResponse(args: {
  pendingResponses: Map<number | string, PendingCodexAppServerResponse>;
  requestId: number | string;
  method: string;
  timeoutMs?: number;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}) {
  const pending: PendingCodexAppServerResponse = {
    resolve: args.resolve,
    reject: args.reject,
  };
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
