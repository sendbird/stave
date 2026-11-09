import { useState } from "react";
import { Ellipsis, Workflow } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { Badge, type BadgeTone } from "@/components/aui/components/Badge";
import { DropdownMenu } from "@/components/aui/components/DropdownMenu";
import { InlineDisclosureIcon } from "@/components/aui/components/inline-disclosure-icon";
import { StateMark } from "@/components/aui/components/StateMark";
import type { WorkState } from "@/components/aui/components/state-vocabulary";
import { StepRail } from "@/components/aui/components/StepRail";
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from "@/components/aui/headless/collapsible";
import { controlIconSizes } from "@/components/aui/recipes/control-metrics";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { inlineDisclosure } from "@/components/aui/recipes/inline-disclosure";
import { transition } from "@/components/aui/recipes/transition";
import { cx, sx } from "@/components/aui/utils/stylex";
import type { StageStatus } from "@/lib/agent-runs/domain";
import { STAGE_STATUS_PRESENTATION } from "@/lib/agent-runs/agent-run-view";
import { StageStatusIcon } from "@/components/agent-runs/StageStatusIcon";
import { isTarsResponsibilityTerminal } from "@/lib/tars/attention";
import { describeTarsResponsibilityDetail } from "@/lib/tars/detail";
import type { TarsActivityNotice, TarsFlow, TarsFlowStage } from "@/lib/tars/flow-model";
import type { TarsSideViewTarget } from "@/lib/tars/side-view";
import type { FleetFocusTarget } from "@/store/fleet-focus-store";
import { tarsStyles } from "./tars.styles";
import { tarsFlowStyles as styles } from "./tars-tray.styles";

const STAGE_TONE: Record<StageStatus, BadgeTone> = {
  pending: "neutral", "awaiting-sign-off": "warning", running: "info", blocked: "warning", stuck: "warning",
  completed: "success", skipped: "neutral", cancelled: "neutral",
};

/**
 * The rail mark: the stage's state as the run panel draws it (`StageStatusIcon`,
 * the shared `StateMark` vocabulary), so a stage wears the same glyph here and
 * on the run's timeline. The chip beside it carries the words.
 */
function StageMarker({ status }: { status: StageStatus }) {
  return <StageStatusIcon tone={STAGE_STATUS_PRESENTATION[status].tone} />;
}

/** A node that is not a stage (the request, Tars's decision, the completion) in the same vocabulary. */
function NodeMarker({ state }: { state: WorkState }) {
  return <StateMark state={state} motion="still" />;
}

/** "1 of 3 stages done · Running"; the state alone while the run is unread. */
export function describeTarsFlowSummary(flow: TarsFlow) {
  const state = flow.state ? i18n.t(`shell:tars.states.${flow.state}`) : i18n.t("shell:tars.conversation.receipts.applied");
  return flow.progress && flow.progress.total > 0
    ? i18n.t("shell:tars.flow.summary", { finished: flow.progress.finished, total: flow.progress.total, state })
    : state;
}

/**
 * Where a stage node leads in the side view: the review stage to the review,
 * a blocked or stuck stage to the report's unmet criteria, any other stage to
 * its place on the timeline.
 */
export function tarsFlowStageTarget(responsibilityId: string, stage: Pick<TarsFlowStage, "id" | "status" | "review">): TarsSideViewTarget {
  if (stage.status === "blocked" || stage.status === "stuck") return { responsibilityId, kind: "report", focus: { unmet: true } };
  return stage.review ? { responsibilityId, kind: "review" } : { responsibilityId, kind: "timeline", focus: { stageId: stage.id } };
}

/** "Show in Fleet" for a node whose main click opens the side view. */
function NodeMenu({ title, target, onShowInFleet }: { title: string; target: FleetFocusTarget | null; onShowInFleet?: (target: FleetFocusTarget) => void }) {
  const { t } = useTranslation(["shell"]);
  if (!target || !onShowInFleet) return null;
  return <DropdownMenu placement="bottom-end"
    trigger={<Ellipsis aria-hidden />}
    triggerProps={{ render: <Button variant="ghost" size="icon-sm" aria-label={t("shell:tars.flow.nodeMenu", { title })} title={t("shell:tars.tray.moreActionsHint")} /> }}
    groups={[{ items: [{ label: t("shell:tars.tray.showInFleet"), onSelect: () => onShowInFleet(target) }] }]} />;
}

