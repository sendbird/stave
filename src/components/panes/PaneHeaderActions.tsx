import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import type { IDockviewHeaderActionsProps } from "dockview-react";
import { Ellipsis, Globe, Plus, SquareTerminal } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui";
import { openPaneTabInGroup } from "@/components/panes/pane-host-controller";
import { dispatchOpenTaskHistory } from "@/components/panes/pane-surface-actions";
import type { PaneSurfaceDescriptor } from "@/lib/panes/types";
import { isTaskArchived } from "@/lib/tasks";
import {
  getCliSessionContextLabel,
  getCliSessionProviderLabel,
  type CliSessionContextMode,
} from "@/lib/terminal/types";
import { useAppStore } from "@/store/app.store";

const CLI_SESSION_CHOICES = [
  { provider: "claude-code", contextMode: "workspace" },
  { provider: "claude-code", contextMode: "active-task" },
  { provider: "codex", contextMode: "workspace" },
  { provider: "codex", contextMode: "active-task" },
] as const satisfies readonly {
  provider: "claude-code" | "codex";
  contextMode: CliSessionContextMode;
}[];

/** Group header "+" menu: create any surface kind as a new pane tab. */
export function PaneHeaderActions(props: IDockviewHeaderActionsProps) {
  const [
    providerAvailability,
    hasActiveTask,
    activeTaskTitle,
    showPresetBar,
    createTask,
    createCliSessionTab,
    createTerminalTab,
    createLensTab,
    updateSettings,
  ] = useAppStore(
    useShallow((state) => {
      const activeTask =
        state.tasks.find(
          (task) => task.id === state.activeTaskId && !isTaskArchived(task),
        ) ?? null;
      return [
        state.providerAvailability,
        Boolean(activeTask),
        activeTask?.title ?? null,
        state.settings.showPresetBar,
        state.createTask,
        state.createCliSessionTab,
        state.createTerminalTab,
        state.createLensTab,
        state.updateSettings,
      ] as const;
    }),
  );

  const openCreatedSurfaceInGroup = (surface: PaneSurfaceDescriptor) =>
    openPaneTabInGroup({ surface, groupId: props.group.id });

  const createTaskInGroup = () => {
    const previousFirstTaskId = useAppStore.getState().tasks[0]?.id;
    createTask({ title: "" });
    const createdTaskId = useAppStore.getState().tasks[0]?.id;
    if (createdTaskId && createdTaskId !== previousFirstTaskId) {
      openCreatedSurfaceInGroup({ kind: "task", taskId: createdTaskId });
    }
  };

  const createLensInGroup = () => {
    const lensSessionId = createLensTab();
    if (lensSessionId) {
      openCreatedSurfaceInGroup({ kind: "lens", lensSessionId });
    }
  };

  return (
    <div className={sx(styles.root)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={sx(styles.trigger)}
              aria-label="Create new pane tab"
            />
          }
        >
          <Plus className={sx(styles.icon)} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={sx(styles.menu)}>
          <DropdownMenuItem onSelect={createTaskInGroup}>
            <Plus className={sx(styles.icon)} />
            New Task
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SquareTerminal className={sx(styles.icon)} />
              New CLI Session
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={sx(styles.submenu)}>
              <DropdownMenuLabel>Start Here</DropdownMenuLabel>
              {CLI_SESSION_CHOICES.map((choice) => {
                const providerAvailable = providerAvailability[choice.provider];
                const requiresTask = choice.contextMode === "active-task";
                const disabled =
                  !providerAvailable || (requiresTask && !hasActiveTask);
                const providerLabel = getCliSessionProviderLabel(
                  choice.provider,
                );
                const contextLabel = getCliSessionContextLabel(
                  choice.contextMode,
                );
                const secondaryLabel = !providerAvailable
                  ? `${providerLabel} is unavailable in this environment`
                  : requiresTask
                    ? hasActiveTask
                      ? "Continue from the active task context"
                      : "Select an active task first"
                    : "Use the current workspace context";
                const taskHint =
                  requiresTask && hasActiveTask ? activeTaskTitle : null;

                return (
                  <DropdownMenuItem
                    key={`${choice.provider}:${choice.contextMode}`}
                    disabled={disabled}
                    className={sx(styles.item)}
                    onSelect={() => {
                      const cliSessionTabId = createCliSessionTab({
                        provider: choice.provider,
                        contextMode: choice.contextMode,
                      });
                      if (cliSessionTabId) {
                        openCreatedSurfaceInGroup({
                          kind: "cli-session",
                          cliSessionTabId,
                        });
                      }
                    }}
                  >
                    <div className={sx(styles.choice)}>
                      <ModelIcon
                        providerId={choice.provider}
                        className={sx(styles.providerIcon)}
                      />
                      <div className={sx(styles.content)}>
                        <div className={sx(styles.label)}>
                          {providerLabel} · {contextLabel}
                        </div>
                        <div className={sx(styles.description)}>
                          {secondaryLabel}
                        </div>
                        {taskHint ? (
                          <div className={sx(styles.taskHint)}>
                            {taskHint}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => createTerminalTab()}>
            <SquareTerminal className={sx(styles.icon)} />
            New Terminal
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={createLensInGroup}>
            <Globe className={sx(styles.icon)} />
            New Lens
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={sx(styles.trigger)}
              aria-label="Pane options"
            />
          }
        >
          <Ellipsis className={sx(styles.icon)} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={sx(styles.options)}>
          <DropdownMenuItem onSelect={() => dispatchOpenTaskHistory()}>
            Task History
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={showPresetBar}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { showPresetBar: checked } })
            }
          >
            Show preset bar
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const styles = stylex.create({
root: {display:"flex",height:"100%",alignItems:"center",gap:2,paddingInline:4},
trigger: {height:28,width:28,flexShrink:0,borderRadius:4,padding:0,color:vars.colorTextMuted},
icon: {width:16,height:16},
menu: {width:240},
submenu: {width:256},
options: {width:176},
item: {alignItems:"flex-start"},
choice: {display:"flex",minWidth:0,alignItems:"flex-start",gap:8},
providerIcon: {marginTop:2,width:16,height:16,flexShrink:0,color:vars.colorTextMuted},
content: {minWidth:0},
label: {overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:14,fontWeight:500},
description: {marginTop:2,fontSize:12,color:vars.colorTextMuted},
taskHint: {marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12,color:vars.colorTextSubtle}
});
