import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Input,
} from "@/components/ui";
import {
  filterTasksByName,
  isLegacyBranchTask,
  isTaskArchived,
} from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";

/**
 * Archived-task browser (ported from the removed WorkspaceTaskTabs strip).
 * Restoring a task re-opens it as a pane tab via `restoreTask`.
 */
export function TaskHistoryDrawer(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [tasks, restoreTask] = useAppStore(
    useShallow((state) => [state.tasks, state.restoreTask] as const),
  );
  const archivedTasks = tasks.filter(
    (task) => !isLegacyBranchTask(task) && isTaskArchived(task),
  );

  function handleOpenChange(open: boolean) {
    if (!open) {
      setSearchQuery("");
    }
    args.onOpenChange(open);
  }

  const filteredTasks = filterTasksByName({
    tasks: archivedTasks,
    query: searchQuery,
  });

  return (
    <Drawer open={args.open} onOpenChange={handleOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(28rem,92vw)] data-[vaul-drawer-direction=right]:sm:max-w-[28rem]">
        <DrawerHeader className="border-b border-border/70 px-5 py-5 text-left">
          <DrawerTitle>Task History</DrawerTitle>
          <DrawerDescription>
            Archived tasks for the current workspace.
          </DrawerDescription>
          <Input
            className="mt-3 h-9 rounded-sm border-border/80 bg-background"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {archivedTasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
              No archived tasks yet.
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
              No tasks match &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-3"
                >
                  <ModelIcon
                    providerId={task.provider}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {task.title}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={() => {
                      restoreTask({ taskId: task.id });
                      args.onOpenChange(false);
                    }}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DrawerFooter className="border-t border-border/70 px-5 py-4">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
