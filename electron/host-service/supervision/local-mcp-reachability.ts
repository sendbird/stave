/**
 * Whether the Local MCP server that agent run turns report through is up.
 *
 * The server runs in the main process and advertises itself through the
 * manifest file; its `/health` endpoint answers without a token. The answer
 * is cached briefly because the agent run supervisor asks every tick.
 *
 * Used by: `electron/host-service.ts` (wires it into the agent run runtime).
 */
import type { StaveLocalMcpManifest } from "../../../src/lib/local-mcp";

const DEFAULT_CACHE_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 2_000;

export function createLocalMcpReachabilityProbe(args: {
  readManifest: () => Promise<
    (Pick<StaveLocalMcpManifest, "url"> & Partial<Pick<StaveLocalMcpManifest, "healthUrl">>) | null
  >;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  cacheMs?: number;
  timeoutMs?: number;
}) {
  const fetchImpl = args.fetch ?? globalThis.fetch;
  const now = args.now ?? Date.now;
  const cacheMs = args.cacheMs ?? DEFAULT_CACHE_MS;
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let cached: { reachable: boolean; at: number } | null = null;

  async function probe(): Promise<boolean> {
    const manifest = await args.readManifest();
    if (!manifest?.url) return false;
    let healthUrl: URL;
    try {
      healthUrl = new URL(manifest.healthUrl?.trim() || "/health", manifest.url);
    } catch {
      return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(healthUrl, { signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async isReachable(): Promise<boolean> {
      const at = now();
      if (cached && at - cached.at < cacheMs) return cached.reachable;
      const reachable = await probe();
      cached = { reachable, at };
      return reachable;
    },
    /** Forget the cached answer, e.g. before an agent run starts. */
    invalidate() {
      cached = null;
    },
  };
}
