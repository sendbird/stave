/**
 * OpenCode session ids that Stave's own ACP turns created or loaded in this
 * host process. OpenCode lists ACP and TUI sessions together, so Standalone
 * CLI discovery must never mistake one of these for the conversation its
 * PTY started. Bounded so a long-running host cannot grow it without limit.
 */
const MAX_REMEMBERED_SESSIONS = 2_000;
const acpSessionIds = new Set<string>();

export function rememberOpenCodeAcpSessionId(sessionId: string) {
  const id = sessionId.trim();
  if (!id) {
    return;
  }
  acpSessionIds.delete(id);
  acpSessionIds.add(id);
  if (acpSessionIds.size > MAX_REMEMBERED_SESSIONS) {
    const oldest = acpSessionIds.values().next().value;
    if (oldest !== undefined) acpSessionIds.delete(oldest);
  }
}

export function isOpenCodeAcpSessionId(sessionId: string) {
  return acpSessionIds.has(sessionId.trim());
}
