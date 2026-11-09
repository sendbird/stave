import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The chevron rotates with the disclosure's open state. StyleX conditions only
 * see the element they sit on, and `<details>[open]` is an ancestor of the
 * chevron, so the open state travels down as a custom property the chevron
 * reads for its transform.
 */
const CHEVRON_ROTATE = "--taskContextChevronRotate";

export const taskSourceContextNoticeStyles = stylex.create({
  root: {
    marginBottom: vars["--aui-space-8"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    backgroundColor: vars["--aui-color-surface-tint"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
  },
  headerRow: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"] },
  headerIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
    color: vars["--aui-color-text-muted"],
  },
  headerText: { minWidth: 0, flex: 1 },
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  subtitle: { fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  clearButton: {
    flexShrink: 0,
    borderRadius: vars["--aui-radius-control"],
    paddingInline: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
  },
  staleNotice: {
    marginTop: vars["--aui-space-8"],
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-warning-border"],
    backgroundColor: vars["--aui-color-warning-soft"],
    paddingInline: "0.625rem",
    paddingBlock: "0.375rem",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text"],
  },
  staleIcon: {
    marginTop: "0.125rem",
    width: 14,
    height: 14,
    flexShrink: 0,
    color: vars["--aui-color-warning"],
  },
  staleBody: { minWidth: 0, flex: 1 },
  refreshButton: {
    marginTop: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-control"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    textDecorationLine: "underline",
    textUnderlineOffset: "2px",
    color: {
      default: "inherit",
      ":hover": vars["--aui-color-text"],
    },
  },
  details: {
    marginTop: "0.375rem",
    [CHEVRON_ROTATE]: { default: "0deg", ":is([open])": "180deg" },
  },
  summary: {
    display: "flex",
    width: "fit-content",
    cursor: "pointer",
    listStyle: "none",
    alignItems: "center",
    gap: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-control"],
    paddingBlock: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
    outlineStyle: "none",
    "::-webkit-details-marker": { display: "none" },
  },
  summaryChevron: {
    width: 14,
    height: 14,
    transform: `rotate(${CHEVRON_ROTATE})`,
    transitionProperty: "transform",
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  attachedList: {
    marginTop: "0.375rem",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    maxHeight: "14rem",
    overflowY: "auto",
    borderLeftWidth: vars["--aui-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: vars["--aui-color-border"],
    paddingLeft: vars["--aui-space-12"],
  },
  attachedHeaderRow: {
    marginBottom: vars["--aui-space-4"],
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
  },
  attachedTitle: {
    minWidth: 0,
    flex: 1,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  staleTag: {
    marginLeft: "0.375rem",
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-regular"],
    color: vars["--aui-color-warning"],
  },
  removeButton: {
    flexShrink: 0,
    borderRadius: vars["--aui-radius-control"],
    padding: "0.125rem",
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
  },
  removeIcon: { width: 14, height: 14 },
  attachedContent: {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1.25rem",
    color: vars["--aui-color-text-muted"],
  },
});
