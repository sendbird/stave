import type { BridgeEvent } from "../providers/types";
import type { PersistedTurnStreamEvent } from "../persistence/turn-event-payload";

const TURN_EVENT_FLUSH_MAX_PENDING = 64;

interface PendingTurnEvent {
  sequence: number;
  event: BridgeEvent;
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
}) {
  const pendingTurnEventsById = new Map<string, PendingTurnEvent[]>();

  function flush(turnId: string) {
    const events = pendingTurnEventsById.get(turnId);
    if (!events || events.length === 0) {
      return;
    }
    pendingTurnEventsById.delete(turnId);
    try {
      args.persistEvents({ turnId, events });
    } catch (error) {
      args.onPersistError?.(error, {
        turnId,
        count: events.length,
      });
    }
  }

  return {
    append(input: PendingTurnEvent & { turnId: string }) {
      const pending = pendingTurnEventsById.get(input.turnId) ?? [];
      pending.push({
        sequence: input.sequence,
        event: input.event,
      });
      pendingTurnEventsById.set(input.turnId, pending);
      if (
        pending.length >= TURN_EVENT_FLUSH_MAX_PENDING ||
        input.event.type === "done"
      ) {
        flush(input.turnId);
      }
    },
    flushAll() {
      for (const turnId of pendingTurnEventsById.keys()) {
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
