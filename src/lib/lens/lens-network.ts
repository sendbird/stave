import type {
  BrowserNetworkBody,
  BrowserNetworkEntry,
  BrowserNetworkHeaders,
} from "@/lib/lens/lens.types";

const MAX_HEADER_COUNT = 100;
const MAX_HEADER_NAME_BYTES = 256;
const MAX_VALUES_PER_HEADER = 10;
const MAX_HEADER_VALUE_BYTES = 2_048;
const MAX_HEADER_BLOCK_BYTES = 64 * 1_024;
const MAX_NETWORK_URL_BYTES = 16_384;
export const MAX_LENS_NETWORK_BODY_BYTES = 256 * 1_024;
const MAX_STRUCTURED_BODY_DEPTH = 8;
const MAX_STRUCTURED_BODY_ITEMS = 100;
const SENSITIVE_HEADER_NAME_PATTERN =
  /(authorization|authentication|cookie|token|secret|credential|session|signature|csrf|xsrf|api[-_]?key|private[-_]?key)/i;
const SENSITIVE_BODY_FIELD_PATTERN =
  /(authorization|authentication|cookie|password|passwd|passphrase|token|secret|credential|session|signature|csrf|xsrf|api[-_]?key|private[-_]?key)/i;
const SENSITIVE_URL_QUERY_FIELD_PATTERN =
  /^(?:auth|code|state|sig|jwt|ticket|assertion|samlresponse)$/i;
