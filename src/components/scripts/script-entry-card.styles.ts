import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const entryCardStyles = stylex.create({
  root: {
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
  },
  rootAttention: {
    borderColor: vars["--ads-color-danger-border"],
  },
  header: {
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 80rem)": "row",
    },
    gap: vars["--ads-space-12"],
    padding: vars["--ads-space-12"],
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
    gap: vars["--ads-space-8"],
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
    color: vars["--ads-color-text-muted"],
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
    gap: vars["--ads-space-4"],
  },
  titleRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  runningBadge: {
    borderRadius: vars["--ads-radius-mark"],
    paddingInline: vars["--ads-space-8"],
    paddingBlock: 0,
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-accent"],
  },
  attention: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-danger-text"],
  },
  attentionIcon: {
    width: 12,
    height: 12,
  },
  metaText: {
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  triggerRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-4"],
    paddingTop: 2,
  },
  triggerLabel: {
    fontSize: vars["--ads-font-size-micro"],
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: vars["--ads-color-text-muted"],
  },
  triggerBadge: {
    borderRadius: vars["--ads-radius-full"],
    paddingInline: vars["--ads-space-8"],
    paddingBlock: 0,
    fontSize: vars["--ads-font-size-micro"],
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-4"],
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
    color: vars["--ads-color-danger-text"],
  },
  body: {
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border"],
    padding: vars["--ads-space-12"],
  },
});
