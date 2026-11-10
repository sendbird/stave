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
 * How many outbound bytes may be pending when this message is queued.
 *
 * - An error response always goes through (`shouldBypassOutboundQueueLimit`).
 * - A success response answers a request the main process is waiting for, and
 *   there are only as many as requests in flight. It gets the receiver's own
 *   buffer budget, so a backlog of events (a burst of provider stream events
 *   during parallel runs) cannot turn an ordinary read such as `tars:get` into
 *   a "protocol overflow" failure.
 * - Events keep the small backlog cap.
 */
export function outboundQueueLimitBytes(message: { type: string; ok?: boolean }) {
  if (shouldBypassOutboundQueueLimit(message)) return Number.POSITIVE_INFINITY;
  return message.type === "response" ? HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES : HOST_SERVICE_EVENT_QUEUE_MAX_BYTES;
}

/** Keeps a bypassing error response small enough to be safe to force through. */
export function truncateHostServiceErrorMessage(value: string) {
  return value.length > HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS
    ? `${value.slice(0, HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS)}…`
    : value;
}
