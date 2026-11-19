import { TarsCleanupEntry } from "./TarsBatchCard";
import { ReportArtifactLink } from "@/components/agent-runs/ReportArtifactLink";
import { isLocalPreviewUrl, savedHtmlReference } from "@/lib/agent-runs/artifacts";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUpRight, ChevronRight, FileDiff, FileText, FolderTree, GitPullRequest, GripVertical, Link2, PanelRight, SearchCheck, type LucideIcon } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button, ExternalAnchor } from "@/components/ui";
import { Accordion } from "@/components/aui/components/Accordion";
import { Popover } from "@/components/aui/components/Popover";
import { StatusDot } from "@/components/aui/components/StatusDot";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { Toggle } from "@/components/aui/components/Toggle";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { textWrap } from "@/components/aui/recipes/text-wrap";
import { transition } from "@/components/aui/recipes/transition";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsLane } from "@/lib/tars/attention";
import type { TarsQueueMove, TarsQueueMoveSource } from "@/lib/tars/conversation";
import { tarsQueueDropMove } from "@/lib/tars/queue-order";
import { SortableDropIndicator, useSortableListMonitor, useSortableRow } from "@/hooks/use-sortable-list";
import { tarsQueueMoves, type TarsTrayCard as TarsTrayCardModel, type TarsTrayDecision, type TarsTrayModel, type TarsTrayStatus } from "@/lib/tars/tray-model";
import type { TarsControlOperation, TarsResponsibility } from "@/lib/tars/types";
import type { TarsOutput } from "@/lib/tars/outputs-model";
import type { TarsSideViewKind, TarsSideViewTarget } from "@/lib/tars/side-view";
import type { FleetFocusTarget } from "@/store/fleet-focus-store";
import { tarsTrayStyles as styles } from "./tars-tray.styles";
import { TarsTrayCard } from "./TarsWorkCard";
import { useAppStore } from "@/store/app.store";
import { groupTarsTrayItems, type TarsTrayProject } from "@/lib/tars/tray-projects";
import { tarsClearStyles as clearStyles } from "./tars-clear.styles";

export { stateTone } from "./TarsRunMonitor";
export { TarsCardActions, TarsTrayCard } from "./TarsWorkCard";

