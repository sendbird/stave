export const HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES = 4 * 1024 * 1024;
export const HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES = 8 * 1024 * 1024;

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

/** Keeps a bypassing error response small enough to be safe to force through. */
export function truncateHostServiceErrorMessage(value: string) {
  return value.length > HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS
    ? `${value.slice(0, HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS)}…`
    : value;
}
