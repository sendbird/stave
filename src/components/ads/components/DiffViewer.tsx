import * as stylex from "@stylexjs/stylex";
import { useMemo, useState } from "react";
import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import {
  annotateWordDiff,
  diffLines,
  planCollapse,
  splitLines,
  toSplitRows,
  type WordOp,
} from "./DiffViewer.diff";

/**
 * Line-level text diff (unified or split) with an internal LCS diff — no
 * external diff dependency.
 *
 * Color contract: semantic color rides the **edge stripe** plus a *soft* row
 * wash (`successSoft` / `dangerSoft`). Per `docs/design-direction.md` §1.2 the
 * rule is "semantic color on a small element, never a full card wash" — the
 * diff row wash is the sanctioned nuance of that rule: the wash *is* the
 * information here (which lines changed), it uses only the soft tints, and the
 * saturated tone stays confined to the edge stripe and sign column.
 *
 * `granularity="word"` (see below) keeps that same contract for its added
 * inline emphasis: no new saturated fill is introduced, only the existing
 * `successSoft` / `dangerSoft` tokens, now scoped to the changed run instead
 * of the whole row.
 *
 * `context` (optional) collapses long unchanged runs to N lines of context
 * around each change, with an inline expand affordance. Omit it to render
 * every line.
 *
 * Ported from the ADS upstream `DiffViewer` into the host-owned installed copy.
 * The upstream `XstyleProp` layer is not part of the installed `utils/stylex`,
 * so the `xstyle` escape hatch is dropped; callers style the wrapper via
 * `className`.
 */

export type DiffViewerMode = "unified" | "split";

/**
 * `"line"` (default) diffs whole lines only, so an edited line renders as a
 * full removed line next to a full added line — accurate, but a reader has to
 * eyeball a one-line change against its neighbor to find what actually moved.
 * `"word"` additionally diffs each changed line pair on word boundaries and
 * emphasizes only the changed runs inline (see the color contract above); a
 * pure addition or removal (no line on the other side to compare against)
 * still renders as a fully washed line, since there is nothing to diff it
 * against.
 */
export type DiffViewerGranularity = "line" | "word";

export type DiffViewerProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Original text. */
  before: string;
  /** Revised text. */
  after: string;
  /** @default "unified" */
  mode?: DiffViewerMode;
  /**
   * Diff resolution. `"word"` requires a changed line to have a counterpart on
   * the other side (see `DiffViewerGranularity`).
   * @default "line"
   */
  granularity?: DiffViewerGranularity;
  /**
   * Number of unchanged lines to keep around each change; longer unchanged
   * runs collapse behind an "Expand" affordance. Omit to show all lines.
   */
  context?: number;
};

const signFor = { add: "+", equal: " ", remove: "-" } as const;

/**
 * Renders one line/cell's text content. In `"word"` mode, a paired changed op
 * (`wordOps` set) renders its own tokens with only the changed runs wrapped in
 * an emphasis span (`successSoft` / `dangerSoft` background — see the file
 * header's color contract); everything else renders as plain text, same as
 * `"line"` mode.
 */
function renderCode(
  op: { text: string; wordOps?: WordOp[] },
  granularity: DiffViewerGranularity,
) {
  if (granularity !== "word" || !op.wordOps) {
    return op.text.length > 0 ? op.text : " ";
  }
  return op.wordOps.map((wordOp, index) =>
    wordOp.type === "equal" ? (
      <span key={index}>{wordOp.text}</span>
    ) : (
      <span
        className={sx(
          wordOp.type === "add" ? styles.wordAdd : styles.wordRemove,
        )}
        key={index}
      >
        {wordOp.text}
      </span>
    ),
  );
}

