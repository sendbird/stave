import type { BridgeEvent } from "./types";

export type ProviderTurnTerminalReason =
  "completed" | "runtime_failure" | "user_abort";

export type ProviderTurnLifecycleSnapshot = {
  eventCount: number;
  terminalCount: number;
  droppedAfterTerminalCount: number;
  pendingDecisionCount: number;
};

/**
 * Enforces the provider bridge's terminal-event contract at the last shared
 * boundary before events reach IPC.
 *
 * Provider adapters may both stream and return their events, or may race an
 * abort/error with their own final callback. Consumers must still observe one
 * and only one terminal event. Any event after that terminal boundary is
 * ignored so replay and live delivery stay identical.
 */
export function createProviderTurnLifecycle(args?: {
  onEvent?: (event: BridgeEvent) => void;
}) {
  const events: BridgeEvent[] = [];
  const pendingDecisionIds = new Set<string>();
  let terminalCount = 0;
  let droppedAfterTerminalCount = 0;

  const emit = (event: BridgeEvent) => {
    if (terminalCount > 0) {
      droppedAfterTerminalCount += 1;
      return false;
    }

    if (event.type === "approval" || event.type === "user_input") {
      pendingDecisionIds.add(event.requestId);
    } else if (event.type === "done") {
      terminalCount = 1;
      pendingDecisionIds.clear();
    }

    events.push(event);
    args?.onEvent?.(event);
    return true;
  };

  const finish = (reason: ProviderTurnTerminalReason) => {
    emit({ type: "done", stop_reason: reason });
  };

  const snapshot = (): ProviderTurnLifecycleSnapshot => ({
    eventCount: events.length,
    terminalCount,
    droppedAfterTerminalCount,
    pendingDecisionCount: pendingDecisionIds.size,
  });

  return {
    emit,
    finish,
    events: () => [...events],
    snapshot,
    get terminal() {
      return terminalCount > 0;
    },
  };
}
