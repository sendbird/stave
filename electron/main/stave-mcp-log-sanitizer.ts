const MAX_LOCAL_MCP_LOG_DEPTH = 6;
const MAX_LOCAL_MCP_LOG_STRING_LENGTH = 4000;
const MAX_LOCAL_MCP_LOG_ARRAY_ITEMS = 20;
const MAX_LOCAL_MCP_LOG_OBJECT_KEYS = 40;

function isSensitiveLogKey(key: string) {
  return /(authorization|token|secret|password|api[_-]?key|consultKey|workerKey|grant[_-]?key|x-stave-.*-key)/i.test(
    key,
  );
}

export function truncateLogString(value: string) {
  if (value.length <= MAX_LOCAL_MCP_LOG_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_LOCAL_MCP_LOG_STRING_LENGTH)}…<truncated>`;
}

/**
 * `stave_request_secret` never takes a value, and its strict schema rejects
 * one, but the log records the raw request before validation. Keep only the
 * keys the tool declares so nothing a caller adds can be stored.
 */
const SECRET_REQUEST_LOGGED_ARGUMENT_KEYS = new Set(["envVar", "reason", "label"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactSecretRequestCall(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecretRequestCall);
  if (!isRecord(value) || value.method !== "tools/call" || !isRecord(value.params)) return value;
  const toolName = typeof value.params.name === "string" ? value.params.name : "";
  if (toolName.split(/__|\./).at(-1) !== "stave_request_secret") return value;
  const args = value.params.arguments;
  return {
    ...value,
    params: {
      ...value.params,
      arguments: isRecord(args)
        ? Object.fromEntries(
            Object.entries(args).map(([key, nested]) => [
              key,
              SECRET_REQUEST_LOGGED_ARGUMENT_KEYS.has(key) ? nested : "[redacted]",
            ]),
          )
        : args === undefined
          ? undefined
          : "[redacted]",
    },
  };
}

export function sanitizeMcpLogValue(
  value: unknown,
  keyName?: string,
  depth = 0,
): unknown {
  if (keyName && isSensitiveLogKey(keyName)) {
    return "[redacted]";
  }
  if (depth === 0) {
    value = redactSecretRequestCall(value);
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