export function DiffViewer({
  after,
  before,
  className,
  context,
  granularity = "line",
  mode = "unified",
  ...props
}: DiffViewerProps) {
  const ops = useMemo(() => {
    const lineOps = diffLines(splitLines(before), splitLines(after));
    if (granularity === "word") annotateWordDiff(lineOps);
    return lineOps;
  }, [after, before, granularity]);
  const splitRows = useMemo(
    () => (mode === "split" ? toSplitRows(ops) : []),
    [mode, ops],
  );
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(
    () => new Set(),
  );

  const expand = (start: number) =>
    setExpanded((prev) => new Set(prev).add(start));

  const expandRow = (start: number, count: number) => (
    <div className={sx(styles.expandRow)} key={`x-${start}`}>
      <button
        className={sx(
          styles.expandButton,
          // The expand affordance is the one pressable thing in the diff, and
          // its hover/press wash was a hard cut: `transition.colors` is what
          // every other ADS row composes beside `focusRing.ring`, and naming
          // the three paint properties keeps `all` off a surface that can hold
          // hundreds of rows.
          transition.colors,
          focusRing.ring,
          focusRing.ringInset,
        )}
        onClick={() => expand(start)}
        type="button"
      >
        Expand {count} unchanged {count === 1 ? "line" : "lines"}
      </button>
    </div>
  );

  return (
    <div
      {...props}
      aria-label={props["aria-label"] ?? "Text diff"}
      className={cx(sx(styles.root), className)}
      role="group"
    >
      {mode === "unified"
        ? planCollapse(ops, (op) => op.type === "equal", context, expanded).map(
            (segment, segmentIndex) =>
              segment.kind === "collapsed" ? (
                expandRow(segment.start, segment.count)
              ) : (
                <div key={`s-${segmentIndex}`}>
                  {segment.rows.map((op) => {
                    // A word-paired changed line already carries its own
                    // inline emphasis (see `renderCode`); washing the whole
                    // row too would use the identical soft token as the run's
                    // background and hide the very thing the run calls out.
                    // The edge stripe + sign column stay on every changed
                    // row regardless of pairing.
                    const wordPaired =
                      granularity === "word" && op.wordOps !== undefined;
                    return (
                      <div
                        className={sx(
                          styles.row,
                          op.type === "add" && styles.rowEdgeAdd,
                          op.type === "remove" && styles.rowEdgeRemove,
                          op.type === "add" && !wordPaired && styles.rowWashAdd,
                          op.type === "remove" &&
                            !wordPaired &&
                            styles.rowWashRemove,
                        )}
                        key={`${op.type}-${op.beforeLine ?? ""}-${op.afterLine ?? ""}`}
                      >
                        <span className={sx(styles.lineNo)}>
                          {op.beforeLine ?? ""}
                        </span>
                        <span className={sx(styles.lineNo)}>
                          {op.afterLine ?? ""}
                        </span>
                        <span
                          aria-hidden={op.type === "equal"}
                          className={sx(
                            styles.sign,
                            op.type === "add" && styles.signAdd,
                            op.type === "remove" && styles.signRemove,
                          )}
                        >
                          {signFor[op.type]}
                        </span>
                        <span className={sx(styles.code)}>
                          {renderCode(op, granularity)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ),
          )
        : planCollapse(splitRows, (row) => row.equal, context, expanded).map(
            (segment, segmentIndex) =>
              segment.kind === "collapsed" ? (
                expandRow(segment.start, segment.count)
              ) : (
                <div key={`s-${segmentIndex}`}>
                  {segment.rows.map((row) => (
                    <div className={sx(styles.splitRow)} key={row.key}>
                      {(["left", "right"] as const).map((side) => {
                        const cell = row[side];
                        // See the unified-mode comment above: a word-paired
                        // cell carries its own inline emphasis, so the cell
                        // wash is skipped for it (same soft token as the run,
                        // it would otherwise hide the run).
                        const wordPaired =
                          granularity === "word" && cell?.wordOps !== undefined;
                        return (
                          <div
                            className={sx(
                              styles.splitCell,
                              cell?.type === "add" && styles.rowEdgeAdd,
                              cell?.type === "remove" && styles.rowEdgeRemove,
                              cell?.type === "add" &&
                                !wordPaired &&
                                styles.rowWashAdd,
                              cell?.type === "remove" &&
                                !wordPaired &&
                                styles.rowWashRemove,
                              !cell && styles.cellEmpty,
                            )}
                            key={side}
                          >
                            <span className={sx(styles.lineNo)}>
                              {cell?.line ?? ""}
                            </span>
                            <span
                              aria-hidden={!cell || cell.type === "equal"}
                              className={sx(
                                styles.sign,
                                cell?.type === "add" && styles.signAdd,
                                cell?.type === "remove" && styles.signRemove,
                              )}
                            >
                              {cell ? signFor[cell.type] : " "}
                            </span>
                            <span className={sx(styles.code)}>
                              {cell ? renderCode(cell, granularity) : " "}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ),
          )}
    </div>
  );
}

const styles = stylex.create({
  root: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    inlineSize: "100%",
    lineHeight: vars.lineHeightNormal,
    overflow: "auto",
  },
  row: {
    alignItems: "baseline",
    // Saturated tone lives only on the edge stripe (2px inline-start border);
    // the row itself carries at most the soft wash. (design-direction §1.2)
    borderInlineStartColor: "transparent",
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 2,
    display: "grid",
    gridTemplateColumns: `${vars.space32} ${vars.space32} ${vars.space16} minmax(0, 1fr)`,
  },
  splitRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  splitCell: {
    alignItems: "baseline",
    borderInlineStartColor: "transparent",
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 2,
    display: "grid",
    gridTemplateColumns: `${vars.space32} ${vars.space16} minmax(0, 1fr)`,
    minInlineSize: 0,
  },
  cellEmpty: {
    backgroundColor: vars.colorCanvasSubtle,
  },
  // Split from the wash below so a word-paired changed line (granularity
  // "word") can keep the edge stripe without the row-level wash competing
  // with its own inline emphasis (see the render-time `wordPaired` checks).
  rowEdgeAdd: {
    borderInlineStartColor: vars.colorSuccess,
  },
  rowEdgeRemove: {
    borderInlineStartColor: vars.colorDanger,
  },
  rowWashAdd: {
    backgroundColor: vars.colorSuccessSoft,
  },
  rowWashRemove: {
    backgroundColor: vars.colorDangerSoft,
  },
  // Word-boundary emphasis (granularity="word"): the same soft tokens as the
  // row wash above, now scoped to just the changed run instead of the whole
  // line — no new saturated fill, per the file header's color contract.
  wordAdd: {
    backgroundColor: vars.colorSuccessSoft,
    borderRadius: vars.radiusMark,
  },
  wordRemove: {
    backgroundColor: vars.colorDangerSoft,
    borderRadius: vars.radiusMark,
  },
  lineNo: {
    color: vars.colorTextSubtle,
    paddingInlineEnd: vars.space8,
    textAlign: "end",
    userSelect: "none",
  },
  sign: {
    textAlign: "center",
    userSelect: "none",
  },
  signAdd: {
    color: vars.colorSuccessText,
  },
  signRemove: {
    color: vars.colorDangerText,
  },
  code: {
    overflowWrap: "anywhere",
    paddingInlineEnd: vars.space12,
    whiteSpace: "pre-wrap",
  },
  expandRow: {
    borderBlockColor: vars.colorBorderSubtle,
    borderBlockStyle: "solid",
    // The root draws the card border. When an expand row is the last thing in
    // the diff its own block-end hairline landed on that border and the pair
    // read as one thick rule; the block-start rule is the one doing the work.
    borderBlockEndWidth: {
      default: vars.borderWidthHairline,
      ":last-child": 0,
    },
    borderBlockStartWidth: vars.borderWidthHairline,
    display: "flex",
  },
  expandButton: {
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
      ":active": vars.colorOverlayPressed,
    },
    borderStyle: "none",
    color: vars.colorTextMuted,
    cursor: "pointer",
    flexGrow: 1,
    fontFamily: vars.fontSans,
    fontSize: vars.fontSizeCaption,
    paddingBlock: vars.space4,
    paddingInline: vars.space12,
    textAlign: "start",
  },
});
