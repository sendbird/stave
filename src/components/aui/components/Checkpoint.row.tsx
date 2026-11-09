import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { Bookmark, GitBranch, RotateCcw } from "lucide-react";
import * as React from "react";

import { agentMotion } from "../recipes/agent-motion";
import { agentSurface } from "../recipes/agent-surface";
import { controlIconSizes } from "../recipes/control-metrics";
import { transition } from "../recipes/transition";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { AgentPulse, useSelfEntrance } from "./agent-motion";
import { Button } from "./Button";
import type { CheckpointProps } from "./Checkpoint.types";

/**
 * `Checkpoint variant="row"` (R2 · agent-checkpoints): one stop on a run's
 * checkpoint rail. Rail dot · glyph tile · `#n` + title over a detail line ·
 * machine value; Restore and Branch sit at the end of the detail line and
 * show on the selected row, on hover and on focus. Branch renders only with
 * `onBranch` — a runtime that cannot re-run from a boundary shows no button.
 *
 * Host: every default label reads `ui:checkpoint.*` (no English in the
 * bundle file) and the Branch button uses the installed Button's `outline`
 * variant name (the bundle calls it `outlined`).
 */
export function CheckpointRow({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  branchLabel = i18n.t("ui:checkpoint.branch"),
  className,
  description,
  disabled,
  icon,
  index,
  meta,
  onBranch,
  onRestore,
  rail = "done",
  railEdge,
  restoreLabel = i18n.t("ui:checkpoint.restore"),
  restoringLabel = i18n.t("ui:checkpoint.restoring"),
  restoring = false,
  selected = false,
  title = i18n.t("ui:checkpoint.checkpointSaved"),
  variant: _variant,
  xstyle,
  ...props
}: CheckpointProps) {
  useTranslation();
  const titleId = `${React.useId()}title`;
  const theme = themeProps("checkpoint");
  const hasActions = onRestore != null || onBranch != null;
  const enter = useSelfEntrance() && agentMotion.enter;

  return (
    <div
      {...props}
      {...theme}
      aria-current={selected ? "step" : undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : titleId)}
      className={cx(
        sx(
          styles.row,
          selected && styles.rowSelected,
          transition.colors,
          enter,
          xstyle,
        ),
        theme.className,
        className,
      )}
      data-checkpoint-variant="row"
      role="group"
    >
      <span aria-hidden className={sx(styles.rail)}>
        <span
          className={sx(
            styles.line,
            railEdge === "first" && styles.lineFromDot,
            railEdge === "last" && styles.lineToDot,
          )}
        />
        <span
          className={sx(
            styles.dot,
            agentMotion.tone,
            styles.dotGrow,
            rail === "current" && styles.dotCurrent,
            rail === "running" && styles.dotRunning,
            rail === "running" && agentMotion.breathe,
          )}
        >
          {/* The dot pulses once when its rail state changes. */}
          <AgentPulse pulseKey={rail} />
        </span>
      </span>
      <span aria-hidden className={sx(styles.tile)}>
        {icon ?? <Bookmark size={controlIconSizes.sm} />}
      </span>
      <span className={sx(styles.head)}>
        {index == null ? null : (
          <span className={sx(styles.index)}>{index}</span>
        )}
        <span
          {...themeSlotProps("checkpoint", "title")}
          className={sx(styles.title)}
          id={titleId}
        >
          {title}
        </span>
      </span>
      {meta == null ? null : (
        <span className={sx(agentSurface.meta, styles.meta)}>{meta}</span>
      )}
      {description == null && !hasActions ? null : (
        <span className={sx(styles.detailLine)}>
          {description == null ? null : (
            <span
              {...themeSlotProps("checkpoint", "description")}
              className={sx(styles.description)}
            >
              {description}
            </span>
          )}
          {hasActions ? (
            <span
              className={sx(
                styles.actions,
                transition.fade,
                selected && styles.actionsShown,
              )}
              data-checkpoint-actions=""
            >
              {onRestore == null ? null : (
                <Button
                  disabled={disabled}
                  loading={restoring}
                  loadingLabel={restoringLabel}
                  onClick={onRestore}
                  size="2xs"
                  variant="quiet"
                >
                  <RotateCcw aria-hidden size={controlIconSizes.sm} />
                  {restoreLabel}
                </Button>
              )}
              {onBranch == null ? null : (
                <Button
                  disabled={disabled}
                  onClick={onBranch}
                  size="2xs"
                  variant="outlined"
                >
                  <GitBranch aria-hidden size={controlIconSizes.sm} />
                  {branchLabel}
                </Button>
              )}
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
}

const RAIL_LINE = `color-mix(in oklab, ${vars["--aui-color-info"]} 45%, ${vars["--aui-color-surface-raised"]})`;

// Columns: 1 rail (16) · 2 tile (24) · 3 copy · 4 meta. Rows: 1 head · 2 detail.
const styles = stylex.create({
  row: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    columnGap: vars["--aui-space-12"],
    display: "grid",
    gridTemplateColumns: "16px 24px minmax(0, 1fr) auto",
    gridTemplateRows: "auto auto",
    inlineSize: "100%",
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
    position: "relative",
    rowGap: vars["--aui-space-2"],
    // Read by `actions`: the row reveals its controls on hover and focus.
    "--aui-checkpoint-actions": {
      default: "0",
      ":focus-within": "1",
      "@media (hover: hover)": {
        default: "0",
        ":hover": "1",
        ":focus-within": "1",
      },
      "@media (pointer: coarse)": "1",
    },
  },
  // selection-ok: the current stop is signalled by its larger rail dot
  // (`dotCurrent`, rail="current") and its revealed actions; the fill only
  // groups the row's parts.
  rowSelected: {
    backgroundColor: vars["--aui-color-selection-fill"],
  },
  rail: {
    alignSelf: "stretch",
    display: "flex",
    gridColumn: "1",
    gridRow: "1 / span 2",
    justifyContent: "center",
    position: "relative",
  },
  // The rail runs edge to edge of the row (through its block padding), so
  // consecutive rows join into one line; `railEdge` trims the ends.
  line: {
    backgroundColor: RAIL_LINE,
    insetBlockEnd: `calc(-1 * ${vars["--aui-space-4"]})`,
    insetBlockStart: `calc(-1 * ${vars["--aui-space-4"]})`,
    inlineSize: 2,
    position: "absolute",
  },
  lineFromDot: { insetBlockStart: "50%" },
  lineToDot: { insetBlockEnd: "50%" },
  dot: {
    alignSelf: "center",
    backgroundColor: vars["--aui-color-info"],
    blockSize: 8,
    borderRadius: vars["--aui-radius-full"],
    inlineSize: 8,
    position: "relative",
  },
  // The current/running dot grows into its size rather than snapping.
  dotGrow: {
    transitionProperty:
      "background-color, border-color, box-shadow, block-size, inline-size",
  },
  dotCurrent: { blockSize: 10, inlineSize: 10 },
  dotRunning: {
    backgroundColor: vars["--aui-color-surface-raised"],
    blockSize: 10,
    borderColor: vars["--aui-color-info"],
    borderStyle: "solid",
    borderWidth: vars["--aui-ring-width-sm"],
    boxSizing: "border-box",
    inlineSize: 10,
  },
  tile: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface-raised"],
    blockSize: 24,
    borderColor: vars["--aui-color-ring"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxSizing: "border-box",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    gridColumn: "2",
    gridRow: "1 / span 2",
    inlineSize: 24,
    justifyContent: "center",
  },
  head: {
    alignItems: "baseline",
    display: "flex",
    gap: vars["--aui-space-4"],
    gridColumn: "3",
    gridRow: "1",
    minInlineSize: 0,
  },
  index: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-control"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    alignSelf: "start",
    gridColumn: "4",
    gridRow: "1",
    lineHeight: vars["--aui-line-height-control"],
  },
  detailLine: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    gridColumn: "3 / span 2",
    gridRow: "2",
    minBlockSize: vars["--aui-control-height-2xs"],
    minInlineSize: 0,
    rowGap: vars["--aui-space-4"],
  },
  description: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    // Grows so a caller's trailing mark (a running tag) can sit at the end.
    flexGrow: 1,
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  // Revealed by the selected row, and through the row's custom property by a
  // hovered row and focus inside it; coarse pointers have no hover, so the
  // controls always show there.
  actions: {
    display: "inline-flex",
    gap: vars["--aui-space-4"],
    marginInlineStart: "auto",
    opacity: "var(--aui-checkpoint-actions, 0)",
  },
  actionsShown: { opacity: 1 },
});
