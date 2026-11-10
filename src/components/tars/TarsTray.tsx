import { useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUpRight, ChevronRight, Ellipsis, FileDiff, FileText, GitBranch, GitPullRequest, GripVertical, Link2, PanelRight, SearchCheck, type LucideIcon } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button, ExternalAnchor } from "@/components/ui";
import { Accordion } from "@/components/aui/components/Accordion";
import { Badge } from "@/components/aui/components/Badge";
import { DropdownMenu } from "@/components/aui/components/DropdownMenu";
import { Popover } from "@/components/aui/components/Popover";
import { runStyles } from "@/components/aui/components/RunMonitor";
import { StatusDot } from "@/components/aui/components/StatusDot";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { textWrap } from "@/components/aui/recipes/text-wrap";
import { transition } from "@/components/aui/recipes/transition";
import { sx } from "@/components/aui/utils/stylex";
import { FLEET_ATTENTION_KIND_LABEL } from "@/lib/fleet/fleet-vocabulary";
import type { TarsLane } from "@/lib/tars/attention";
import { describeTarsQueueWait, describeTarsResponsibilityDetail, describeTarsResponsibilityDiagnostic, describeTarsWorkingChanges } from "@/lib/tars/detail";
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
import { TarsDiagnosticDetail } from "./TarsDiagnosticDetail";
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
 * A clearable lane's controls on the end of its sticky header row: the newest
 * clear's Undo, and Clear, which hides the ended work the lane shows now. They
 * stay in reach however far the lane scrolls. Nothing appears while there is
 * nothing to do.
 */
function TarsLaneTools({ scope, clearing }: { scope: "done" | "outputs"; clearing: TarsTrayClearing }) {
  const { t } = useTranslation(["shell"]);
  const lane = clearing[scope];
  if (!lane.clearable && !lane.onUndo) return null;
  const label = t(scope === "done" ? "shell:tars.clear.lane.clearDone" : "shell:tars.clear.lane.clearOutputs");
  return <div className={sx(clearStyles.laneActions)} data-tars-lane-tools={scope}>
    {lane.onUndo ? <Button variant="ghost" size="2xs" disabled={clearing.busy} data-tars-lane-undo={scope} onClick={lane.onUndo}>{t("shell:tars.clear.undo")}</Button> : null}
    {lane.clearable ? <Button variant="ghost" size="2xs" disabled={clearing.busy} aria-label={label} title={label} data-tars-lane-clear={scope}
      onClick={() => clearing.onClear(scope)}>{t("shell:tars.clear.lane.clear")}</Button> : null}
  </div>;
}

/** Under a clearable lane's header: how many ended items it leaves out, and a failed clear's reason. */
function TarsLaneNote({ scope, clearing }: { scope: "done" | "outputs"; clearing: TarsTrayClearing }) {
  const { t } = useTranslation(["shell"]);
  const lane = clearing[scope];
  if (!lane.hidden && !lane.error) return null;
  return <div className={sx(clearStyles.laneTools)} data-tars-lane-note={scope}>
    {lane.hidden ? <p className={sx(clearStyles.laneNote)} data-tars-lane-hidden={lane.hidden}>{t("shell:tars.clear.lane.hidden", { count: lane.hidden })}</p> : null}
    {lane.error ? <p className={sx(clearStyles.laneNote, clearStyles.laneError)} role="alert">{lane.error}</p> : null}
  </div>;
}

/** The queue moves list for the tray's drag and drop; one list, so a card only drops among queued work. */
const QUEUE_LIST_ID = "tars-queue";
/** The grip's keys, as `aria-keyshortcuts` names them. */
const QUEUE_MOVE_ARIA_KEYS = "Alt+ArrowUp Alt+ArrowDown";

const LANES: readonly TarsLane[] = ["needsYou", "running", "done"];
type TarsTrayLaneId = TarsLane | "outputs";
/** Done work is folded until asked for; what waits, what runs and what it produced stays in view, unless the lane is empty. */
const OPEN_LANES: readonly TarsTrayLaneId[] = ["needsYou", "running", "outputs"];

const CONTROL_LABEL = {
  pause: "shell:tars.pause", resume: "shell:tars.resume", takeover: "shell:tars.takeOver", handBack: "shell:tars.handBack", cancel: "shell:tars.cancel",
  acceptCompletion: "shell:tars.acceptCompletion", startNow: "shell:tars.startNow", extend: "shell:tars.extend",
  retryStage: "shell:tars.retryStage", skipStage: "shell:tars.skipStage", signOff: "shell:tars.signOff",
  approve: "shell:tars.approve", deny: "shell:tars.deny", answer: "shell:tars.answer", message: "shell:tars.message", requestChanges: "shell:tars.requestChanges",
} as const satisfies Record<TarsControlOperation, string>;

