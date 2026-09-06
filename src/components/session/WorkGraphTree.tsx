import { Button as AdsButton } from "@/components/ads/components/Button";
import { memo, useId, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Hand,
  MessageSquare,
  Square,
  type LucideIcon,
} from "lucide-react";
import {
  getTurnActivityStatusLabel,
  TurnActivityStatusIcon,
} from "@/components/session/turn-activity-status-icon";
import {
  formatTurnActivityElapsedSeconds,
  type TurnActivityRowStatus,
} from "@/components/session/turn-activity.utils";
import { Button } from "@/components/ui";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx, cx } from "@/components/ads/utils/stylex";
import { workGraphTreeStyles as styles } from "./work-graph-tree.styles";
import type { ProviderWorkGraphCapabilities } from "@/lib/providers/provider.types";
import { createEmptyProviderRuntimeCapabilities } from "@/lib/providers/runtime-capabilities";
import {
  buildWorkGraphTree,
  collectLiveWorkGraphIdentities,
  resolveWorkGraphControls,
  type WorkGraphControl,
  type WorkGraphTreeRow,
} from "@/lib/work-graph/work-graph-tree";
import {
  isTerminalWorkGraphStatus,
  type AgentNode,
  type WorkGraph,
  type WorkGraphStatus,
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
 */

/** Per depth level, so a child reads as owned by the row above it. */
const WORK_GRAPH_INDENT_PX = 14;
/** Matches the row's own `px-2`, which the indent replaces on the leading edge. */
const WORK_GRAPH_ROW_INSET_PX = 8;

/**
 * The graph's statuses onto the shelf's. `cancelled` has no shelf equivalent:
 * it neither succeeded nor errored, so it borrows the inert queued circle and
 * renames itself for screen readers rather than claiming a check or an alert.
 */
const WORK_GRAPH_ROW_STATUS: Record<WorkGraphStatus, TurnActivityRowStatus> = {
  pending: "pending",
  running: "running",
  waiting: "waiting",
  completed: "completed",
  failed: "failed",
  cancelled: "pending",
};

const WORK_GRAPH_CONTROL_ICONS: Record<WorkGraphControl, LucideIcon> = {
  message: MessageSquare,
  interrupt: Hand,
  stop: Square,
};

const WORK_GRAPH_CONTROL_LABELS: Record<WorkGraphControl, string> = {
  message: "Message",
  interrupt: "Interrupt",
  stop: "Stop",
};

/** The shelf's badge shape, so a node badge reads as the same kind of tag. */

/**
 * Fail closed while a provider's capabilities are still unresolved: no runtime
 * claim means no control, which is the same answer the resolver gives.
 */
export const NO_WORK_GRAPH_CAPABILITIES: ProviderWorkGraphCapabilities =
  createEmptyProviderRuntimeCapabilities().workGraph;

const NO_LIVE_IDENTITIES: ReadonlySet<string> = new Set<string>();

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
  onSelectTool?: (toolUseId: string) => void;
  /**
   * Why a control the reader just used did not take effect, per node.
   *
   * A refusal is the expected outcome of a stop prepared against an identity
   * that has since moved on, so the row it was clicked on is where it has to
   * appear; sending the reader elsewhere to find out is the same as not saying.
   */
  controlErrorByNodeKey?: Readonly<Record<string, string>>;
  className?: string;
}

export const WorkGraphTree = memo(function WorkGraphTree(
  props: WorkGraphTreeProps,
) {
  const graph = props.graph ?? null;
  const rows = useMemo(() => (graph ? buildWorkGraphTree(graph) : []), [graph]);
  const [showCompleted, setShowCompleted] = useState(false);
  const completedRowsId = useId();
  const liveIdentities = useMemo(
    () => (graph ? collectLiveWorkGraphIdentities(graph) : NO_LIVE_IDENTITIES),
    [graph],
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
  const visibleRows = useMemo(
    () =>
      showCompleted
        ? rows
        : rows.filter((row) => !collapsibleCompletedKeys.has(row.key)),
    [collapsibleCompletedKeys, rows, showCompleted],
  );

  // A turn without delegated agents renders nothing at all: an empty labelled
  // section would add a heading and a border to say "no news".
  if (rows.length === 0) {
    return null;
  }

  return (
    <section
      className={cx(sx(styles.root), props.className)}
      aria-label="Agent tree"
      data-testid="work-graph-tree"
    >
      <h3 className={sx(styles.heading)}>Agent tree</h3>
      <div id={completedRowsId} className={sx(styles.list)}>
        {visibleRows.map((row) => (
          <WorkGraphTreeNodeRow
            key={row.key}
            row={row}
            now={props.now}
            capabilities={props.capabilities}
            liveIdentities={liveIdentities}
            onControl={props.onControl}
            onSelectTool={props.onSelectTool}
            controlError={props.controlErrorByNodeKey?.[row.key] ?? null}
          />
        ))}
      </div>
      {collapsibleCompletedKeys.size > 0 ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className={sx(styles.completedToggle)}
          aria-expanded={showCompleted}
          aria-controls={completedRowsId}
          aria-label={`${showCompleted ? "Hide" : "Show"} ${collapsibleCompletedKeys.size} completed agents`}
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
          {collapsibleCompletedKeys.size} done
        </Button>
      ) : null}
    </section>
  );
});

