import { ListTodo } from "lucide-react";
import type { CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { useTrackerTasksAttention } from "@/lib/tracker-tasks/client-state";
import { layoutShellStyles } from "./layout-shell.styles";
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
            xstyle={[
              layoutShellStyles.topBarButton,
              attentionCount > 0 && layoutShellStyles.topBarButtonWarning,
              isTasksActive && layoutShellStyles.topBarButtonActive,
            ]}
            style={props.noDragStyle}
            aria-label={isTasksActive ? "close-tasks" : "open-tasks"}
            aria-pressed={isTasksActive}
            onClick={toggleTasks}
          />
        }
      >
        <ListTodo {...stylex.props(layoutShellStyles.icon16)} />
        {attentionCount > 0 ? (
          <span {...stylex.props(layoutShellStyles.topBarAttentionBadge)}>
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
