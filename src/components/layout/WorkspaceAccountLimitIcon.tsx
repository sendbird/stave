import { Gauge } from "lucide-react";
import { memo, useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { resolveAccountUsageBlock } from "@/lib/providers/account-usage-block";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import type { Task } from "@/types/chat";

const EMPTY_TASKS: Task[] = [];

/**
 * Trailing mark on a workspace row when that workspace has a task whose
 * provider is at 100% included usage and the stop-at-limit setting is on.
 */
export const WorkspaceAccountLimitIcon = memo(
  function WorkspaceAccountLimitIcon(args: { workspaceId: string }) {
    const enabled = useAppStore(
      (state) => state.settings.blockTurnsWhenAccountLimitReached,
    );
    const snapshot = useAppStore((state) => state.rateLimitsSnapshot);
    const tasks = useAppStore((state) => {
      if (state.activeWorkspaceId === args.workspaceId) {
        return state.tasks;
      }
      return (
        state.workspaceRuntimeCacheById[args.workspaceId]?.tasks ?? EMPTY_TASKS
      );
    });

    const block = useMemo(() => {
      if (!enabled) {
        return null;
      }
      const seen = new Set<ProviderId>();
      for (const task of tasks) {
        if (seen.has(task.provider)) {
          continue;
        }
        seen.add(task.provider);
        const next = resolveAccountUsageBlock({
          providerId: task.provider,
          snapshot,
        });
        if (next) {
          return next;
        }
      }
      return null;
    }, [enabled, snapshot, tasks]);

    if (!block) {
      return null;
    }

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="inline-flex size-4 shrink-0 items-center justify-center"
              role="status"
              aria-label={`${block.providerLabel.toLowerCase()}-account-limit`}
            />
          }
        >
          <Gauge className="size-3.5 text-destructive" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side="right">{block.message}</TooltipContent>
      </Tooltip>
    );
  },
);