const WorkGraphTreeNodeRow = memo(function WorkGraphTreeNodeRow({
  row,
  now,
  capabilities,
  liveIdentities,
  onControl,
  onSelectTool,
  controlError,
}: {
  row: WorkGraphTreeRow;
  now: number;
  capabilities: ProviderWorkGraphCapabilities;
  liveIdentities: ReadonlySet<string>;
  onControl?: (request: WorkGraphControlRequest) => void;
  onSelectTool?: (toolUseId: string) => void;
  controlError?: string | null;
}) {
  const { node } = row;
  const controls = resolveWorkGraphControls({
    node,
    capabilities,
    liveIdentities,
  });
  // A person is the critical path here, whatever the runtime still reports the
  // node's own status as.
  const status = row.blocked ? "waiting" : WORK_GRAPH_ROW_STATUS[node.status];
  const detail = node.reason ?? node.progress.at(-1);
  const title = [node.label, detail, controls.reason]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const elapsedSeconds =
    (isTerminalWorkGraphStatus(node.status)
      ? (node.completedAt ?? node.updatedAt)
      : now) - node.startedAt;
  const elapsedLabel = formatTurnActivityElapsedSeconds(elapsedSeconds / 1_000);
  const statusLabel =
    node.status === "cancelled"
      ? "Cancelled"
      : getTurnActivityStatusLabel(status);
  const revealToolUseId = onSelectTool ? node.spawnedByToolUseId : undefined;
  const body = (
    <>
      <span className={sx(styles.statusIconWrap)}>
        <TurnActivityStatusIcon
          status={status}
          iconKey="subagent"
          label={node.status === "cancelled" ? "Cancelled" : undefined}
        />
      </span>
      <div className={sx(styles.body)}>
        <p
          className={sx(
            styles.labelLine,
            isTerminalWorkGraphStatus(node.status) && styles.labelLineTerminal,
          )}
        >
          <span className={sx(styles.label)}>{node.label}</span>
          {node.badge ? (
            <span className={sx(styles.badge, styles.badgeNeutral)}>
              {node.badge}
            </span>
          ) : null}
          {row.blocked ? (
            <span className={sx(styles.badge, styles.badgeWarning)}>
              Needs you
            </span>
          ) : null}
        </p>
        {detail ? <p className={sx(styles.detail)}>{detail}</p> : null}
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
        <VisuallyHidden>
          {statusLabel}, {elapsedLabel} elapsed
        </VisuallyHidden>
        <span aria-hidden="true">{elapsedLabel}</span>
      </span>
    </>
  );

  return (
    <div
      data-work-graph-node-key={node.key}
      data-work-graph-depth={row.depth}
      data-work-graph-blocked={row.blocked ? "true" : undefined}
      className={sx(styles.row)}
      // Depth is unbounded, so the indent cannot come from a static class list.
      style={{
        paddingInlineStart:
          WORK_GRAPH_ROW_INSET_PX + row.depth * WORK_GRAPH_INDENT_PX,
      }}
    >
      {revealToolUseId ? (
        <AdsButton
          layout="host"
          type="button"
          data-work-graph-revealable="true"
          xstyle={[styles.content, styles.contentRevealable]}
          title={`${title} — show in conversation`}
          onClick={() => onSelectTool?.(revealToolUseId)}
        >
          {body}
        </AdsButton>
      ) : (
        <div className={sx(styles.content)} title={title}>
          {body}
        </div>
      )}
      {controls.available.length > 0 ? (
        <span className={sx(styles.controls)}>
          {controls.available.map((control) => {
            const Icon = WORK_GRAPH_CONTROL_ICONS[control];
            return (
              <Button
                key={control}
                type="button"
                size="icon-xs"
                variant="ghost"
                title={WORK_GRAPH_CONTROL_LABELS[control]}
                aria-label={`${WORK_GRAPH_CONTROL_LABELS[control]} ${node.label}`}
                onClick={() => onControl?.({ control, node })}
              >
                <Icon className={sx(styles.controlIcon)} aria-hidden="true" />
              </Button>
            );
          })}
        </span>
      ) : controls.reason ? (
        // No button to disable, so the explanation carries the whole message:
        // the row's tooltip shows it, and this keeps it reachable without one.
        <VisuallyHidden>{controls.reason}</VisuallyHidden>
      ) : null}
    </div>
  );
});
