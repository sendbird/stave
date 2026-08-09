import { Bot } from "lucide-react";
import type { CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { useFleetAttentionProjection } from "@/components/layout/useFleetAttentionProjection";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

export function TopBarFleetAttention(props: { noDragStyle: CSSProperties }) {
  const [projectPath, recentProjects, toggleFleetView, isFleetViewActive] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.projectPath,
            state.recentProjects,
            state.toggleFleetView,
            state.activeAppSurface.kind === "fleet-view",
          ] as const,
      ),
    );
  const { count: attentionCount } = useFleetAttentionProjection();

  if (!projectPath && recentProjects.length === 0) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
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
            aria-label={
              isFleetViewActive ? "close-fleet-view" : "open-fleet-view"
            }
            aria-pressed={isFleetViewActive}
            onClick={toggleFleetView}
          />
        }
      >
        <Bot className="size-4" />
        {attentionCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-card bg-warning px-1 text-[10px] font-semibold leading-none text-warning-foreground">
            {attentionCount > 99 ? "99+" : attentionCount}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isFleetViewActive
          ? "Close Fleet View"
          : attentionCount > 0
            ? `Fleet View · ${attentionCount} action${attentionCount === 1 ? "" : "s"} required`
            : "Fleet View"}
      </TooltipContent>
    </Tooltip>
  );
}