/** Every tray control goes through the view's host action path; opening and folding are view-only. */
export interface TarsTrayActions {
  busy: boolean;
  onFollowUp?: (row: TarsResponsibility) => void;
  onAct: (row: TarsResponsibility, operation: TarsControlOperation) => void;
  onConfirm: (decision: TarsTrayDecision) => void;
  onOpenTask: (row: TarsResponsibility) => void;
  /** Shows the work's waiting decision card in the conversation, where it is answered; absent, such a card offers Open task. */
  onAnswer?: (row: TarsResponsibility) => void;
  onShowInFleet: (target: FleetFocusTarget) => void;
  /** Opens the side view; absent where there is none (a card then has no report, request or timeline link). */
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
  if (!lane.clearable && !lane.onUndo && !(scope === "done" && typeof window !== "undefined" && window.api?.tars?.batch)) return null;
  const label = t(scope === "done" ? "shell:tars.clear.lane.clearDone" : "shell:tars.clear.lane.clearOutputs");
  return <div className={sx(clearStyles.laneActions)} data-tars-lane-tools={scope}>
    {scope === "done" ? <TarsCleanupEntry /> : null}
    {lane.onUndo ? <Button variant="ghost" size="xs" disabled={clearing.busy} data-tars-lane-undo={scope} onClick={lane.onUndo}>{t("shell:tars.clear.undo")}</Button> : null}
    {lane.clearable ? <Button variant="ghost" size="xs" disabled={clearing.busy} aria-label={label} title={label} data-tars-lane-clear={scope}
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
export function TarsTrayToggle({ pinned, counts, status = "ready", outputs = 0, open, onOpenChange, panelId, children, headerActions }: {
  pinned: boolean; counts: TarsTrayModel["counts"]; status?: TarsTrayStatus; outputs?: number; open: boolean; onOpenChange: (open: boolean) => void; panelId: string; children: ReactNode; headerActions?: ReactNode;
}) {
  const { t } = useTranslation(["shell"]);
  if (pinned) {
    // The pinned tray is removed while folded, so the indicator points at it only while it is there.
    return <Button variant="secondary" size="sm" aria-expanded={open} aria-controls={open ? panelId : undefined} title={t(open ? "shell:tars.tray.indicator.hide" : "shell:tars.tray.indicator.show")}
      onClick={() => onOpenChange(!open)}><IndicatorLabel counts={counts} status={status} outputs={outputs} /></Button>;
  }
  return <Popover open={open} onOpenChange={onOpenChange} trigger={<IndicatorLabel counts={counts} status={status} outputs={outputs} />} triggerProps={{ size: "sm" }} placement="bottom-end"
    padding={false} title={t("shell:tars.tray.title")} headerActions={headerActions} xstyle={styles.popover}>
    <div id={panelId} className={sx(styles.popoverBody, textWrap.keepAll)}>{children}</div>
  </Popover>;
}

/**
 * A queued card in the queue's drag-and-drop list. Its grip, leading the
 * card's state line, is the drag handle and, focused, the keyboard handle:
 * Alt+ArrowUp and Alt+ArrowDown do what Do first and Do later in its detail's
 * menu do.
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
    <Button ref={setHandleElement} variant="ghost" size="icon-xs" data-tars-queue-grip={row.id}
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
      const saved = output.kind === "link" && savedHtmlReference(output.url);
      const external = !saved && (output.kind === "link" || output.kind === "pullRequest");
      const opens = saved ? i18n.t("agentRuns:artifacts.saved") : t(external ? "shell:tars.tray.outputs.opensExternal" : "shell:tars.tray.outputs.opensSide");
      const content = <>
        <span className={sx(styles.outputGlyph)}><KindIcon aria-hidden className={sx(styles.outputIcon)} /></span>
        <span className={sx(styles.outputText)}>
          <span className={sx(styles.outputLabel)}>{label}</span>
          <span className={sx(styles.outputMeta)}>{output.title}{saved ? ` · ${i18n.t("agentRuns:artifacts.saved")}` : output.kind === "link" && isLocalPreviewUrl(output.url) ? ` · ${i18n.t("agentRuns:artifacts.liveLink")}` : ""}</span>
        </span>
        <span className={sx(styles.outputGlyph)} title={opens}>
          {external ? <ArrowUpRight aria-hidden className={sx(styles.outputIcon)} /> : <PanelRight aria-hidden className={sx(styles.outputIcon)} />}
        </span>
        {/* The side-view button is named by its label; a link reads its text, so it says where it opens in words. */}
        {external ? <VisuallyHidden>{opens}</VisuallyHidden> : null}
      </>;
      return <li key={`${output.responsibilityId}:${output.kind}:${index}`} className={sx(styles.cardItem, styles.outputItem, styles.output)} data-tars-output={output.kind}
        data-tars-output-opens={saved ? "saved" : external ? "external" : "side"}>
        {output.kind === "link" ? <ReportArtifactLink link={output} xstyle={[focusRing.ring, transition.colors, styles.outputRow]}>{content}</ReportArtifactLink> : output.kind === "pullRequest"
          ? <ExternalAnchor href={output.url} xstyle={[focusRing.ring, transition.colors, styles.outputRow]}>{content}</ExternalAnchor>
          : <Button variant="ghost" size="sm" layout="host" xstyle={styles.outputRow} disabled={!onOpenSide}
            aria-label={t("shell:tars.tray.outputs.open", { label, title: output.title })}
            onClick={() => onOpenSide?.({ responsibilityId: output.responsibilityId, agentRunId: output.agentRunId, kind: OUTPUT_KIND[output.kind] })}>{content}</Button>}
      </li>;
    })}
  </ul>;
}

