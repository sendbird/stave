import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { layoutShellStyles } from "@/components/layout/layout-shell.styles";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import type { IDockviewHeaderActionsProps } from "dockview-react";
import { Ellipsis } from "lucide-react";
import { useRef } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui";
import { dispatchOpenTaskHistory } from "@/components/panes/pane-surface-actions";
import { PaneNewTabSplitButton } from "@/components/panes/PaneNewTabSplitButton";
import { TaskPaneHeaderActions } from "@/components/panes/TaskPaneHeaderActions";
import { useOverflowedTabsTrigger, usePaneHeaderCompact } from "@/components/panes/pane-header-layout";
import { parsePanePanelId } from "@/lib/panes/types";

/**
 * Group header actions: the task's own actions when the group shows a task,
 * then the new-tab split button (presets first, then any surface kind as a
 * new pane tab) and the pane options.
 */
export function PaneHeaderActions(props: IDockviewHeaderActionsProps) {
  useTranslation();
  // The task this group shows, not the app's active task: with split panes
  // each group's actions act on its own tab.
  const shownSurface = props.activePanel ? parsePanePanelId(props.activePanel.id) : null;
  const rootRef = useRef<HTMLDivElement>(null);
  const compact = usePaneHeaderCompact(props.api);
  useOverflowedTabsTrigger(rootRef, {
    allTasks: props.panels.every((panel) => parsePanePanelId(panel.id)?.kind === "task"),
  });
  return (
    <div className={sx(styles.root)} ref={rootRef}>
      {shownSurface?.kind === "task" && shownSurface.taskId ? (
        <TaskPaneHeaderActions taskId={shownSurface.taskId} compact={compact} />
      ) : null}
      <PaneNewTabSplitButton groupId={props.group.id} />
      <DropdownMenu>
        <Tooltip content={i18n.t("panes:paneHeaderActions.paneOptions")}>
          <span className={sx(layoutShellStyles.inlineFlex)}>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={sx(styles.trigger)}
                  aria-label={i18n.t("panes:paneHeaderActions.paneOptions")}
                />
              }
            >
              <Ellipsis className={sx(styles.icon)} />
            </DropdownMenuTrigger>
          </span>
        </Tooltip>
        <DropdownMenuContent align="end" xstyle={styles.options}>
          <DropdownMenuItem onSelect={() => dispatchOpenTaskHistory()}>
            {i18n.t("panes:paneHeaderActions.taskHistory")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    // The actions keep their one-line width; the tabs beside them overflow
    // into the strip's own overflow menu instead of squeezing these to wrap.
    flexShrink: 0,
    gap: vars["--ads-space-4"],
    height: "100%",
    minWidth: "max-content",
    paddingInline: vars["--ads-space-4"],
    whiteSpace: "nowrap",
  },
  trigger: {
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: vars["--ads-control-height-xs"],
    padding: 0,
    width: vars["--ads-control-height-xs"],
  },
  icon: { height: 16, width: 16 },
  options: { width: 176 },
});
