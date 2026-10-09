import type { FleetAttentionItem } from "./attention-projection";
import type { FleetTaskStatus } from "./task-status";
import {
  orderByWorkAttention,
  rankWorkAttention,
  type WorkQueueLane,
} from "./work-attention-order";

/** What a Fleet card reports about itself once it has rendered. */
export interface FleetBoardCardReport {
  leadingStatus: FleetTaskStatus | null;
  activityAt: string | null;
}

/**
 * The Fleet board is the Work queue's full view, so one repository's cards
 * follow the same rule (`work-attention-order.ts`): what needs you, then what
 * is running, then what waits for review, then the rest by recent activity.
 * Until every card has reported, the stored order stands so the board does not
 * reshuffle while it settles.
 *
 * used by: `src/components/layout/FleetView.tsx`;
 * `tests/work-attention-order.test.ts`.
 */
export function orderFleetBoardWorkspaces<T extends { id: string }>(args: {
  workspaces: readonly T[];
  isCurrentRepository: boolean;
  reportOf: (workspace: T) => FleetBoardCardReport | undefined;
  activeWorkspaceId: string;
  highestAttentionByWorkspaceId: Record<string, FleetAttentionItem | undefined>;
  agentRunLaneByWorkspaceId: Record<string, WorkQueueLane | undefined>;
}): readonly T[] {
  const entries = args.workspaces.map((workspace) => ({
    workspace,
    report: args.reportOf(workspace),
  }));
  if (entries.some((entry) => !entry.report)) {
    return args.workspaces;
  }
  return orderByWorkAttention(entries, ({ workspace, report }) =>
    rankWorkAttention({
      attentionKind: args.highestAttentionByWorkspaceId[workspace.id]?.kind,
      status: report?.leadingStatus ?? undefined,
      agentRunLane: args.agentRunLaneByWorkspaceId[workspace.id] ?? null,
      isActive: args.isCurrentRepository && workspace.id === args.activeWorkspaceId,
      activityAt: report?.activityAt ?? null,
    }),
  ).map((entry) => entry.workspace);
}
