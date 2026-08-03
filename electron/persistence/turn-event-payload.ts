import type { BridgeEvent } from "../providers/types";

/**
 * W1 Phase 0 — durable turn-event journaling helpers.
 *
 * Pure (no native `better-sqlite3` dependency) so they can be unit-tested under
 * Bun, unlike the `SqliteStore` methods that consume them. The DB methods stay
 * thin wrappers around these functions.
 *
 * Inline payloads are bounded: an earlier turn-event journal stored unbounded
 * payloads and was purged (`purgeLegacyTurnJournal`). Oversized events are
 * replaced by a compact truncation marker so the `turn_events` table never holds
 * multi-MB rows. (Offloading large payloads to the `artifacts` table via the
 * existing `payload_artifact_id` column is a future enhancement.)
 */
export const TURN_EVENT_PAYLOAD_INLINE_MAX_BYTES = 64 * 1024;

export interface PreparedTurnEventPayload {
  eventType: string;
  payloadJson: string;
  truncated: boolean;
}

export interface ParsedTurnEventPayload {
  event: BridgeEvent | null;
  truncated: boolean;
}

export interface PersistedTurnStreamEvent {
  sequence: number;
  eventType: string;
  /** Parsed event, or `null` when the stored payload was truncated/unparseable. */
  event: BridgeEvent | null;
  truncated: boolean;
}

function resolveEventType(event: BridgeEvent): string {
  const type = (event as { type?: unknown } | null | undefined)?.type;
  return typeof type === "string" && type.length > 0 ? type : "unknown";
}

function truncationMarker(eventType: string, byteSize: number): string {
  return JSON.stringify({ type: eventType, __truncated: true, byteSize });
}

function unserializableMarker(eventType: string): string {
  return JSON.stringify({ type: eventType, __unserializable: true });
}

/**
 * Serialize a bridge event for storage, bounding the inline payload size.
 * Returns the resolved event type, the JSON to persist, and whether the original
 * payload was replaced by a marker.
 */
export function prepareTurnEventPayload(
  event: BridgeEvent,
  maxBytes: number = TURN_EVENT_PAYLOAD_INLINE_MAX_BYTES,
): PreparedTurnEventPayload {
  const eventType = resolveEventType(event);

  let payloadJson: string | undefined;
  try {
    payloadJson = JSON.stringify(event);
  } catch {
    payloadJson = undefined;
  }

  if (payloadJson === undefined) {
    return {
      eventType,
      payloadJson: unserializableMarker(eventType),
      truncated: true,
    };
  }

  const byteSize = Buffer.byteLength(payloadJson, "utf8");
  if (byteSize > maxBytes) {
    return {
      eventType,
      payloadJson: truncationMarker(eventType, byteSize),
      truncated: true,
    };
  }

  return { eventType, payloadJson, truncated: false };
}

/**
 * Parse a stored turn-event payload back into a bridge event. Truncated or
 * unparseable payloads yield `event: null` with `truncated: true`.
 */
export function parseTurnEventPayload(payloadJson: string): ParsedTurnEventPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return { event: null, truncated: true };
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    ((parsed as Record<string, unknown>).__truncated === true ||
      (parsed as Record<string, unknown>).__unserializable === true)
  ) {
    return { event: null, truncated: true };
  }

  return { event: parsed as BridgeEvent, truncated: false };
}
