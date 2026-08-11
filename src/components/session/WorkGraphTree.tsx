import { memo, useMemo } from "react";
import { Hand, MessageSquare, Square, type LucideIcon } from "lucide-react";
import { TurnActivityStatusIcon } from "@/components/session/turn-activity-status-icon";
import type { TurnActivityRowStatus } from "@/components/session/turn-activity.utils";
import { Button } from "@/components/ui";
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
import { cn } from "@/lib/utils";

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
const WORK_GRAPH_BADGE_CLASS =
  "shrink-0 rounded border px-1 text-[10px] leading-4 font-medium tracking-wide";

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
  capabilities: ProviderWorkGraphCapabilities;
  /**
   * Optional because a surface may render the tree with no controls at all —
   * no runtime implements per-agent steering, so only ledger-owned children
   * have anything to click.
   */
  onControl?: (request: WorkGraphControlRequest) => void;
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
  const liveIdentities = useMemo(
    () => (graph ? collectLiveWorkGraphIdentities(graph) : NO_LIVE_IDENTITIES),
    [graph],
  );

  // A turn without delegated agents renders nothing at all: an empty labelled
  // section would add a heading and a border to say "no news".
  if (rows.length === 0) {
    return null;
  }

  return (
    <section
      className={cn("min-w-0", props.className)}
      aria-label="Agent tree"
      data-testid="work-graph-tree"
    >
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Agent tree
      </h3>
      <div className="mt-1 flex min-w-0 flex-col">
        {rows.map((row) => (
          <WorkGraphTreeNodeRow
            key={row.key}
            row={row}
            capabilities={props.capabilities}
            liveIdentities={liveIdentities}
            onControl={props.onControl}
            controlError={props.controlErrorByNodeKey?.[row.key] ?? null}
          />
        ))}
      </div>
    </section>
  );
});

const WorkGraphTreeNodeRow = memo(function WorkGraphTreeNodeRow({
  row,
  capabilities,
  liveIdentities,
  onControl,
  controlError,
}: {
  row: WorkGraphTreeRow;
  capabilities: ProviderWorkGraphCapabilities;
  liveIdentities: ReadonlySet<string>;
  onControl?: (request: WorkGraphControlRequest) => void;
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

  return (
    <div
      data-work-graph-node-key={node.key}
      data-work-graph-depth={row.depth}
      data-work-graph-blocked={row.blocked ? "true" : undefined}
      className={cn(
        "flex min-w-0 items-start gap-2.5 rounded-lg px-2 py-1.5",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
      )}
      // Depth is unbounded, so the indent cannot come from a static class list.
      style={{
        paddingInlineStart:
          WORK_GRAPH_ROW_INSET_PX + row.depth * WORK_GRAPH_INDENT_PX,
      }}
      title={title}
    >
      <span className="flex h-5 shrink-0 items-center">
        <TurnActivityStatusIcon
          status={status}
          iconKey="subagent"
          label={node.status === "cancelled" ? "Cancelled" : undefined}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-[0.8125rem] leading-5",
            isTerminalWorkGraphStatus(node.status) && "text-muted-foreground",
          )}
        >
          <span className="truncate font-medium">{node.label}</span>
          {node.badge ? (
            <span
              className={cn(
                WORK_GRAPH_BADGE_CLASS,
                "border-border/60 text-muted-foreground",
              )}
            >
              {node.badge}
            </span>
          ) : null}
          {row.blocked ? (
            <span
              className={cn(
                WORK_GRAPH_BADGE_CLASS,
                "border-warning/40 text-warning",
              )}
            >
              Needs you
            </span>
          ) : null}
        </p>
        {detail ? (
          <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {detail}
          </p>
        ) : null}
        {controlError ? (
          <p
            role="status"
            data-testid="work-graph-control-error"
            className="line-clamp-2 text-[11px] leading-4 text-destructive"
          >
            {controlError}
          </p>
        ) : null}
      </div>
      {controls.available.length > 0 ? (
        <span className="flex shrink-0 items-center gap-0.5">
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
                <Icon className="size-3" aria-hidden="true" />
              </Button>
            );
          })}
        </span>
      ) : controls.reason ? (
        // No button to disable, so the explanation carries the whole message:
        // the row's tooltip shows it, and this keeps it reachable without one.
        <span className="sr-only">{controls.reason}</span>
      ) : null}
    </div>
  );
});
