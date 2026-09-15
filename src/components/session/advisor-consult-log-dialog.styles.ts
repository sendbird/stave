import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const advisorConsultLogDialogStyles = stylex.create({
  dialogContent: {
    gap: 0,
    maxWidth: "48rem",
    padding: 0,
  },
  header: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  staticContent: {
    maxWidth: "48rem",
  },
  staticTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  staticDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  emptyBody: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-24"],
    paddingInline: vars["--ads-space-16"],
  },
  grid: {
    display: "grid",
    maxHeight: "min(34rem, 70vh)",
    minHeight: 0,
    "@media (min-width: 768px)": {
      gridTemplateColumns: "15rem 1fr",
    },
  },
  listColumn: {
    borderColor: vars["--ads-color-border"],
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: 6,
    "@media (min-width: 768px)": {
      borderRightStyle: "solid",
      borderRightWidth: vars["--ads-border-width-hairline"],
    },
  },

  // Section label for the log-only sections (post-consult, verdict).
  sectionLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },

  // Consult row (an ADS host button). `layout="host"` supplies the quiet hover
  // wash, focus ring, and color transition; this owns geometry, the selected
  // fill, and restores full-contrast text (host quiet chrome rests muted).
  row: {
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
    textAlign: "left",
    width: "100%",
  },
  rowSelected: {
    backgroundColor: vars["--ads-color-selection-fill"],
  },
  rowHeader: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
  },
  verdictDot: {
    borderRadius: vars["--ads-radius-full"],
    flexShrink: 0,
    height: 6,
    width: 6,
  },
  rowTitle: {
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chip: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    minBlockSize: "1rem",
    paddingInline: vars["--ads-space-4"],
  },
  rowMeta: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: 6,
    lineHeight: "1rem",
    minWidth: 0,
  },
  rowMetaLabel: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowCurrentTurn: {
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    paddingInline: vars["--ads-space-4"],
  },
  rowDuration: {
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },

  // Detail pane.
  detail: {
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  section: {
    marginTop: vars["--ads-space-12"],
  },
  footnote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: 1.45,
    marginTop: vars["--ads-space-4"],
  },
  postConsultList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    marginTop: vars["--ads-space-4"],
  },
  postConsultItem: {
    alignItems: "baseline",
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    lineHeight: 1.5,
  },
  postConsultAt: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  postConsultTitle: {
    color: vars["--ads-color-text"],
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  verdictControl: {
    marginTop: 6,
  },
  tally: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: 1.45,
    marginTop: 6,
  },
});

export const advisorConsultLogVerdictDot = stylex.create({
  helpful: { backgroundColor: vars["--ads-color-success"] },
  not_helpful: { backgroundColor: vars["--ads-color-warning"] },
  ignored: { backgroundColor: vars["--ads-color-text-muted"] },
});