const SENSITIVE_PLAIN_TEXT_PATTERN =
  /(["']?(?:authorization|authentication|cookie|password|passwd|passphrase|token|secret|credential|session|signature|csrf|xsrf|api[-_]?key|private[-_]?key)["']?\s*[:=]\s*)("(?:\\.|[^"\\])*(?:"|$)|'(?:\\.|[^'\\])*(?:'|$)|[^&,\s"'<>}]+)/gi;
const JSON_MIME_TYPE_PATTERN = /(?:^|\/|\+)json(?:$|;)/i;
const FORM_MIME_TYPE_PATTERN = /application\/x-www-form-urlencoded(?:$|;)/i;
const TEXT_MIME_TYPE_PATTERN =
  /^(?:text\/|application\/(?:javascript|xml|xhtml\+xml|graphql|sql)|image\/svg\+xml)/i;

function truncateUtf8(content: string, maxBytes: number) {
  const boundedMaxBytes = Number.isFinite(maxBytes)
    ? Math.max(0, Math.floor(maxBytes))
    : 0;
  const encoded = new TextEncoder().encode(content);
  if (encoded.byteLength <= boundedMaxBytes) {
    return {
      content,
      capturedBytes: encoded.byteLength,
      sourceBytes: encoded.byteLength,
      truncated: false,
    };
  }

  let end = Math.min(boundedMaxBytes, encoded.byteLength);
  while (
    end > 0 &&
    end < encoded.byteLength &&
    (encoded[end]! & 0xc0) === 0x80
  ) {
    end -= 1;
  }

  return {
    content: new TextDecoder().decode(encoded.subarray(0, end)),
    capturedBytes: end,
    sourceBytes: encoded.byteLength,
    truncated: true,
  };
}

function utf8JsonBytes(value: string): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function normalizeHeaderValue(value: string) {
  const truncated = truncateUtf8(value, MAX_HEADER_VALUE_BYTES);
  if (!truncated.truncated) {
    return value;
  }

  const marker = "…";
  const markerBytes = new TextEncoder().encode(marker).byteLength;
  const prefix = truncateUtf8(
    value,
    Math.max(0, MAX_HEADER_VALUE_BYTES - markerBytes),
  );
  return `${prefix.content}${marker}`;
}

/**
 * Lens exposes diagnostic request metadata to the renderer, but never raw
 * credentials. Header count and value sizes are bounded so the network ring
 * buffer cannot become an unbounded memory sink.
 */
export function sanitizeLensNetworkHeaders(
  headers: Record<string, string | string[] | number | boolean> | undefined,
): BrowserNetworkHeaders | undefined {
  if (!headers) {
    return undefined;
  }

  const sanitized: Array<[string, string[]]> = [];
  const usedNames = new Set<string>();
  let serializedBytes = 2;

  for (const [rawName, value] of Object.entries(headers).slice(
    0,
    MAX_HEADER_COUNT,
  )) {
    const name = truncateUtf8(rawName, MAX_HEADER_NAME_BYTES).content;
    if (usedNames.has(name)) {
      continue;
    }

    const rawValues = SENSITIVE_HEADER_NAME_PATTERN.test(rawName)
      ? ["[redacted]"]
      : (Array.isArray(value) ? value : [value])
          .slice(0, MAX_VALUES_PER_HEADER)
          .map(String)
          .map(normalizeHeaderValue);
    const entryOverhead =
      (sanitized.length > 0 ? 1 : 0) + utf8JsonBytes(name) + 3;
    const values: string[] = [];
    let entryBytes = entryOverhead;

    for (const nextValue of rawValues) {
      const nextBytes = (values.length > 0 ? 1 : 0) + utf8JsonBytes(nextValue);
      if (serializedBytes + entryBytes + nextBytes > MAX_HEADER_BLOCK_BYTES) {
        break;
      }
      values.push(nextValue);
      entryBytes += nextBytes;
    }

    if (values.length === 0) {
      continue;
    }
    sanitized.push([name, values]);
    usedNames.add(name);
    serializedBytes += entryBytes;
  }

  return Object.fromEntries(sanitized);
}

export function isLensSensitiveFieldName(name: string): boolean {
  return SENSITIVE_BODY_FIELD_PATTERN.test(name);
}

/**
 * Preserve a useful request URL while removing credentials and secret-like
 * query values before the URL enters the shared summary ring.
 */
export function sanitizeLensNetworkUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.username) parsed.username = "[redacted]";
    if (parsed.password) parsed.password = "[redacted]";
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        isLensSensitiveFieldName(key) ||
        SENSITIVE_URL_QUERY_FIELD_PATTERN.test(key)
      ) {
        parsed.searchParams.set(key, "[redacted]");
      }
    }
    return truncateUtf8(parsed.toString(), MAX_NETWORK_URL_BYTES).content;
  } catch {
    return "[invalid URL]";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactStructuredBody(
  value: unknown,
  depth = 0,
): { value: unknown; redacted: boolean; truncated: boolean } {
  if (depth >= MAX_STRUCTURED_BODY_DEPTH) {
    return { value: "[depth limit]", redacted: false, truncated: true };
  }

  if (Array.isArray(value)) {
    let redacted = false;
    let truncated = value.length > MAX_STRUCTURED_BODY_ITEMS;
    const items = value.slice(0, MAX_STRUCTURED_BODY_ITEMS).map((item) => {
      const next = redactStructuredBody(item, depth + 1);
      redacted ||= next.redacted;
      truncated ||= next.truncated;
      return next.value;
    });
    if (value.length > MAX_STRUCTURED_BODY_ITEMS) {
      items.push(`[${value.length - MAX_STRUCTURED_BODY_ITEMS} more items]`);
    }
    return { value: items, redacted, truncated };
  }

  if (!isRecord(value)) {
    return { value, redacted: false, truncated: false };
  }

  let redacted = false;
  const sourceEntries = Object.entries(value);
  let truncated = sourceEntries.length > MAX_STRUCTURED_BODY_ITEMS;
  const entries = sourceEntries
    .slice(0, MAX_STRUCTURED_BODY_ITEMS)
    .map(([key, fieldValue]) => {
      if (isLensSensitiveFieldName(key)) {
        redacted = true;
        return [key, "[redacted]"] as const;
      }
      const next = redactStructuredBody(fieldValue, depth + 1);
      redacted ||= next.redacted;
      truncated ||= next.truncated;
      return [key, next.value] as const;
    });

  if (sourceEntries.length > MAX_STRUCTURED_BODY_ITEMS) {
    entries.push([
      "[truncated]",
      `${sourceEntries.length - MAX_STRUCTURED_BODY_ITEMS} more fields`,
    ]);
  }

  return { value: Object.fromEntries(entries), redacted, truncated };
}

function redactFormBody(content: string) {
  const form = new URLSearchParams(content);
  let redacted = false;
  for (const key of [...form.keys()]) {
    if (!isLensSensitiveFieldName(key)) {
      continue;
    }
    form.set(key, "[redacted]");
    redacted = true;
  }
  return { content: form.toString(), redacted };
}

function redactPlainTextBody(content: string) {
  let redacted = false;
  const next = content.replace(
    SENSITIVE_PLAIN_TEXT_PATTERN,
    (_match, prefix: string, rawValue: string) => {
      redacted = true;
      const quote =
        rawValue.startsWith('"') || rawValue.startsWith("'") ? rawValue[0] : "";
      return `${prefix}${quote}[redacted]${quote}`;
    },
  );
  return { content: next, redacted };
}

export function isLensTextMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) {
    return false;
  }
  return (
    JSON_MIME_TYPE_PATTERN.test(mimeType) ||
    FORM_MIME_TYPE_PATTERN.test(mimeType) ||
    TEXT_MIME_TYPE_PATTERN.test(mimeType)
  );
}

