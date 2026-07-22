import type { IWatermarkPanelProps } from "dockview-react";
import { Layers, Plus, SquareTerminal } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import { useAppStore } from "@/store/app.store";

/** Shown by Dockview when a group (or the whole dock) has no panels. */
export function PaneWatermark(_props: IWatermarkPanelProps) {
  const [hasWorkspace, createTask, createTerminalTab] = useAppStore(
    useShallow(
      (state) =>
        [
          Boolean(state.activeWorkspaceId) &&
            state.workspaces.some(
              (workspace) => workspace.id === state.activeWorkspaceId,
            ),
          state.createTask,
          state.createTerminalTab,
        ] as const,
    ),
  );

  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <Empty data-testid="pane-watermark" className="border-none bg-transparent">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Layers strokeWidth={1.25} />
          </EmptyMedia>
          <EmptyTitle>
            {hasWorkspace ? "No open tabs" : "Pick a Workspace"}
          </EmptyTitle>
          <EmptyDescription>
            {hasWorkspace
              ? "Open a task, CLI session, or terminal to get started."
              : "Select a workspace from the left sidebar to continue."}
          </EmptyDescription>
        </EmptyHeader>
        {hasWorkspace ? (
          <EmptyContent>
            <div className="flex items-center gap-2">
              <Button onClick={() => createTask({ title: "" })}>
                <Plus className="size-4" />
                New Task
              </Button>
              <Button
                variant="outline"
                onClick={() => createTerminalTab()}
              >
                <SquareTerminal className="size-4" />
                New Terminal
              </Button>
            </div>
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  );
}
