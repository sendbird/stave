import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

const border65 = `color-mix(in oklch, ${vars["--ads-color-border"]} 65%, transparent)`;

export const autoRoutingProfileListStyles = stylex.create({
  /*
   * The Auto tab hides the model search row, so this panel owns the full
   * popover height. Everything below is sized so all four profile rows fit
   * inside it without scrolling at the selector's 25rem height.
   */
  panel: {
    display: "flex",
    minHeight: 0,
    flex: 1,
    flexDirection: "column",
    overflowY: "auto",
  },
  header: {
    display: "flex",
    flexShrink: 0,
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    padding: vars["--ads-space-12"],
  },
  headerIcon: {
    width: "0.875rem",
    height: "0.875rem",
    marginBlockStart: "0.125rem",
    flexShrink: 0,
    color: vars["--ads-color-accent"],
  },
  headerBody: {
    display: "flex",
    minWidth: 0,
    flexDirection: "column",
    gap: "0.125rem",
  },
  headerTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  headerText: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  notice: {
    flexShrink: 0,
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: border65,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-warning-text"],
  },
  sectionLabel: {
    flexShrink: 0,
    paddingInline: vars["--ads-space-12"],
    paddingBlockStart: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: vars["--ads-color-text-muted"],
  },
  list: {
    display: "flex",
    minHeight: 0,
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    padding: vars["--ads-space-8"],
  },
  row: {
    display: "flex",
    width: "100%",
    flexShrink: 0,
    // Top-aligned, not centred: a wrapped description would otherwise drop the
    // swatch on that row. Anchoring to the title line keeps the marks on one
    // axis down the list.
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: "transparent",
    paddingInline: vars["--ads-space-8"],
    paddingBlock: "0.375rem",
    textAlign: "start",
  },
  rowIdle: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
  },
  rowSelected: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 35%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 10%, transparent)`,
  },
  swatch: {
    width: "1.5rem",
    height: "1.5rem",
    flexShrink: 0,
    // Optical centre on the title line rather than its box top.
    marginBlockStart: "0.0625rem",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-text"]} 5%, transparent)`,
    boxShadow: vars["--ads-elevation-raised"],
  },
  body: {
    display: "flex",
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
    gap: "0.0625rem",
  },
  titleLine: {
    display: "flex",
    minWidth: 0,
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
  badge: {
    flexShrink: 0,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    paddingInline: "0.375rem",
    paddingBlock: "0.125rem",
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  description: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  check: {
    width: "0.875rem",
    height: "0.875rem",
    flexShrink: 0,
    marginBlockStart: "0.3125rem",
    color: vars["--ads-color-accent"],
  },
  footer: {
    flexShrink: 0,
    paddingInline: vars["--ads-space-12"],
    paddingBlockEnd: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
});
