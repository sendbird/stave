/**
 * Cursor Agent's Connect-RPC stream uses HTTP/2 PING keepalives against the
 * Agent backend. When that stream dies the CLI writes a RetriableError to
 * stderr, or appends the same envelope as an ACP assistant text chunk and
 * still answers `session/prompt` with `end_turn`.
 *
 * ACP has no client setting that shrinks or retries that transport. Stave
 * recognizes the failure so the turn can end as `runtime_failure` instead of
 * hanging or looking like a finished answer.
 */
export const CURSOR_AGENT_PING_TIMEOUT_MESSAGE =
  "Cursor's agent stream lost its server keepalive (PING timed out). This is a Cursor Agent network drop, not a Stave protocol error. Retry the turn.";

export const CURSOR_AGENT_STREAM_CLOSED_MESSAGE =
  "Cursor's agent stream closed (HTTP/2). This is a Cursor Agent network drop, not a Stave protocol error. Retry the turn.";

export const CURSOR_AGENT_RETRIABLE_MESSAGE =
  "Cursor's agent stream dropped with a retriable backend error. This is a Cursor Agent network drop, not a Stave protocol error. Retry the turn.";

export const CURSOR_AGENT_CAPACITY_MESSAGE =
  "Cursor's agent backend is at capacity. This is a Cursor service limit, not a Stave protocol error. Retry the turn or choose another model.";

export type CursorAgentTransportKind = "stream_drop" | "capacity";

export type CursorAgentTransportFailure = {
  kind: CursorAgentTransportKind;
  message: string;
};

const RETRIABLE_LINE =
  /^(?:Error:\s*)?RetriableError:\s*\[(?<code>[^\]]+)\](?<rest>.*)$/i;

function lastNonEmptyLine(text: string) {
  const lines = text.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? "";
    if (line) {
      return line;
    }
  }
  return "";
}

function stripLastNonEmptyLine(text: string) {
  const lines = text.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]?.trim()) {
      return lines.slice(0, index).join("\n").trimEnd();
    }
  }
  return "";
}

function classifyRetriableEnvelope(code: string, rest: string) {
  const blob = `${code} ${rest}`;
  if (/resource_exhausted/i.test(blob)) {
    return {
      kind: "capacity",
      message: CURSOR_AGENT_CAPACITY_MESSAGE,
    } satisfies CursorAgentTransportFailure;
  }
  if (/PING timed out/i.test(blob)) {
    return {
      kind: "stream_drop",
      message: CURSOR_AGENT_PING_TIMEOUT_MESSAGE,
    } satisfies CursorAgentTransportFailure;
  }
  if (/NGHTTP2/i.test(blob) || /^internal$/i.test(code.trim())) {
    return {
      kind: "stream_drop",
      message: CURSOR_AGENT_STREAM_CLOSED_MESSAGE,
    } satisfies CursorAgentTransportFailure;
  }
  return {
    kind: "stream_drop",
    message: CURSOR_AGENT_RETRIABLE_MESSAGE,
  } satisfies CursorAgentTransportFailure;
}

function inspectRetriableLine(line: string) {
  const match = RETRIABLE_LINE.exec(line.trim());
  if (!match) {
    return null;
  }
  return classifyRetriableEnvelope(match.groups?.code ?? "", match.groups?.rest ?? "");
}

function inspectStderrBlob(text: string) {
  const lastLine = inspectRetriableLine(lastNonEmptyLine(text));
  if (lastLine) {
    return lastLine;
  }
  for (const line of text.split(/\r?\n/)) {
    const found = inspectRetriableLine(line);
    if (found) {
      return found;
    }
  }
  if (/PING timed out/i.test(text)) {
    return {
      kind: "stream_drop",
      message: CURSOR_AGENT_PING_TIMEOUT_MESSAGE,
    } satisfies CursorAgentTransportFailure;
  }
  if (/NGHTTP2/i.test(text)) {
    return {
      kind: "stream_drop",
      message: CURSOR_AGENT_STREAM_CLOSED_MESSAGE,
    } satisfies CursorAgentTransportFailure;
  }
  return null;
}

export function inspectCursorAgentTransportFailure(
  text: string,
  source: "stderr" | "agent-text" = "stderr",
) {
  if (source === "agent-text") {
    return inspectRetriableLine(lastNonEmptyLine(text));
  }
  return inspectStderrBlob(text);
}

/** Drops a last-line RetriableError so it is not stored as assistant text. */
export function stripCursorAgentTextTransportEnvelope(text: string) {
  if (!inspectRetriableLine(lastNonEmptyLine(text))) {
    return text;
  }
  return stripLastNonEmptyLine(text);
}

export function isCursorAgentPingTimeout(text: string) {
  return inspectCursorAgentTransportFailure(text)?.message ===
    CURSOR_AGENT_PING_TIMEOUT_MESSAGE;
}

export function describeCursorAgentTransportFailure(text: string) {
  return inspectCursorAgentTransportFailure(text)?.message ?? null;
}

export function isCursorAgentTransportRetryable(
  failure: CursorAgentTransportFailure | null,
) {
  return failure?.kind === "stream_drop";
}
