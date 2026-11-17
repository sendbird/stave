import { powerSaveBlocker } from "electron";
import { onHostServiceDisconnect, onHostServiceEvent, onHostServiceReady } from "./host-service-client";
import { ensurePersistenceReadySync } from "./state";
import { trackWorkPowerSave } from "./work-power-save";

let stop: (() => void) | null = null;

/** Main owns OS power policy; host changes trigger a fresh read of durable state. */
export function startWorkPowerSaveBlocker() {
  if (stop) return;
  const store = ensurePersistenceReadySync();
  const dispose = trackWorkPowerSave({
    blocker: powerSaveBlocker,
    read: () => ({
      runs: store.agentRuns.listActiveAgentRuns(),
      responsibilities: store.tars.snapshot().responsibilities,
      reasoning: store.tarsConversations.listInProgressIds().some((id) => store.tarsConversations.get(id)?.state === "reasoning"),
    }),
    subscribe: ({ changed, ready, disconnected }) => [
      onHostServiceEvent("agent-run.changed", changed),
      onHostServiceEvent("tars.changed", changed),
      onHostServiceReady(ready),
      onHostServiceDisconnect(disconnected),
      store.tarsConversations.onChange(changed),
    ],
  });
  stop = () => { dispose(); stop = null; };
}

export function stopWorkPowerSaveBlocker() { stop?.(); }
