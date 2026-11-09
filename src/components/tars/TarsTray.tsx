import type { ReactNode } from "react";
import { ArrowUpRight, ChevronDown, Ellipsis, FileText, GitBranch } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { Accordion } from "@/components/aui/components/Accordion";
import { Badge } from "@/components/aui/components/Badge";
import { DropdownMenu } from "@/components/aui/components/DropdownMenu";
import { Popover } from "@/components/aui/components/Popover";
import { StatusDot } from "@/components/aui/components/StatusDot";
import { textWrap } from "@/components/aui/recipes/text-wrap";
import { transition } from "@/components/aui/recipes/transition";
import { cx, sx } from "@/components/aui/utils/stylex";
import { FLEET_ATTENTION_KIND_LABEL } from "@/lib/fleet/fleet-vocabulary";
import type { TarsLane } from "@/lib/tars/attention";
import { describeTarsResponsibilityDetail } from "@/lib/tars/detail";
import { describeUsageShort } from "@/lib/agent-runs/usage";
import { TARS_IRREVERSIBLE_OPERATIONS } from "@/lib/tars/conversation";
import { formatDateTime } from "@/i18n/format";
import { tarsCardActions, type TarsCardAction, type TarsTrayAttentionInput, type TarsTrayAttentionRow, type TarsTrayCard as TarsTrayCardModel, type TarsTrayDecision, type TarsTrayModel, type TarsTrayStatus } from "@/lib/tars/tray-model";
import type { TarsControlOperation, TarsResponsibility } from "@/lib/tars/types";
import type { TarsOutput } from "@/lib/tars/outputs-model";
import type { TarsSideViewKind, TarsSideViewTarget } from "@/lib/tars/side-view";
import type { FleetFocusTarget } from "@/store/fleet-focus-store";
import { agentRunStyles } from "@/components/agent-runs/agent-runs.styles";
import { tarsTrayStyles as styles } from "./tars-tray.styles";
import { tarsMonitorStyles as monitorStyles } from "./tars-monitor.styles";
import { TarsRunMonitor } from "./TarsRunMonitor";
import { TarsPublishEntry } from "./TarsPublishEntry";
import { isTarsPublishable } from "@/lib/tars/publish-model";

export { stateTone } from "./TarsRunMonitor";

/** Every tray control goes through the view's host action path; opening and folding are view-only. */
export interface TarsTrayActions {
  busy: boolean;
  onAct: (row: TarsResponsibility, operation: TarsControlOperation) => void;
  onConfirm: (decision: TarsTrayDecision) => void;
  onOpenTask: (row: TarsResponsibility) => void;
  onShowInFleet: (target: FleetFocusTarget) => void;
  /** Opens the side view; absent where there is none (a blocked card then has no report link). */
  onOpenSide?: (target: TarsSideViewTarget) => void;
  /** Opens completed work's publish confirmation card; absent on bridges without publishing. */
  onPublish?: (row: TarsResponsibility) => void;
}

const LANES: readonly TarsLane[] = ["needsYou", "running", "done"];
/** Done work is folded until asked for; what waits and what runs stays in view. */
const OPEN_LANES: TarsLane[] = ["needsYou", "running"];

const CONTROL_LABEL = {
  pause: "shell:tars.pause", resume: "shell:tars.resume", takeover: "shell:tars.takeOver", handBack: "shell:tars.handBack", cancel: "shell:tars.cancel",
  acceptCompletion: "shell:tars.acceptCompletion",
} as const satisfies Record<TarsControlOperation, string>;

/**
 * "2 running · 1 needs you · 3 done": each part only when it counts, as Fleet
 * says its counts. Before a successful read the indicator says so instead of
 * claiming there is no work.
 */
