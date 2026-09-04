import { ListTodo } from "lucide-react";
import type { CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { useTrackerTasksAttention } from "@/lib/tracker-tasks/client-state";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

export function TopBarTasks(props: { noDragStyle: CSSProperties }) {
  const [toggleTasks, isTasksActive] = useAppStore(
    useShallow(
      (state) =>
        [state.toggleTasks, state.activeAppSurface.kind === "tasks"] as const,
    ),
  );
  const attention = useTrackerTasksAttention();
  const attentionCount = attention.overdue + attention.dueToday;

  const dueLabel = `${attentionCount} ticket${attentionCount === 1 ? "" : "s"} due`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "relative h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
              attentionCount > 0 && "text-warning hover:text-warning",
              isTasksActive && "bg-secondary/70 text-foreground",
            )}
            style={props.noDragStyle}
            aria-label={isTasksActive ? "close-tasks" : "open-tasks"}
            aria-pressed={isTasksActive}
            onClick={toggleTasks}
          />
        }
      >
        <ListTodo className="size-4" />
        {attentionCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-card bg-warning px-1 text-[10px] font-semibold leading-none text-warning-foreground">
            {attentionCount > 99 ? "99+" : attentionCount}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isTasksActive
          ? "Close Tasks"
          : attentionCount > 0
            ? `Tasks · ${dueLabel}`
            : "Tasks"}
      </TooltipContent>
    </Tooltip>
  );
}
