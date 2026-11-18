import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Archived workspaces live behind a footer entry, the way Notion keeps Trash
 * and Arc keeps archived tabs at the bottom of the sidebar: rarely used, so
 * they never push the active project list down.
 */
export const archivedShelfStyles = stylex.create({
  // Matches the 32px footer chrome buttons; the count keeps it from reading as
  // a bare glyph without adding a tiny badge. Hover paint comes from the ghost
  // button itself.
  trigger: {
    borderRadius: vars["--aui-radius-control"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
    gap: vars["--aui-space-4"],
    height: vars["--aui-control-height-sm"],
    paddingInline: vars["--aui-space-8"],
  },
  triggerCollapsed: {
    borderRadius: vars["--aui-radius-control"],
    height: vars["--aui-control-height-lg"],
    padding: 0,
    width: vars["--aui-control-height-lg"],
  },
  icon: { flexShrink: 0, height: vars["--aui-control-icon-size-sm"], width: vars["--aui-control-icon-size-sm"] },
  iconCollapsed: { flexShrink: 0, height: vars["--aui-control-icon-size-md"], width: vars["--aui-control-icon-size-md"] },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    maxWidth: "calc(100vw - 2rem)",
    padding: vars["--aui-space-8"],
    width: "18rem",
  },
  header: {
    alignItems: "baseline",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-8"],
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
  },
  count: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    listStyle: "none",
    margin: 0,
    maxHeight: "18rem",
    overflowY: "auto",
    padding: 0,
  },
  row: {
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-4"],
    paddingInlineEnd: vars["--aui-space-4"],
    paddingInlineStart: vars["--aui-space-8"],
  },
  rowText: {
    display: "flex",
    flex: "1 1 0%",
    flexDirection: "column",
    minWidth: 0,
  },
  name: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  error: {
    color: vars["--aui-color-danger-text"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    paddingInline: vars["--aui-space-8"],
  },
  footer: {
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    paddingTop: vars["--aui-space-4"],
  },
  manage: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    justifyContent: "flex-start",
    width: "100%",
  },
});
