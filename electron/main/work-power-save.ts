import type { AgentRunState } from "../../src/lib/agent-runs/domain";
import type { TarsState } from "../../src/lib/tars/types";

export interface WorkPowerSnapshot {
  runs: ReadonlyArray<{ state: AgentRunState }>;
  responsibilities: ReadonlyArray<{ state: TarsState }>;
  reasoning: boolean;
}

/** Paused work and user decisions are idle; runnable work holds one app blocker. */
export function hasActivePowerWork(snapshot: WorkPowerSnapshot): boolean {
  return snapshot.reasoning || snapshot.runs.some((run) => run.state === "running") ||
    snapshot.responsibilities.some((row) => row.state === "preparing" || row.state === "running");
}

/** One blocker shared by every run, released only after the last execution ends. */
export function createWorkPowerSaveController(blocker: {
  start: (type: "prevent-app-suspension") => number;
  stop: (id: number) => void;
}) {
  let id: number | null = null;
  const release = () => {
    if (id === null) return;
    blocker.stop(id);
    id = null;
  };
  return {
    update(snapshot: WorkPowerSnapshot) {
      if (hasActivePowerWork(snapshot)) {
        if (id === null) id = blocker.start("prevent-app-suspension");
      } else release();
    },
    dispose: release,
  };
}

/** Subscribe before the first read so startup and reconnect cannot miss an active run. */
export function trackWorkPowerSave(deps: {
  blocker: Parameters<typeof createWorkPowerSaveController>[0];
  read: () => WorkPowerSnapshot;
  subscribe: (handlers: { changed: () => void; ready: () => void; disconnected: () => void }) => Array<() => void>;
}) {
  const controller = createWorkPowerSaveController(deps.blocker);
  let connected = true;
  const refresh = () => { if (connected) controller.update(deps.read()); };
  const unsubscribes = deps.subscribe({ changed: refresh,
    ready: () => { connected = true; refresh(); },
    disconnected: () => { connected = false; controller.dispose(); },
  });
  refresh();
  return () => { connected = false; for (const unsubscribe of unsubscribes) unsubscribe(); controller.dispose(); };
}
