export const HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES = 4 * 1024 * 1024;
export const HOST_SERVICE_PROTOCOL_BUFFER_MAX_BYTES = 8 * 1024 * 1024;

// Compatibility alias for older call sites/tests migrated incrementally.
export const HOST_SERVICE_PROTOCOL_LINE_MAX_BYTES =
  HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES;
