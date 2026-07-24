import type { IDockviewPanelProps } from "dockview-react";
import { useEffect, useState } from "react";
import { ChatArea } from "@/components/session/ChatArea";
import { parsePanePanelId } from "@/lib/panes/types";

/** Dockview panel wrapper rendering a task chat surface. */
export function TaskSurfacePanel(props: IDockviewPanelProps) {
  const surface = parsePanePanelId(props.api.id);
  const [scrollActivationKey, setScrollActivationKey] = useState(0);

  useEffect(() => {
    let wasVisible = props.api.isVisible;
    const visibilityDisposable = props.api.onDidVisibilityChange((event) => {
      if (event.isVisible && !wasVisible) {
        setScrollActivationKey((current) => current + 1);
      }
      wasVisible = event.isVisible;
    });
    return () => visibilityDisposable.dispose();
  }, [props.api]);

  if (surface?.kind !== "task") {
    return null;
  }
  return (
    <ChatArea
      taskId={surface.taskId}
      scrollActivationKey={scrollActivationKey}
    />
  );
}
