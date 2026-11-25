import { useCallback, useLayoutEffect, useRef } from "react";
import { Bot } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { EmptyState } from "@/components/aui/components/EmptyState";
import { iconTileGlyphSizes } from "@/components/aui/components/IconTile";
import { sx } from "@/components/aui/utils/stylex";
import { RightRailPanelHeader, RightRailPanelTitle } from "@/components/layout/RightRailPanelShell";
import { CompareProgressPanel } from "@/components/compare/CompareProgressPanel";
import { TarsProgressPanel } from "@/components/tars/TarsProgressPanel";
import { ReviewProgressPanel } from "@/components/session/composer-shelf/ReviewProgressPanel";
import type { AgentStep } from "@/lib/agent-progress";
import {
  agentProgressTargetKey,
  useAgentProgressPanelStore,
  type AgentProgressTarget,
} from "@/store/agent-progress-panel-store";
import { AgentProgressControllerView, type AgentPanelChrome } from "./AgentProgressControllerView";
import { agentProgressStyles as s } from "./agent-progress.styles";
import { agentTargetTitle, childTargetFromStep, type AgentStepContext } from "./agent-progress-targets";
import { useDelegatedProgress, useSubagentProgress } from "./use-agent-progress";

function SubagentPanel(props: { target: Extract<AgentProgressTarget, { kind: "subagent" }>; chrome: AgentPanelChrome }) {
  const controller = useSubagentProgress(props.target);
  return <AgentProgressControllerView target={props.target} controller={controller} chrome={props.chrome} />;
}

function DelegatedPanel(props: { target: Extract<AgentProgressTarget, { kind: "delegated-task" }>; chrome: AgentPanelChrome }) {
  const controller = useDelegatedProgress(props.target);
  return <AgentProgressControllerView target={props.target} controller={controller} chrome={props.chrome} />;
}

function EmptyAgentPanel() {
  useTranslation();
  return (
    <div className={sx(s.root)} data-testid="agent-progress-panel-empty">
      <RightRailPanelHeader>
        <RightRailPanelTitle panelId="agent" />
      </RightRailPanelHeader>
      <div className={sx(s.empty)}>
        <EmptyState.Root variant="plain">
          <EmptyState.Media>
            <Bot size={iconTileGlyphSizes.xl} />
          </EmptyState.Media>
          <EmptyState.Header>
            <EmptyState.Title>{i18n.t("session:agentProgress.panel.emptyTitle")}</EmptyState.Title>
            <EmptyState.Description>{i18n.t("session:agentProgress.panel.emptyDescription")}</EmptyState.Description>
          </EmptyState.Header>
        </EmptyState.Root>
      </div>
    </div>
  );
}

/**
 * The right-rail Agent panel: the agent last opened from a View, beside the
 * conversation. An agent it started opens in place with a step back.
 */
export function AgentProgressPanel() {
  useTranslation();
  const stack = useAgentProgressPanelStore((state) => state.stack);
  const back = useAgentProgressPanelStore((state) => state.back);
  const push = useAgentProgressPanelStore((state) => state.push);
  const close = useAgentProgressPanelStore((state) => state.close);
  const onOpenChild = useCallback((step: AgentStep, context: AgentStepContext) => {
    const next = childTargetFromStep(step, context);
    if (next) push(next);
  }, [push]);
  const target = stack.at(-1);
  const region = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const key = target ? agentProgressTargetKey(target) : undefined;
  useLayoutEffect(() => {
    if (!key) return;
    const active = document.activeElement;
    // Replacing a nested panel can return focus to the document body. Keep the original card.
    if (active instanceof HTMLElement && active !== document.body && !region.current?.contains(active)) {
      opener.current = active;
    }
    region.current?.focus({ preventScroll: true });
  }, [key]);
  const closePanel = useCallback(() => {
    const trigger = opener.current;
    close();
    if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
  }, [close]);
  if (!target) return <EmptyAgentPanel />;
  const previous = stack.length > 1 ? stack[stack.length - 2] : undefined;
  const chrome: AgentPanelChrome = {
    onClose: closePanel,
    ...(previous ? { back: { label: agentTargetTitle(previous), onBack: back } } : {}),
    onOpenChild,
  };
  function content(target: AgentProgressTarget) {
    switch (target.kind) {
      case "subagent":
        return <SubagentPanel key={key} target={target} chrome={chrome} />;
      case "delegated-task":
        return <DelegatedPanel key={key} target={target} chrome={chrome} />;
      case "tars":
        return <TarsProgressPanel key={key} target={target} chrome={chrome} />;
      case "compare-candidate":
        return <CompareProgressPanel key={key} target={target} chrome={chrome} />;
      case "review":
        return <ReviewProgressPanel key={key} target={target} chrome={chrome} />;
    }
  }
  return (
    <div ref={region} tabIndex={-1} className={sx(s.root)} onKeyDown={(event) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (previous) back();
      else closePanel();
    }}>
      {content(target)}
    </div>
  );
}
