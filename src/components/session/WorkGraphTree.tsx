import { getWorkGraphFallbackLabel } from "@/lib/work-graph/work-graph-tree";
import { i18n, useTranslation } from "@/i18n";
import { AgentIdentity } from "@/components/delegation/AgentIdentity";
import { transition } from "@/components/ads/recipes/transition";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { disclosureChevron } from "@/components/ads/recipes/disclosure-chevron";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { createTreeKeyDownHandler } from "@/components/ads/components/Tree.keyboard";
import {
  flattenVisibleTree,
  type TreeFlatNode,
  type TreeNode,
} from "@/components/ads/components/Tree.model";
import { useCancelableTimeout } from "@/components/ads/utils/pointer-gesture";
import {
  memo,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Hand,
  MessageSquare,
  Square,
  type LucideIcon,
} from "lucide-react";
import { StateMark } from "@/components/ads/components/StateMark";
import { formatTurnActivityElapsedSeconds } from "@/components/session/turn-activity.utils";
import {
  describeExchangeStatus,
  exchangeStatusFromWorkGraphStatus,
  exchangeStatusToWorkState,
} from "@/lib/delegation/format";
import { Button } from "@/components/ui";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx, cx } from "@/components/ads/utils/stylex";
import { workGraphTreeStyles as styles } from "./work-graph-tree.styles";
import type { ProviderWorkGraphCapabilities } from "@/lib/providers/provider.types";
import { createEmptyProviderRuntimeCapabilities } from "@/lib/providers/runtime-capabilities";
import {
  buildWorkGraphTree,
  collectLiveWorkGraphIdentities,
  countWorkGraphDescendants,
  countWorkGraphRows,
  nestWorkGraphTreeRows,
  resolveWorkGraphControls,
  type WorkGraphControl,
  type WorkGraphTreeBranch,
  type WorkGraphTreeRow,
} from "@/lib/work-graph/work-graph-tree";
import {
  isTerminalWorkGraphStatus,
  type AgentNode,
  type WorkGraph,
} from "@/lib/work-graph/work-graph.types";

/**
 * The turn's agents drawn as the tree they actually form, next to the flat
 * shelf that lists what happened in order.
 *
 * The shelf answers "what is going on right now"; this answers "who is working
 * for whom", which is the only question a nested delegation makes anyone ask.
 * It borrows the shelf's icons, tones, and badge shape wholesale — a second
 * visual vocabulary for the same six statuses would make two views of one turn
 * look like two different turns.
 *
 * It is an APG treeview: a flat `ul role="tree"` of `treeitem` rows carrying
 * `aria-level` / `aria-posinset` / `aria-setsize` / `aria-expanded`, one
 * tabbable row (roving tabindex), and the ADS `Tree` key map — the same
 * `Tree.keyboard` handler and `Tree.model` flattening the ADS `Tree` renders
 * with. It does not render `Tree` itself because an agent row is a two-line
 * card with its own controls, which the file-explorer row (one fixed-height
 * line) cannot hold. Enter and Space run the row's action — open its activity
 * or show it in the conversation — when it has one, and otherwise fold the
 * branch; Right and Left always fold.
 */

/** Per depth level, so a child reads as owned by the row above it. */
const WORK_GRAPH_INDENT_PX = 14;
/** Root rows align their status mark with the section heading; depth owns the inset. */
const WORK_GRAPH_ROW_INSET_PX = 0;

const WORK_GRAPH_CONTROL_ICONS: Record<WorkGraphControl, LucideIcon> = {
  message: MessageSquare,
  interrupt: Hand,
  stop: Square,
};

const WORK_GRAPH_CONTROL_LABELS: Record<WorkGraphControl, string> = {
  get message() { return i18n.t("session:workGraphTree.message"); },
  get interrupt() { return i18n.t("session:workGraphTree.interrupt"); },
  get stop() { return i18n.t("session:workGraphTree.stop"); },
};

/**
 * Fail closed while a provider's capabilities are still unresolved: no runtime
 * claim means no control, which is the same answer the resolver gives.
 */
export const NO_WORK_GRAPH_CAPABILITIES: ProviderWorkGraphCapabilities =
  createEmptyProviderRuntimeCapabilities().workGraph;

