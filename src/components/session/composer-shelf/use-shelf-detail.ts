import { useCallback } from "react";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { useScopedTaskAgentRun } from "@/components/agent-runs/useAgentRun";
import { useAppStore } from "@/store/app.store";
import { useComposerShelfStore } from "@/store/composer-shelf-store";
import {
  resolveShelfDetailOpen,
  resolveShelfRunKey,
} from "./composer-shelf.utils";

/**
 * Whether the scoped task's run details are open, shared by the shelf's toggle
 * and the floating card it controls. Every selector returns a primitive or a
 * stored object, so the shelf re-renders only when one of them changes.
 */
export function useShelfDetail(taskId: string) {
  const expandedByDefault = useAppStore(
    (state) => state.settings.turnActivityExpandedByDefault,
  );
  // The live snapshot outlives its turn by a few seconds after a failure; its
  // id keeps the toggle on the same run until the line has left.
  const turnId = useAppStore(
    (state) =>
      state.activeTurnIdsByTask[taskId] ??
      state.providerTurnActivityByTask[taskId]?.turnId ??
      null,
  );
  const { detail } = useScopedTaskAgentRun();
  const agentRun =
    detail && isActiveAgentRunState(detail.agentRun.state) ? detail : undefined;
  const runKey = resolveShelfRunKey({
    agentRunId: agentRun?.agentRun.id ?? null,
    turnId,
  });
  const override = useComposerShelfStore((state) => state.detailByTask[taskId]);
  const setDetailOpen = useComposerShelfStore((state) => state.setDetailOpen);
  const open = resolveShelfDetailOpen({ override, runKey, expandedByDefault });
  const setOpen = useCallback(
    (next: boolean) => {
      if (runKey) {
        setDetailOpen({ taskId, runKey, open: next });
      }
    },
    [runKey, setDetailOpen, taskId],
  );
  return { open, setOpen, agentRun };
}