/**
 * Create a bounded body preview for Lens. The full body never crosses IPC:
 * sensitive structured fields are redacted and UTF-8 content is capped.
 */
export function sanitizeLensNetworkBody(args: {
  content?: string;
  mimeType?: string;
  size?: number;
  unavailableReason?: string;
  maxBytes?: number;
  sourceTruncated?: boolean;
}): BrowserNetworkBody {
  const mimeType = args.mimeType?.split(";")[0]?.trim();
  if (args.content === undefined) {
    return {
      kind: args.unavailableReason ? "unavailable" : "binary",
      mimeType,
      size: args.size,
      capturedBytes: 0,
      truncated: false,
      redacted: false,
      unavailableReason:
        args.unavailableReason ??
        "Binary or unknown response data is not retained by Lens.",
    };
  }

  if (!isLensTextMimeType(mimeType)) {
    return {
      kind: "binary",
      mimeType,
      size: args.size ?? new TextEncoder().encode(args.content).byteLength,
      capturedBytes: 0,
      truncated: false,
      redacted: false,
      unavailableReason:
        args.unavailableReason ??
        "Binary or unknown response data is not retained by Lens.",
    };
  }

  const maxBytes = args.maxBytes ?? MAX_LENS_NETWORK_BODY_BYTES;
  const input = truncateUtf8(args.content, maxBytes);
  let content = input.content;
  let redacted = false;
  let structuredTruncated = false;
  let kind: BrowserNetworkBody["kind"] = "text";

  if (mimeType && JSON_MIME_TYPE_PATTERN.test(mimeType)) {
    kind = "json";
    try {
      const structured = redactStructuredBody(JSON.parse(content));
      content = JSON.stringify(structured.value, null, 2);
      redacted = structured.redacted;
      structuredTruncated = structured.truncated;
    } catch {
      const plain = redactPlainTextBody(content);
      content = plain.content;
      redacted = plain.redacted;
    }
  } else if (mimeType && FORM_MIME_TYPE_PATTERN.test(mimeType)) {
    kind = "form";
    const form = redactFormBody(content);
    content = form.content;
    redacted = form.redacted;
  } else {
    const plain = redactPlainTextBody(content);
    content = plain.content;
    redacted = plain.redacted;
  }

  const output = truncateUtf8(content, maxBytes);
  return {
    kind,
    mimeType,
    content: output.content,
    size: args.size ?? input.sourceBytes,
    capturedBytes: output.capturedBytes,
    truncated:
      Boolean(args.sourceTruncated) ||
      input.truncated ||
      structuredTruncated ||
      output.truncated,
    redacted,
  };
}

export function formatLensNetworkBytes(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "-";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatLensNetworkStatus(
  entry: Pick<BrowserNetworkEntry, "status" | "statusText">,
): string {
  const status = entry.status ?? "ERR";
  const statusText = entry.statusText?.trim();
  if (!statusText) {
    return String(status);
  }

  let detail = statusText.replace(/^HTTP\/\S+\s+/i, "").trim();
  if (typeof entry.status === "number") {
    detail = detail
      .replace(new RegExp(`^${entry.status}(?:\\s+|$)`), "")
      .trim();
  }
  return detail ? `${status} · ${detail}` : String(status);
}
