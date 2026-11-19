import { powerSaveBlocker } from "electron";
import { onHostServiceDisconnect, onHostServiceEvent, onHostServiceReady } from "./host-service-client";
import { ensurePersistenceReadySync } from "./state";
import { readPowerRun, trackWorkPowerSave, type PowerRun, type WorkPowerSnapshot } from "./work-power-save";

let stop: (() => void) | null = null;

/** Main owns OS power policy; host changes trigger a fresh read of durable state. */
export function startWorkPowerSaveBlocker() {
  if (stop) return;
  const store = ensurePersistenceReadySync();
  // Live turns exist only in the host process: the last list it sent, dropped with it.
  let turns: WorkPowerSnapshot["turns"] = [];
  const dispose = trackWorkPowerSave({
    blocker: powerSaveBlocker,
    read: () => ({
      turns,
      runs: store.agentRuns.listActiveAgentRuns().map((run) => readPowerRun(store.agentRuns, run.id)).filter((run): run is PowerRun => run !== null),
      responsibilities: store.tars.snapshot().responsibilities,
      reasoning: store.tarsConversations.listInProgressIds().some((id) => store.tarsConversations.get(id)?.state === "reasoning"),
    }),
    subscribe: ({ changed, ready, disconnected }) => [
      onHostServiceEvent("provider.live-turns-changed", (live) => { turns = live.turns; changed(); }),
      onHostServiceEvent("agent-run.changed", changed),
      onHostServiceEvent("tars.changed", changed),
      onHostServiceReady(ready),
      onHostServiceDisconnect(() => { turns = []; disconnected(); }),
      store.tarsConversations.onChange(changed),
    ],
  });
  stop = () => { dispose(); stop = null; };
}

export function stopWorkPowerSaveBlocker() { stop?.(); }
