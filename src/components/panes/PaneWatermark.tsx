import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
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
    <div className={sx(styles.root)}>
      <Empty data-testid="pane-watermark" className={sx(styles.empty)}>
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
            <div className={sx(styles.actions)}>
              <Button onClick={() => createTask({ title: "" })}>
                <Plus className={sx(styles.icon)} />
                New Task
              </Button>
              <Button
                variant="outline"
                onClick={() => createTerminalTab()}
              >
                <SquareTerminal className={sx(styles.icon)} />
                New Terminal
              </Button>
            </div>
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  );
}

const styles = stylex.create({
root: {display:"flex",height:"100%",width:"100%",alignItems:"center",justifyContent:"center",backgroundColor:vars.colorCanvas},
empty: {borderWidth:0,backgroundColor:"transparent"},
actions: {display:"flex",alignItems:"center",gap:8},
icon: {width:16,height:16}
});