export function TarsFlowStageNode({ stage, target, onShowInFleet, onOpen }: {
  stage: TarsFlowStage; target: FleetFocusTarget | null; onShowInFleet?: (target: FleetFocusTarget) => void;
  /** Opens the stage in the side view; Fleet then moves to the node's menu. */
  onOpen?: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  const troubled = stage.status === "blocked" || stage.status === "stuck";
  const content = <>
    <span className={sx(styles.stageTitle)}>{stage.title}</span>
    <Badge size="sm" tone={STAGE_TONE[stage.status]}>{STAGE_STATUS_PRESENTATION[stage.status].label}</Badge>
    {stage.attempt > 1 ? <span className={sx(styles.attempt)}>{t("shell:tars.flow.attempt", { attempt: stage.attempt })}</span> : null}
  </>;
  // A blocked or stuck stage says why where it stands.
  const reason = troubled && stage.reason ? <p className={sx(styles.nodeLabel, styles.stageReason)} data-tars-flow-reason="">{stage.reason}</p> : null;
  if (onOpen) {
    const title = t(troubled ? "shell:tars.flow.openUnmet" : stage.review ? "shell:tars.flow.openReview" : "shell:tars.flow.openTimeline", { title: stage.title });
    return <div className={sx(styles.nodeRow)}>
      <div className={sx(styles.nodeMain)}>
        <Button variant="ghost" size="sm" layout="host" xstyle={styles.stageButton} title={title} aria-label={`${stage.title} · ${STAGE_STATUS_PRESENTATION[stage.status].label} · ${title}`}
          aria-current={stage.current ? "step" : undefined} data-tars-flow-stage={stage.id} onClick={onOpen}>{content}</Button>
        {reason}
      </div>
      <NodeMenu title={stage.title} target={target} onShowInFleet={onShowInFleet} />
    </div>;
  }
  // Without the side view a stage opens its task's row in Fleet; without a task there is nowhere to go, so the node stays text.
  return target && onShowInFleet
    ? <Button variant="ghost" size="sm" layout="host" xstyle={styles.stageButton} title={t("shell:tars.flow.openStage", { title: stage.title })}
      aria-current={stage.current ? "step" : undefined} data-tars-flow-stage={stage.id} onClick={() => onShowInFleet(target)}>{content}</Button>
    : <div className={sx(styles.stageStatic)} aria-current={stage.current ? "step" : undefined} data-tars-flow-stage={stage.id}>{content}</div>;
}

/** Request → Tars decision → each stage → completion, as one vertical run. */
export function TarsFlowNodes({ flow, agentNameOf, onShowInFleet, onOpenSide }: {
  flow: TarsFlow; agentNameOf?: (agentId: string) => string | undefined; onShowInFleet?: (target: FleetFocusTarget) => void;
  /** Opens a node's part of the side view; absent, stage nodes lead to Fleet. */
  onOpenSide?: (target: TarsSideViewTarget) => void;
}) {
  const { t } = useTranslation(["shell"]);
  const agent = flow.agentId ? t("shell:tars.flow.agent", { name: agentNameOf?.(flow.agentId) ?? flow.agentId }) : t("shell:tars.flow.agentAuto");
  const ended = flow.state ? isTarsResponsibilityTerminal({ state: flow.state }) : false;
  const completion = flow.criteriaMet !== null
    ? t("shell:tars.flow.criteriaMet", { met: flow.criteriaMet, total: flow.criteriaCount })
    : flow.state === "completed" || flow.state === "cancelled" ? t(`shell:tars.states.${flow.state}`) : t("shell:tars.flow.notFinished");
  return <StepRail density="compact" role="list" xstyle={styles.nodes} data-tars-flow-nodes="">
    <StepRail.Step role="listitem" marker={<NodeMarker state="ready" />}>
      {/* The request opens what the work was handed: the user's message, Tars's instruction and the criteria. */}
      {onOpenSide ? <Button variant="ghost" size="sm" layout="host" xstyle={styles.stageButton} data-tars-flow-request=""
        title={t("shell:tars.flow.openBrief")} onClick={() => onOpenSide({ responsibilityId: flow.responsibilityId, kind: "brief" })}>
        <span className={sx(styles.node, styles.nodeFlush)}>
          <span className={sx(styles.nodeLabel)}>{t("shell:tars.flow.request")}</span>
          <span className={sx(styles.nodeText)}>{flow.title}</span>
          <span className={sx(styles.nodeLabel)}>{t("shell:tars.flow.criteria", { count: flow.criteriaCount })}</span>
        </span>
      </Button> : <div className={sx(styles.node)} data-tars-flow-request="">
        <p className={sx(styles.nodeLabel)}>{t("shell:tars.flow.request")}</p>
        <p className={sx(styles.nodeText)}>{flow.title}</p>
        <p className={sx(styles.nodeLabel)}>{t("shell:tars.flow.criteria", { count: flow.criteriaCount })}</p>
      </div>}
    </StepRail.Step>
    <StepRail.Step role="listitem" marker={<NodeMarker state="ready" />}>
      <div className={sx(styles.node)} data-tars-flow-decision="">
        <p className={sx(styles.nodeLabel)}>{t("shell:tars.flow.decision")}</p>
        <p className={sx(styles.nodeText)}>{agent}</p>
        {flow.reason ? <p className={sx(styles.nodeLabel)}>{flow.reason}</p> : null}
      </div>
    </StepRail.Step>
    {flow.progress
      ? flow.progress.stages.map((stage) => <StepRail.Step key={stage.id} role="listitem" marker={<StageMarker status={stage.status} />}>
        <TarsFlowStageNode stage={stage} target={flow.fleetTarget} onShowInFleet={onShowInFleet}
          onOpen={onOpenSide ? () => onOpenSide(tarsFlowStageTarget(flow.responsibilityId, stage)) : undefined} />
      </StepRail.Step>)
      : <StepRail.Step role="listitem" marker={<NodeMarker state="queued" />}>
        <p className={sx(styles.nodeLabel, styles.node)}>{t(ended ? "shell:tars.flow.stagesUnavailable" : "shell:tars.flow.stagesPending")}</p>
      </StepRail.Step>}
    <StepRail.Step role="listitem" connector={false}
      marker={<NodeMarker state={flow.state === "completed" ? "ready" : flow.state === "cancelled" ? "stopped" : "queued"} />}>
      {onOpenSide ? <Button variant="ghost" size="sm" layout="host" xstyle={styles.stageButton} data-tars-flow-completion=""
        title={t("shell:tars.flow.openReport")} onClick={() => onOpenSide({ responsibilityId: flow.responsibilityId, kind: "report" })}>
        <span className={sx(styles.node, styles.nodeFlush)}>
          <span className={sx(styles.nodeLabel)}>{t("shell:tars.flow.completion")}</span>
          <span className={sx(styles.nodeText)}>{completion}</span>
        </span>
      </Button> : <div className={sx(styles.node)} data-tars-flow-completion="">
        <p className={sx(styles.nodeLabel)}>{t("shell:tars.flow.completion")}</p>
        <p className={sx(styles.nodeText)}>{completion}</p>
      </div>}
    </StepRail.Step>
  </StepRail>;
}

/**
 * A delegated responsibility's flow under the Tars message that started it.
 * Folded to one line by default; it updates in place from the snapshot and the
 * run, so live progress never adds transcript rows.
 */
export function TarsFlowBlock({ flow, agentNameOf, onShowInFleet, onOpenSide, defaultOpen = false }: {
  flow: TarsFlow; agentNameOf?: (agentId: string) => string | undefined; onShowInFleet?: (target: FleetFocusTarget) => void;
  onOpenSide?: (target: TarsSideViewTarget) => void; defaultOpen?: boolean;
}) {
  const { t } = useTranslation(["shell"]);
  const [open, setOpen] = useState(defaultOpen);
  return <CollapsibleRoot className={sx(inlineDisclosure.root, styles.root)} open={open} onOpenChange={setOpen}
    data-tars-flow={flow.responsibilityId} aria-label={t("shell:tars.flow.label", { title: flow.title })}>
    <CollapsibleTrigger className={cx(sx(inlineDisclosure.trigger, inlineDisclosure.triggerIntrinsic, open && inlineDisclosure.triggerOpen,
      transition.colors, focusRing.ring), "atelier-inline-disclosure-trigger")}>
      <InlineDisclosureIcon open={open}><Workflow size={controlIconSizes.md} /></InlineDisclosureIcon>
      <span className={sx(styles.summary)}>
        <span className={sx(styles.summaryTitle)}>{flow.title}</span>
        <span className={sx(styles.summaryState)} data-tars-flow-summary="">{describeTarsFlowSummary(flow)}</span>
      </span>
    </CollapsibleTrigger>
    <CollapsiblePanel className={cx(sx(inlineDisclosure.panel), "atelier-motion-collapse")}>
      <div className={cx(sx(inlineDisclosure.body), "atelier-motion-panel-inner")}>
        <TarsFlowNodes flow={flow} agentNameOf={agentNameOf} onShowInFleet={onShowInFleet} onOpenSide={onOpenSide} />
      </div>
    </CollapsiblePanel>
  </CollapsibleRoot>;
}

/** Completion, a block that needs you, or an unasked end: one line, never a live progress row. */
export function TarsActivityNoticeLine({ notice }: { notice: TarsActivityNotice }) {
  const { t } = useTranslation(["shell"]);
  const detail = notice.kind === "completed" ? null : describeTarsResponsibilityDetail(notice.activity);
  return <p className={sx(styles.notice)} data-tars-activity={notice.kind}>
    <span aria-hidden="true" className={sx(tarsStyles.glyph)}>↳</span>
    <span>{t(`shell:tars.flow.notice.${notice.kind}`)}</span>
    <span className={sx(styles.noticeTitle)}>{notice.activity.title}</span>
    {detail ? <span>{detail}</span> : null}
  </p>;
}
