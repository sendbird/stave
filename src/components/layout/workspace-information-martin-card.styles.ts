import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

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
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    padding: vars["--aui-space-12"],
  },
  head: {
    alignItems: "flex-start",
    display: "flex",
    gap: 10,
  },
  iconBox: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface-tint"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  icon: { color: vars["--aui-color-text-muted"], height: 16, width: 16 },
  headBody: { flex: 1, minWidth: 0 },
  titleRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  staleIcon: { height: 12, width: 12 },
  headNote: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
    marginBlockStart: vars["--aui-space-2"],
  },
  linkedBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    marginBlockStart: vars["--aui-space-12"],
  },
  openProject: {
    "--martin-open-icon-color": {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-accent"],
    },
    alignItems: "center",
    color: { default: vars["--aui-color-text"], ":hover": vars["--aui-color-accent"] },
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
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
    color: `var(--martin-open-icon-color, ${vars["--aui-color-text-muted"]})`,
    flexShrink: 0,
    height: vars["--aui-control-icon-size-sm"],
    width: vars["--aui-control-icon-size-sm"],
  },
  meta: { color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"] },
  staleNotice: {
    backgroundColor: vars["--aui-color-warning-soft"],
    borderColor: vars["--aui-color-warning-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-warning-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: 10,
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
  },
  actionIcon: { height: vars["--aui-control-icon-size-sm"], width: vars["--aui-control-icon-size-sm"] },
  searchBody: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBlockStart: vars["--aui-space-12"],
  },
  searchForm: { display: "flex", gap: vars["--aui-space-8"] },
  searchInput: { height: 32 },
  error: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-relaxed"],
  },
  emptyResults: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  results: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    maxHeight: "13rem",
    overflowY: "auto",
  },
  resultRow: {
    alignItems: "flex-start",
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border-subtle"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: 10,
  },
  resultBody: { flex: 1, minWidth: 0 },
  resultTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  resultName: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultBadge: { fontSize: vars["--aui-font-size-micro"], height: 20 },
  resultSummary: {
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    color: vars["--aui-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "15px",
    marginBlockStart: vars["--aui-space-4"],
    overflow: "hidden",
  },
});
