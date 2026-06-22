import { Bot } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { countFleetAttentionTasks } from "@/lib/fleet/task-status";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

export function TopBarFleetAttention(props: { noDragStyle: CSSProperties }) {
  const [
    projectPath,
    recentProjects,
    workspaces,
    activeWorkspaceId,
    tasks,
    messagesByTask,
    activeTurnIdsByTask,
    providerTurnActivityByTask,
    workspaceRuntimeCacheById,
    toggleFleetView,
    isFleetViewActive,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.projectPath,
          state.recentProjects,
          state.workspaces,
          state.activeWorkspaceId,
          state.tasks,
          state.messagesByTask,
          state.activeTurnIdsByTask,
          state.providerTurnActivityByTask,
          state.workspaceRuntimeCacheById,
          state.toggleFleetView,
          state.activeAppSurface.kind === "fleet-view",
        ] as const,
    ),
  );
  const attentionCount = useMemo(() => {
    if (!projectPath) {
      return 0;
    }

    let count = 0;
    for (const workspace of workspaces) {
      if (workspace.id === activeWorkspaceId) {
        count += countFleetAttentionTasks({
          tasks,
          messagesByTask,
          activeTurnIdsByTask,
          providerTurnActivityByTask,
        });
        continue;
      }

      const session = workspaceRuntimeCacheById[workspace.id];
      if (!session) {
        continue;
      }
      count += countFleetAttentionTasks({
        tasks: session.tasks,
        messagesByTask: session.messagesByTask,
        activeTurnIdsByTask: session.activeTurnIdsByTask,
        providerTurnActivityByTask,
      });
    }

    return count;
  }, [
    activeTurnIdsByTask,
    activeWorkspaceId,
    messagesByTask,
    projectPath,
    providerTurnActivityByTask,
    tasks,
    workspaceRuntimeCacheById,
    workspaces,
  ]);

  if (!projectPath && recentProjects.length === 0) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "relative h-8 w-8 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
            attentionCount > 0 && "text-warning hover:text-warning",
            isFleetViewActive && "bg-secondary/70 text-foreground",
          )}
          style={props.noDragStyle}
          aria-label={isFleetViewActive ? "close-fleet-view" : "open-fleet-view"}
          aria-pressed={isFleetViewActive}
          onClick={toggleFleetView}
        >
          <Bot className="size-4" />
          {attentionCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-card bg-warning px-1 text-[10px] font-semibold leading-none text-warning-foreground">
              {attentionCount > 99 ? "99+" : attentionCount}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isFleetViewActive ? "Close Fleet View" : "Fleet View"}
      </TooltipContent>
    </Tooltip>
  );
}
