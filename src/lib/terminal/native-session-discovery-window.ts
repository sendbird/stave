/**
 * How long the host keeps looking for the native session id of an OpenCode
 * 1.x Standalone CLI tab. The TUI creates its session only when the first
 * message is sent, so discovery covers five minutes of an idle tab. The
 * renderer polls the host for at least this long; see
 * `cli-resume-info-poller.ts`.
 */
export const OPENCODE_NATIVE_SESSION_DISCOVERY = {
  pollMs: 2_000,
  maxAttempts: 150,
} as const;
