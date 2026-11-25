import { useCallback, type ReactNode } from "react";
import type { AgentStep } from "@/lib/agent-progress";
import type { AgentProgressTarget } from "@/store/agent-progress-panel-store";
import { AgentProgressView } from "./AgentProgressView";
import { placeholderProgress, type AgentStepContext } from "./agent-progress-targets";
import type { AgentProgressController } from "./use-agent-progress";

/** What the Agent panel lends every source's view: close, back, open a child. */
export interface AgentPanelChrome {
  onClose: () => void;
  back?: { label: string; onBack: () => void };
  /** Opens an agent the shown one started, keeping the way back. */
  onOpenChild: (step: AgentStep, context: AgentStepContext) => void;
}

/** One source's controller as the shared view, with a placeholder while it loads. */
export function AgentProgressControllerView(props: {
  target: AgentProgressTarget;
  controller: AgentProgressController;
  chrome: AgentPanelChrome;
  lead?: ReactNode;
  extraActions?: ReactNode;
  onStop?: () => void;
  onOpenTask?: () => void;
}) {
  const { controller, chrome } = props;
  const { context } = controller;
  const openChild = chrome.onOpenChild;
  const onOpenChild = useCallback((step: AgentStep) => openChild(step, context), [openChild, context]);
  return (
    <AgentProgressView
      progress={controller.progress ?? placeholderProgress(props.target)}
      loading={controller.loading}
      notice={controller.notice}
      back={chrome.back}
      onClose={chrome.onClose}
      onOpenParent={controller.onOpenParent}
      onOpenChild={onOpenChild}
      onStop={props.onStop ?? controller.onStop}
      stopBusy={controller.stopBusy}
      onOpenTask={props.onOpenTask ?? controller.onOpenTask}
      hasOlder={controller.hasOlder}
      onLoadOlder={controller.onLoadOlder}
      actionError={controller.actionError}
      lead={props.lead}
      extraActions={props.extraActions}
    />
  );
}
