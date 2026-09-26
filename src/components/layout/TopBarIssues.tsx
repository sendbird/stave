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
import { useTrackerIssuesAttention } from "@/lib/tracker-issues/client-state";
import { CountBadge } from "@/components/system/CountBadge";
import { layoutShellStyles } from "./layout-shell.styles";
import { useAppStore } from "@/store/app.store";

export function TopBarIssues(props: { noDragStyle: CSSProperties }) {
  const [toggleIssues, isIssuesActive] = useAppStore(
    useShallow(
      (state) =>
        [state.toggleIssues, state.activeAppSurface.kind === "issues"] as const,
    ),
  );
  const attention = useTrackerIssuesAttention();
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
              isIssuesActive && layoutShellStyles.topBarButtonActive,
            ]}
            style={props.noDragStyle}
            aria-label={isIssuesActive ? "close-tasks" : "open-tasks"}
            aria-pressed={isIssuesActive}
            onClick={toggleIssues}
            indicator={
              attentionCount > 0 ? (
                <CountBadge count={attentionCount} tone="warning" />
              ) : null
            }
          />
        }
      >
        <ListTodo {...stylex.props(layoutShellStyles.icon16)} />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isIssuesActive
          ? "Close Issues"
          : attentionCount > 0
            ? `Issues · ${dueLabel}`
            : "Issues"}
      </TooltipContent>
    </Tooltip>
  );
}
