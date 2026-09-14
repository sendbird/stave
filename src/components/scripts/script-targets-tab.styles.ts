import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const targetsTabStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--ads-space-12"],
  },
  headerText: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  title: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text"],
  },
  description: {
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  mono: {
    fontFamily: vars["--ads-font-mono"],
  },
  addButton: {
    gap: vars["--ads-space-4"],
  },
  buttonIcon: {
    width: 14,
    height: 14,
  },
  overrideRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-4"],
  },
  overrideLabel: {
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  overrideButton: {
    height: 28,
    gap: vars["--ads-space-4"],
  },
  emptyState: {
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "dashed",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
  },
  emptyIcon: {
    width: 16,
    height: 16,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
    padding: vars["--ads-space-12"],
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
  },
  cardHeaderTitle: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  cardTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  usageBadge: {
    borderRadius: vars["--ads-radius-mark"],
    paddingInline: vars["--ads-space-8"],
    paddingBlock: 0,
    fontSize: vars["--ads-font-size-micro"],
  },
  deleteButton: {
    width: 32,
    height: 32,
    // One value, one declaration. The `:hover` arm named the SAME token as the
    // resting state, so it was a state change that changed nothing — and it
    // read as "this control has a hover tone" to every later reader and to the
    // hard-cut check, which flagged the module for a transition it did not
    // need. The delete affordance is red at rest and stays red.
    color: vars["--ads-color-danger-text"],
  },
  fieldGrid: {
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 40rem)": "1fr 1fr",
    },
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  fieldLabel: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  monoInput: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  hint: {
    display: "block",
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  triggerFull: {
    width: "100%",
  },
  injectedBox: {
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: 10,
  },
  injectedTitle: {
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  injectedDescription: {
    marginTop: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  injectedList: {
    marginTop: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
  },
  varBadge: {
    borderRadius: vars["--ads-radius-mark"],
    paddingInline: vars["--ads-space-8"],
    paddingBlock: 0,
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
  },
  footnote: {
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  emphasis: {
    fontWeight: vars["--ads-font-weight-medium"],
  },
});
