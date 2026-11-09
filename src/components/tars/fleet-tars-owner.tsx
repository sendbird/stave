import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { findActiveTaskRun, tarsTaskTarget } from "@/lib/tars/ownership";
import type { XstyleProp } from "@/components/aui/utils/stylex";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { TarsOwnerLabel } from "./TarsOwnerBadge";

/**
 * A Fleet task's active agent run, as Fleet's run mirror holds it: the run's
 * detail, null when it has none, or undefined until the mirror has read them.
 * Ownership needs it so a run you started on the task is never Tars's.
 */
export function useFleetTaskRun(workspaceId: string, taskId: string): AgentRunDetail | null | undefined {
  return useFleetAgentRunsStore((state) => findActiveTaskRun(state.details, workspaceId, taskId) ?? (state.loaded ? null : undefined));
}

/** The Tars owner mark of a Fleet task, judged by the task and its own active run. */
export function FleetTarsOwnerLabel({ workspaceId, taskId, xstyle }: { workspaceId: string; taskId: string } & XstyleProp) {
  const run = useFleetTaskRun(workspaceId, taskId);
  return <TarsOwnerLabel target={tarsTaskTarget(taskId, workspaceId, run)} xstyle={xstyle} />;
}
