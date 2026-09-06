const MAX_LOCAL_MCP_LOG_DEPTH = 6;
const MAX_LOCAL_MCP_LOG_STRING_LENGTH = 4000;
const MAX_LOCAL_MCP_LOG_ARRAY_ITEMS = 20;
const MAX_LOCAL_MCP_LOG_OBJECT_KEYS = 40;

function isSensitiveLogKey(key: string) {
  return /(authorization|token|secret|password|api[_-]?key)/i.test(key);
}

export function truncateLogString(value: string) {
  if (value.length <= MAX_LOCAL_MCP_LOG_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_LOCAL_MCP_LOG_STRING_LENGTH)}…<truncated>`;
}

export function sanitizeMcpLogValue(
  value: unknown,
  keyName?: string,
  depth = 0,
): unknown {
  if (keyName && isSensitiveLogKey(keyName)) {
    return "[redacted]";
  }

  if (
    value == null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    if (/^bearer\s+/i.test(value.trim())) {
      return "[redacted bearer token]";
    }
    return truncateLogString(value);
  }

  if (depth >= MAX_LOCAL_MCP_LOG_DEPTH) {
    return "[truncated depth]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_LOCAL_MCP_LOG_ARRAY_ITEMS)
      .map((item) => sanitizeMcpLogValue(item, undefined, depth + 1));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record).slice(
      0,
      MAX_LOCAL_MCP_LOG_OBJECT_KEYS,
    );
    return Object.fromEntries(
      entries.map(([key, nestedValue]) => [
        key,
        sanitizeMcpLogValue(nestedValue, key, depth + 1),
      ]),
    );
  }

  return String(value);
}
