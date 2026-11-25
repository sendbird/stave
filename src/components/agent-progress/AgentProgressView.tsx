import type { ReactNode } from "react";
import { ArrowDown, ChevronLeft, CornerUpLeft, ExternalLink, MessageSquare, Square, X } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { StateMark } from "@/components/aui/components/StateMark";
import { Tabs } from "@/components/aui/components/Tabs";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { WORK_STATE } from "@/components/aui/components/state-vocabulary";
import { sx } from "@/components/aui/utils/stylex";
import { CollapsibleResponse } from "@/components/ai-elements/collapsible-response";
import { useNow } from "@/components/agent-runs/useAgentRun";
import { RightRailPanelHeader, RightRailPanelTitle } from "@/components/layout/RightRailPanelShell";
import {
  formatAgentFacts,
  isAgentStateLive,
  type AgentProgress,
  type AgentStep,
} from "@/lib/agent-progress";
import { AgentStepList } from "./AgentStepList";
import { agentProgressStyles as s } from "./agent-progress.styles";
import { useFollowBottom } from "./use-follow-bottom";

/**
 * Views the panel can show beside Progress. Outputs and Background arrive
 * with the agent's scratch folder and commands; an empty view is never shown.
 */
export type AgentProgressExtraView = {
  value: "outputs" | "background";
  label: string;
  content: ReactNode;
};

export interface AgentProgressViewProps {
  progress: AgentProgress;
  loading?: boolean;
  /** A notice above the steps: the history could not be read, the agent is gone. */
  notice?: string | null;
  /** Set while a nested agent is open: the way back to the agent that started it. */
  back?: { label: string; onBack: () => void };
  onOpenParent?: () => void;
  onOpenChild?: (step: AgentStep) => void;
  onStop?: () => void;
  stopBusy?: boolean;
  onOpenTask?: () => void;
  onShowInConversation?: () => void;
  onClose?: () => void;
  hasOlder?: boolean;
  onLoadOlder?: () => void;
  /** Source-specific content before the steps (a review's findings). */
  lead?: ReactNode;
  extraActions?: ReactNode;
  actionError?: string | null;
  extraViews?: readonly AgentProgressExtraView[];
}

/** The state in words, then the facts in their fixed order. */
function FactRow(props: { progress: AgentProgress; nowMs: number; live: boolean; stateLabel: string }) {
  const facts = formatAgentFacts(
    { kindLabel: props.progress.kindLabel, facts: props.progress.facts },
    { nowMs: props.nowMs, live: props.live },
  );
  return (
    <p className={sx(s.facts)} data-testid="agent-progress-facts">
      <span data-fact="state" className={sx(s.stateWord)}>{props.stateLabel}</span>
      {/* The separator wraps with the fact it leads, never alone at a line end. */}
      {facts.map((fact) => (
        <span key={fact.key} className={sx(s.fact)}>
          <span aria-hidden className={sx(s.factSeparator)}>·</span>
          <span data-fact={fact.key}>{fact.text}</span>
        </span>
      ))}
    </p>
  );
}

