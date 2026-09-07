import { ListTree } from "lucide-react";
import * as React from "react";

import {
  CollapsiblePanel,
  CollapsibleRoot,
  CollapsibleTrigger,
} from "../headless/collapsible";
import { agentSurface } from "../recipes/agent-surface";
import { controlHeights, controlIconSizes } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { inlineDisclosure } from "../recipes/inline-disclosure";
import { transition } from "../recipes/transition";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { isAttentionState, type AgentRunState } from "./agent-state";
import { InlineDisclosureIcon } from "./inline-disclosure-icon";
import {
  formatElapsed,
  useSettleDisclosure,
  type ElapsedSource,
} from "./Thinking.parts";
import {
  aggregateRunStatus,
  defaultRollupSummary,
  isLiveRunState,
  totalMeasuredDuration,
  ToolRunSummary,
  toolRunStyles,
} from "./ToolRun.parts";

/* ------------------------------------------------------------------------ *
 * ToolRun.Group — a run of sibling rows, and the roll-up that hides them
 * behind one line.
 *
 * Split from `ToolRun.tsx` for the 500-line source ceiling, and the seam is
 * the real one: the root is one invocation and this file is the *set* of them,
 * with its own aggregate status, its own total duration and its own
 * disclosure. Nothing here imports the root, so the pair adds no relative
 * import cycle, and `ToolRun.Group` still hangs off the root at the call site
 * (see `decisions/composition-api.md`).
 * ------------------------------------------------------------------------ */

export type ToolRunGroupProps = Omit<
  React.ComponentProps<"div">,
  "children"
> & {
  /** Accessible name for the list of runs. @default "Tool calls" */
  "aria-label"?: string;
  children?: React.ReactNode;
  /** Initial open state of a rolled-up group. Defaults to "open while any run is live". */
  defaultOpen?: boolean;
  /** The roll-up's glyph, replacing the default tree. */
  icon?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  /** Controlled open state of a rolled-up group. */
  open?: boolean;
  /**
   * Let the whole run collapse into one summary line. Off by default: a group
   * of three visible rows is already quiet, and hiding work behind a
   * disclosure nobody asked for is worse than showing it.
   * @default false
   */
  rollUp?: boolean;
  /**
   * Explicit lifecycle data for the roll-up summary. Visual children are not
   * inspected: fragments, wrappers, and conditional composition must not make
   * the aggregate status or duration silently wrong.
   */
  runs: readonly ToolRunGroupRun[];
  /**
   * Overrides the rolled-up status word. By default the group takes the most
   * urgent state among its runs — see `aggregateRunStatus`.
   */
  status?: AgentRunState;
  /** Overrides the "4 tool calls" summary label. */
  summary?: React.ReactNode;
} & XstyleProp;

export type ToolRunGroupRun = ElapsedSource & {
  status: AgentRunState;
};

/**
 * A run of sibling `ToolRun` rows, and the roll-up that hides them behind one
 * line.
 *
 * **Rung 3.** Compact gaps and each row's hover/open wash separate the run.
 * Tool rows are disclosures, not table records, so the default group does not
 * draw full-width rules between every sibling.
 *
 * **Why the roll-up is a compound part and not a separate component.** Three
 * reasons, in order of weight:
 *
 * 1. **The group owns explicit run data.** "4 tool calls", the aggregate
 *    status and the total duration are facts about the run, not facts React
 *    markup can reliably reveal. `runs` stays correct through fragments,
 *    wrappers and conditional composition; the children only render rows.
 * 2. **The summary row and list are one object in two states**, not two
 *    components that swap. §5.2 asks for a row-track animation between them;
 *    that is only expressible if the collapsed and expanded forms share a
 *    root. A `ToolRunRollup` beside a `ToolRunList` would have to mount one
 *    and unmount the other, which is exactly the transition the rule forbids.
 * 3. **`ToolRun.Group` says at the call site what is being grouped.** A
 *    top-level `ToolRunList` — what the old set shipped — is discoverable only
 *    from documentation, and §8 does not want a second generic list primitive
 *    in the family.
 *
 * The roll-up is a **row**, not a bordered pill: a pill would spend a
 * perimeter (rung 5) on a list header, and §1 reserves those for detachable
 * artifacts. It carries the same anatomy as the rows under it — an object glyph
 * that yields to the disclosure chevron on hover or focus, title, one colored
 * status word, right-aligned duration — because it *is* one of them, standing
 * for the rest.
 *
 * An empty group renders nothing. A blank slate for "no tools ran" is the
 * product's copy to write, not a shape this component should guess.
 */