export function describeTarsTrayCounts(counts: TarsTrayModel["counts"], status: TarsTrayStatus = "ready", outputs = 0) {
  if (status !== "ready") return i18n.t(`shell:tars.tray.indicator.${status}`);
  const parts = [
    counts.running > 0 ? i18n.t("shell:tars.tray.indicator.running", { count: counts.running }) : null,
    counts.needsYou > 0 ? i18n.t("shell:tars.tray.indicator.needsYou", { count: counts.needsYou }) : null,
    counts.done > 0 ? i18n.t("shell:tars.tray.indicator.done", { count: counts.done }) : null,
    // Outputs are what work produced, not work: counted only when there are some.
    outputs > 0 ? i18n.t("shell:tars.tray.indicator.outputs", { count: outputs }) : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : i18n.t("shell:tars.tray.indicator.empty");
}

function IndicatorLabel({ counts, status, outputs }: { counts: TarsTrayModel["counts"]; status: TarsTrayStatus; outputs: number }) {
  return <span className={sx(styles.indicator)} data-tars-tray-indicator={status}>
    {status === "ready" && counts.needsYou > 0 ? <StatusDot tone="warning" size="sm" /> : null}
    {describeTarsTrayCounts(counts, status, outputs)}
  </span>;
}

/** The tray body before a successful read: checking, or a read that failed (the view's error bar offers Retry). */
export function TarsTrayStatusNote({ status }: { status: Exclude<TarsTrayStatus, "ready"> }) {
  const { t } = useTranslation(["shell"]);
  return <p className={sx(styles.empty)} role="status" data-tars-tray-status={status}>{t(`shell:tars.tray.body.${status}`)}</p>;
}

/**
 * The header indicator. Pinned (wide view) it shows or hides the tray beside
 * the conversation; narrow, it opens the tray as a popover anchored under it,
 * which Esc and an outside click close, returning focus to the indicator.
 */
export function TarsTrayToggle({ pinned, counts, status = "ready", outputs = 0, open, onOpenChange, panelId, children }: {
  pinned: boolean; counts: TarsTrayModel["counts"]; status?: TarsTrayStatus; outputs?: number; open: boolean; onOpenChange: (open: boolean) => void; panelId: string; children: ReactNode;
}) {
  const { t } = useTranslation(["shell"]);
  if (pinned) {
    // The pinned tray is removed while folded, so the indicator points at it only while it is there.
    return <Button variant="secondary" size="sm" aria-expanded={open} aria-controls={open ? panelId : undefined} title={t(open ? "shell:tars.tray.indicator.hide" : "shell:tars.tray.indicator.show")}
      onClick={() => onOpenChange(!open)}><IndicatorLabel counts={counts} status={status} outputs={outputs} /></Button>;
  }
  return <Popover open={open} onOpenChange={onOpenChange} trigger={<IndicatorLabel counts={counts} status={status} outputs={outputs} />} triggerProps={{ size: "sm" }} placement="bottom-end"
    padding={false} title={t("shell:tars.tray.title")} xstyle={styles.popover}>
    <div id={panelId} className={sx(styles.popoverBody, textWrap.keepAll)}>{children}</div>
  </Popover>;
}

/** The kind badge and short text of one attention row; Tars's kinds get Tars's words. */
function describeAttention(row: TarsResponsibility, entry: TarsTrayAttentionRow<TarsTrayAttentionInput>) {
  const { item, decision } = entry;
  if (item.kind === "tars-decision") {
    // A decision with several options is answered in the conversation; its row says what it asks.
    return { label: i18n.t("shell:tars.tray.attention.decision"), text: decision ? i18n.t(`shell:tars.tray.decision.${decision.operation}`)
      : item.detail?.trim() || i18n.t("shell:tars.tray.decision.answerInConversation") };
  }
  if (item.kind === "tars-blocked") {
    return { label: i18n.t("shell:tars.tray.attention.blocked"), text: describeTarsResponsibilityDetail(row) ?? i18n.t("shell:tars.tray.blockedDetail") };
  }
  const label = (FLEET_ATTENTION_KIND_LABEL as Readonly<Record<string, string | undefined>>)[item.kind];
  return { label: label ?? i18n.t("shell:tars.tray.attention.other"), text: item.detail?.trim() || null };
}

/** What an action is called: its control, the proposal it confirms, or the Fleet row. */
function actionLabel(action: TarsCardAction) {
  if (action.kind === "fleet") return i18n.t("shell:tars.tray.showInFleet");
  if (action.kind === "confirm") return i18n.t(`shell:tars.tray.confirm.${action.decision.operation}`);
  return i18n.t(CONTROL_LABEL[action.operation]);
}

/**
 * One main action and Open task stay visible; the rest fold into one menu, so
 * a card's actions keep to a single line. Every control still goes through
 * the view's host action path.
 */
export function TarsCardActions({ card, actions }: { card: TarsTrayCardModel; actions: TarsTrayActions }) {
  const { t } = useTranslation(["shell"]);
  const { row } = card;
  const { primary, more } = tarsCardActions(card);
  const run = (action: TarsCardAction) => {
    if (action.kind === "fleet") { if (card.fleetTarget) actions.onShowInFleet(card.fleetTarget); return; }
    if (action.kind === "confirm") actions.onConfirm(action.decision);
    else actions.onAct(row, action.operation);
  };
  if (!primary && !row.taskId && !more.length) return null;
  return <div className={sx(styles.actions)} role="group" aria-label={t("shell:tars.tray.controls", { title: row.title })} data-tars-card-actions="">
    {/* A reversible confirmation is the card's primary action; one that cannot be undone is never filled primary, as on its decision card. */}
    {/* A confirmation is a decision and keeps the 28px decision rung; a control and the rest are in-surface secondary actions on the 24px rung (AUI #809 A1). */}
    {primary ? <Button variant={primary.kind !== "confirm" ? "secondary" : TARS_IRREVERSIBLE_OPERATIONS.has(primary.decision.operation) ? "destructive" : "default"} size={primary.kind === "confirm" ? "xs" : "2xs"} disabled={actions.busy}
      data-tars-action={primary.kind === "control" ? primary.operation : primary.kind} onClick={() => run(primary)}>{actionLabel(primary)}</Button> : null}
    {row.taskId ? <Button variant="ghost" size="2xs" onClick={() => actions.onOpenTask(row)}>{t("shell:tars.openTask")}</Button> : null}
    {more.length ? <DropdownMenu placement="bottom-end"
      trigger={<Ellipsis aria-hidden />}
      triggerProps={{ render: <Button variant="ghost" size="icon-2xs" aria-label={t("shell:tars.tray.moreActions", { title: row.title })} title={t("shell:tars.tray.moreActionsHint")} /> }}
      groups={[{ items: more.map((action) => ({ label: actionLabel(action), tone: action.kind === "control" && action.operation === "cancel" ? "danger" as const : "neutral" as const,
        disabled: action.kind !== "fleet" && actions.busy, onSelect: () => run(action) })) }]} /> : null}
  </div>;
}

export function TarsTrayCard({ card, actions }: { card: TarsTrayCardModel; actions: TarsTrayActions }) {
  const { t } = useTranslation(["shell"]);
  const { row, progress } = card;
  const terminal = card.lane === "done";
  const detail = describeTarsResponsibilityDetail(row);
  // Who holds it, then what the run reported; an unknown budget or helper count is left out, never "0".
  const facts = [
    t(card.owner === "you" ? "shell:tars.tray.owner.you" : "shell:tars.tray.owner.tars"),
    card.remainingTurns !== null ? t("shell:tars.tray.turnsLeft", { count: card.remainingTurns }) : null,
    card.helpers !== null && card.helpers > 0 ? t("shell:tars.tray.helpers", { count: card.helpers }) : null,
    describeUsageShort(card.usage),
  ].filter((fact): fact is string => Boolean(fact));
  const staged = progress && progress.total > 0;
  const { primary, more } = tarsCardActions(card);
  const hasActions = Boolean(primary || row.taskId || more.length);
  const body = [
    card.waitingBehind ? <p key="waiting" className={sx(styles.meta)} data-tars-waiting-behind="">{t("shell:tars.tray.waitingBehind", { title: card.waitingBehind })}</p> : null,
    !staged && !terminal && row.agentRunId ? <p key="pending" className={sx(styles.meta)}>{t("shell:tars.tray.runPending")}</p> : null,
    detail ? <p key="detail" className={sx(styles.meta)}>{detail}</p> : null,
    row.reverifyAfter && !terminal ? <p key="reverify" className={sx(styles.meta)}>{t("shell:tars.reverify")}</p> : null,
    card.branch ? <p key="branch" className={sx(styles.meta, styles.branch)} data-tars-branch={card.branch} title={card.branch}>
      <GitBranch aria-hidden className={sx(styles.branchIcon)} /><span className={sx(agentRunStyles.visuallyHidden)}>{t("shell:tars.tray.branch")}</span>
      <span className={sx(styles.branchName)}>{card.branch}</span></p> : null,
    card.followUp ? <p key="followUp" className={sx(styles.meta)} data-tars-follow-up-state={card.followUp.status}>
      {t(`shell:tars.tray.followUp.${card.followUp.status}`, { time: card.followUp.at ? formatDateTime(card.followUp.at) : "" })}</p> : null,
    card.attention.length ? <ul key="attention" className={sx(styles.attention)}>
      {card.attention.map((entry) => {
        const { label, text } = describeAttention(row, entry);
        // One state tag per card: what needs the user reads as a marked line, not a second tag.
        return <li key={entry.item.id} className={sx(styles.attentionRow)} data-tars-attention={entry.item.kind}>
          <StatusDot tone="warning" size="sm" xstyle={monitorStyles.attentionMark} />
          <span className={sx(monitorStyles.attentionLabel)}>{label}</span>
          {text ? <span className={sx(styles.attentionText)}>{text}</span> : null}
          {entry.decision && TARS_IRREVERSIBLE_OPERATIONS.has(entry.decision.operation)
            ? <Badge size="sm" tone="danger" variant="outlined" data-tars-decision-risk-tag="">{t("shell:tars.decision.card.risk")}</Badge> : null}
        </li>;
      })}
    </ul> : null,
    // A blocked card leads to what is unmet, under the reason it shows.
    row.state === "blocked" && actions.onOpenSide ? <div key="report" className={sx(styles.actions)}>
      <Button variant="ghost" size="2xs" data-tars-open-report={row.id} onClick={() => actions.onOpenSide!({ responsibilityId: row.id, kind: "report", focus: { unmet: true } })}>
        <FileText aria-hidden />{t("shell:tars.tray.openReport")}</Button>
    </div> : null,
    // Completed work leads to its draft pull request: the link once open, else the button that opens its confirmation card.
    row.state === "completed" && (row.publication || (actions.onPublish && isTarsPublishable(row))) ? <div key="publish" className={sx(styles.actions)} data-tars-card-publish="">
      <TarsPublishEntry row={row} onPublish={actions.onPublish} />
    </div> : null,
  ].filter(Boolean);
  // The card is the design system's run object; its footer holds the card's actions, the step count and the timeline link.
  return <TarsRunMonitor row={row} progress={progress} onOpenSide={actions.onOpenSide} data-tars-card={row.id} data-tars-lane={card.lane}
    data-tars-progress={staged ? `${progress.finished}/${progress.total}` : undefined}
    meta={<span data-tars-facts="">{facts.join(" · ")}</span>} actions={hasActions ? <TarsCardActions card={card} actions={actions} /> : undefined}>
    {body.length ? body : null}
  </TarsRunMonitor>;
}

const OUTPUT_KIND: Record<Exclude<TarsOutput["kind"], "link" | "pullRequest">, TarsSideViewKind> = { report: "report", changes: "changes", review: "review" };

/** A verdict as the run records it, as its translation key. */
export const REVIEW_VERDICT_KEY = { passed: "passed", "changes-requested": "changesRequested", none: "none" } as const;

function outputLabel(output: TarsOutput) {
  switch (output.kind) {
    case "report": return i18n.t(`shell:tars.tray.outputs.report.${output.outcome}`);
    case "changes": return output.files === null ? i18n.t("shell:tars.tray.outputs.changesUncounted") : i18n.t("shell:tars.tray.outputs.changes", { count: output.files });
    case "review": return i18n.t(`shell:tars.tray.outputs.review.${REVIEW_VERDICT_KEY[output.verdict ?? "none"]}`);
    case "link": return output.label;
    case "pullRequest": return output.number ? i18n.t("shell:tars.publish.outputs.pullRequest", { number: output.number }) : i18n.t("shell:tars.publish.outputs.pullRequestUnnumbered");
  }
}

/** What finished or running work produced; each opens the side view, a recorded link opens where it points. */
export function TarsOutputList({ outputs, onOpenSide }: { outputs: readonly TarsOutput[]; onOpenSide?: (target: TarsSideViewTarget) => void }) {
  const { t } = useTranslation(["shell"]);
  if (!outputs.length) return <p className={sx(styles.empty)}>{t("shell:tars.tray.emptyLane.outputs")}</p>;
  return <ul className={sx(styles.cards, styles.outputList)} data-tars-outputs="">
    {outputs.map((output, index) => {
      const label = outputLabel(output);
      return <li key={`${output.responsibilityId}:${output.kind}:${index}`} className={sx(styles.cardItem, styles.outputItem, styles.output)} data-tars-output={output.kind}>
        {output.kind === "link" || output.kind === "pullRequest"
          ? <a className={sx(styles.outputLink)} href={output.url} target="_blank" rel="noreferrer">
            <span className={sx(styles.outputLabel)}>{label}</span><ArrowUpRight aria-hidden className={sx(styles.outputIcon)} /></a>
          : <Button variant="ghost" size="sm" layout="host" xstyle={styles.outputButton} disabled={!onOpenSide}
            aria-label={t("shell:tars.tray.outputs.open", { label, title: output.title })}
            onClick={() => onOpenSide?.({ responsibilityId: output.responsibilityId, kind: OUTPUT_KIND[output.kind] })}>
            <span className={sx(styles.outputLabel)}>{label}</span></Button>}
        <span className={sx(styles.meta, styles.outputMeta)}>{output.title}</span>
      </li>;
    })}
  </ul>;
}

/** Needs you, Running and Done, each folding on its own, then the outputs; the conversation beside it never moves. */
export function TarsTray({ model, actions, outputs }: { model: TarsTrayModel; actions: TarsTrayActions; outputs?: readonly TarsOutput[] }) {
  const { t } = useTranslation(["shell"]);
  return <Accordion.Root multiple defaultValue={outputs ? [...OPEN_LANES, "outputs"] : OPEN_LANES} data-tars-tray="">
    {LANES.map((lane) => {
      const cards = model.lanes[lane];
      // The header says the indicator's number: Fleet's rows for needs you (one card may hold several), cards elsewhere.
      const count = lane === "needsYou" ? model.counts.needsYou : cards.length;
      return <Accordion.Item key={lane} value={lane} data-tars-tray-lane={lane}>
        <Accordion.Header>
          <Accordion.Trigger>
            <span className={sx(styles.sectionTitle)}>{t(`shell:tars.tray.lanes.${lane}`)}<span className={sx(styles.sectionCount)} data-tars-lane-count={count}>{count}</span></span>
            <ChevronDown aria-hidden className={cx(sx(styles.chevron, transition.transform), "atelier-accordion-chevron")} />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>
          {cards.length ? <ul className={sx(styles.cards)}>
            {cards.map((card) => <li key={card.row.id} className={sx(styles.cardItem)}><TarsTrayCard card={card} actions={actions} /></li>)}
          </ul> : <p className={sx(styles.empty)}>{t(`shell:tars.tray.emptyLane.${lane}`)}</p>}
        </Accordion.Panel>
      </Accordion.Item>;
    })}
    {outputs ? <Accordion.Item value="outputs" data-tars-tray-lane="outputs">
      <Accordion.Header>
        <Accordion.Trigger>
          <span className={sx(styles.sectionTitle)}>{t("shell:tars.tray.lanes.outputs")}<span className={sx(styles.sectionCount)} data-tars-lane-count={outputs.length}>{outputs.length}</span></span>
          <ChevronDown aria-hidden className={cx(sx(styles.chevron, transition.transform), "atelier-accordion-chevron")} />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel><TarsOutputList outputs={outputs} onOpenSide={actions.onOpenSide} /></Accordion.Panel>
    </Accordion.Item> : null}
  </Accordion.Root>;
}
