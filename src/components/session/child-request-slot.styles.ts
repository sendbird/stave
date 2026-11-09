import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The same card the composer gives the task's own approvals — canvas fill, a
 * warning hairline, raised — so a delegated child's request reads as the same
 * kind of thing, with one attribution line naming who is asking.
 */
export const childRequestSlotStyles = stylex.create({
  section: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-warning-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    marginBottom: vars["--aui-space-12"],
    padding: "0.625rem",
  },
  // A question set is capped like the task's own questions in the composer, so
  // a long one scrolls inside the card instead of pushing its actions away.
  sectionCapped: {
    maxHeight: "min(60vh, 34rem)",
    minHeight: 0,
  },
  header: {
    alignItems: "center",
    flexShrink: 0,
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  attribution: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    margin: 0,
    minWidth: 0,
  },
  eyebrow: {
    color: vars["--aui-color-text-muted"],
    flex: "0 0 auto",
    whiteSpace: "nowrap",
  },
  childTitle: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  queued: {
    color: vars["--aui-color-text-muted"],
    flex: "0 0 auto",
    fontSize: vars["--aui-font-size-caption"],
    marginInlineStart: "auto",
    whiteSpace: "nowrap",
  },
  status: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    paddingInline: vars["--aui-space-4"],
  },
  error: {
    color: vars["--aui-color-danger-text"],
  },
});
