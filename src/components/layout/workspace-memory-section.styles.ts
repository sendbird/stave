import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Project-memory list and per-memory editor inside the Information panel. */
export const workspaceMemorySectionStyles = stylex.create({
  empty: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-body"] },
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  controls: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-12"],
  },
  controlsSummary: {
    cursor: "pointer",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  controlsBody: { paddingBlockStart: vars["--ads-space-16"] },
  hint: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  error: { color: vars["--ads-color-danger-text"], fontSize: vars["--ads-font-size-body"] },
  retry: { textDecorationLine: "underline" },
  /* Row shape, hover wash and action trail come from
     `information-row.styles.ts`, shared with the linked-pull-request and
     saved-plan lists. Only the recall mark's ink and the row's own action
     buttons are memory-specific. */
  markCore: { color: vars["--ads-color-accent"] },
  markContextual: { color: vars["--ads-color-text-muted"] },
  markCandidate: { color: vars["--ads-color-text-subtle"] },
  rowAction: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    blockSize: vars["--ads-icon-button-size"],
    borderRadius: vars["--ads-radius-control"],
    color: {
      default: vars["--ads-color-text-subtle"],
      ":hover": vars["--ads-color-text"],
    },
    display: "flex",
    flexShrink: 0,
    inlineSize: vars["--ads-icon-button-size"],
    justifyContent: "center",
  },
  rowActionDanger: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-danger-soft"],
    },
    color: {
      default: vars["--ads-color-text-subtle"],
      ":focus-visible": vars["--ads-color-danger-text"],
      ":hover": vars["--ads-color-danger-text"],
    },
  },
  rowActionIcon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  fieldLabel: {
    display: "block",
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  fieldTextarea: {
    fontSize: vars["--ads-font-size-body"],
    marginBlockStart: vars["--ads-space-4"],
    minHeight: 112,
    resize: "vertical",
  },
  counter: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  controlRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  kindTrigger: { width: "8rem" },
  modeTrigger: { maxWidth: "100%", width: "13rem" },
  actionRow: { display: "flex", gap: vars["--ads-space-8"] },
  /* The memory sentence IS the row's title, so it takes the row-title step and
     clamps to two lines rather than ellipsizing at the first: a memory that
     reads "Use Bun for install, test and build" is useless truncated to "Use
     Bun for install,". The full text stays one click away in the editor. */
  content: {
    color: vars["--ads-color-text"],
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-normal"],
    overflow: "hidden",
    overflowWrap: "anywhere",
  },
});
