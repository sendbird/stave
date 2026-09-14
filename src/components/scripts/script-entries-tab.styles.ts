import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const entriesTabStyles = stylex.create({
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
  addButton: {
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
  buttonIcon: {
    width: 14,
    height: 14,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
});
