import type { KeyboardEvent, ReactNode } from "react";
import { ArrowUpRight, ChevronDown, Ellipsis, FileText, GitBranch, GripVertical } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { Accordion } from "@/components/aui/components/Accordion";
import { Badge } from "@/components/aui/components/Badge";
import { DropdownMenu } from "@/components/aui/components/DropdownMenu";
import { Popover } from "@/components/aui/components/Popover";
import { runStyles } from "@/components/aui/components/RunMonitor";
import { StatusDot } from "@/components/aui/components/StatusDot";
import { textWrap } from "@/components/aui/recipes/text-wrap";
import { transition } from "@/components/aui/recipes/transition";
import { cx, sx } from "@/components/aui/utils/stylex";
import { FLEET_ATTENTION_KIND_LABEL } from "@/lib/fleet/fleet-vocabulary";
import type { TarsLane } from "@/lib/tars/attention";
import { describeTarsQueueWait, describeTarsResponsibilityDetail, describeTarsWorkingChanges } from "@/lib/tars/detail";
import { describeUsageShort } from "@/lib/agent-runs/usage";
import { TARS_IRREVERSIBLE_OPERATIONS, type TarsQueueMove, type TarsQueueMoveSource } from "@/lib/tars/conversation";
import { tarsQueueDropMove } from "@/lib/tars/queue-order";
import { SortableDropIndicator, useSortableListMonitor, useSortableRow } from "@/hooks/use-sortable-list";
import { formatDateTime } from "@/i18n/format";
import { tarsCardActions, tarsQueueMoves, type TarsCardAction, type TarsTrayAttentionInput, type TarsTrayAttentionRow, type TarsTrayCard as TarsTrayCardModel, type TarsTrayDecision, type TarsTrayModel, type TarsTrayStatus } from "@/lib/tars/tray-model";
import type { TarsControlOperation, TarsResponsibility } from "@/lib/tars/types";
import type { TarsOutput } from "@/lib/tars/outputs-model";
import type { TarsSideViewKind, TarsSideViewTarget } from "@/lib/tars/side-view";
import type { FleetFocusTarget } from "@/store/fleet-focus-store";
import { agentRunStyles } from "@/components/agent-runs/agent-runs.styles";
import { tarsTrayStyles as styles } from "./tars-tray.styles";
import { tarsMonitorStyles as monitorStyles } from "./tars-monitor.styles";
import { TarsRunMonitor } from "./TarsRunMonitor";
import { TarsLiveLine, TarsRecentProgress, tarsLiveLineShows } from "./TarsLiveProgress";
import { useTarsLiveProgress } from "./use-tars-live-progress";
import { TarsPublishEntry } from "./TarsPublishEntry";
import { isTarsPublishable } from "@/lib/tars/publish-model";
import { tarsClearStyles as clearStyles } from "./tars-clear.styles";

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
  /** Moves queued work in the queue through the host; absent, queued cards offer no Do first, Do later or drag. */
  onMove?: (row: TarsResponsibility, move: TarsQueueMove, source: TarsQueueMoveSource) => void;
}

/** One clearable lane: how many ended items a clear would hide now, how many are hidden, and the newest clear's Undo. */
export interface TarsTrayLaneClearing { clearable: number; hidden: number; onUndo: (() => void) | null; error?: string | null }

/** The Done and Outputs lanes' Clear; absent on bridges without clearing. */
export interface TarsTrayClearing {
  busy: boolean;
  done: TarsTrayLaneClearing;
  outputs: TarsTrayLaneClearing;
  onClear: (scope: "done" | "outputs") => void;
}

/**
 * A clearable lane's controls under its header: how many ended items it
 * leaves out (with the newest clear's Undo) and Clear, which hides the ended
 * work it shows now. Nothing appears while there is nothing to say or do.
 */
