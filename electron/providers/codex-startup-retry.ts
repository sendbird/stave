import { setTimeout as delay } from "node:timers/promises";
import { CodexAppServerRpcError, isCodexRoutingDiscoveryFailure, toErrorMessage } from "./codex-app-server-errors";
import { buildCodexMcpAppInitializeCapabilities } from "./codex-mcp-app-views";

export const CODEX_INITIALIZE_TIMEOUT_MS = 20_000;
const BACKOFF_MS = [500, 1_500] as const;

export function isCodexInitializeTimeout(error: unknown) {
  return /^Codex App Server initialize timed out after \d+ms\.$/.test(toErrorMessage(error));
}

/** Retry only failures known to precede execution; never replay a model turn. */
export async function retryCodexStartup<T>(action: () => Promise<T>, options: {
  initialize?: boolean;
  signal?: AbortSignal;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
} = {}): Promise<T> {
  const wait = options.wait ?? ((ms, signal) => delay(ms, undefined, { signal }));
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    try {
      return await action();
    } catch (error) {
      // A thread timeout has an unknown outcome. Only an explicit refusal is
      // safe to repeat; initialize can time out because its child is torn down.
      const retryable = ((options.initialize || error instanceof CodexAppServerRpcError) && isCodexRoutingDiscoveryFailure(toErrorMessage(error)))
        || (options.initialize && isCodexInitializeTimeout(error));
      const backoff = BACKOFF_MS[attempt];
      if (!retryable || backoff === undefined) throw error;
      await wait(backoff, options.signal);
    }
  }
}

export async function initializeCodexAppServer(request: (method: string, params: unknown,
  options: { timeoutMs: number }) => Promise<unknown>) {
  const capabilities = buildCodexMcpAppInitializeCapabilities();
  await request("initialize", {
    clientInfo: { name: "stave", version: "0.1.0" },
    capabilities: { experimentalApi: true, ...capabilities },
  }, { timeoutMs: CODEX_INITIALIZE_TIMEOUT_MS });
  return Boolean(capabilities.extensions);
}
