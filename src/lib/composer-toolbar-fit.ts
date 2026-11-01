/**
 * Which composer toolbar controls leave the row for the `⋯` menu when the row
 * cannot hold them all on one line.
 *
 * The classic composer used to let its control row wrap, so a narrow column
 * (a side panel open on a small window) stacked the controls three rows deep
 * and the composer grew taller than the transcript it served. The row now
 * stays one line: controls leave it, lowest priority first, until the rest
 * fits, and the ones that left are reached from the `⋯` menu. Every control
 * that stays keeps its position and order.
 *
 * Widths are each control's natural width, measured while it was last on the
 * row, so the answer does not depend on which controls are currently out — the
 * row cannot oscillate between two layouts.
 *
 * Before anything leaves, a control that can drop its label does
 * (`compactWidth`). The side question only ever does that: it is a direct
 * action beside Attach and Send whatever the placement, so it keeps its glyph,
 * tooltip and name on the row.
 */

/** The side question action, which lives with Attach and Send. */
export const COMPOSER_SIDE_QUESTION_SLOT = "sideQuestion";

/**
 * The order controls leave the row: Stave's own tooling first (it is used
 * least often per turn), then the runtime readout (checked rather than
 * operated), then the run settings, with the permission preset last — it
 * changes what the next turn may do. The model picker, the side question,
 * Attach and Send never leave.
 */
export const COMPOSER_TOOLBAR_DROP_ORDER: readonly string[] = [
  "compare",
  "macro",
  "secrets",
  "review",
  "runtime",
  "runAccountPool",
  "thinking",
  "providerMode",
];

export interface ComposerToolbarFitItem {
  id: string;
  /** Natural width in px, measured while the control was on the row. */
  width: number;
  /** Width without its label, for a control that can drop it. */
  compactWidth?: number;
}

export interface ComposerToolbarFit {
  /** Controls that keep their place but drop their label. */
  compacted: string[];
  /** Controls that leave the row for the `⋯` menu, in drop order. */
  collapsed: string[];
}

/**
 * Which controls drop their label and which leave the row.
 *
 * `fixedWidth` is everything that always stays (the model picker, the gap to
 * the actions and the actions without the side question). Each kept item adds
 * its width plus one `gap`; the `⋯` trigger adds `trayWidth` plus one `gap`
 * whenever it is shown — always when `trayAlwaysShown` (the user demoted a
 * control), otherwise as soon as one control leaves. `activeIds` are holding a
 * deliberate state and leave last, so the row keeps saying what is set.
 * Compacting comes first, for every item that offers it.
 */
export function fitComposerToolbar(args: {
  availableWidth: number;
  fixedWidth: number;
  gap: number;
  items: readonly ComposerToolbarFitItem[];
  trayWidth: number;
  trayAlwaysShown: boolean;
  dropOrder?: readonly string[];
  activeIds?: readonly string[];
}): ComposerToolbarFit {
  const dropOrder = args.dropOrder ?? COMPOSER_TOOLBAR_DROP_ORDER;
  const active = new Set(args.activeIds ?? []);
  const present = new Set(args.items.map((item) => item.id));
  const droppable = dropOrder.filter((id) => present.has(id));
  const order = [
    ...droppable.filter((id) => !active.has(id)),
    ...droppable.filter((id) => active.has(id)),
  ];
  const compacted: string[] = [];
  const collapsed: string[] = [];
  const widthOf = (item: ComposerToolbarFitItem) =>
    compacted.includes(item.id) && item.compactWidth != null ? item.compactWidth : item.width;
  const total = () => {
    const kept = args.items.filter((item) => !collapsed.includes(item.id));
    const trayShown = args.trayAlwaysShown || collapsed.length > 0;
    return (
      args.fixedWidth +
      kept.reduce((sum, item) => sum + args.gap + widthOf(item), 0) +
      (trayShown ? args.gap + args.trayWidth : 0)
    );
  };
  // Sub-pixel layout rounds both ways; a half pixel is not a reason to fold.
  const limit = args.availableWidth + 0.5;
  const steps = [
    ...args.items.filter((item) => item.compactWidth != null).map((item) => ({ id: item.id, fold: false })),
    ...order.map((id) => ({ id, fold: true })),
  ];
  for (const step of steps) {
    if (total() <= limit) {
      break;
    }
    if (step.fold) {
      collapsed.push(step.id);
    } else {
      compacted.push(step.id);
    }
  }
  return {
    compacted: compacted.filter((id) => !collapsed.includes(id)),
    collapsed,
  };
}
