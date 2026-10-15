import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { resolveCommandCwd } from "../main/utils/command";
import {
  collectRecentCodexSessionFiles,
  readCodexSessionMeta,
} from "./codex-native-session-files";
import { listKiroSessions } from "./kiro-native-session-files";
import {
  canonicalOpenCodeDirectory,
  listOpenCodeSessions,
} from "./opencode-native-session-files";
import { isOpenCodeAcpSessionId } from "../providers/opencode/opencode-session-registry";
import { OPENCODE_NATIVE_SESSION_DISCOVERY } from "../../src/lib/terminal/native-session-discovery-window";
import type { TerminalSessionEntry } from "./terminal-session-entry";

const CODEX_SESSION_DISCOVERY_POLL_MS = 500;
const CODEX_SESSION_DISCOVERY_MAX_ATTEMPTS = 60;
const CODEX_SESSION_DISCOVERY_LOOKBACK_MS = 15_000;
const CODEX_SESSION_DISCOVERY_MATCH_WINDOW_MS = 60_000;
const KIRO_SESSION_DISCOVERY_POLL_MS = 500;
const KIRO_SESSION_DISCOVERY_MAX_ATTEMPTS = 60;
const KIRO_SESSION_DISCOVERY_LOOKBACK_MS = 15_000;
/** Claim owner for a session two OpenCode tabs could own; nobody adopts it. */
const CONTESTED_OPENCODE_SESSION = "\u0000contested";

/**
 * Native session ids are not known at spawn time for every provider, so they
 * are discovered by polling after the PTY starts. The claim maps live here so
 * that two PTYs racing in the same folder cannot adopt the same native id.
 */
