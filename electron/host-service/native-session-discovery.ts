import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { resolveCommandCwd } from "../main/utils/command";
import {
  collectRecentCodexSessionFiles,
  readCodexSessionMeta,
} from "./codex-native-session-files";
import { listKiroSessions } from "./kiro-native-session-files";
import { listOpenCodeSessions } from "./opencode-native-session-files";
import type { TerminalSessionEntry } from "./terminal-session-entry";

const CODEX_SESSION_DISCOVERY_POLL_MS = 500;
const CODEX_SESSION_DISCOVERY_MAX_ATTEMPTS = 60;
const CODEX_SESSION_DISCOVERY_LOOKBACK_MS = 15_000;
const CODEX_SESSION_DISCOVERY_MATCH_WINDOW_MS = 60_000;
const KIRO_SESSION_DISCOVERY_POLL_MS = 500;
const KIRO_SESSION_DISCOVERY_MAX_ATTEMPTS = 60;
const KIRO_SESSION_DISCOVERY_LOOKBACK_MS = 15_000;
const OPENCODE_SESSION_DISCOVERY_POLL_MS = 2_000;
const OPENCODE_SESSION_DISCOVERY_MAX_ATTEMPTS = 150;
const OPENCODE_SESSION_DISCOVERY_LOOKBACK_MS = 5_000;

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

  function normalizeSessionCwd(cwd: string) {
    return resolveCommandCwd({ cwd });
  }

  function releaseNativeSessionClaims(sessionId: string) {
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
   * The OpenCode TUI creates its session when the first message is sent, and
   * 1.x takes no new-session id, so the id is discovered by polling
   * `opencode session list --format json` for a session created in this folder
   * after the PTY started. Each poll starts the CLI, so it runs less often than
   * Kiro's and for longer, to cover the time before the first message.
   */
  function startOpenCodeNativeSessionDiscovery(args: {
    sessionId: string;
    cwd: string;
    startedAtMs: number;
    executablePath: string;
    env?: Record<string, string | undefined>;
  }) {
    startListedNativeSessionDiscovery({
      sessionId: args.sessionId,
      startedAtMs: args.startedAtMs,
      pollMs: OPENCODE_SESSION_DISCOVERY_POLL_MS,
      maxAttempts: OPENCODE_SESSION_DISCOVERY_MAX_ATTEMPTS,
      lookbackMs: OPENCODE_SESSION_DISCOVERY_LOOKBACK_MS,
      claims: opencodeSessionIdClaimByNativeId,
      listSessions: () =>
        listOpenCodeSessions({
          executablePath: args.executablePath,
          cwd: args.cwd,
          env: args.env,
        }),
    });
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
