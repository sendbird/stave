import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The same card the composer gives the task's own approvals — canvas fill, a
 * warning hairline, raised — so a delegated child's request reads as the same
 * kind of thing, with one attribution line naming who is asking.
 */
export const childRequestSlotStyles = stylex.create({
  section: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-raised"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    marginBottom: vars["--ads-space-12"],
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
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  attribution: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    margin: 0,
    minWidth: 0,
  },
  eyebrow: {
    color: vars["--ads-color-text-subtle"],
    flex: "0 0 auto",
    whiteSpace: "nowrap",
  },
  childTitle: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  queued: {
    color: vars["--ads-color-text-subtle"],
    flex: "0 0 auto",
    fontSize: vars["--ads-font-size-micro"],
    marginInlineStart: "auto",
    whiteSpace: "nowrap",
  },
  status: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    margin: 0,
    paddingInline: vars["--ads-space-4"],
  },
  error: {
    color: vars["--ads-color-danger-text"],
  },
});
