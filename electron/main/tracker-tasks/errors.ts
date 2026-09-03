/**
 * Stable failure vocabulary for the tracker surface.
 *
 * Every tracker failure crosses IPC and lands in a renderer banner, so an
 * upstream message must never travel with it: a Jira or Atelier body can carry
 * a site URL, an account id, or the tail of a request that included a
 * credential. Only a snake_case code leaves this layer, and the human sentence
 * is derived from that code alone.
 */

/** `TrackerSourceSyncStatus.lastErrorCode` and `TrackerTaskStaveLink.errorCode`. */
const ERROR_CODE_LIMIT = 64;

/** A tracker failure Stave itself decided on, rather than one it received. */
export class TrackerTaskError extends Error {
  constructor(readonly code: string) {
    super(`Tracker request failed (${code}).`);
    this.name = "TrackerTaskError";
  }
}

/**
 * Reduce any thrown value to a code the surface can render.
 *
 * Connector errors (`JiraHttpError`, `AtelierConnectorHttpError`) already carry
 * a machine-readable `code`, so it is reused after being forced into the
 * character set the status schema accepts. Anything else collapses into
 * `request_failed`: guessing from a message is how upstream text leaks.
 */
export function toTrackerErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === "string") {
    const normalized = code
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, ERROR_CODE_LIMIT);
    if (normalized) {
      return normalized;
    }
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "aborted";
  }
  return "request_failed";
}

/**
 * The rate-limit hint a connector attached to its own error.
 *
 * Honoured in preference to the computed backoff because a server that says
 * "come back in 90 seconds" is stating a fact about its own budget, and
 * retrying earlier only spends another rejected request.
 */
export function trackerRetryAfterMs(error: unknown): number | null {
  const value = (error as { retryAfterMs?: unknown } | null | undefined)
    ?.retryAfterMs;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

/** The one sentence the renderer is allowed to show for a tracker failure. */
export function safeTrackerErrorMessage(error: unknown): string {
  if (error instanceof TrackerTaskError) {
    return error.message;
  }
  return `Tracker request failed (${toTrackerErrorCode(error)}).`;
}
