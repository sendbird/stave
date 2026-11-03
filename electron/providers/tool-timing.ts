import type { BridgeEvent } from "./types";

/**
 * When each tool call of one turn started and finished, as the runtime saw it.
 *
 * Neither provider reports these times itself, and the renderer cannot stamp
 * them: it folds events in batches, reads a buffered stream after a reload,
 * and replays saved events, so its clock says when an event was *processed*,
 * not when the call ran. The runtime handles each provider message as it
 * arrives, which makes this the one place an observed time is honest.
 *
 * Both runtimes create one recorder per turn and pass every event they emit
 * through `stamp`:
 *
 * - `tool` events carry `startedAt` — the first time this `toolUseId` was
 *   seen — on every emission, so a call announced as input-streaming, then
 *   input-available, then output-available keeps one start.
 * - The first terminal observation (`tool` in `output-available` /
 *   `output-error`, or a non-partial `tool_result`) fixes `completedAt`, and
 *   later emissions for the same call (a captured app view arriving in a
 *   second result) repeat it rather than moving it.
 *
 * A time the event already carries is kept. A result for a call whose start
 * was never seen gets an end only; nothing is back-filled.
 */
export interface ToolTimingRecorder {
  stamp: (event: BridgeEvent) => BridgeEvent;
}

const TERMINAL_TOOL_STATES = new Set(["output-available", "output-error"]);

export function createToolTimingRecorder(
  now: () => number = Date.now,
): ToolTimingRecorder {
  const startedAtById = new Map<string, number>();
  const completedAtById = new Map<string, number>();

  const recordStart = (id: string, provided: number | undefined) => {
    const known = startedAtById.get(id);
    if (known !== undefined) return known;
    const value = provided ?? now();
    startedAtById.set(id, value);
    return value;
  };
  const recordEnd = (id: string, provided: number | undefined) => {
    const known = completedAtById.get(id);
    if (known !== undefined) return known;
    const value = provided ?? now();
    completedAtById.set(id, value);
    return value;
  };

  return {
    stamp(event) {
      if (event.type === "tool") {
        const id = event.toolUseId;
        if (!id) return event;
        const startedAt = recordStart(id, event.startedAt);
        const completedAt = TERMINAL_TOOL_STATES.has(event.state)
          ? recordEnd(id, event.completedAt)
          : completedAtById.get(id);
        return {
          ...event,
          startedAt,
          ...(completedAt !== undefined ? { completedAt } : {}),
        };
      }
      if (event.type === "tool_result") {
        if (event.isPartial || !event.tool_use_id) return event;
        return { ...event, completedAt: recordEnd(event.tool_use_id, event.completedAt) };
      }
      return event;
    },
  };
}