export function ToolRunGroup({
  "aria-label": ariaLabel = "Tool calls",
  children,
  className,
  defaultOpen,
  icon,
  onOpenChange,
  open: openProp,
  rollUp = false,
  runs,
  status: statusProp,
  summary,
  xstyle,
  ...props
}: ToolRunGroupProps) {
  const items = flattenRunRows(children);
  const derivedStatus =
    statusProp ?? aggregateRunStatus(runs.map((run) => run.status)) ?? "done";
  const live = runs.some(
    (run) => isLiveRunState(run.status) || isAttentionState(run.status),
  );
  const totalMs = totalMeasuredDuration(runs);

  const { open, setOpen } = useSettleDisclosure({
    defaultOpen,
    live,
    onOpenChange,
    open: openProp,
  });

  if (items.length === 0) return null;

  const list = (
    <div
      aria-label={ariaLabel}
      className={sx(agentSurface.rowGroup, toolRunStyles.groupList)}
      role="list"
    >
      {items.map((item, index) => (
        <div
          className={sx(toolRunStyles.groupItem)}
          key={item.key ?? index}
          role="listitem"
        >
          {item}
        </div>
      ))}
    </div>
  );

  if (!rollUp) {
    return (
      <div
        {...props}
        className={cx(
          sx(agentSurface.bare, toolRunStyles.group, xstyle),
          className,
        )}
        data-tool-run-group-status={derivedStatus}
      >
        {list}
      </div>
    );
  }

  return (
    <CollapsibleRoot
      className={cx(
        sx(inlineDisclosure.root, toolRunStyles.group, xstyle),
        className,
      )}
      data-tool-run-group-status={derivedStatus}
      onOpenChange={(nextOpen) => setOpen(nextOpen)}
      open={open}
      render={<div {...props} />}
    >
      <CollapsibleTrigger
        className={() =>
          cx(
            sx(
              inlineDisclosure.trigger,
              inlineDisclosure.triggerIntrinsic,
              open && inlineDisclosure.triggerOpen,
              toolRunStyles.row,
              controlHeights.sm,
              transition.colors,
              toolRunStyles.trigger,
              focusRing.ring,
              focusRing.ringInset,
            ),
            "atelier-inline-disclosure-trigger",
          )
        }
      >
        <InlineDisclosureIcon open={open}>
          {icon ?? <ListTree aria-hidden size={controlIconSizes.md} />}
        </InlineDisclosureIcon>
        <ToolRunSummary
          elapsedText={totalMs === null ? null : formatElapsed(totalMs, true)}
          status={derivedStatus}
          title={summary ?? defaultRollupSummary(runs.length)}
        />
      </CollapsibleTrigger>
      <CollapsiblePanel
        className={cx(
          sx(inlineDisclosure.panel, toolRunStyles.panel),
          "atelier-motion-collapse",
        )}
        keepMounted
      >
        <div className="atelier-motion-panel-inner">{list}</div>
      </CollapsiblePanel>
    </CollapsibleRoot>
  );
}

/** Fragments are transparent grouping syntax, not one visual tool row. */
function flattenRunRows(children: React.ReactNode): React.ReactElement[] {
  return React.Children.toArray(children).flatMap((item) => {
    if (!React.isValidElement(item)) return [];
    if (item.type === React.Fragment) {
      const fragment = item.props as { children?: React.ReactNode };
      return flattenRunRows(fragment.children);
    }
    return [item];
  });
}
