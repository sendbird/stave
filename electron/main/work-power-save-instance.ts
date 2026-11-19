import { powerSaveBlocker } from "electron";
import { getSecretRequestBroker, onSecretRequestsChanged } from "./browser/secret-request-service";
import { invokeHostService, onHostServiceDisconnect, onHostServiceEvent, onHostServiceReady } from "./host-service-client";
import { ensurePersistenceReadySync } from "./state";
import { readPowerRun, trackWorkPowerSave } from "./work-power-save";

/** A live-turn read is in-memory on the host; one that takes longer is a failed read, and the tracker keeps the last answer. */
const LIVE_TURNS_READ_TIMEOUT_MS = 15_000;

let stop: (() => void) | null = null;

/** Main owns OS power policy; each source is re-read on its own signal and on a periodic resync. */
export function startWorkPowerSaveBlocker() {
  if (stop) return;
  const store = ensurePersistenceReadySync();
  const dispose = trackWorkPowerSave({
    blocker: powerSaveBlocker,
    readRuns: () => store.agentRuns.listActiveAgentRuns().map((run) => readPowerRun(store.agentRuns, run)),
    readTars: () => ({
      responsibilities: store.tars.snapshot().responsibilities,
      reasoning: store.tarsConversations.listInProgressIds().some((id) => store.tarsConversations.get(id)?.state === "reasoning"),
    }),
    readSecretWaitTurnIds: () => new Set(getSecretRequestBroker().list().map((request) => request.turnId)),
    pullTurns: async () => (await invokeHostService("provider.list-live-turns", {}, { timeoutMs: LIVE_TURNS_READ_TIMEOUT_MS })).turns,
    subscribe: (signals) => [
      onHostServiceEvent("provider.live-turns-changed", signals.turnsChanged),
      onHostServiceEvent("agent-run.changed", signals.runsChanged),
      onHostServiceEvent("tars.changed", signals.tarsChanged),
      onSecretRequestsChanged(signals.secretsChanged),
      onHostServiceReady(signals.ready),
      onHostServiceDisconnect(signals.disconnected),
      store.tarsConversations.onChange(signals.tarsChanged),
    ],
  });
  stop = () => { dispose(); stop = null; };
}

export function stopWorkPowerSaveBlocker() { stop?.(); }