/**
 * "16 need you · 2 in progress · 4 done · 7 outputs": the lanes' own names and
 * the numbers their headers show (`tarsTrayLaneCount`), each part only when it
 * counts, so the indicator and the tray never disagree. Running work that
 * needs the user is in Needs you, and counted there. Before a successful read
 * the indicator says so instead of claiming there is no work.
 */
export function describeTarsTrayCounts(counts: TarsTrayModel["counts"], status: TarsTrayStatus = "ready", outputs = 0) {
  if (status !== "ready") return i18n.t(`shell:tars.tray.indicator.${status}`);
  const parts = [
    counts.needsYou > 0 ? i18n.t("shell:tars.tray.indicator.needsYou", { count: counts.needsYou }) : null,
    counts.inProgress > 0 ? i18n.t("shell:tars.tray.indicator.inProgress", { count: counts.inProgress }) : null,
    counts.done > 0 ? i18n.t("shell:tars.tray.indicator.done", { count: counts.done }) : null,
    // Outputs are what work produced, not work: counted only when there are some.
    outputs > 0 ? i18n.t("shell:tars.tray.indicator.outputs", { count: outputs }) : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : i18n.t("shell:tars.tray.indicator.empty");
}

/** The number a lane's header shows, the same number the indicator says for it. */
export function tarsTrayLaneCount(counts: TarsTrayModel["counts"], lane: TarsLane) {
  return lane === "needsYou" ? counts.needsYou : lane === "running" ? counts.inProgress : counts.done;
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
 * A card's actions keep to one line: at most one primary action, then the
 * secondary ones, then one menu with the rest. The primary action is a Tars
 * proposal waiting for the user's Confirm, on the AUI decision rung; one that
 * cannot be undone wears the danger tone, as on its decision card. The state's
 * own control (pause, resume, hand back) and Open task are 24px secondary
 * actions of one weight. Every control still goes through the view's host
 * action path.
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
  const decision = primary?.kind === "confirm" ? primary : null;
  const moreLabel = t("shell:tars.tray.moreActions", { title: row.title });
  return <div className={sx(styles.actions)} role="group" aria-label={t("shell:tars.tray.controls", { title: row.title })} data-tars-card-actions="">
    {grip}
    {decision ? <Button variant={TARS_IRREVERSIBLE_OPERATIONS.has(decision.decision.operation) ? "destructive" : "default"} size="xs" disabled={actions.busy}
      data-tars-action="confirm" data-tars-card-primary="" onClick={() => run(decision)}>{actionLabel(decision)}</Button> : null}
    {primary && !decision ? <Button variant="ghost" size="2xs" disabled={actions.busy}
      data-tars-action={primary.kind === "control" ? primary.operation : primary.kind} onClick={() => run(primary)}>{actionLabel(primary)}</Button> : null}
    {row.taskId ? <Button variant="ghost" size="2xs" onClick={() => actions.onOpenTask(row)}>{t("shell:tars.openTask")}</Button> : null}
    {more.length ? <DropdownMenu placement="bottom-end"
      trigger={<Ellipsis aria-hidden />}
      // The menu's trigger is also the hint's trigger: the hint names it on hover and keyboard focus.
      triggerProps={{ render: (props) => <Tooltip content={t("shell:tars.tray.moreActionsHint")}>
        <Button {...props} variant="ghost" size="icon-2xs" aria-label={moreLabel} data-tars-more-actions={row.id} />
      </Tooltip> }}
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
  // The run's own words behind a translated line, folded; the report keeps them for blocked work too.
  const diagnostic = describeTarsResponsibilityDiagnostic(row);
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
    diagnostic ? <TarsDiagnosticDetail key="diagnostic" text={diagnostic} /> : null,
    row.reverifyAfter && !terminal ? <p key="reverify" className={sx(styles.meta)}>{t("shell:tars.reverify")}</p> : null,
    workingChanges ? <p key="workingChanges" className={sx(styles.meta)} data-tars-working-changes={row.workingChanges!.kind}>{workingChanges}</p> : null,
    card.followUp ? <p key="followUp" className={sx(styles.meta)} data-tars-follow-up-state={card.followUp.status}>
      {t(`shell:tars.tray.followUp.${card.followUp.status}`, { time: card.followUp.at ? formatDateTime(card.followUp.at) : "" })}</p> : null,
    // What the work waits on is "now", so it sits in the run object's recessed well (AUI RunMonitor's decision well):
    // each item says what kind of wait it is on a short label line, then its text across the card's full width.
    card.attention.length ? <ul key="attention" className={sx(runStyles.well, styles.attention)} data-tars-attention-list={card.attention.length}>
      {card.attention.map((entry) => {
        const { label, text } = describeAttention(row, entry);
        const irreversible = entry.decision && TARS_IRREVERSIBLE_OPERATIONS.has(entry.decision.operation)
          ? <Badge size="sm" tone="danger" variant="outlined" xstyle={styles.attentionEnd} data-tars-decision-risk-tag="">{t("shell:tars.decision.card.risk")}</Badge> : null;
        // A Tars decision's text already says what Tars proposes, so the row keeps one named mark instead of repeating a label.
        if (entry.item.kind === "tars-decision") {
          return <li key={entry.item.id} className={sx(styles.attentionRow, styles.attentionInline)} data-tars-attention={entry.item.kind}>
            <span className={sx(styles.attentionMarkBox)}><StatusDot tone="warning" size="sm" aria-label={label} xstyle={monitorStyles.attentionMark} data-tars-attention-mark="" /></span>
            {text ? <span className={sx(styles.attentionText, styles.attentionInlineText)}>{text}</span> : null}
            {irreversible}
          </li>;
        }
        // One state tag per card: what needs the user reads as a marked label, not a second tag.
        return <li key={entry.item.id} className={sx(styles.attentionRow)} data-tars-attention={entry.item.kind}>
          <span className={sx(styles.attentionHead)}>
            <StatusDot tone="warning" size="sm" xstyle={monitorStyles.attentionMark} />
            <span className={sx(monitorStyles.attentionLabel)}>{label}</span>
            {irreversible}
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
  const grip = sortable ? <Tooltip content={t("shell:tars.tray.reorder.hint")}>
    <Button ref={setHandleElement} variant="ghost" size="icon-2xs" data-tars-queue-grip={row.id}
      aria-label={t("shell:tars.tray.reorder.handle", { title: row.title })}
      aria-keyshortcuts={QUEUE_MOVE_ARIA_KEYS} onKeyDown={onKeyDown}><GripVertical aria-hidden /></Button>
  </Tooltip> : undefined;
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

/** Each output's kind as a glyph; a side-view output wears the side view's own glyph for it. */
const OUTPUT_ICON: Record<TarsOutput["kind"], LucideIcon> = { report: FileText, changes: FileDiff, review: SearchCheck, pullRequest: GitPullRequest, link: Link2 };

/**
 * What finished or running work produced. Every row says its kind with a
 * glyph, then where it opens on the end: the side view beside the
 * conversation, or the browser for a recorded link or pull request. The whole
 * row is the opener, with the quiet hover and the focus ring.
 */
export function TarsOutputList({ outputs, onOpenSide }: { outputs: readonly TarsOutput[]; onOpenSide?: (target: TarsSideViewTarget) => void }) {
  const { t } = useTranslation(["shell"]);
  if (!outputs.length) return <p className={sx(styles.empty)}>{t("shell:tars.tray.emptyLane.outputs")}</p>;
  return <ul className={sx(styles.cards, styles.outputList)} data-tars-outputs="">
    {outputs.map((output, index) => {
      const label = outputLabel(output);
      const KindIcon = OUTPUT_ICON[output.kind];
      const external = output.kind === "link" || output.kind === "pullRequest";
      const opens = t(external ? "shell:tars.tray.outputs.opensExternal" : "shell:tars.tray.outputs.opensSide");
      const content = <>
        <span className={sx(styles.outputGlyph)}><KindIcon aria-hidden className={sx(styles.outputIcon)} /></span>
        <span className={sx(styles.outputText)}>
          <span className={sx(styles.outputLabel)}>{label}</span>
          <span className={sx(styles.outputMeta)}>{output.title}</span>
        </span>
        <span className={sx(styles.outputGlyph)} title={opens}>
          {external ? <ArrowUpRight aria-hidden className={sx(styles.outputIcon)} /> : <PanelRight aria-hidden className={sx(styles.outputIcon)} />}
        </span>
        {/* The side-view button is named by its label; a link reads its text, so it says where it opens in words. */}
        {external ? <VisuallyHidden>{opens}</VisuallyHidden> : null}
      </>;
      return <li key={`${output.responsibilityId}:${output.kind}:${index}`} className={sx(styles.cardItem, styles.outputItem, styles.output)} data-tars-output={output.kind}
        data-tars-output-opens={external ? "external" : "side"}>
        {external
          ? <ExternalAnchor href={output.url} xstyle={[focusRing.ring, transition.colors, styles.outputRow]}>{content}</ExternalAnchor>
          : <Button variant="ghost" size="sm" layout="host" xstyle={styles.outputRow} disabled={!onOpenSide}
            aria-label={t("shell:tars.tray.outputs.open", { label, title: output.title })}
            onClick={() => onOpenSide?.({ responsibilityId: output.responsibilityId, kind: OUTPUT_KIND[output.kind] })}>{content}</Button>}
      </li>;
    })}
  </ul>;
}

/** One lane's sticky header: the chevron leading, the lane's name and count, then its Clear and Undo. */
function TarsLaneHeader({ lane, count, open, surface, tools }: { lane: TarsTrayLaneId; count: number; open: boolean; surface: TarsTraySurface; tools?: ReactNode }) {
  const { t } = useTranslation(["shell"]);
  return <div className={sx(styles.laneHead, surface === "raised" ? styles.laneHeadOnRaised : styles.laneHeadOnCanvas)} data-tars-lane-head={lane}>
    <Accordion.Header xstyle={styles.laneHeader}>
      <Accordion.Trigger xstyle={styles.laneTrigger}>
        <ChevronRight aria-hidden className={sx(styles.chevron, transition.transform, open && styles.chevronOpen)} data-tars-lane-chevron={open ? "open" : "closed"} />
        <span className={sx(styles.sectionTitle, count === 0 && styles.sectionTitleEmpty)} data-tars-lane-empty={count === 0 ? "" : undefined}>
          {t(`shell:tars.tray.lanes.${lane}`)}<span className={sx(styles.sectionCount)} data-tars-lane-count={count}>{count}</span>
        </span>
      </Accordion.Trigger>
    </Accordion.Header>
    {tools}
  </div>;
}

/** What the tray sits on, which its sticky lane headers paint: the view's canvas when pinned, the popover's raised surface otherwise. */
export type TarsTraySurface = "canvas" | "raised";

/**
 * Needs you, In progress and Done, each folding on its own, then the outputs;
 * the conversation beside it never moves. A lane opens by default unless it is
 * Done or empty; once the user folds or opens one, that choice holds for this
 * tray. Lane headers stay pinned while their lane scrolls.
 */
export function TarsTray({ model, actions, outputs, clearing, surface = "canvas" }: {
  model: TarsTrayModel; actions: TarsTrayActions; outputs?: readonly TarsOutput[]; clearing?: TarsTrayClearing; surface?: TarsTraySurface;
}) {
  const { t } = useTranslation(["shell"]);
  // Only what the user chose is kept; every other lane follows the default rule as its count changes.
  const [chosen, setChosen] = useState<Partial<Record<TarsTrayLaneId, boolean>>>({});
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
  const counts: Partial<Record<TarsTrayLaneId, number>> = Object.fromEntries(LANES.map((lane) => [lane, tarsTrayLaneCount(model.counts, lane)]));
  if (outputs) counts.outputs = outputs.length;
  const isOpen = (lane: TarsTrayLaneId) => chosen[lane] ?? (OPEN_LANES.includes(lane) && (counts[lane] ?? 0) > 0);
  const lanes: TarsTrayLaneId[] = outputs ? [...LANES, "outputs"] : [...LANES];
  const value = lanes.filter(isOpen);
  const onValueChange = (next: unknown[]) => setChosen((previous) => {
    const updated = { ...previous };
    for (const lane of lanes) if (next.includes(lane) !== value.includes(lane)) updated[lane] = next.includes(lane);
    return updated;
  });
  return <Accordion.Root multiple value={value} onValueChange={onValueChange} data-tars-tray="">
    {LANES.map((lane) => {
      const cards = model.lanes[lane];
      const count = counts[lane] ?? 0;
      return <Accordion.Item key={lane} value={lane} data-tars-tray-lane={lane}>
        <TarsLaneHeader lane={lane} count={count} open={isOpen(lane)} surface={surface}
          tools={lane === "done" && clearing ? <TarsLaneTools scope="done" clearing={clearing} /> : undefined} />
        <Accordion.Panel>
          {lane === "done" && clearing ? <TarsLaneNote scope="done" clearing={clearing} /> : null}
          {cards.length ? <ul className={sx(styles.cards)}>
            {cards.map((card) => card.queue ? <TarsQueuedCardItem key={card.row.id} card={card} actions={actions} sortable={sortable} />
              : <li key={card.row.id} className={sx(styles.cardItem)}><TarsTrayCard card={card} actions={actions} /></li>)}
          </ul> : lane === "done" && clearing?.done.hidden ? null : <p className={sx(styles.empty)}>{t(`shell:tars.tray.emptyLane.${lane}`)}</p>}
        </Accordion.Panel>
      </Accordion.Item>;
    })}
    {outputs ? <Accordion.Item value="outputs" data-tars-tray-lane="outputs">
      <TarsLaneHeader lane="outputs" count={outputs.length} open={isOpen("outputs")} surface={surface}
        tools={clearing ? <TarsLaneTools scope="outputs" clearing={clearing} /> : undefined} />
      <Accordion.Panel>
        {clearing ? <TarsLaneNote scope="outputs" clearing={clearing} /> : null}
        {!outputs.length && clearing?.outputs.hidden ? null : <TarsOutputList outputs={outputs} onOpenSide={actions.onOpenSide} />}
      </Accordion.Panel>
    </Accordion.Item> : null}
  </Accordion.Root>;
}