function TarsLaneTools({ scope, clearing }: { scope: "done" | "outputs"; clearing: TarsTrayClearing }) {
  const { t } = useTranslation(["shell"]);
  const lane = clearing[scope];
  if (!lane.clearable && !lane.hidden && !lane.error) return null;
  const label = t(scope === "done" ? "shell:tars.clear.lane.clearDone" : "shell:tars.clear.lane.clearOutputs");
  return <div className={sx(clearStyles.laneTools)} data-tars-lane-tools={scope}>
    {lane.hidden ? <p className={sx(clearStyles.laneNote)} data-tars-lane-hidden={lane.hidden}>{t("shell:tars.clear.lane.hidden", { count: lane.hidden })}</p> : null}
    <div className={sx(clearStyles.laneActions)}>
      {lane.onUndo ? <Button variant="ghost" size="2xs" disabled={clearing.busy} data-tars-lane-undo={scope} onClick={lane.onUndo}>{t("shell:tars.clear.undo")}</Button> : null}
      {lane.clearable ? <Button variant="ghost" size="2xs" disabled={clearing.busy} aria-label={label} title={label} data-tars-lane-clear={scope}
        onClick={() => clearing.onClear(scope)}>{t("shell:tars.clear.lane.clear")}</Button> : null}
    </div>
    {lane.error ? <p className={sx(clearStyles.laneNote, clearStyles.laneError)} role="alert">{lane.error}</p> : null}
  </div>;
}

/** The queue moves list for the tray's drag and drop; one list, so a card only drops among queued work. */
const QUEUE_LIST_ID = "tars-queue";
/** The grip's keys, as `aria-keyshortcuts` names them. */
const QUEUE_MOVE_ARIA_KEYS = "Alt+ArrowUp Alt+ArrowDown";

const LANES: readonly TarsLane[] = ["needsYou", "running", "done"];
/** Done work is folded until asked for; what waits and what runs stays in view. */
const OPEN_LANES: TarsLane[] = ["needsYou", "running"];

const CONTROL_LABEL = {
  pause: "shell:tars.pause", resume: "shell:tars.resume", takeover: "shell:tars.takeOver", handBack: "shell:tars.handBack", cancel: "shell:tars.cancel",
  acceptCompletion: "shell:tars.acceptCompletion", startNow: "shell:tars.startNow", extend: "shell:tars.extend",
  retryStage: "shell:tars.retryStage", skipStage: "shell:tars.skipStage", signOff: "shell:tars.signOff",
  approve: "shell:tars.approve", deny: "shell:tars.deny", answer: "shell:tars.answer", message: "shell:tars.message", requestChanges: "shell:tars.requestChanges",
} as const satisfies Record<TarsControlOperation, string>;

/**
 * "1 running · 2 waiting · 1 needs you · 3 done": each part only when it
 * counts, as Fleet says its counts. Running counts only work that actually
 * runs; queued, paused and waiting work is "waiting", work the user took over
 * is "yours". Before a successful read the indicator says so instead of
 * claiming there is no work.
 */
