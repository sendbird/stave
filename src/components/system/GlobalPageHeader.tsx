import * as stylex from "@stylexjs/stylex";
import { PageHeader, type PageHeaderProps } from "@/components/aui/components/AppShell.PageHeader";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";

/**
 * Where the header sits, which decides who owns the page's inline inset:
 * - `surface` (default): the full-bleed top band of a surface whose body runs
 *   edge to edge (Fleet, Schedules, Agents, Issues, Tars). The header owns the
 *   inset and its divider spans the surface. Full-bleed surfaces share one
 *   inline inset, `space16`, so the header, toolbars and first column start on
 *   the same edge.
 * - `column`: the first row of a centered page column that already owns the
 *   inset (Activity, AI usage). The header adds none, so its title starts on
 *   the same edge as the column's content and the divider spans the column.
 */
export type GlobalPageHeaderPlacement = "surface" | "column";

/** Shared geometry for global surfaces; each surface owns its actions. */
export function GlobalPageHeader({ placement = "surface", ...props }: PageHeaderProps & { placement?: GlobalPageHeaderPlacement }) {
  return <div className={sx(styles.root, placement === "column" && styles.column)} data-placement={placement}><PageHeader {...props} /></div>;
}
const styles = stylex.create({
  root: {
    flexShrink: 0, paddingBlock: vars["--aui-space-12"], paddingInline: vars["--aui-space-16"],
    borderBottomWidth: vars["--aui-border-width-hairline"], borderBottomStyle: "solid", borderBottomColor: vars["--aui-color-border-subtle"],
  },
  // The column's own block padding already separates the header from the top.
  column: { paddingBlockStart: 0, paddingInline: 0 },
});
