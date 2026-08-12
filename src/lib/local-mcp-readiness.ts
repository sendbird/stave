import { useEffect, useMemo, useState } from "react";
import type { StaveLocalMcpStatus } from "@/lib/local-mcp";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * Whether the agent-facing Local MCP tools (`stave_consult_advisor`,
 * `stave_delegate_task`, …) can actually be called right now.
 *
 * Both capabilities are armed in one place and delivered in another: the user
 * arms them in the composer or Settings, but the tool only reaches the model
 * when the Local MCP server is running and — for a Codex primary — registered
 * with the installed CLI. When that link is broken the model simply never sees
 * the tool, so an armed capability does nothing and says nothing. This resolver
 * exists so the surfaces that arm a capability can name that gap themselves.
 *
 * `unknown` is a real state, not a failure: the status arrives over IPC, and a
 * pill that flashed a warning before the first read would cry wolf on every
 * mount.
 */
export type LocalMcpReadinessState = "ready" | "unavailable" | "unknown";

export type LocalMcpBlockReason =
  | "server-disabled"
  | "server-stopped"
  | "codex-not-registered";

export interface LocalMcpReadiness {
  state: LocalMcpReadinessState;
  reason: LocalMcpBlockReason | null;
  /** What is wrong and where it is fixed. Null unless `unavailable`. */
  detail: string | null;
}

const UNKNOWN_READINESS: LocalMcpReadiness = {
  state: "unknown",
  reason: null,
  detail: null,
};

const READY_READINESS: LocalMcpReadiness = {
  state: "ready",
  reason: null,
  detail: null,
};

const BLOCK_DETAIL: Record<LocalMcpBlockReason, string> = {
  "server-disabled":
    "The Local MCP server is turned off in Settings → Developer.",
  "server-stopped":
    "The Local MCP server is enabled but not running; restart it in Settings → Developer.",
  "codex-not-registered":
    "Codex has no current Stave MCP entry, so Stave's tools are missing from its session. Re-register it in Settings → Developer.",
};

function blocked(reason: LocalMcpBlockReason): LocalMcpReadiness {
  return { state: "unavailable", reason, detail: BLOCK_DETAIL[reason] };
}

/**
 * Mirrors the provider-side gates that decide whether the tool is exposed:
 * Claude needs a live manifest (`resolveEmbeddedStaveLocalMcpServers`), and
 * Codex additionally needs its managed config entry to match the current
 * manifest (`hasConnectedStaveLocalMcpForCodex`).
 */
export function resolveLocalMcpReadiness(args: {
  status: StaveLocalMcpStatus | null;
  primaryProviderId: ProviderId;
}): LocalMcpReadiness {
  const { status } = args;
  if (!status) {
    return UNKNOWN_READINESS;
  }
  if (!status.config.enabled) {
    return blocked("server-disabled");
  }
  if (!status.running || !status.manifest) {
    return blocked("server-stopped");
  }
  if (
    args.primaryProviderId === "codex" &&
    !(
      status.codexRegistration.installed &&
      status.codexRegistration.matchesCurrentManifest
    )
  ) {
    return blocked("codex-not-registered");
  }
  return READY_READINESS;
}

/**
 * One sentence a capability surface can show verbatim: what will not happen,
 * plus the fix. Null while ready or still unknown, so callers can render it
 * unconditionally.
 */
export function describeLocalMcpBlock(args: {
  readiness: LocalMcpReadiness;
  /** Capability as the user names it, e.g. "Advisor consults". */
  capability: string;
}): string | null {
  if (args.readiness.state !== "unavailable" || !args.readiness.detail) {
    return null;
  }
  return `${args.capability} reach the model through the Local MCP server. ${args.readiness.detail}`;
}

const STATUS_CACHE_TTL_MS = 30_000;

let cachedStatus: { status: StaveLocalMcpStatus; fetchedAt: number } | null =
  null;
let inflight: Promise<StaveLocalMcpStatus | null> | null = null;

/** Test seam: drops the shared cache so a case starts from a cold read. */
export function resetLocalMcpStatusCacheForTests() {
  cachedStatus = null;
  inflight = null;
}

async function loadLocalMcpStatus(args: { force?: boolean }) {
  if (
    !args.force &&
    cachedStatus &&
    Date.now() - cachedStatus.fetchedAt < STATUS_CACHE_TTL_MS
  ) {
    return cachedStatus.status;
  }
  if (inflight) {
    return inflight;
  }
  const getStatus = window.api?.localMcp?.getStatus;
  if (!getStatus) {
    return null;
  }
  inflight = (async () => {
    try {
      const result = await getStatus();
      if (!result.ok || !result.status) {
        return null;
      }
      cachedStatus = { status: result.status, fetchedAt: Date.now() };
      return result.status;
    } catch {
      // A failed read is not evidence the server is down, so the readiness
      // stays `unknown` rather than accusing a working setup.
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Reads Local MCP status for a capability surface. There is no status-change
 * subscription on the IPC surface, so this refetches when the surface becomes
 * relevant (armed, or a picker opened) instead of polling.
 */
export function useLocalMcpReadiness(args: {
  enabled?: boolean;
  primaryProviderId: ProviderId;
  /** Change to force a fresh read, e.g. when a picker opens. */
  refreshKey?: string | number | boolean;
}) {
  const [status, setStatus] = useState<StaveLocalMcpStatus | null>(
    () => cachedStatus?.status ?? null,
  );
  const [refreshNonce, setRefreshNonce] = useState(0);
  const enabled = args.enabled !== false;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    void loadLocalMcpStatus({ force: refreshNonce > 0 }).then((next) => {
      if (!cancelled && next) {
        setStatus(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshNonce, args.refreshKey]);

  return useMemo(
    () => ({
      status,
      readiness: resolveLocalMcpReadiness({
        status,
        primaryProviderId: args.primaryProviderId,
      }),
      refresh: () => setRefreshNonce((value) => value + 1),
    }),
    [status, args.primaryProviderId],
  );
}
