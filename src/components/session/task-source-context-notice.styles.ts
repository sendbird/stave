import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The chevron rotates with the disclosure's open state. StyleX conditions only
 * see the element they sit on, and `<details>[open]` is an ancestor of the
 * chevron, so the open state travels down as a custom property the chevron
 * reads for its transform.
 */
const CHEVRON_ROTATE = "--taskContextChevronRotate";

export const taskSourceContextNoticeStyles = stylex.create({
  root: {
    marginBottom: vars["--ads-space-8"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    backgroundColor: vars["--ads-color-surface-tint"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  headerRow: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"] },
  headerIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
    color: vars["--ads-color-text-muted"],
  },
  headerText: { minWidth: 0, flex: 1 },
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  subtitle: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  clearButton: {
    flexShrink: 0,
    borderRadius: vars["--ads-radius-control"],
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
  },
  staleNotice: {
    marginTop: vars["--ads-space-8"],
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-warning-border"],
    backgroundColor: vars["--ads-color-warning-soft"],
    paddingInline: "0.625rem",
    paddingBlock: "0.375rem",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text"],
  },
  staleIcon: {
    marginTop: "0.125rem",
    width: 14,
    height: 14,
    flexShrink: 0,
    color: vars["--ads-color-warning"],
  },
  staleBody: { minWidth: 0, flex: 1 },
  refreshButton: {
    marginTop: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-control"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    textDecorationLine: "underline",
    textUnderlineOffset: "2px",
    color: {
      default: "inherit",
      ":hover": vars["--ads-color-text"],
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
    gap: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-control"],
    paddingBlock: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    outlineStyle: "none",
    "::-webkit-details-marker": { display: "none" },
  },
  summaryChevron: {
    width: 14,
    height: 14,
    transform: `rotate(${CHEVRON_ROTATE})`,
    transitionProperty: "transform",
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  attachedList: {
    marginTop: "0.375rem",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    maxHeight: "14rem",
    overflowY: "auto",
    borderLeftWidth: vars["--ads-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: vars["--ads-color-border"],
    paddingLeft: vars["--ads-space-12"],
  },
  attachedHeaderRow: {
    marginBottom: vars["--ads-space-4"],
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
  },
  attachedTitle: {
    minWidth: 0,
    flex: 1,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  staleTag: {
    marginLeft: "0.375rem",
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-regular"],
    color: vars["--ads-color-warning"],
  },
  removeButton: {
    flexShrink: 0,
    borderRadius: vars["--ads-radius-control"],
    padding: "0.125rem",
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
  },
  removeIcon: { width: 14, height: 14 },
  attachedContent: {
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
    color: vars["--ads-color-text-muted"],
  },
});
