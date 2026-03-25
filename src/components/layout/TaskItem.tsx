import { Archive, Download, Ellipsis, Hash, LoaderCircle, Pencil } from "lucide-react";
import { memo, type ReactNode } from "react";
import { ModelIcon } from "@/components/ai-elements";
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Kbd, WaveIndicator } from "@/components/ui";
import { getProviderLabel, getProviderWaveToneClass } from "@/lib/providers/model-catalog";
import { formatTaskUpdatedAt, isTaskArchived } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { Task } from "@/types/chat";

interface BaseTaskItemProps {
  task: Task;
  shortcutLabel: string | null;
  isActive: boolean;
  isSwitching: boolean;
  timeAnchor: number;
  onSelect: () => void;
}

export interface TaskItemProps extends BaseTaskItemProps {
  onRename: () => void;
  onArchive: () => void;
  onExport: () => void;
  onViewSession: () => void;
  dragHandle?: ReactNode;
}

export const CompactTaskItem = memo(function CompactTaskItem({
  task,
  shortcutLabel,
  isActive,
  timeAnchor,
  onSelect,
}: BaseTaskItemProps) {
  const isTurnActive = useAppStore((state) => Boolean(state.activeTurnIdsByTask[task.id]));

  return (
    <button
      className={[
        "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-secondary/70",
        isActive ? "bg-secondary/70" : "",
      ].join(" ")}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {shortcutLabel ? <Kbd>{shortcutLabel}</Kbd> : null}
          <p className="truncate">{task.title}</p>
        </div>
        {isTurnActive ? (
          <WaveIndicator
            className={cn("gap-px", getProviderWaveToneClass({ providerId: task.provider }))}
            barClassName="h-3 w-0.5 rounded-[2px]"
          />
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {isTaskArchived(task) ? "Archived" : formatTaskUpdatedAt({ value: task.updatedAt, now: timeAnchor })}
      </p>
    </button>
  );
});

export const TaskItem = memo(function TaskItem({
  task,
  shortcutLabel,
  isActive,
  isSwitching,
  timeAnchor,
  onSelect,
  onRename,
  onArchive,
  onExport,
  onViewSession,
  dragHandle,
}: TaskItemProps) {
  const isTurnActive = useAppStore((state) => Boolean(state.activeTurnIdsByTask[task.id]));

  return (
    <div
      className={cn(
        "relative rounded-sm border transition-colors",
        isActive
          ? "border-primary/50 bg-card shadow-sm ring-1 ring-primary/20 hover:border-primary/60 hover:bg-card hover:ring-primary/30 dark:bg-secondary/80 dark:hover:bg-secondary/90"
          : "border-border/70 bg-secondary/50 hover:border-border/90 hover:bg-card/80 hover:ring-1 hover:ring-border/50 dark:bg-card dark:hover:bg-secondary/30"
      )}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        {dragHandle ? <div className="shrink-0 pt-0.5">{dragHandle}</div> : null}
        <button onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {shortcutLabel ? <Kbd>{shortcutLabel}</Kbd> : null}
              <Badge variant="secondary" className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-sm">
                <ModelIcon providerId={task.provider} className="size-3.5" />
                {getProviderLabel({ providerId: task.provider })}
              </Badge>
              {isSwitching ? <LoaderCircle className="size-3 shrink-0 animate-spin text-primary" /> : null}
              {!isSwitching && isTurnActive ? (
                <Badge
                  variant="outline"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border-border/70 bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  <WaveIndicator
                    className={cn("gap-px", getProviderWaveToneClass({ providerId: task.provider }))}
                    barClassName="h-3 w-0.5 rounded-[2px]"
                  />
                  Responding
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
            {task.unread ? <span className="inline-block size-1.5 shrink-0 rounded-full bg-warning" /> : null}
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <p>{formatTaskUpdatedAt({ value: task.updatedAt, now: timeAnchor })}</p>
            {isTaskArchived(task) ? (
              <Badge variant="outline" className="rounded-md border-border/70 px-1.5 py-0 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Archived
              </Badge>
            ) : null}
          </div>
        </button>
        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 rounded-md border border-transparent p-0 text-muted-foreground hover:border-border/80 hover:bg-card/90 hover:text-foreground"
                aria-label={`task-actions-${task.id}`}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onRename}>
                  <Pencil />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExport}>
                  <Download />
                  Export
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onViewSession}>
                  <Hash />
                  View Session IDs
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onArchive}>
                  <Archive />
                  Archive
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});