export function createNativeSessionDiscovery(args: {
  sessions: Map<string, TerminalSessionEntry>;
}) {
  const { sessions } = args;
  const codexSessionFileClaimByPath = new Map<string, string>();
  const codexSessionIdClaimByNativeId = new Map<string, string>();
  const kiroSessionIdClaimByNativeId = new Map<string, string>();
  const opencodeSessionIdClaimByNativeId = new Map<string, string>();
  /**
   * Open OpenCode 1.x tabs that have no session id yet, by PTY session id.
   * Outlives a tab's polling: an entry leaves only when the PTY closes or the
   * tab gets an id, because until then the tab can still create a session.
   */
  const unresolvedOpenCodeTabs = new Map<
    string,
    { cwdKey: string; startedAtMs: number }
  >();

  function normalizeSessionCwd(cwd: string) {
    return resolveCommandCwd({ cwd });
  }

  function releaseNativeSessionClaims(sessionId: string) {
    unresolvedOpenCodeTabs.delete(sessionId);
    for (const [filePath, ownerSessionId] of codexSessionFileClaimByPath) {
      if (ownerSessionId === sessionId) {
        codexSessionFileClaimByPath.delete(filePath);
      }
    }
    for (const [
      nativeSessionId,
      ownerSessionId,
    ] of codexSessionIdClaimByNativeId) {
      if (ownerSessionId === sessionId) {
        codexSessionIdClaimByNativeId.delete(nativeSessionId);
      }
    }
    for (const claims of [
      kiroSessionIdClaimByNativeId,
      opencodeSessionIdClaimByNativeId,
    ]) {
      for (const [nativeSessionId, ownerSessionId] of claims) {
        if (ownerSessionId === sessionId) {
          claims.delete(nativeSessionId);
        }
      }
    }
  }

  /**
   * Polls a CLI-provided session list until a session that started after this
   * PTY appears. The lookback filter keeps a conversation the user started in
   * that folder before this PTY existed from being adopted, and the claim map
   * keeps two PTYs in the same folder from landing on the same id.
   */
  function startListedNativeSessionDiscovery(args: {
    sessionId: string;
    startedAtMs: number;
    pollMs: number;
    maxAttempts: number;
    lookbackMs: number;
    claims: Map<string, string>;
    listSessions: () => Promise<Array<{ sessionId: string; updatedAtMs: number }>>;
  }) {
    const session = sessions.get(args.sessionId);
    if (!session || session.nativeSessionId) {
      return;
    }

    let disposed = false;
    let attempts = 0;
    let scanning = false;

    const stop = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      clearInterval(intervalId);
      const currentSession = sessions.get(args.sessionId);
      if (currentSession?.disposeNativeSessionDiscovery === stop) {
        currentSession.disposeNativeSessionDiscovery = null;
      }
    };

    const scan = async () => {
      if (scanning) {
        return;
      }
      const currentSession = sessions.get(args.sessionId);
      if (
        !currentSession ||
        currentSession.closing ||
        currentSession.nativeSessionId
      ) {
        stop();
        return;
      }

      scanning = true;
      let summaries: Array<{ sessionId: string; updatedAtMs: number }> = [];
      try {
        summaries = await args.listSessions();
      } finally {
        scanning = false;
      }
      if (disposed) {
        return;
      }

      const liveSession = sessions.get(args.sessionId);
      if (!liveSession || liveSession.closing || liveSession.nativeSessionId) {
        stop();
        return;
      }

      let bestMatch: { sessionId: string; updatedAtMs: number } | null = null;
      for (const summary of summaries) {
        if (summary.updatedAtMs < args.startedAtMs - args.lookbackMs) {
          continue;
        }
        const claimedBy = args.claims.get(summary.sessionId);
        if (claimedBy && claimedBy !== args.sessionId) {
          continue;
        }
        if (!bestMatch || summary.updatedAtMs > bestMatch.updatedAtMs) {
          bestMatch = summary;
        }
      }

      if (bestMatch) {
        liveSession.nativeSessionId = bestMatch.sessionId;
        args.claims.set(bestMatch.sessionId, args.sessionId);
        stop();
        return;
      }

      attempts += 1;
      if (attempts >= args.maxAttempts) {
        stop();
      }
    };

    const intervalId = setInterval(() => {
      void scan();
    }, args.pollMs);
    session.disposeNativeSessionDiscovery = stop;
    void scan();
  }

  /**
   * Kiro accepts no session id up front, so the id is discovered after spawn by
   * polling `kiro-cli chat --list-sessions --format json` in the session cwd.
   */
  function startKiroNativeSessionDiscovery(args: {
    sessionId: string;
    cwd: string;
    startedAtMs: number;
    executablePath: string;
    env?: Record<string, string | undefined>;
  }) {
    startListedNativeSessionDiscovery({
      sessionId: args.sessionId,
      startedAtMs: args.startedAtMs,
      pollMs: KIRO_SESSION_DISCOVERY_POLL_MS,
      maxAttempts: KIRO_SESSION_DISCOVERY_MAX_ATTEMPTS,
      lookbackMs: KIRO_SESSION_DISCOVERY_LOOKBACK_MS,
      claims: kiroSessionIdClaimByNativeId,
      listSessions: () =>
        listKiroSessions({
          executablePath: args.executablePath,
          cwd: args.cwd,
          env: args.env,
        }),
    });
  }

  /**
   * OpenCode 1.x takes no new-session id and its TUI creates the session only
   * when the first message is sent, so the id is inferred from
   * `opencode session list`. OpenCode lists the sessions of Stave's own ACP
   * turns and of other TUIs in the same folder alongside, so the id is taken
   * only when ownership is unambiguous:
   *
   * - the session was created after this tab started;
   * - Stave's ACP runtime did not create or load it in this process;
   * - it is the only such unclaimed session; and
   * - no other open OpenCode tab without an id in the same folder started
   *   before it, whether or not that tab is still polling.
   *
   * Anything else leaves the tab without a resumable id rather than resuming
   * someone else's conversation, and marks the session contested so a tab
   * that is still looking cannot take it later either.
   */
  function startOpenCodeNativeSessionDiscovery(args: {
    sessionId: string;
    cwd: string;
    startedAtMs: number;
    executablePath: string;
    env?: Record<string, string | undefined>;
  }) {
    const session = sessions.get(args.sessionId);
    if (!session || session.nativeSessionId) {
      return;
    }
    const cwdKey = canonicalOpenCodeDirectory(args.cwd);
    unresolvedOpenCodeTabs.set(args.sessionId, {
      cwdKey,
      startedAtMs: args.startedAtMs,
    });

    let disposed = false;
    let scanning = false;
    // Bounded by elapsed time, not by scans: a slow `session list` must not
    // keep the host looking after the renderer has stopped asking.
    const discoveryWindowMs =
      OPENCODE_NATIVE_SESSION_DISCOVERY.pollMs * OPENCODE_NATIVE_SESSION_DISCOVERY.maxAttempts;

    const stop = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      clearInterval(intervalId);
      // Polling ends here; ownership does not. A live tab without an id can
      // still create a session, so it stays a possible owner for the other
      // tabs in its folder until its PTY closes (releaseNativeSessionClaims)
      // or it has an id.
      if (!isLive()) {
        unresolvedOpenCodeTabs.delete(args.sessionId);
      }
      const currentSession = sessions.get(args.sessionId);
      if (currentSession?.disposeNativeSessionDiscovery === stop) {
        currentSession.disposeNativeSessionDiscovery = null;
      }
    };

    const isLive = () => {
      const liveSession = sessions.get(args.sessionId);
      return Boolean(
        liveSession && !liveSession.closing && !liveSession.nativeSessionId,
      );
    };

    const scan = async () => {
      if (scanning) {
        return;
      }
      if (!isLive()) {
        stop();
        return;
      }
      scanning = true;
      let summaries: Array<{ sessionId: string; updatedAtMs: number }> = [];
      try {
        summaries = await listOpenCodeSessions({
          executablePath: args.executablePath,
          cwd: args.cwd,
          env: args.env,
        });
      } finally {
        scanning = false;
      }
      if (disposed) {
        return;
      }
      if (!isLive() || Date.now() - args.startedAtMs >= discoveryWindowMs) {
        stop();
        return;
      }

      const candidates = summaries.filter((summary) => {
        if (summary.updatedAtMs < args.startedAtMs) return false;
        if (isOpenCodeAcpSessionId(summary.sessionId)) return false;
        const claimedBy = opencodeSessionIdClaimByNativeId.get(summary.sessionId);
        return !claimedBy || claimedBy === args.sessionId;
      });
      if (candidates.length === 0) {
        return;
      }
      const possibleOwners = [...unresolvedOpenCodeTabs.entries()].filter(
        ([, pending]) =>
          pending.cwdKey === cwdKey &&
          candidates.some((candidate) => pending.startedAtMs <= candidate.updatedAtMs),
      );
      const [candidate] = candidates;
      if (
        candidates.length === 1 &&
        candidate &&
        possibleOwners.length === 1 &&
        possibleOwners[0]?.[0] === args.sessionId
      ) {
        const liveSession = sessions.get(args.sessionId);
        if (liveSession) {
          liveSession.nativeSessionId = candidate.sessionId;
        }
        opencodeSessionIdClaimByNativeId.set(candidate.sessionId, args.sessionId);
        stop();
        return;
      }
      for (const contested of candidates) {
        opencodeSessionIdClaimByNativeId.set(
          contested.sessionId,
          CONTESTED_OPENCODE_SESSION,
        );
      }
      stop();
    };

    const intervalId = setInterval(() => {
      void scan();
    }, OPENCODE_NATIVE_SESSION_DISCOVERY.pollMs);
    session.disposeNativeSessionDiscovery = stop;
    void scan();
  }

  function startCodexNativeSessionDiscovery(args: {
    sessionId: string;
    cwd: string;
    startedAtMs: number;
    codexHome?: string;
  }) {
    const session = sessions.get(args.sessionId);
    if (!session || session.nativeSessionId) {
      return;
    }

    const sessionsRoot = path.join(args.codexHome || path.join(homedir(), ".codex"), "sessions");
    if (!existsSync(sessionsRoot)) {
      return;
    }

    const targetCwd = normalizeSessionCwd(args.cwd);
    let disposed = false;
    let attempts = 0;

    const stop = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      clearInterval(intervalId);
      const currentSession = sessions.get(args.sessionId);
      if (currentSession?.disposeNativeSessionDiscovery === stop) {
        currentSession.disposeNativeSessionDiscovery = null;
      }
    };

    const scan = () => {
      const currentSession = sessions.get(args.sessionId);
      if (
        !currentSession ||
        currentSession.closing ||
        currentSession.nativeSessionId
      ) {
        stop();
        return;
      }

      const candidates = collectRecentCodexSessionFiles({
        rootPath: sessionsRoot,
        earliestMtimeMs: args.startedAtMs - CODEX_SESSION_DISCOVERY_LOOKBACK_MS,
      });

      let bestMatch: {
        filePath: string;
        nativeSessionId: string;
        deltaMs: number;
      } | null = null;

      for (const filePath of candidates) {
        const claimedBy = codexSessionFileClaimByPath.get(filePath);
        if (claimedBy && claimedBy !== args.sessionId) {
          continue;
        }
        const meta = readCodexSessionMeta({ filePath });
        if (!meta || meta.cwd !== targetCwd) {
          continue;
        }
        if (
          Math.abs(meta.timestampMs - args.startedAtMs) >
          CODEX_SESSION_DISCOVERY_MATCH_WINDOW_MS
        ) {
          continue;
        }
        const claimedNativeSessionId = codexSessionIdClaimByNativeId.get(
          meta.nativeSessionId,
        );
        if (
          claimedNativeSessionId &&
          claimedNativeSessionId !== args.sessionId
        ) {
          continue;
        }
        const deltaMs = Math.abs(meta.timestampMs - args.startedAtMs);
        if (!bestMatch || deltaMs < bestMatch.deltaMs) {
          bestMatch = {
            filePath,
            nativeSessionId: meta.nativeSessionId,
            deltaMs,
          };
        }
      }

      if (bestMatch) {
        currentSession.nativeSessionId = bestMatch.nativeSessionId;
        codexSessionFileClaimByPath.set(bestMatch.filePath, args.sessionId);
        codexSessionIdClaimByNativeId.set(
          bestMatch.nativeSessionId,
          args.sessionId,
        );
        stop();
        return;
      }

      attempts += 1;
      if (attempts >= CODEX_SESSION_DISCOVERY_MAX_ATTEMPTS) {
        stop();
      }
    };

    const intervalId = setInterval(scan, CODEX_SESSION_DISCOVERY_POLL_MS);
    session.disposeNativeSessionDiscovery = stop;
    scan();
  }

  return {
    releaseNativeSessionClaims,
    startCodexNativeSessionDiscovery,
    startKiroNativeSessionDiscovery,
    startOpenCodeNativeSessionDiscovery,
  };
}
