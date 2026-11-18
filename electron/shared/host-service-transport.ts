// Secondary runs carry up to 8,000,000 ASCII image data-URL characters plus
// 32,000 text bytes, a 100,000-character prompt and bounded metadata. Allow
// JSON escaping (up to six bytes per text character) and envelope headroom.
// Both pipe decoders and the client's send guard share this finite cap.
export const HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES = 16 * 1024 * 1024;
export const HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES = 2 * HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES;

// Compatibility alias for older call sites/tests migrated incrementally.
export const HOST_SERVICE_PROTOCOL_LINE_MAX_BYTES =
  HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES;

export const HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS = 4_000;

/**
 * An error response is the only thing that can unblock a caller that is waiting
 * on a request, so it must never be dropped by outbound backpressure.
 *
 * Previously a saturated outbound queue rejected the success response, and the
 * error response that was supposed to replace it was rejected by the same cap
 * and then swallowed — leaving the caller's promise permanently unsettled.
 * Error responses are small and bounded, so they bypass the queue cap.
 */
export function shouldBypassOutboundQueueLimit(message: {
  type: string;
  ok?: boolean;
}) {
  return message.type === "response" && message.ok === false;
}

/** Backlog cap for events: a push nobody is waiting for is dropped rather than buffered without bound. */
export const HOST_SERVICE_EVENT_QUEUE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Events that only say "this changed, read it again". Each is small, and
 * dropping one leaves a surface stale until something else changes (the Tars
 * tray, Fleet, a task's turn state), so they are not shed with bulk events.
 */
export const HOST_SERVICE_CHANGE_SIGNAL_EVENTS: ReadonlySet<string> = new Set([
  "tars.changed", "agent-run.changed", "agent.changed", "wake-up.changed", "workspace.cleanup-changed",
  "local-mcp.task-turn-updated", "local-mcp.workspace-information-updated", "automation.unattended-authorizations-changed",
]);
/** A change signal larger than this is bulk data, not a signal, and keeps the event cap. */
export const HOST_SERVICE_CHANGE_SIGNAL_MAX_BYTES = 64 * 1024;

/**
 * How many outbound bytes may be pending when this message is queued.
 *
 * - An error response always goes through (`shouldBypassOutboundQueueLimit`).
 * - A success response answers a request the main process is waiting for, and
 *   there are only as many as requests in flight. It gets the receiver's own
 *   buffer budget, so a backlog of events (a burst of provider stream events
 *   during parallel runs) cannot turn an ordinary read such as `tars:get` into
 *   a "protocol overflow" failure.
 * - A small change signal gets the same budget, so a surface is told to read again.
 * - Other events keep the small backlog cap.
 */
export function outboundQueueLimitBytes(message: { type: string; ok?: boolean; event?: string }, messageBytes = 0) {
  if (shouldBypassOutboundQueueLimit(message)) return Number.POSITIVE_INFINITY;
  if (message.type === "response") return HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES;
  if (message.type === "event" && message.event && HOST_SERVICE_CHANGE_SIGNAL_EVENTS.has(message.event) &&
      messageBytes <= HOST_SERVICE_CHANGE_SIGNAL_MAX_BYTES) return HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES;
  return HOST_SERVICE_EVENT_QUEUE_MAX_BYTES;
}

/** What one outbound message counts as in the backlog: a response, or its event name. */
export function outboundBacklogKind(message: { type: string; event?: string }) {
  return message.type === "event" && message.event ? message.event : message.type;
}

/**
 * Pending outbound bytes by kind, so a rejected message can say what filled
 * the queue (the one thing a "protocol overflow" report needs to be fixed).
 */
export class OutboundBacklog {
  private readonly bytesByKind = new Map<string, number>();
  private total = 0;
  add(kind: string, bytes: number) {
    this.bytesByKind.set(kind, (this.bytesByKind.get(kind) ?? 0) + bytes);
    this.total += bytes;
  }
  remove(kind: string, bytes: number) {
    const left = (this.bytesByKind.get(kind) ?? 0) - bytes;
    if (left > 0) this.bytesByKind.set(kind, left); else this.bytesByKind.delete(kind);
    this.total = Math.max(0, this.total - bytes);
  }
  get bytes() { return this.total; }
  /** The kinds holding the most pending bytes, largest first, as `kind=bytes`. */
  describeTop(count = 3) {
    return [...this.bytesByKind].sort((a, b) => b[1] - a[1]).slice(0, count).map(([kind, bytes]) => `${kind}=${bytes}`).join(" ");
  }
}

/** The stderr prefix the main process persists to its diagnostic log in every build. */
export const HOST_SERVICE_QUEUE_REJECTED_PREFIX = "[host-service:queue-rejected]";

/** The queue-rejection lines in a host stderr chunk, bounded. */
export function selectHostQueueRejections(chunk: string) {
  return chunk.split("\n").filter((line) => line.startsWith(HOST_SERVICE_QUEUE_REJECTED_PREFIX)).slice(0, 4).map((line) => line.slice(0, 1_000));
}

/** Keeps a bypassing error response small enough to be safe to force through. */
export function truncateHostServiceErrorMessage(value: string) {
  return value.length > HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS
    ? `${value.slice(0, HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS)}…`
    : value;
}
