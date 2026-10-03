import { useMemo } from "react";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  buildSidebarWorkQueueLanes,
  type SidebarWorkQueueSignals,
} from "@/lib/fleet/sidebar-work-queue";
import type { FleetTaskStatus } from "@/lib/fleet/task-status";
import { agentRunLanesByWorkspace } from "@/lib/agent-runs/lanes";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";

/**
 * The work queue's lanes. Grouping runs here, outside the Zustand selector, so
 * the store never hands out a freshly built object on every notification. The
 * ranking already happened upstream; this only names the reason a row is in
 * the list. `highestAttentionByWorkspaceId` folds PR state into need kinds,
 * and each workspace's agent runs add the lane they ask for.
 */
export function useSidebarWorkQueueGroups<
  T extends { workspaceId: string; status?: FleetTaskStatus },
>(args: {
  entries: readonly T[];
  highestAttentionByWorkspaceId: Record<string, FleetAttentionItem | undefined>;
}) {
  const agentRunDetails = useFleetAgentRunsStore((state) => state.details);
  const { entries, highestAttentionByWorkspaceId } = args;
  return useMemo(() => {
    const agentRunLaneByWorkspaceId = agentRunLanesByWorkspace(Object.values(agentRunDetails));
    const signalsByWorkspaceId: Record<string, SidebarWorkQueueSignals> = {};
    for (const entry of entries) {
      signalsByWorkspaceId[entry.workspaceId] = {
        attentionKind: highestAttentionByWorkspaceId[entry.workspaceId]?.kind,
        status: entry.status,
        agentRunLane: agentRunLaneByWorkspaceId[entry.workspaceId] ?? null,
      };
    }
    return buildSidebarWorkQueueLanes({ entries, signalsByWorkspaceId });
  }, [entries, highestAttentionByWorkspaceId, agentRunDetails]);
}
