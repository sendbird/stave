import { DockviewReact, type DockviewReadyEvent } from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { PaneHeaderActions } from "@/components/panes/PaneHeaderActions";
import { TaskSurfacePanel } from "@/components/panes/surfaces/TaskSurfacePanel";
import { buildPanePanelId } from "@/lib/panes/types";

const theme = { name: "stave", className: "dockview-theme-stave" };
const components = { task: TaskSurfacePanel };

export function AttentionPane({ taskId }: { taskId: string }) {
  const onReady = ({ api }: DockviewReadyEvent) => {
    api.addPanel({ id: buildPanePanelId({ kind: "task", taskId }), component: "task", title: "Pagination" });
  };
  return <DockviewReact theme={theme} components={components} rightHeaderActionsComponent={PaneHeaderActions} onReady={onReady} />;
}