const NO_LIVE_IDENTITIES: ReadonlySet<string> = new Set<string>();
const NO_TYPEAHEAD_MOVES = () => {};

export interface WorkGraphControlRequest {
  control: WorkGraphControl;
  node: AgentNode;
}

export interface WorkGraphTreeProps {
  graph: WorkGraph | null | undefined;
  /** Shared shelf clock; completed turns pass their frozen completion time. */
  now: number;
  capabilities: ProviderWorkGraphCapabilities;
  /**
   * Optional because a surface may render the tree with no controls at all —
   * no runtime implements per-agent steering, so only ledger-owned children
   * have anything to click.
   */
  onControl?: (request: WorkGraphControlRequest) => void;
  /** Reveal the spawning tool call in the transcript when the graph knows it. */
  onInspectAgent?: (node: AgentNode) => void;
  onSelectTool?: (toolUseId: string) => void;
  /** Hidden when a host block already titles the tree (the Agents block). */
  showHeading?: boolean;
  /**
   * Why a control the reader just used did not take effect, per node.
   *
   * A refusal is the expected outcome of a stop prepared against an identity
   * that has since moved on, so the row it was clicked on is where it has to
   * appear; sending the reader elsewhere to find out is the same as not saying.
   */
  controlErrorByNodeKey?: Readonly<Record<string, string>>;
  /** Wrap labels and details instead of clipping them to one or two lines. */
  expandCopy?: boolean;
  className?: string;
}

/**
 * Keep one Set instance while its members stay the same, so memoized rows that
 * read it do not re-render on every graph event that leaves liveness alone.
 */
function useStableIdentitySet(next: ReadonlySet<string>): ReadonlySet<string> {
  const ref = useRef(next);
  const current = ref.current;
  if (current !== next) {
    const same =
      current.size === next.size && [...next].every((id) => current.has(id));
    if (!same) {
      ref.current = next;
    }
  }
  return ref.current;
}

function toTreeNodes(branches: readonly WorkGraphTreeBranch[]): TreeNode[] {
  return branches.map((branch) => ({
    id: branch.id,
    label: branch.label,
    ...(branch.children ? { children: toTreeNodes(branch.children) } : {}),
  }));
}

function indexBranches(
  branches: readonly WorkGraphTreeBranch[],
  into: Map<string, WorkGraphTreeBranch>,
) {
  for (const branch of branches) {
    into.set(branch.id, branch);
    if (branch.children) indexBranches(branch.children, into);
  }
  return into;
}

