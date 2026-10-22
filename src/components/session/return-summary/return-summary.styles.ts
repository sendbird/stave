import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const returnSummaryStyles = stylex.create({
  // Pinned to the top of the conversation, so it reads without scrolling the
  // transcript; the overlay around it passes clicks through.
  card: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 80%, transparent)`,
    borderRadius: vars["--ads-radius-frame"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-overlay"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    insetInlineStart: "50%",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    pointerEvents: "auto",
    position: "absolute",
    top: vars["--ads-space-12"],
    transform: "translateX(-50%)",
    width: `min(40rem, calc(100% - 2 * ${vars["--ads-space-12"]}))`,
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  headerIcon: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: 16,
    width: 16,
  },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: "1.25rem",
    margin: 0,
  },
  since: {
    color: vars["--ads-color-text-muted"],
    flex: 1,
    fontSize: vars["--ads-font-size-caption"],
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rows: {
    columnGap: vars["--ads-space-12"],
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr) max-content",
    margin: 0,
    rowGap: vars["--ads-space-4"],
  },
  row: {
    display: "contents",
  },
  label: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: "1.5rem",
    margin: 0,
    whiteSpace: "nowrap",
  },
  value: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.5rem",
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  action: {
    justifySelf: "end",
  },
});
