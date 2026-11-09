import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Project-memory list and per-memory editor inside the Information panel. */
export const workspaceMemorySectionStyles = stylex.create({
  empty: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-body"] },
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  controls: {
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    padding: vars["--aui-space-12"],
  },
  controlsSummary: {
    cursor: "pointer",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  controlsBody: { paddingBlockStart: vars["--aui-space-16"] },
  hint: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  /* The search and the kind chips under it, flush with the hint above: they
     filter the list, they are not rows of it. The chip track wraps onto a
     second line in a narrow rail rather than overflowing it. */
  filters: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  filterStatus: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    lineHeight: vars["--aui-line-height-tight"],
  },
  filterStatusText: { minWidth: 0 },
  /* "Last confirmed 3d ago": the relative time is a button (its card shows
     the absolute time), so this wrapper must not clip its focus ring the way
     the ellipsizing `metaText` would. */
  metaTime: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    whiteSpace: "nowrap",
  },
  /* "Source task": a text link at the meta line's own size, not a control-
     height button, so when a narrow row wraps it under the time it sits one
     text line down rather than a control's height down. Accent ink and an
     underline on hover, like the row titles' links. */
  sourceLink: {
    color: vars["--aui-color-accent"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-tight"],
    textDecorationLine: { default: "none", ":hover": "underline" },
    whiteSpace: "nowrap",
  },
  error: { color: vars["--aui-color-danger-text"], fontSize: vars["--aui-font-size-body"] },
  retry: { textDecorationLine: "underline" },
  /* Row shape, hover wash and action trail come from
     `information-row.styles.ts`, shared with the linked-pull-request and
     saved-plan lists. Only the recall mark's ink and the row's own action
     buttons are memory-specific. */
  markCore: { color: vars["--aui-color-accent"] },
  markContextual: { color: vars["--aui-color-text-muted"] },
  markCandidate: { color: vars["--aui-color-text-subtle"] },
  rowAction: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    blockSize: vars["--aui-icon-button-size"],
    borderRadius: vars["--aui-radius-control"],
    color: {
      default: vars["--aui-color-text-subtle"],
      ":hover": vars["--aui-color-text"],
    },
    display: "flex",
    flexShrink: 0,
    inlineSize: vars["--aui-icon-button-size"],
    justifyContent: "center",
  },
  rowActionDanger: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-danger-soft"],
    },
    color: {
      default: vars["--aui-color-text-subtle"],
      ":focus-visible": vars["--aui-color-danger-text"],
      ":hover": vars["--aui-color-danger-text"],
    },
  },
  rowActionIcon: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  fieldLabel: {
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  fieldTextarea: {
    fontSize: vars["--aui-font-size-body"],
    marginBlockStart: vars["--aui-space-4"],
    minHeight: 112,
    resize: "vertical",
  },
  counter: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  controlRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  kindTrigger: { width: "8rem" },
  modeTrigger: { maxWidth: "100%", width: "13rem" },
  actionRow: { display: "flex", gap: vars["--aui-space-8"] },
  /* The memory sentence IS the row's title, so it takes the row-title step and
     clamps to two lines rather than ellipsizing at the first: a memory that
     reads "Use Bun for install, test and build" is useless truncated to "Use
     Bun for install,". The full text stays one click away in the editor. */
  content: {
    color: vars["--aui-color-text"],
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-normal"],
    overflow: "hidden",
    overflowWrap: "anywhere",
  },
});
