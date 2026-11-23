import type { Writable } from "node:stream";

// Settle before the shared provider delivery acknowledgement deadline. A
// wedged pipe may still hold a queued reply, so retire it instead of retrying.
const CODEX_RESPONSE_WRITE_TIMEOUT_MS = 25_000;

export function writeCodexServerResponse(args: {
  stdin: Writable;
  payload: unknown;
  signal?: AbortSignal;
  onExit: (listener: (message: string) => void) => () => void;
  onTimeout: () => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (args.signal?.aborted || args.stdin.destroyed || !args.stdin.writable) {
      reject(new Error("Codex App Server stdin is not writable."));
      return;
    }

    const finish = (error?: Error | null) => {
      clearTimeout(deadline);
      unsubscribeExit();
      args.signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(new Error("Codex App Server response was interrupted."));
    const unsubscribeExit = args.onExit((message) => finish(new Error(message)));
    const deadline = setTimeout(() => {
      args.onTimeout();
      finish(new Error("Codex App Server response write timed out."));
    }, CODEX_RESPONSE_WRITE_TIMEOUT_MS);
    args.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      // write() returning false means backpressure. The callback is the
      // acknowledgement that this frame was written or failed.
      args.stdin.write(JSON.stringify(args.payload) + "\n", finish);
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Codex App Server response write failed."));
    }
  });
}
