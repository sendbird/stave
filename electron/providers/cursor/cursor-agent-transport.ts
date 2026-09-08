/**
 * Cursor Agent's Connect-RPC stream uses HTTP/2 PING keepalives against the
 * Agent backend. When that ping fails the CLI writes a RetriableError to
 * stderr and often stops completing the in-flight ACP `session/prompt`.
 *
 * ACP has no client setting that shrinks or retries that transport. Stave
 * only recognizes the failure so the turn can end instead of hanging.
 */
export const CURSOR_AGENT_PING_TIMEOUT_MESSAGE =
  "Cursor's agent stream lost its server keepalive (PING timed out). This is a Cursor Agent network drop, not a Stave protocol error. Retry the turn.";

export function isCursorAgentPingTimeout(text: string) {
  return /PING timed out/i.test(text);
}

export function describeCursorAgentTransportFailure(text: string) {
  if (!isCursorAgentPingTimeout(text)) {
    return null;
  }
  return CURSOR_AGENT_PING_TIMEOUT_MESSAGE;
}
