import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const entryCardStyles = stylex.create({
  root: {
    borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface"],
  },
  rootAttention: {
    borderColor: vars["--aui-color-danger-border"],
  },
  header: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 80rem)": "row",
    },
    gap: vars["--aui-space-12"],
    padding: vars["--aui-space-12"],
    alignItems: {
      default: null,
      "@media (min-width: 80rem)": "flex-start",
    },
    justifyContent: {
      default: null,
      "@media (min-width: 80rem)": "space-between",
    },
  },
  summaryButton: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
    textAlign: "left",
    background: "none",
    borderStyle: "none",
    padding: 0,
    cursor: "pointer",
    color: "inherit",
    font: "inherit",
  },
  chevron: {
    marginTop: 2,
    display: "flex",
    width: 16,
    height: 16,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    color: vars["--aui-color-text-muted"],
  },
  chevronIcon: {
    width: 16,
    height: 16,
  },
  summaryBody: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  titleRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-8"],
  },
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  runningBadge: {
    borderRadius: vars["--aui-radius-mark"],
    paddingInline: vars["--aui-space-8"],
    paddingBlock: 0,
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-accent"],
  },
  attention: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-danger-text"],
  },
  attentionIcon: {
    width: 12,
    height: 12,
  },
  metaText: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  triggerRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-4"],
    paddingTop: 2,
  },
  triggerLabel: {
    fontSize: vars["--aui-font-size-caption"],
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: vars["--aui-color-text-muted"],
  },
  triggerBadge: {
    borderRadius: vars["--aui-radius-full"],
    paddingInline: vars["--aui-space-8"],
    paddingBlock: 0,
    fontSize: vars["--aui-font-size-micro"],
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },
  iconButton: {
    width: 32,
    height: 32,
  },
  actionButtonTall: {
    height: 32,
  },
  icon: {
    width: 14,
    height: 14,
  },
  iconFlipped: {
    width: 14,
    height: 14,
    transform: "rotate(180deg)",
  },
  destructiveButton: {
    width: 32,
    height: 32,
    // One value, one declaration. The `:hover` arm named the SAME token as the
    // resting state, so it was a state change that changed nothing — and it
    // read as "this control has a hover tone" to every later reader and to the
    // hard-cut check, which flagged the module for a transition it did not
    // need. The delete affordance is red at rest and stays red.
    color: vars["--aui-color-danger-text"],
  },
  body: {
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--aui-color-border"],
    padding: vars["--aui-space-12"],
  },
});