function ProgressBody(props: AgentProgressViewProps & { live: boolean }) {
  useTranslation();
  const { progress } = props;
  const follow = useFollowBottom({ steps: progress.steps, live: props.live, resetKey: progress.id });
  return (
    <>
      <div
        ref={follow.viewportRef}
        className={sx(s.viewport)}
        onScroll={follow.onScroll}
        data-testid="agent-progress-scroll"
        data-following={follow.following ? "true" : "false"}
      >
        <div ref={follow.contentRef} className={sx(s.content)}>
          {props.lead}
          {progress.ask?.trim() ? (
            <section className={sx(s.section)} aria-label={i18n.t("session:agentProgress.panel.ask")}>
              <h4 className={sx(s.sectionLabel)}>{i18n.t("session:agentProgress.panel.ask")}</h4>
              <CollapsibleResponse text={progress.ask} label={i18n.t("session:agentProgress.panel.ask")} />
            </section>
          ) : null}
          <section className={sx(s.section)} aria-label={i18n.t("session:agentProgress.panel.steps")}>
            <h4 className={sx(s.sectionLabel)}>{i18n.t("session:agentProgress.panel.steps")}</h4>
            {props.hasOlder && props.onLoadOlder ? (
              <Button size="2xs" variant="quiet" onClick={props.onLoadOlder} xstyle={s.parentLink}>
                {i18n.t("session:agentProgress.panel.loadOlder")}
              </Button>
            ) : null}
            {props.notice ? <p role="status" className={sx(s.muted)}>{props.notice}</p> : null}
            {progress.steps.length > 0 ? (
              <AgentStepList steps={progress.steps} onOpenChild={props.onOpenChild} />
            ) : (
              <p role="status" className={sx(s.muted)}>
                {props.loading ? i18n.t("session:agentProgress.panel.loading") : i18n.t("session:agentProgress.panel.noSteps")}
              </p>
            )}
          </section>
          {progress.result?.trim() ? (
            <section className={sx(s.section)} aria-label={i18n.t("session:agentProgress.panel.answer")} data-testid="agent-progress-answer">
              <h4 className={sx(s.sectionLabel)}>{i18n.t("session:agentProgress.panel.answer")}</h4>
              <CollapsibleResponse text={progress.result} label={i18n.t("session:agentProgress.panel.answer")} />
            </section>
          ) : progress.error?.trim() && !props.live ? (
            <section className={sx(s.section)} aria-label={i18n.t("session:agentProgress.panel.endedWithoutAnswer")}>
              <h4 className={sx(s.sectionLabel)}>{i18n.t("session:agentProgress.panel.endedWithoutAnswer")}</h4>
              <p className={sx(s.errorText)}>{progress.error}</p>
            </section>
          ) : null}
        </div>
      </div>
      {follow.newStepCount > 0 ? (
        <div className={sx(s.jump)}>
          <Button size="xs" variant="floating" onClick={follow.jumpToLatest} xstyle={s.jumpButton} data-testid="agent-progress-new-steps">
            <ArrowDown aria-hidden />
            {i18n.t("session:agentProgress.panel.newSteps", { count: follow.newStepCount })}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/**
 * One agent's progress beside the conversation: where it came from, who it
 * is and how it stands, what it is doing now, then what it was asked, every
 * step it took and its answer. The conversation stays where it is.
 */
export function AgentProgressView(props: AgentProgressViewProps) {
  useTranslation();
  const { progress } = props;
  const live = isAgentStateLive(progress.state);
  const nowMs = useNow(live, 1_000);
  const stateLabel = WORK_STATE[progress.state].label;
  const nowStep = live ? progress.now : undefined;
  const body = <ProgressBody {...props} live={live} />;
  return (
    <div className={sx(s.root)} data-testid="agent-progress-panel" data-agent-state={progress.state} data-agent-source={progress.source}>
      <RightRailPanelHeader
        actions={props.onClose ? (
          <Tooltip content={i18n.t("session:agentProgress.panel.close")}>
            <Button size="xs" variant="quiet" iconOnly aria-label={i18n.t("session:agentProgress.panel.close")} onClick={props.onClose}>
              <X aria-hidden />
            </Button>
          </Tooltip>
        ) : undefined}
      >
        <RightRailPanelTitle panelId="agent" />
      </RightRailPanelHeader>
      <header className={sx(s.head)}>
        {props.back ? (
          <Button size="2xs" variant="quiet" onClick={props.back.onBack} xstyle={s.parentLink} data-testid="agent-progress-back">
            <ChevronLeft aria-hidden />
            <span className={sx(s.parentLabel)}>{i18n.t("session:agentProgress.panel.backTo", { parent: props.back.label })}</span>
          </Button>
        ) : progress.parent ? (
          <Button
            size="2xs"
            variant="quiet"
            onClick={props.onOpenParent}
            disabled={!props.onOpenParent}
            xstyle={s.parentLink}
            data-testid="agent-progress-parent"
          >
            <CornerUpLeft aria-hidden />
            <span className={sx(s.parentLabel)}>{i18n.t("session:agentProgress.panel.parentOf", { parent: progress.parent.label })}</span>
          </Button>
        ) : null}
        <div className={sx(s.titleRow)}>
          <span className={sx(s.titleMark)}>
            <StateMark state={progress.state} size="sm" label={stateLabel} />
          </span>
          <h3 className={sx(s.title)}>{progress.title}</h3>
        </div>
        <FactRow progress={progress} nowMs={nowMs} live={live} stateLabel={stateLabel} />
        {nowStep ? (
          <p className={sx(s.now)} data-testid="agent-progress-now">
            <span className={sx(s.nowLabel)}>{i18n.t("session:agentProgress.panel.now")}</span>
            <span className={sx(s.nowText)} title={nowStep.doing}>{nowStep.doing}</span>
          </p>
        ) : null}
        {props.onStop || props.onOpenTask || props.onShowInConversation || props.extraActions ? (
          <div className={sx(s.actions)}>
            {props.onStop && live ? (
              <Button size="xs" variant="secondary" disabled={props.stopBusy} onClick={props.onStop}>
                <Square aria-hidden />
                {i18n.t("session:agentProgress.panel.stop")}
              </Button>
            ) : null}
            {props.onOpenTask ? (
              <Button size="xs" variant="quiet" onClick={props.onOpenTask}>
                <ExternalLink aria-hidden />
                {i18n.t("session:agentProgress.panel.openTask")}
              </Button>
            ) : null}
            {props.onShowInConversation ? (
              <Button size="xs" variant="quiet" onClick={props.onShowInConversation}>
                <MessageSquare aria-hidden />
                {i18n.t("session:agentProgress.panel.showInConversation")}
              </Button>
            ) : null}
            {props.extraActions}
          </div>
        ) : null}
        {props.actionError ? <p role="alert" className={sx(s.actionError)}>{props.actionError}</p> : null}
      </header>
      {props.extraViews && props.extraViews.length > 0 ? (
        <Tabs
          aria-label={i18n.t("session:agentProgress.panel.tabsLabel")}
          options={[
            { value: "progress", label: i18n.t("session:agentProgress.panel.tabProgress"), content: body },
            ...props.extraViews.map((view) => ({ value: view.value, label: view.label, content: view.content })),
          ]}
        />
      ) : body}
    </div>
  );
}
