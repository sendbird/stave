import type { IDockviewPanelProps } from "dockview-react";
import { ChatArea } from "@/components/session/ChatArea";
import { parsePanePanelId } from "@/lib/panes/types";

/** Dockview panel wrapper rendering a task chat surface. */
export function TaskSurfacePanel(props: IDockviewPanelProps) {
  const surface = parsePanePanelId(props.api.id);
  if (surface?.kind !== "task") {
    return null;
  }
  return <ChatArea taskId={surface.taskId} />;
}
