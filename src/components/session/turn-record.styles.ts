import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * An earlier turn's record in Activity. It reads as the finished turn's own
 * panel: the same header rhythm, the same rows, with the facts only the
 * record keeps in a section above the steps.
 */
export const turnRecordStyles = stylex.create({
  root: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    overflowY: "auto",
  },
  surface: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  restSlot: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  badge: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-full"],
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: "1rem",
    paddingBlock: "0.125rem",
    paddingInline: vars["--ads-space-8"],
  },
  headline: {
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: "1.25rem",
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  elapsed: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  meta: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    margin: 0,
    overflowWrap: "anywhere",
  },
  turnId: {
    fontFamily: vars["--ads-font-mono"],
  },
  prompt: {
    borderInlineStartColor: vars["--ads-color-border"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 2,
    color: vars["--ads-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.125rem",
    margin: 0,
    overflow: "hidden",
    overflowWrap: "anywhere",
    paddingInlineStart: vars["--ads-space-8"],
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
    whiteSpace: "pre-wrap",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  sectionHeading: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.025em",
    lineHeight: "1rem",
    margin: 0,
  },
  sectionNote: {
    color: vars["--ads-color-text-muted"],
    fontWeight: vars["--ads-font-weight-regular"],
    letterSpacing: "normal",
  },
  notice: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.125rem",
    margin: 0,
    paddingInline: vars["--ads-space-8"],
  },
  noticeLead: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  list: {
    display: "flex",
    flexDirection: "column",
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  failures: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    listStyle: "none",
    margin: 0,
    marginBlockStart: vars["--ads-space-4"],
    padding: 0,
  },
  failure: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    overflowWrap: "anywhere",
  },
  failureScript: {
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
  },
  failureKind: {
    color: vars["--ads-color-text-muted"],
  },
});