export function describeTarsTrayCounts(counts: TarsTrayModel["counts"], status: TarsTrayStatus = "ready", outputs = 0) {
  if (status !== "ready") return i18n.t(`shell:tars.tray.indicator.${status}`);
  const parts = [
    counts.running > 0 ? i18n.t("shell:tars.tray.indicator.running", { count: counts.running }) : null,
    counts.waiting > 0 ? i18n.t("shell:tars.tray.indicator.waiting", { count: counts.waiting }) : null,
    counts.yours > 0 ? i18n.t("shell:tars.tray.indicator.yours", { count: counts.yours }) : null,
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

/** What an action is called: its control, the proposal it confirms, the Fleet row, or a queue move. */
function actionLabel(action: TarsCardAction) {
  if (action.kind === "fleet") return i18n.t("shell:tars.tray.showInFleet");
  if (action.kind === "confirm") return i18n.t(`shell:tars.tray.confirm.${action.decision.operation}`);
  if (action.kind === "move") return i18n.t(action.direction === "earlier" ? "shell:tars.tray.moveEarlier" : "shell:tars.tray.moveLater");
  return i18n.t(CONTROL_LABEL[action.operation]);
}

/**
 * One main action and Open task stay visible; the rest fold into one menu, so
 * a card's actions keep to a single line. Every control still goes through
 * the view's host action path.
 */
export function TarsCardActions({ card, actions, grip }: { card: TarsTrayCardModel; actions: TarsTrayActions; grip?: ReactNode }) {
  const { t } = useTranslation(["shell"]);
  const { row } = card;
  const offered = tarsCardActions(card);
  const primary = offered.primary;
  // Queue moves need the host's move path; a bridge without it offers none.
  const more = offered.more.filter((action) => action.kind !== "move" || actions.onMove);
  const run = (action: TarsCardAction) => {
    if (action.kind === "fleet") { if (card.fleetTarget) actions.onShowInFleet(card.fleetTarget); return; }
    if (action.kind === "move") { actions.onMove?.(row, { direction: action.direction }, "click"); return; }
    if (action.kind === "confirm") actions.onConfirm(action.decision);
    else actions.onAct(row, action.operation);
  };
  if (!primary && !row.taskId && !more.length && !grip) return null;
  return <div className={sx(styles.actions)} role="group" aria-label={t("shell:tars.tray.controls", { title: row.title })} data-tars-card-actions="">
    {grip}
    {/* A reversible confirmation is the card's primary action; one that cannot be undone is never filled primary, as on its decision card. */}
    {/* A confirmation is a decision and keeps the 28px decision rung; a control and the rest are in-surface secondary actions on the 24px rung (AUI #809 A1). */}
    {primary ? <Button variant={primary.kind !== "confirm" ? "secondary" : TARS_IRREVERSIBLE_OPERATIONS.has(primary.decision.operation) ? "destructive" : "default"} size={primary.kind === "confirm" ? "xs" : "2xs"} disabled={actions.busy}
      data-tars-action={primary.kind === "control" ? primary.operation : primary.kind} onClick={() => run(primary)}>{actionLabel(primary)}</Button> : null}
    {row.taskId ? <Button variant="ghost" size="2xs" onClick={() => actions.onOpenTask(row)}>{t("shell:tars.openTask")}</Button> : null}
    {more.length ? <DropdownMenu placement="bottom-end"
      trigger={<Ellipsis aria-hidden />}
      triggerProps={{ render: <Button variant="ghost" size="icon-2xs" aria-label={t("shell:tars.tray.moreActions", { title: row.title })} title={t("shell:tars.tray.moreActionsHint")} data-tars-more-actions={row.id} /> }}
      groups={[{ items: more.map((action) => ({ label: actionLabel(action), tone: action.kind === "control" && action.operation === "cancel" ? "danger" as const : "neutral" as const,
        disabled: action.kind !== "fleet" && actions.busy, onSelect: () => run(action) })) }]} /> : null}
  </div>;
}

/** How many of the run's recent changes a card lists; the timeline has the rest. */
const CARD_RECENT_LIMIT = 3;

export function TarsTrayCard({ card, actions, grip }: { card: TarsTrayCardModel; actions: TarsTrayActions; grip?: ReactNode }) {
  const { t } = useTranslation(["shell"]);
  const { row, progress } = card;
  const terminal = card.lane === "done";
  // What Stave observed: the turn's activity, how current it is, and the run's last few changes.
  const { live, now } = useTarsLiveProgress(row, card.run, { recentLimit: CARD_RECENT_LIMIT });
  const detail = describeTarsResponsibilityDetail(row);
  const workingChanges = describeTarsWorkingChanges(row);
  // Who holds it, then what the run reported; an unknown budget or helper count is left out, never "0".
  const facts = [
    t(card.owner === "you" ? "shell:tars.tray.owner.you" : "shell:tars.tray.owner.tars"),
    card.remainingTurns !== null ? t("shell:tars.tray.turnsLeft", { count: card.remainingTurns }) : null,
    card.helpers !== null && card.helpers > 0 ? t("shell:tars.tray.helpers", { count: card.helpers }) : null,
    describeUsageShort(card.usage),
  ].filter((fact): fact is string => Boolean(fact));
  const staged = progress && progress.total > 0;
  const { primary, more } = tarsCardActions(card);
  const hasActions = Boolean(primary || row.taskId || more.length || grip);
  // A blocked row in the attention well already says the block's reason; the card does not say it twice.
  const blockedEntry = card.attention.find((entry) => entry.item.kind === "tars-blocked");
  const detailInAttention = Boolean(blockedEntry);
  // A blocked card leads to what is unmet: from the end of the well's Blocked line when there is one, else under the card's lines.
  const report = row.state === "blocked" && actions.onOpenSide ? <Button variant="ghost" size="2xs" data-tars-open-report={row.id}
    onClick={() => actions.onOpenSide!({ responsibilityId: row.id, kind: "report", focus: { unmet: true } })}>
    <FileText aria-hidden />{t("shell:tars.tray.openReport")}</Button> : null;
  // Status first, then what needs the user right above the actions that answer it; identity (owner, branch) is the header's.
  const body = [
    row.state === "queued" ? <p key="waiting" className={sx(styles.meta)} data-tars-queue-wait={row.queueWait?.code ?? "unknown"}>{describeTarsQueueWait(row)}</p> : null,
    !staged && !terminal && row.agentRunId && !live.running ? <p key="pending" className={sx(styles.meta)}>{t("shell:tars.tray.runPending")}</p> : null,
    tarsLiveLineShows(row, live) ? <TarsLiveLine key="live" row={row} live={live} now={now} /> : null,
    !terminal && live.recent.length ? <TarsRecentProgress key="recent" entries={live.recent} now={now} title compact /> : null,
    detail && !detailInAttention ? <p key="detail" className={sx(styles.meta)}>{detail}</p> : null,
    row.reverifyAfter && !terminal ? <p key="reverify" className={sx(styles.meta)}>{t("shell:tars.reverify")}</p> : null,
    workingChanges ? <p key="workingChanges" className={sx(styles.meta)} data-tars-working-changes={row.workingChanges!.kind}>{workingChanges}</p> : null,
    card.followUp ? <p key="followUp" className={sx(styles.meta)} data-tars-follow-up-state={card.followUp.status}>
      {t(`shell:tars.tray.followUp.${card.followUp.status}`, { time: card.followUp.at ? formatDateTime(card.followUp.at) : "" })}</p> : null,
    // What the work waits on is "now", so it sits in the run object's recessed well (AUI RunMonitor's decision well):
    // each item says what kind of wait it is on a short label line, then its text across the card's full width.
    card.attention.length ? <ul key="attention" className={sx(runStyles.well, styles.attention)} data-tars-attention-list={card.attention.length}>
      {card.attention.map((entry) => {
        const { label, text } = describeAttention(row, entry);
        // One state tag per card: what needs the user reads as a marked label, not a second tag.
        return <li key={entry.item.id} className={sx(styles.attentionRow)} data-tars-attention={entry.item.kind}>
          <span className={sx(styles.attentionHead)}>
            <StatusDot tone="warning" size="sm" xstyle={monitorStyles.attentionMark} />
            <span className={sx(monitorStyles.attentionLabel)}>{label}</span>
            {entry.decision && TARS_IRREVERSIBLE_OPERATIONS.has(entry.decision.operation)
              ? <Badge size="sm" tone="danger" variant="outlined" xstyle={styles.attentionEnd} data-tars-decision-risk-tag="">{t("shell:tars.decision.card.risk")}</Badge> : null}
            {report && entry === blockedEntry ? <span className={sx(styles.attentionEnd)}>{report}</span> : null}
          </span>
          {text ? <span className={sx(styles.attentionText)}>{text}</span> : null}
        </li>;
      })}
    </ul> : null,
    report && !blockedEntry ? <div key="report" className={sx(styles.actions)}>{report}</div> : null,
    // Completed work leads to its draft pull request: the link once open, else the button that opens its confirmation card.
    row.state === "completed" && (row.publication || (actions.onPublish && isTarsPublishable(row))) ? <div key="publish" className={sx(styles.actions)} data-tars-card-publish="">
      <TarsPublishEntry row={row} onPublish={actions.onPublish} />
    </div> : null,
  ].filter(Boolean);
  // The card is the design system's run object; its footer holds the card's actions, the step count and the timeline link.
  return <TarsRunMonitor row={row} progress={progress} onOpenSide={actions.onOpenSide} data-tars-card={row.id} data-tars-lane={card.lane}
    data-tars-progress={staged ? `${progress.finished}/${progress.total}` : undefined}
    meta={<>
      <span data-tars-facts="">{facts.join(" · ")}</span>
      {/* Where the work happens is identity, so it sits with the owner: an identifier in the mono face at the meta line's size. */}
      {card.branch ? <span className={sx(styles.branch)} data-tars-branch={card.branch} title={card.branch}>
        <GitBranch aria-hidden className={sx(styles.branchIcon)} /><span className={sx(agentRunStyles.visuallyHidden)}>{t("shell:tars.tray.branch")}</span>
        <span className={sx(styles.branchName)}>{card.branch}</span></span> : null}
    </>} actions={hasActions ? <TarsCardActions card={card} actions={actions} grip={grip} /> : undefined}>
    {body.length ? body : null}
  </TarsRunMonitor>;
}

/**
 * A queued card in the queue's drag-and-drop list. Its grip is the drag
 * handle and, focused, the keyboard handle: Alt+ArrowUp and Alt+ArrowDown
 * do what Do first and Do later in its menu do.
 */
function TarsQueuedCardItem({ card, actions, sortable }: { card: TarsTrayCardModel; actions: TarsTrayActions; sortable: boolean }) {
  const { t } = useTranslation(["shell"]);
  const { row } = card;
  const { setRowElement, setHandleElement, isDragging, closestEdge } = useSortableRow({
    listId: QUEUE_LIST_ID, itemId: row.id, disabled: !sortable || actions.busy, preview: { title: row.title },
  });
  const moves = tarsQueueMoves(card.queue);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowUp" ? "earlier" : "later";
    if (!actions.busy && moves.includes(direction)) actions.onMove?.(row, { direction }, "click");
  };
  const grip = sortable ? <Button ref={setHandleElement} variant="ghost" size="icon-2xs" data-tars-queue-grip={row.id}
    aria-label={t("shell:tars.tray.reorder.handle", { title: row.title })} title={t("shell:tars.tray.reorder.hint")}
    aria-keyshortcuts={QUEUE_MOVE_ARIA_KEYS} onKeyDown={onKeyDown}><GripVertical aria-hidden /></Button> : undefined;
  return <li ref={setRowElement} className={sx(styles.cardItem, styles.queuedItem, isDragging && styles.queuedItemDragging)} data-tars-queue-item={row.id}
    data-tars-queue-position={card.queue ? card.queue.position : undefined}>
    <TarsTrayCard card={card} actions={actions} grip={grip} />
    {closestEdge ? <SortableDropIndicator edge={closestEdge} /> : null}
  </li>;
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
export function TarsTray({ model, actions, outputs, clearing }: { model: TarsTrayModel; actions: TarsTrayActions; outputs?: readonly TarsOutput[]; clearing?: TarsTrayClearing }) {
  const { t } = useTranslation(["shell"]);
  const queued = Object.values(model.lanes).flat().filter((card) => card.queue);
  // Reordering needs the host's move path and something to reorder with.
  const sortable = Boolean(actions.onMove) && queued.length > 1;
  useSortableListMonitor({
    isListMatch: (listId) => listId === QUEUE_LIST_ID,
    onReorder: (event) => {
      const source = queued.find((card) => card.row.id === event.sourceId);
      const move = source ? tarsQueueDropMove(queued.map((card) => card.row), event.sourceId, event.targetId, event.closestEdge === "bottom" ? "bottom" : "top") : null;
      if (source && move && !actions.busy) actions.onMove?.(source.row, move, "drag");
    },
  });
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
          {lane === "done" && clearing ? <TarsLaneTools scope="done" clearing={clearing} /> : null}
          {cards.length ? <ul className={sx(styles.cards)}>
            {cards.map((card) => card.queue ? <TarsQueuedCardItem key={card.row.id} card={card} actions={actions} sortable={sortable} />
              : <li key={card.row.id} className={sx(styles.cardItem)}><TarsTrayCard card={card} actions={actions} /></li>)}
          </ul> : lane === "done" && clearing?.done.hidden ? null : <p className={sx(styles.empty)}>{t(`shell:tars.tray.emptyLane.${lane}`)}</p>}
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
      <Accordion.Panel>
        {clearing ? <TarsLaneTools scope="outputs" clearing={clearing} /> : null}
        {!outputs.length && clearing?.outputs.hidden ? null : <TarsOutputList outputs={outputs} onOpenSide={actions.onOpenSide} />}
      </Accordion.Panel>
    </Accordion.Item> : null}
  </Accordion.Root>;
}
