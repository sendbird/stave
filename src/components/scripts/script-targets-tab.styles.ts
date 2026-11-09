import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const targetsTabStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--aui-space-12"],
  },
  headerText: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  title: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    color: vars["--aui-color-text"],
  },
  description: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  mono: {
    fontFamily: vars["--aui-font-mono"],
  },
  addButton: {
    gap: vars["--aui-space-4"],
  },
  buttonIcon: {
    width: 14,
    height: 14,
  },
  overrideRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-4"],
  },
  overrideLabel: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  overrideButton: {
    height: 28,
    gap: vars["--aui-space-4"],
  },
  emptyState: {
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "dashed",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
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
    gap: vars["--aui-space-12"],
    borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface"],
    padding: vars["--aui-space-12"],
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
  },
  cardHeaderTitle: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--aui-space-8"],
  },
  cardTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  usageBadge: {
    borderRadius: vars["--aui-radius-mark"],
    paddingInline: vars["--aui-space-8"],
    paddingBlock: 0,
    fontSize: vars["--aui-font-size-micro"],
  },
  deleteButton: {
    width: 32,
    height: 32,
    // One value, one declaration. The `:hover` arm named the SAME token as the
    // resting state, so it was a state change that changed nothing — and it
    // read as "this control has a hover tone" to every later reader and to the
    // hard-cut check, which flagged the module for a transition it did not
    // need. The delete affordance is red at rest and stays red.
    color: vars["--aui-color-danger-text"],
  },
  fieldGrid: {
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 40rem)": "1fr 1fr",
    },
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  fieldLabel: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  monoInput: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  hint: {
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  triggerFull: {
    width: "100%",
  },
  injectedBox: {
    borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-tint"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: 10,
  },
  injectedTitle: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  injectedDescription: {
    marginTop: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  injectedList: {
    marginTop: vars["--aui-space-8"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
  },
  varBadge: {
    borderRadius: vars["--aui-radius-mark"],
    paddingInline: vars["--aui-space-8"],
    paddingBlock: 0,
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-micro"],
  },
  footnote: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  emphasis: {
    fontWeight: vars["--aui-font-weight-medium"],
  },
});
