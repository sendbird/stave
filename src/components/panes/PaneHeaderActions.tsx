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
    <div className="flex h-full items-center gap-0.5 px-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-sm p-0 text-muted-foreground"
              aria-label="Create new pane tab"
            />
          }
        >
          <Plus className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={createTaskInGroup}>
            <Plus className="size-4" />
            New Task
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SquareTerminal className="size-4" />
              New CLI Session
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
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
                    className="items-start"
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
                    <div className="flex min-w-0 items-start gap-2">
                      <ModelIcon
                        providerId={choice.provider}
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {providerLabel} · {contextLabel}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {secondaryLabel}
                        </div>
                        {taskHint ? (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground/60">
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
            <SquareTerminal className="size-4" />
            New Terminal
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={createLensInGroup}>
            <Globe className="size-4" />
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
              className="h-7 w-7 shrink-0 rounded-sm p-0 text-muted-foreground"
              aria-label="Pane options"
            />
          }
        >
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
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
