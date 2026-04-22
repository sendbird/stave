import type { PersistedTurnSummary } from "@/lib/db/turns.db";

export interface LatestCompletedTurnTarget {
  completedAt: string;
  taskId: string;
  turnId: string;
  workspaceId: string;
}

export function resolveLatestCompletedTurnTarget(args: {
  turnsByWorkspaceId: Record<string, PersistedTurnSummary[]>;
}): LatestCompletedTurnTarget | null {
  let latest: LatestCompletedTurnTarget | null = null;

  for (const [workspaceId, turns] of Object.entries(args.turnsByWorkspaceId)) {
    for (const turn of turns) {
      if (!turn.completedAt) {
        continue;
      }

      if (!latest || turn.completedAt > latest.completedAt) {
        latest = {
          completedAt: turn.completedAt,
          taskId: turn.taskId,
          turnId: turn.id,
          workspaceId,
        };
      }
    }
  }

  return latest;
}
