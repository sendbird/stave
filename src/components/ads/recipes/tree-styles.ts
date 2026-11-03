import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

export const styles = stylex.create({
  root: {
    color: vars["--ads-color-text"],
    display: "grid",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-body"],
    listStyle: "none",
    margin: 0,
    minInlineSize: 0,
    padding: 0,
  },
  row: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--ads-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--ads-color-overlay-hover"],
        ":active": vars["--ads-color-overlay-pressed"],
      },
    },
    borderRadius: vars["--ads-radius-control"],
    cursor: "pointer",
    display: "flex",
    gap: vars["--ads-space-4"],
    lineHeight: vars["--ads-line-height-tight"],
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInlineEnd: vars["--ads-space-8"],
    paddingInlineStart: vars["--ads-space-8"],
    position: "relative",
    userSelect: "none",
  },
  rowCompact: {
    paddingInlineEnd: vars["--ads-space-8"],
    // Compact removes the phantom disclosure gutter, not the row's breathing
    // room. Leaf rows still need the standard inset when Tree is used without a
    // padded container, while the outer Sidebar padding remains independent.
    paddingInlineStart: vars["--ads-space-8"],
  },
  rowSelected: {
    backgroundColor: vars["--ads-color-selection-fill"],
    color: vars["--ads-color-accent"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  rowDropInside: {
    backgroundColor: vars["--ads-color-accent-soft"],
    boxShadow: `inset 0 0 0 ${vars["--ads-ring-width-sm"]} ${vars["--ads-color-accent"]}`,
  },
  dropLine: {
    backgroundColor: vars["--ads-color-accent"],
    blockSize: vars["--ads-ring-width-sm"],
    insetInline: vars["--ads-space-4"],
    pointerEvents: "none",
    position: "absolute",
    // In-surface chrome over the tree's own rows. Tokenized (was a raw
    // `zIndex: 1`, which silently outranks a z-auto sibling panel).
    zIndex: vars["--ads-z-index-sticky"],
  },
  dropLineBefore: {
    insetBlockStart: 0,
  },
  dropLineAfter: {
    insetBlockEnd: 0,
  },
  rowDisabled: {
    cursor: "default",
    opacity: vars["--ads-opacity-disabled"],
  },
  // One rail per ancestor depth; the hairline sits at the span's center so it
  // aligns under the parent row's chevron.
  guide: {
    alignSelf: "stretch",
    flexShrink: 0,
    inlineSize: vars["--ads-space-16"],
    marginInlineEnd: `calc(-1 * ${vars["--ads-space-4"]})`,
    position: "relative",
    "::before": {
      backgroundColor: vars["--ads-color-border-subtle"],
      blockSize: "100%",
      content: '""',
      inlineSize: vars["--ads-border-width-hairline"],
      insetInlineStart: "50%",
      position: "absolute",
    },
  },
  guideCompact: {
    inlineSize: vars["--ads-space-12"],
  },
  disclosure: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: vars["--ads-space-16"],
    justifyContent: "center",
  },
  disclosureCompact: {
    inlineSize: vars["--ads-space-12"],
  },
  icon: {
    alignItems: "center",
    blockSize: vars["--ads-control-icon-size-sm"],
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-sm"],
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
    gap: vars["--ads-space-4"],
    marginInlineStart: "auto",
  },
  meta: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  // Row actions keep their box at rest so the label does not re-flow under
  // the pointer when they appear; only the paint is withheld. Revealed on row
  // hover (tracked by the row, see `TreeRow`) and on `:focus-within`, so a
  // keyboard user who tabs onto the control sees what they landed on.
  actions: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    gap: vars["--ads-space-4"],
    marginInlineStart: vars["--ads-space-4"],
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
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: {
      default: vars["--ads-color-border"],
      ":focus-within": vars["--ads-color-border-focus"],
    },
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text"],
    flexGrow: 1,
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    minInlineSize: 0,
    paddingBlock: 0,
    paddingInline: vars["--ads-space-4"],
  },
});
