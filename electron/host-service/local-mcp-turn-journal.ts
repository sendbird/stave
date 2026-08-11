import type { BridgeEvent } from "../providers/types";
import type { PersistedTurnStreamEvent } from "../persistence/turn-event-payload";

const TURN_EVENT_FLUSH_MAX_PENDING = 64;
/**
 * A buffered turn that has not appended anything for this long is considered
 * abandoned (stopped, steered away, or taken over without a terminal event)
 * and gets flushed on the next write so its events are persisted instead of
 * stranded in memory forever.
 */
const TURN_EVENT_STALE_BUFFER_MS = 5 * 60 * 1000;
/**
 * Hard cap on concurrently buffered turns. When exceeded, the least recently
 * touched buffers are flushed first so total pending memory stays bounded even
 * if stale sweeping alone cannot keep up.
 */
const TURN_EVENT_MAX_BUFFERED_TURNS = 64;

interface PendingTurnEvent {
  sequence: number;
  event: BridgeEvent;
}

interface PendingTurnBuffer {
  events: PendingTurnEvent[];
  lastAppendedAt: number;
}

export function createLocalMcpTurnJournal(args: {
  persistEvents: (input: {
    turnId: string;
    events: PendingTurnEvent[];
  }) => void;
  onPersistError?: (error: unknown, context: {
    turnId: string;
    count: number;
  }) => void;
  now?: () => number;
  staleBufferMs?: number;
  maxBufferedTurns?: number;
}) {
  const now = args.now ?? Date.now;
  const staleBufferMs = args.staleBufferMs ?? TURN_EVENT_STALE_BUFFER_MS;
  const maxBufferedTurns =
    args.maxBufferedTurns ?? TURN_EVENT_MAX_BUFFERED_TURNS;
  const pendingTurnEventsById = new Map<string, PendingTurnBuffer>();

  function flush(turnId: string) {
    const pending = pendingTurnEventsById.get(turnId);
    if (!pending || pending.events.length === 0) {
      return;
    }
    pendingTurnEventsById.delete(turnId);
    try {
      args.persistEvents({ turnId, events: pending.events });
    } catch (error) {
      args.onPersistError?.(error, {
        turnId,
        count: pending.events.length,
      });
    }
  }

  /**
   * The stop/stale-turn call sites cannot always tell the journal a turn is
   * over (a stopped or taken-over turn just never appends again), so every
   * write sweeps abandoned buffers: anything untouched for `staleBufferMs` is
   * flushed to persistence, and the least recently touched buffers are flushed
   * whenever the total exceeds `maxBufferedTurns`.
   */
  function sweepStaleBuffers(currentTurnId: string, timestamp: number) {
    const staleTurnIds: string[] = [];
    for (const [turnId, pending] of pendingTurnEventsById) {
      if (turnId === currentTurnId) {
        continue;
      }
      if (timestamp - pending.lastAppendedAt >= staleBufferMs) {
        staleTurnIds.push(turnId);
      }
    }
    for (const turnId of staleTurnIds) {
      flush(turnId);
    }

    if (pendingTurnEventsById.size <= maxBufferedTurns) {
      return;
    }
    const oldestFirst = Array.from(pendingTurnEventsById.entries())
      .filter(([turnId]) => turnId !== currentTurnId)
      .sort(([, a], [, b]) => a.lastAppendedAt - b.lastAppendedAt);
    for (const [turnId] of oldestFirst) {
      if (pendingTurnEventsById.size <= maxBufferedTurns) {
        break;
      }
      flush(turnId);
    }
  }

  return {
    append(input: PendingTurnEvent & { turnId: string }) {
      const timestamp = now();
      const pending = pendingTurnEventsById.get(input.turnId) ?? {
        events: [],
        lastAppendedAt: timestamp,
      };
      pending.events.push({
        sequence: input.sequence,
        event: input.event,
      });
      pending.lastAppendedAt = timestamp;
      pendingTurnEventsById.set(input.turnId, pending);
      if (
        pending.events.length >= TURN_EVENT_FLUSH_MAX_PENDING ||
        input.event.type === "done"
      ) {
        flush(input.turnId);
      }
      sweepStaleBuffers(input.turnId, timestamp);
    },
    flushAll() {
      for (const turnId of Array.from(pendingTurnEventsById.keys())) {
        flush(turnId);
      }
    },
  };
}

export function resolveTargetedTurnError(args: {
  completedAt: string | null;
  events: PersistedTurnStreamEvent[];
}) {
  if (!args.completedAt) {
    return null;
  }
  if (args.events.length === 0) {
    return "Provider turn ended without emitting a response.";
  }

  let lastError: Extract<BridgeEvent, { type: "error" }> | null = null;
  let stopReason: string | null = null;
  let outputObserved = false;
  for (const entry of args.events) {
    const event = entry.event;
    if (!event) {
      continue;
    }
    if (event.type === "error") {
      lastError = event;
      continue;
    }
    if (event.type === "done") {
      stopReason = event.stop_reason?.trim() || null;
      continue;
    }
    if (
      (event.type === "text" && event.text.trim().length > 0) ||
      event.type === "tool" ||
      event.type === "tool_result" ||
      event.type === "diff" ||
      event.type === "plan_ready"
    ) {
      outputObserved = true;
    }
  }

  if (stopReason === "runtime_failure") {
    return lastError?.message || "Provider runtime failed before responding.";
  }
  if (stopReason === "user_abort") {
    return "Provider turn was interrupted before it completed.";
  }
  if (lastError && (!lastError.recoverable || !outputObserved)) {
    return lastError.message;
  }
  if (!outputObserved) {
    return "Provider turn ended without a response.";
  }
  return null;
}
