import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

export const styles = stylex.create({
  root: {
    color: vars["--aui-color-text"],
    display: "grid",
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-body"],
    listStyle: "none",
    margin: 0,
    minInlineSize: 0,
    padding: 0,
  },
  row: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--aui-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--aui-color-overlay-hover"],
        ":active": vars["--aui-color-overlay-pressed"],
      },
    },
    borderRadius: vars["--aui-radius-control"],
    cursor: "pointer",
    display: "flex",
    gap: vars["--aui-space-4"],
    lineHeight: vars["--aui-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInlineEnd: vars["--aui-space-8"],
    paddingInlineStart: vars["--aui-space-8"],
    position: "relative",
    userSelect: "none",
  },
  rowCompact: {
    paddingInlineEnd: vars["--aui-space-8"],
    // Compact removes the phantom disclosure gutter, not the row's breathing
    // room. Leaf rows still need the standard inset when Tree is used without a
    // padded container, while the outer Sidebar padding remains independent.
    paddingInlineStart: vars["--aui-space-8"],
  },
  rowSelected: {
    backgroundColor: vars["--aui-color-selection-fill"],
    color: vars["--aui-color-accent"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  rowDropInside: {
    backgroundColor: vars["--aui-color-accent-soft"],
    boxShadow: `inset 0 0 0 ${vars["--aui-ring-width-sm"]} ${vars["--aui-color-accent"]}`,
  },
  dropLine: {
    backgroundColor: vars["--aui-color-accent"],
    blockSize: vars["--aui-ring-width-sm"],
    insetInline: vars["--aui-space-4"],
    pointerEvents: "none",
    position: "absolute",
    // In-surface chrome over the tree's own rows. Tokenized (was a raw
    // `zIndex: 1`, which silently outranks a z-auto sibling panel).
    zIndex: vars["--aui-z-index-sticky"],
  },
  dropLineBefore: {
    insetBlockStart: 0,
  },
  dropLineAfter: {
    insetBlockEnd: 0,
  },
  rowDisabled: {
    cursor: "default",
    opacity: vars["--aui-opacity-disabled"],
  },
  // One rail per ancestor depth; the hairline sits at the span's center so it
  // aligns under the parent row's chevron.
  guide: {
    alignSelf: "stretch",
    flexShrink: 0,
    inlineSize: vars["--aui-space-16"],
    marginInlineEnd: `calc(-1 * ${vars["--aui-space-4"]})`,
    position: "relative",
    "::before": {
      backgroundColor: vars["--aui-color-border-subtle"],
      blockSize: "100%",
      content: '""',
      inlineSize: vars["--aui-border-width-hairline"],
      insetInlineStart: "50%",
      position: "absolute",
    },
  },
  guideCompact: {
    inlineSize: vars["--aui-space-12"],
  },
  disclosure: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: vars["--aui-space-16"],
    justifyContent: "center",
  },
  disclosureCompact: {
    inlineSize: vars["--aui-space-12"],
  },
  icon: {
    alignItems: "center",
    blockSize: vars["--aui-control-icon-size-sm"],
    color: vars["--aui-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-sm"],
    justifyContent: "center",
  },
  label: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  trailing: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    gap: vars["--aui-space-4"],
    marginInlineStart: "auto",
  },
  meta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  // Row actions keep their box at rest so the label does not re-flow under
  // the pointer when they appear; only the paint is withheld. Revealed on row
  // hover (tracked by the row, see `TreeRow`) and on `:focus-within`, so a
  // keyboard user who tabs onto the control sees what they landed on.
  actions: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    gap: vars["--aui-space-4"],
    marginInlineStart: vars["--aui-space-4"],
    opacity: {
      default: 0,
      ":focus-within": 1,
    },
  },
  // Without a `meta`/`badge` span ahead of it, the slot takes the trailing
  // span's `auto` margin itself so it still sits at the row's end.
  actionsTrailing: {
    marginInlineStart: "auto",
  },
  actionsVisible: {
    opacity: 1,
  },
  renameInput: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: {
      default: vars["--aui-color-border"],
      ":focus-within": vars["--aui-color-border-focus"],
    },
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text"],
    flexGrow: 1,
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    minInlineSize: 0,
    paddingBlock: 0,
    paddingInline: vars["--aui-space-4"],
  },
});
