import type { IDockviewPanelProps } from "dockview-react";
import { useEffect, useRef, useState } from "react";
import { ChatArea } from "@/components/session/ChatArea";
import { parsePanePanelId } from "@/lib/panes/types";

/** Dockview panel wrapper rendering a task chat surface. */
export function TaskSurfacePanel(props: IDockviewPanelProps) {
  const surface = parsePanePanelId(props.api.id);
  const [scrollActivationKey, setScrollActivationKey] = useState(0);
  const activationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let wasVisible = props.api.isVisible;
    let wasActive = props.api.isActive;
    const requestLatestMessage = () => {
      if (activationFrameRef.current !== null) {
        return;
      }
      activationFrameRef.current = window.requestAnimationFrame(() => {
        activationFrameRef.current = null;
        setScrollActivationKey((current) => current + 1);
      });
    };
    const visibilityDisposable = props.api.onDidVisibilityChange((event) => {
      if (event.isVisible && !wasVisible) {
        requestLatestMessage();
      }
      wasVisible = event.isVisible;
    });
    const activeDisposable = props.api.onDidActiveChange((event) => {
      if (event.isActive && !wasActive) {
        requestLatestMessage();
      }
      wasActive = event.isActive;
    });
    return () => {
      visibilityDisposable.dispose();
      activeDisposable.dispose();
      if (activationFrameRef.current !== null) {
        window.cancelAnimationFrame(activationFrameRef.current);
        activationFrameRef.current = null;
      }
    };
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
