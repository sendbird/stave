import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const childTaskRowsStyles = stylex.create({
  row: {
    minWidth: 0,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    backgroundColor: vars["--ads-color-surface-tint"],
    paddingInline: "0.625rem",
    paddingBlock: vars["--ads-space-8"],
  },
  rowBorderDefault: { borderColor: vars["--ads-color-border"] },
  rowBorderBlocked: { borderColor: vars["--ads-color-warning-border"] },
  headerRow: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    rowGap: vars["--ads-space-4"],
  },
  phaseBadge: {
    flexShrink: 0,
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  // The row's title, so it takes the row-title step rather than sitting a
  // rung under the metadata it labels.
  delegationName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  metaText: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  metaTextNums: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--ads-color-text-muted"],
  },
  // Consequential prose — why a child task is blocked, why it stopped, what
  // failed. Micro is the badge-count step, not a step for text a user has to
  // read to act on.
  blockedHint: {
    marginTop: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-warning"],
  },
  reasonText: {
    marginTop: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  errorText: {
    marginTop: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-danger"],
  },
  actionsRow: {
    marginTop: "0.375rem",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-4"],
  },
  composer: {
    marginTop: "0.375rem",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
    padding: vars["--ads-space-8"],
  },
  composerLabel: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  composerTextarea: {
    marginTop: vars["--ads-space-4"],
    minHeight: "4rem",
    resize: "vertical",
    backgroundColor: vars["--ads-color-canvas"],
    fontSize: vars["--ads-font-size-caption"],
  },
  composerActions: {
    marginTop: "0.375rem",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-4"],
  },
  composerHint: { fontSize: vars["--ads-font-size-micro"], color: vars["--ads-color-text-muted"] },
  // Glyph inside a control, so it takes the control-icon floor rather than a
  // raw 12px that reads as a status mark.
  actionIcon: { width: vars["--ads-control-icon-size-sm"], height: vars["--ads-control-icon-size-sm"] },
  backlink: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    rowGap: vars["--ads-space-4"],
  },
  backlinkLabel: {
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: vars["--ads-color-text-muted"],
  },
  /* A parent task's title, not a chip: Micro is the badge-count step and this
     is the row's one orienting label. */
  backlinkTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text"],
  },
  /* Body-semibold, and no uppercase or tracking: those were standing in
     for a hierarchy the step now supplies directly, and at 11px they cost
     the x-height and word-shape cues that make a header scannable in the
     first place. Matches the section headers in the changes panel and the
     workspace sidebar. */
  sectionHeading: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text-muted"],
  },
  sectionRoot: { minWidth: 0 },
  sectionList: {
    marginTop: "0.375rem",
    display: "flex",
    minWidth: 0,
    flexDirection: "column",
    gap: "0.375rem",
  },
});

/** The phase tones, one style object per tone, colors from `vars`. */
export const childTaskPhaseToneStyles = stylex.create({
  active: {
    borderColor: vars["--ads-color-accent"],
    backgroundColor: vars["--ads-color-accent-soft"],
    color: vars["--ads-color-accent"],
  },
  waiting: {
    borderColor: vars["--ads-color-warning-border"],
    backgroundColor: vars["--ads-color-warning-soft"],
    color: vars["--ads-color-warning"],
  },
  done: {
    borderColor: vars["--ads-color-success-border"],
    backgroundColor: vars["--ads-color-success-soft"],
    color: vars["--ads-color-success"],
  },
  failed: {
    borderColor: vars["--ads-color-danger-border"],
    backgroundColor: vars["--ads-color-danger-soft"],
    color: vars["--ads-color-danger"],
  },
  released: {
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
    color: vars["--ads-color-text-muted"],
  },
});