/** A project disclosure counts work cards (or outputs), independently of attention-row counts. */
function TarsProjectGroups<T>({ items, pathOf, projects, render }: {
  items: readonly T[]; pathOf: (item: T) => string | null | undefined; projects: readonly TarsTrayProject[]; render: (items: T[]) => ReactNode;
}) {
  const { t } = useTranslation(["shell"]);
  const id = useId();
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  return groupTarsTrayItems(items, pathOf, projects).map((group, index) => {
    const open = !folded.has(group.key);
    const panelId = `${id}-${index}`;
    return <section key={group.key} data-tars-project={group.key}>
      <Button variant="ghost" size="sm" xstyle={styles.projectTrigger} aria-expanded={open} aria-controls={panelId}
        onClick={() => setFolded((previous) => { const next = new Set(previous); if (open) next.add(group.key); else next.delete(group.key); return next; })}>
        <ChevronRight aria-hidden className={sx(styles.chevron, transition.transform, open && styles.chevronOpen)} />
        <span className={sx(styles.projectName)} title={group.key}>{group.label ?? t("shell:tars.tray.grouping.unknown")}</span>
        <span className={sx(styles.sectionCount)} data-tars-project-count={group.items.length}>{group.items.length}</span>
      </Button>
      <div id={panelId} hidden={!open}>{render(group.items)}</div>
    </section>;
  });
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

/** A view-only toggle in the tray's title bar, shared by the panel and popover. */
export function TarsTrayGroupingButton({ grouped, onChange }: { grouped: boolean; onChange: (next: boolean) => void }) {
  const { t } = useTranslation(["shell"]);
  const label = t("shell:tars.tray.grouping.toggle");
  return <Tooltip content={label}><Toggle size="sm" iconOnly pressed={grouped} onPressedChange={onChange}
    data-tars-group-projects="" icon={<FolderTree aria-hidden className={sx(styles.groupingIcon)} />}>
    {label}
  </Toggle></Tooltip>;
}

/**
 * Needs you, In progress and Done, each folding on its own, then the outputs;
 * the conversation beside it never moves. A lane opens by default unless it is
 * Done or empty; once the user folds or opens one, that choice holds for this
 * tray. Lane headers stay pinned while their lane scrolls.
 */
export function TarsTray({ model, actions, outputs, clearing, surface = "canvas", grouped }: {
  model: TarsTrayModel; actions: TarsTrayActions; outputs?: readonly TarsOutput[]; clearing?: TarsTrayClearing; surface?: TarsTraySurface; grouped: boolean;
}) {
  const { t } = useTranslation(["shell"]);
  const registered = useAppStore((state) => state.recentRepositories);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const repositoryName = useAppStore((state) => state.repositoryName);
  const projects = repositoryPath ? [...registered, { repositoryPath, repositoryName: repositoryName ?? "" }] : registered;
  const allCards = Object.values(model.lanes).flat();
  const outputPath = (output: TarsOutput) => allCards.find((card) => card.row.id === output.responsibilityId)?.row.repositoryPath;
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
  const renderCards = (cards: readonly TarsTrayCardModel[]) => <ul className={sx(styles.cards)}>
    {cards.map((card) => card.queue ? <TarsQueuedCardItem key={card.row.id} card={card} actions={actions} sortable={sortable} />
      : <li key={card.row.id} className={sx(styles.cardItem)}><TarsTrayCard card={card} actions={actions} /></li>)}
  </ul>;
  return <Accordion.Root multiple value={value} onValueChange={onValueChange} data-tars-tray="">
    {LANES.map((lane) => {
      const cards = model.lanes[lane];
      const count = counts[lane] ?? 0;
      return <Accordion.Item key={lane} value={lane} data-tars-tray-lane={lane}>
        <TarsLaneHeader lane={lane} count={count} open={isOpen(lane)} surface={surface}
          tools={lane === "done" && clearing ? <TarsLaneTools scope="done" clearing={clearing} /> : undefined} />
        <Accordion.Panel>
          {lane === "done" && clearing ? <TarsLaneNote scope="done" clearing={clearing} /> : null}
          {cards.length ? grouped ? <>
            <TarsProjectGroups items={cards.filter((card) => !card.queue)} pathOf={(card) => card.row.repositoryPath} projects={projects} render={renderCards} />
            {cards.some((card) => card.queue) ? <><p className={sx(styles.empty)}>{t("shell:tars.tray.grouping.queue")}</p>{renderCards(cards.filter((card) => card.queue))}</> : null}
          </> : renderCards(cards) : lane === "done" && clearing?.done.hidden ? null : <p className={sx(styles.empty)}>{t(`shell:tars.tray.emptyLane.${lane}`)}</p>}
        </Accordion.Panel>
      </Accordion.Item>;
    })}
    {outputs ? <Accordion.Item value="outputs" data-tars-tray-lane="outputs">
      <TarsLaneHeader lane="outputs" count={outputs.length} open={isOpen("outputs")} surface={surface}
        tools={clearing ? <TarsLaneTools scope="outputs" clearing={clearing} /> : undefined} />
      <Accordion.Panel>
        {clearing ? <TarsLaneNote scope="outputs" clearing={clearing} /> : null}
        {!outputs.length && clearing?.outputs.hidden ? null : grouped && outputs.length > 0 ? <TarsProjectGroups items={outputs} pathOf={outputPath} projects={projects} render={(items) => <TarsOutputList outputs={items} onOpenSide={actions.onOpenSide} />} /> : <TarsOutputList outputs={outputs} onOpenSide={actions.onOpenSide} />}
      </Accordion.Panel>
    </Accordion.Item> : null}
  </Accordion.Root>;
}