export const WorkGraphTree = memo(function WorkGraphTree(
  props: WorkGraphTreeProps,
) {
  useTranslation();
  const graph = props.graph ?? null;
  const rows = useMemo(() => (graph ? buildWorkGraphTree(graph) : []), [graph]);
  const [showCompleted, setShowCompleted] = useState(false);
  const treeId = useId();
  const headingId = useId();
  const liveIdentities = useStableIdentitySet(
    useMemo(
      () => (graph ? collectLiveWorkGraphIdentities(graph) : NO_LIVE_IDENTITIES),
      [graph],
    ),
  );
  const collapsibleCompletedKeys = useMemo(() => {
    const keys = new Set(
      rows
        .filter(
          (row) =>
            row.node.status === "completed" || row.node.status === "cancelled",
        )
        .map((row) => row.key),
    );
    if (!graph || keys.size === 0 || keys.size === rows.length) {
      return new Set<string>();
    }

    // A completed parent remains visible while a live or failed descendant
    // still needs its place in the tree to explain ownership.
    for (const row of rows) {
      if (keys.has(row.key)) {
        continue;
      }
      let ancestorKey = row.node.parentKey;
      while (ancestorKey && ancestorKey !== graph.rootKey) {
        keys.delete(ancestorKey);
        ancestorKey = graph.nodesByKey[ancestorKey]?.parentKey ?? null;
      }
    }
    return keys;
  }, [graph, rows]);
  // Finished branches leave the tree until the reader asks for them; shown,
  // they return to their own place in it rather than piling up at the end.
  const shownRows = useMemo(
    () =>
      showCompleted
        ? rows
        : rows.filter((row) => !collapsibleCompletedKeys.has(row.key)),
    [collapsibleCompletedKeys, rows, showCompleted],
  );
  const rowByKey = useMemo(
    () => new Map(shownRows.map((row) => [row.key, row] as const)),
    [shownRows],
  );
  const branches = useMemo(
    () =>
      nestWorkGraphTreeRows(shownRows, (row) =>
        getWorkGraphFallbackLabel(row.node.label),
      ),
    // Labels are translated fallbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shownRows, i18n.language],
  );
  const items = useMemo(() => toTreeNodes(branches), [branches]);
  const branchById = useMemo(
    () => indexBranches(branches, new Map()),
    [branches],
  );
  const counts = useMemo(() => countWorkGraphRows(rows), [rows]);

  // Branches are open unless folded, so an agent that streams in under a
  // parent the reader never touched appears without being asked for.
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const expanded = useMemo(() => {
    const open = new Set<string>();
    for (const [id, branch] of branchById) {
      if (branch.children && !collapsedKeys.has(id)) open.add(id);
    }
    return open;
  }, [branchById, collapsedKeys]);
  const visible = useMemo(
    () => flattenVisibleTree(items, expanded),
    [expanded, items],
  );
  const hasBranches = useMemo(
    () => visible.some((item) => item.hasChildren),
    [visible],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const rovingId = useMemo(() => {
    if (activeId && visible.some((item) => item.id === activeId)) {
      return activeId;
    }
    return visible[0]?.id ?? null;
  }, [activeId, visible]);

  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const registerRef = useCallback((id: string, element: HTMLLIElement | null) => {
    if (element) {
      itemRefs.current.set(id, element);
    } else {
      itemRefs.current.delete(id);
    }
  }, []);
  const toggle = useCallback((id: string) => {
    setCollapsedKeys((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // The row action reads the latest callbacks through a ref so the memoized
  // rows can hold one stable handler for the life of the tree.
  const actionRef = useRef({
    onInspectAgent: props.onInspectAgent,
    onSelectTool: props.onSelectTool,
    rowByKey,
  });
  actionRef.current = {
    onInspectAgent: props.onInspectAgent,
    onSelectTool: props.onSelectTool,
    rowByKey,
  };
  const activateRow = useCallback((id: string) => {
    const { onInspectAgent, onSelectTool, rowByKey: lookup } = actionRef.current;
    const node = lookup.get(id)?.node;
    if (!node) return false;
    if (onInspectAgent) {
      onInspectAgent(node);
      return true;
    }
    if (onSelectTool && node.spawnedByToolUseId) {
      onSelectTool(node.spawnedByToolUseId);
      return true;
    }
    return false;
  }, []);

  const typeaheadState = useRef({ buffer: "" }).current;
  const scheduleBufferReset = useCancelableTimeout();
  const treeKeyDown = createTreeKeyDownHandler({
    announceMove: NO_TYPEAHEAD_MOVES,
    editingId: null,
    expanded,
    expandSiblings: (item: TreeFlatNode) => {
      setCollapsedKeys((current) => {
        const next = new Set(current);
        for (const sibling of visible) {
          if (sibling.parentId === item.parentId && sibling.hasChildren) {
            next.delete(sibling.id);
          }
        }
        return next;
      });
    },
    focusNode: (id: string) => {
      setActiveId(id);
      itemRefs.current.get(id)?.focus();
    },
    items,
    rovingId,
    scheduleBufferReset,
    select: () => {},
    startRename: () => {},
    toggle,
    typeaheadState,
    visible,
  });
  const keyDownRef = useRef(treeKeyDown);
  keyDownRef.current = (event: KeyboardEvent<HTMLLIElement>) => {
    // Keys pressed on a row's own controls belong to those controls.
    if (event.target !== event.currentTarget) return;
    if ((event.key === "Enter" || event.key === " ") && rovingId) {
      if (activateRow(rovingId)) {
        event.preventDefault();
        return;
      }
    }
    treeKeyDown(event);
  };
  const onRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLLIElement>) => keyDownRef.current(event),
    [],
  );

  // A turn without delegated agents renders nothing at all: an empty labelled
  // section would add a heading and a border to say "no news".
  if (rows.length === 0) {
    return null;
  }

  const showHeading = props.showHeading !== false;
  const summary = [
    i18n.t("session:workGraphTree.summaryRunning", { count: counts.runningCount }),
    i18n.t("session:workGraphTree.summaryNeedsYou", { count: counts.blockedCount }),
    i18n.t("session:workGraphTree.summaryFailed", { count: counts.failedCount }),
  ].join(" · ");

  return (
    <div
      className={cx(sx(styles.root), props.className)}
      data-testid="work-graph-tree"
    >
      {showHeading ? (
        <div className={sx(styles.headingRow)}>
          <h3 id={headingId} className={sx(styles.heading)}>
            {i18n.t("session:workGraphTree.workGraphTree")}
          </h3>
          <p
            aria-live="polite"
            className={sx(styles.summary)}
            data-testid="work-graph-summary"
          >
            {summary}
          </p>
        </div>
      ) : null}
      <ul
        id={treeId}
        role="tree"
        className={sx(styles.list)}
        {...(showHeading
          ? { "aria-labelledby": headingId }
          : { "aria-label": i18n.t("session:workGraphTree.ariaLabel") })}
      >
        {visible.map((item) => {
          const row = rowByKey.get(item.id);
          if (!row) return null;
          const branch = branchById.get(item.id);
          const isExpanded = item.hasChildren && expanded.has(item.id);
          return (
            <WorkGraphTreeNodeRow
              key={row.key}
              row={row}
              item={item}
              isExpanded={isExpanded}
              isRoving={item.id === rovingId}
              hiddenDescendantCount={
                item.hasChildren && !isExpanded && branch
                  ? countWorkGraphDescendants(branch)
                  : 0
              }
              reserveDisclosure={hasBranches}
              // A finished agent's clock is frozen; only live rows tick.
              now={isTerminalWorkGraphStatus(row.node.status) ? 0 : props.now}
              capabilities={props.capabilities}
              liveIdentities={liveIdentities}
              onControl={props.onControl}
              revealable={Boolean(
                props.onInspectAgent ||
                  (props.onSelectTool && row.node.spawnedByToolUseId),
              )}
              inspects={Boolean(props.onInspectAgent)}
              controlError={props.controlErrorByNodeKey?.[row.key] ?? null}
              expandCopy={props.expandCopy}
              onActivate={activateRow}
              onToggle={toggle}
              onFocusRow={setActiveId}
              onKeyDown={onRowKeyDown}
              registerRef={registerRef}
            />
          );
        })}
      </ul>
      {collapsibleCompletedKeys.size > 0 ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className={sx(styles.completedToggle)}
          aria-expanded={showCompleted}
          aria-controls={treeId}
          aria-label={i18n.t("session:workGraphTree.ariaLabel2", { value1: showCompleted ? i18n.t("session:workGraphTree.extraCopy130") : i18n.t("session:workGraphTree.extraCopy131"), value2: collapsibleCompletedKeys.size })}
          data-testid="work-graph-completed-toggle"
          onClick={() => setShowCompleted((current) => !current)}
        >
          {showCompleted ? (
            <ChevronDown className={sx(styles.toggleIcon)} aria-hidden="true" />
          ) : (
            <ChevronRight
              className={sx(styles.toggleIcon)}
              aria-hidden="true"
            />
          )}
          {collapsibleCompletedKeys.size} {i18n.t("session:workGraphTree.workGraphTree2")}</Button>
      ) : null}
    </div>
  );
});

interface WorkGraphTreeNodeRowProps {
  row: WorkGraphTreeRow;
  item: TreeFlatNode;
  isExpanded: boolean;
  isRoving: boolean;
  /** Agents under a folded branch, named on the fold so it says what it hides. */
  hiddenDescendantCount: number;
  /** The tree has a branch, so leaf rows keep the disclosure column. */
  reserveDisclosure: boolean;
  now: number;
  capabilities: ProviderWorkGraphCapabilities;
  liveIdentities: ReadonlySet<string>;
  onControl?: (request: WorkGraphControlRequest) => void;
  revealable: boolean;
  /** The row opens activity details rather than the conversation. */
  inspects: boolean;
  controlError?: string | null;
  expandCopy?: boolean;
  onActivate: (id: string) => boolean;
  onToggle: (id: string) => void;
  onFocusRow: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void;
  registerRef: (id: string, element: HTMLLIElement | null) => void;
}

/**
 * Rows are rebuilt on every graph event, but a node object is replaced only
 * when that node changed, so comparing the node (and the row facts derived
 * around it) keeps an unrelated agent's event from re-rendering this row.
 */
function areRowPropsEqual(
  previous: WorkGraphTreeNodeRowProps,
  next: WorkGraphTreeNodeRowProps,
) {
  for (const key of Object.keys(next) as (keyof WorkGraphTreeNodeRowProps)[]) {
    if (key === "row" || key === "item") continue;
    if (previous[key] !== next[key]) return false;
  }
  return (
    previous.row.node === next.row.node &&
    previous.row.depth === next.row.depth &&
    previous.row.blocked === next.row.blocked &&
    previous.item.level === next.item.level &&
    previous.item.posinset === next.item.posinset &&
    previous.item.setsize === next.item.setsize &&
    previous.item.hasChildren === next.item.hasChildren
  );
}

const WorkGraphTreeNodeRow = memo(function WorkGraphTreeNodeRow({
  row,
  item,
  isExpanded,
  isRoving,
  hiddenDescendantCount,
  reserveDisclosure,
  now,
  capabilities,
  liveIdentities,
  onControl,
  revealable,
  inspects,
  controlError,
  expandCopy,
  onActivate,
  onToggle,
  onFocusRow,
  onKeyDown,
  registerRef,
}: WorkGraphTreeNodeRowProps) {
  useTranslation();
  const { node } = row;
  const labelId = useId();
  const statusId = useId();
  const detailId = useId();
  const hintId = useId();
  const displayLabel = getWorkGraphFallbackLabel(node.label);
  const controls = resolveWorkGraphControls({
    node,
    capabilities,
    liveIdentities,
  });
  // A person is the critical path here, whatever the runtime still reports the
  // node's own status as. Read through the exchange vocabulary, so the tree and
  // the delegation rows give one node the same mark and word.
  const exchangeStatus = exchangeStatusFromWorkGraphStatus(node.status, { blocked: row.blocked });
  const detail = node.reason ?? node.progress.at(-1);
  const title = [displayLabel, detail, controls.reason]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const elapsedSeconds =
    (isTerminalWorkGraphStatus(node.status)
      ? (node.completedAt ?? node.updatedAt)
      : now) - node.startedAt;
  const elapsedLabel = formatTurnActivityElapsedSeconds(elapsedSeconds / 1_000);
  const statusLabel = describeExchangeStatus(exchangeStatus).label;
  const hasChildren = item.hasChildren;
  const describedBy = [
    detail ? detailId : null,
    hiddenDescendantCount > 0 ? hintId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      ref={(element) => registerRef(row.key, element)}
      role="treeitem"
      aria-level={item.level}
      aria-posinset={item.posinset}
      aria-setsize={item.setsize}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-labelledby={`${labelId} ${statusId}`}
      aria-describedby={describedBy || undefined}
      tabIndex={isRoving ? 0 : -1}
      data-work-graph-node-key={node.key}
      data-work-graph-depth={row.depth}
      data-work-graph-blocked={row.blocked ? "true" : undefined}
      data-work-graph-revealable={revealable ? "true" : undefined}
      title={
        revealable
          ? `${title} — ${inspects ? i18n.t("session:workGraphTree.extraCopy132") : i18n.t("session:workGraphTree.extraCopy133")}`
          : title
      }
      className={sx(
        styles.row,
        transition.colors,
        focusRing.ring,
        focusRing.ringInset,
        revealable && styles.rowRevealable,
      )}
      // Depth is unbounded, so the indent cannot come from a static class list.
      style={{
        paddingInlineStart:
          WORK_GRAPH_ROW_INSET_PX + row.depth * WORK_GRAPH_INDENT_PX,
      }}
      onClick={revealable ? () => onActivate(row.key) : undefined}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocusRow(row.key);
      }}
      onKeyDown={onKeyDown}
    >
      <div className={sx(styles.content)}>
        {/* The chevron shares the status mark's first-line box, so a folded
            branch and a leaf at the same depth start their marks in one
            column. A pointer target only: Right/Left fold from the keyboard. */}
        {hasChildren ? (
          <span
            aria-hidden="true"
            data-work-graph-disclosure="true"
            className={sx(styles.disclosure, styles.disclosureInteractive)}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(row.key);
            }}
          >
            <ChevronRight
              className={sx(
                styles.disclosureIcon,
                disclosureChevron.base,
                isExpanded && disclosureChevron.openQuarter,
              )}
            />
          </span>
        ) : reserveDisclosure ? (
          <span aria-hidden="true" className={sx(styles.disclosure)} />
        ) : null}
        <span className={sx(styles.statusIconWrap)}>
          <StateMark
            state={exchangeStatusToWorkState(exchangeStatus)}
            size="md"
            label={statusLabel}
          />
        </span>
        <div className={sx(styles.body)}>
          <p
            className={sx(
              styles.labelLine,
              expandCopy && styles.labelLineExpanded,
              isTerminalWorkGraphStatus(node.status) && styles.labelLineTerminal,
            )}
          >
            <span
              id={labelId}
              className={sx(styles.label, expandCopy && styles.labelExpanded)}
            >
              {displayLabel}
            </span>
            <AgentIdentity compact model={node.model} effort={node.effort} />
            {node.modelEvidence ? <span className={sx(styles.badge)}>{node.modelEvidence}</span> : null}
            {node.badge ? (
              <span className={sx(styles.badge, styles.badgeNeutral)}>
                {node.badge}
              </span>
            ) : null}
            {row.blocked ? (
              <span className={sx(styles.badge, styles.badgeWarning)}>
                {i18n.t("session:workGraphTree.body")}</span>
            ) : null}
          </p>
          {detail ? (
            <p
              id={detailId}
              className={sx(styles.detail, expandCopy && styles.detailExpanded)}
            >
              {detail}
            </p>
          ) : null}
          {hiddenDescendantCount > 0 ? (
            <p
              id={hintId}
              data-work-graph-fold-hint="true"
              className={sx(styles.foldHint)}
              onClick={(event) => {
                event.stopPropagation();
                onToggle(row.key);
              }}
            >
              {i18n.t("session:workGraphTree.showSubagents", {
                count: hiddenDescendantCount,
                label: displayLabel,
              })}
            </p>
          ) : null}
          {controlError ? (
            <p
              role="status"
              data-testid="work-graph-control-error"
              className={sx(styles.controlError)}
            >
              {controlError}
            </p>
          ) : null}
        </div>
        <span className={sx(styles.elapsed)}>
          <VisuallyHidden id={statusId}>
            {statusLabel}, {elapsedLabel} {i18n.t("session:workGraphTree.body2")}</VisuallyHidden>
          <span aria-hidden="true">{elapsedLabel}</span>
        </span>
      </div>
      {controls.available.length > 0 ? (
        // The controls sit inside the row, so their clicks and keys must not
        // also activate it or move the tree's focus.
        <span
          className={sx(styles.controls)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {controls.available.map((control) => {
            const Icon = WORK_GRAPH_CONTROL_ICONS[control];
            return (
              <Tooltip key={control} content={WORK_GRAPH_CONTROL_LABELS[control]}>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  // One tab stop per tree: a row's controls join the order only
                  // while that row holds it.
                  tabIndex={isRoving ? 0 : -1}
                  aria-label={i18n.t("session:workGraphTree.controlAgent", { control: WORK_GRAPH_CONTROL_LABELS[control], agent: displayLabel })}
                  onClick={() => onControl?.({ control, node })}
                >
                  <Icon className={sx(styles.controlIcon)} aria-hidden="true" />
                </Button>
              </Tooltip>
            );
          })}
        </span>
      ) : controls.reason ? (
        // No button to disable, so the explanation carries the whole message:
        // the row's tooltip shows it, and this keeps it reachable without one.
        <VisuallyHidden>{controls.reason}</VisuallyHidden>
      ) : null}
    </li>
  );
}, areRowPropsEqual);
