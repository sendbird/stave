import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

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
    gap: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
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
    backgroundColor: vars["--aui-color-surface-tint"],
    borderRadius: vars["--aui-radius-full"],
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: "1rem",
    paddingBlock: "0.125rem",
    paddingInline: vars["--aui-space-8"],
  },
  headline: {
    flex: 1,
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: "1.25rem",
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  elapsed: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  meta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    margin: 0,
    overflowWrap: "anywhere",
  },
  turnId: {
    fontFamily: vars["--aui-font-mono"],
  },
  prompt: {
    borderInlineStartColor: vars["--aui-color-border"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 2,
    color: vars["--aui-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.125rem",
    margin: 0,
    overflow: "hidden",
    overflowWrap: "anywhere",
    paddingInlineStart: vars["--aui-space-8"],
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
    whiteSpace: "pre-wrap",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  sectionHeading: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.025em",
    lineHeight: "1rem",
    margin: 0,
  },
  sectionNote: {
    color: vars["--aui-color-text-muted"],
    fontWeight: vars["--aui-font-weight-regular"],
    letterSpacing: "normal",
  },
  notice: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.125rem",
    margin: 0,
    paddingInline: vars["--aui-space-8"],
  },
  noticeLead: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
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
    marginBlockStart: vars["--aui-space-4"],
    padding: 0,
  },
  failure: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    overflowWrap: "anywhere",
  },
  failureScript: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
  },
  failureKind: {
    color: vars["--aui-color-text-muted"],
  },
});
