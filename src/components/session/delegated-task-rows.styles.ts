import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const delegatedTaskRowsStyles = stylex.create({
  row: {
    minWidth: 0,
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    backgroundColor: vars["--aui-color-surface-tint"],
    paddingInline: "0.625rem",
    paddingBlock: vars["--aui-space-8"],
  },
  rowBorderDefault: { borderColor: vars["--aui-color-border"] },
  rowBorderBlocked: { borderColor: vars["--aui-color-warning-border"] },
  headerRow: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    rowGap: vars["--aui-space-4"],
  },
  phaseBadge: {
    flexShrink: 0,
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  // The row's title, so it takes the row-title step rather than sitting a
  // rung under the metadata it labels.
  delegationName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  metaText: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  metaTextNums: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--aui-color-text-muted"],
  },
  // Consequential prose — why a delegated task is blocked, why it stopped, what
  // failed. Micro is the badge-count step, not a step for text a user has to
  // read to act on.
  blockedHint: {
    marginTop: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-warning"],
  },
  reasonText: {
    marginTop: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
  },
  errorText: {
    marginTop: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-danger"],
  },
  actionsRow: {
    marginTop: "0.375rem",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },
  composer: {
    marginTop: "0.375rem",
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
    padding: vars["--aui-space-8"],
  },
  composerLabel: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  composerTextarea: {
    marginTop: vars["--aui-space-4"],
    minHeight: "4rem",
    resize: "vertical",
    backgroundColor: vars["--aui-color-canvas"],
    fontSize: vars["--aui-font-size-caption"],
  },
  composerActions: {
    marginTop: "0.375rem",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },
  composerHint: { fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  // Glyph inside a control, so it takes the control-icon floor rather than a
  // raw 12px that reads as a status mark.
  actionIcon: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"] },
  backlink: {
    display: "flex",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    rowGap: vars["--aui-space-4"],
  },
  backlinkLabel: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: vars["--aui-color-text-muted"],
  },
  /* A parent task's title, not a chip: Micro is the badge-count step and this
     is the row's one orienting label. */
  backlinkTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text"],
  },
  /* Body-semibold, and no uppercase or tracking: those were standing in
     for a hierarchy the step now supplies directly, and at 11px they cost
     the x-height and word-shape cues that make a header scannable in the
     first place. Matches the section headers in the changes panel and the
     workspace sidebar. */
  sectionHeading: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    color: vars["--aui-color-text-muted"],
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
export const delegatedTaskPhaseToneStyles = stylex.create({
  active: {
    borderColor: vars["--aui-color-accent"],
    backgroundColor: vars["--aui-color-accent-soft"],
    color: vars["--aui-color-accent"],
  },
  waiting: {
    borderColor: vars["--aui-color-warning-border"],
    backgroundColor: vars["--aui-color-warning-soft"],
    color: vars["--aui-color-warning"],
  },
  done: {
    borderColor: vars["--aui-color-success-border"],
    backgroundColor: vars["--aui-color-success-soft"],
    color: vars["--aui-color-success"],
  },
  failed: {
    borderColor: vars["--aui-color-danger-border"],
    backgroundColor: vars["--aui-color-danger-soft"],
    color: vars["--aui-color-danger"],
  },
  released: {
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
    color: vars["--aui-color-text-muted"],
  },
});
