import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { emptyRateLimitsSnapshot } from "@/lib/providers/account-usage-block";
import type { RateLimitsSnapshotResponse } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import { createTaskPauseActions } from "@/store/app-store-task-pause-actions";
import { useUsageLimitAutoResume } from "@/store/use-usage-limit-auto-resume";

const taskId = "usage-limit-resume";
let reads = 0;
let continuations = 0;
let finishRead: ((snapshot: RateLimitsSnapshotResponse) => void) | undefined;

// Only the provider boundaries are stubbed; the store actions and React timer
// run together so the test catches a lost reservation or duplicate dispatch.
window.api = {
  provider: {
    getRateLimitsSnapshot: async () => {
      reads += 1;
      if (reads === 1) throw new Error("offline after wake");
      return new Promise<RateLimitsSnapshotResponse>((resolve) => { finishRead = resolve; });
    },
  },
} as typeof window.api;

useAppStore.persist.setOptions({ name: "usage-limit-resume-fixture" });
useAppStore.setState({
  activeWorkspaceId: "usage-limit-workspace",
  activeTaskId: taskId,
  tasks: [{
    id: taskId, title: "Paused task", provider: "codex",
    controlMode: "interactive", controlOwner: "stave",
    updatedAt: new Date().toISOString(), unread: false, archivedAt: null,
  }],
  messagesByTask: { [taskId]: [] },
  activeTurnIdsByTask: {},
  promptDraftByTask: {},
  usageLimitPauseByTask: {},
  sendUserMessage: async () => {
    continuations += 1;
    return {
      status: "started", taskId, workspaceId: "usage-limit-workspace",
      turnId: `continuation-${continuations}`,
    };
  },
  ...createTaskPauseActions({
    get: useAppStore.getState,
    set: useAppStore.setState,
    dispatchNextQueuedTaskTurn: () => {},
  }),
});
useAppStore.getState().pauseTaskForUsageLimit({
  taskId,
  workspaceId: "usage-limit-workspace",
  providerId: "codex",
  accountProfileId: "system-default",
  stoppedTurn: true,
  usageLimit: { providerId: "codex", windowLabel: "Session", resetsAt: Date.now() - 60_000 },
});
useAppStore.getState().setUsageLimitAutoResume({ taskId, enabled: true });

export const resumeProbe = {
  getState: () => ({
    reads,
    continuations,
    pause: useAppStore.getState().usageLimitPauseByTask[taskId],
  }),
  cancel: () => useAppStore.getState().setUsageLimitAutoResume({ taskId, enabled: false }),
  recover: () => {
    if (!finishRead) throw new Error("No pending usage read");
    finishRead({
      ...emptyRateLimitsSnapshot(),
      codex: { source: "rpc", error: null, buckets: [] },
    });
    finishRead = undefined;
  },
};

declare global {
  interface Window { resumeProbe: typeof resumeProbe }
}

function Probe() {
  useUsageLimitAutoResume();
  useEffect(() => { window.resumeProbe = resumeProbe; }, []);
  return null;
}

createRoot(document.getElementById("root")!).render(<Probe />);
