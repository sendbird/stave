import type { WorkspaceScriptHookRunSummary } from "../../src/lib/workspace-scripts/types";
import type { HostWorkspaceScriptRunHookArgs } from "./protocol";

interface TurnCheckRecorder {
  turnDigests: {
    recordChecks(args: {
      turnId: string;
      summary: WorkspaceScriptHookRunSummary;
    }): boolean;
  };
}

/**
 * Keep the `turn.completed` checks Stave ran in that turn's digest. The
 * window holds only the workspace's latest result, in memory, so without this
 * an earlier turn's check evidence is gone after the next turn or a restart.
 * A workspace without checks records nothing.
 */
export function recordTurnCompletedChecks(
  params: Pick<HostWorkspaceScriptRunHookArgs, "trigger" | "hookContext">,
  summary: WorkspaceScriptHookRunSummary,
  store: TurnCheckRecorder,
) {
  const turnId = params.hookContext?.turnId?.trim();
  if (params.trigger !== "turn.completed" || !turnId || summary.totalEntries <= 0) {
    return false;
  }
  try {
    return store.turnDigests.recordChecks({ turnId, summary });
  } catch (error) {
    console.warn("[turn-digest] failed to record turn checks", {
      turnId,
      error: String(error),
    });
    return false;
  }
}
