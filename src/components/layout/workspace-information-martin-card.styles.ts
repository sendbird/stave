import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * Martin project card inside the Information panel.
 *
 * The open-project row drives its trailing icon through
 * `--martin-open-icon-color`: StyleX has no ancestor selector, so the hover
 * hand-off that used to be `group-hover:` is carried by a custom property the
 * parent recolors on `:hover` and the icon reads.
 */
export const workspaceInformationMartinCardStyles = stylex.create({
  root: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-12"],
  },
  head: {
    alignItems: "flex-start",
    display: "flex",
    gap: 10,
  },
  iconBox: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  icon: { color: vars["--ads-color-text-muted"], height: 16, width: 16 },
  headBody: { flex: 1, minWidth: 0 },
  titleRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  staleIcon: { height: 12, width: 12 },
  headNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
    marginBlockStart: vars["--ads-space-2"],
  },
  linkedBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    marginBlockStart: vars["--ads-space-12"],
  },
  openProject: {
    "--martin-open-icon-color": {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-accent"],
    },
    alignItems: "center",
    color: { default: vars["--ads-color-text"], ":hover": vars["--ads-color-accent"] },
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: 6,
    maxWidth: "100%",
    textAlign: "start",
  },
  openProjectName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  openProjectIcon: {
    color: `var(--martin-open-icon-color, ${vars["--ads-color-text-muted"]})`,
    flexShrink: 0,
    height: vars["--ads-control-icon-size-sm"],
    width: vars["--ads-control-icon-size-sm"],
  },
  meta: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  staleNotice: {
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-warning-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: 10,
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  actionIcon: { height: vars["--ads-control-icon-size-sm"], width: vars["--ads-control-icon-size-sm"] },
  searchBody: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBlockStart: vars["--ads-space-12"],
  },
  searchForm: { display: "flex", gap: vars["--ads-space-8"] },
  searchInput: { height: 32 },
  error: {
    color: vars["--ads-color-danger-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-relaxed"],
  },
  emptyResults: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  results: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    maxHeight: "13rem",
    overflowY: "auto",
  },
  resultRow: {
    alignItems: "flex-start",
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: 10,
  },
  resultBody: { flex: 1, minWidth: 0 },
  resultTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  resultName: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultBadge: { fontSize: vars["--ads-font-size-micro"], height: 20 },
  resultSummary: {
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    color: vars["--ads-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: vars["--ads-line-height-tight"],
    marginBlockStart: vars["--ads-space-4"],
    overflow: "hidden",
  },
});
