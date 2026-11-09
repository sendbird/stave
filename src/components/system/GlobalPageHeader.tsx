import * as stylex from "@stylexjs/stylex";
import { PageHeader, type PageHeaderProps } from "@/components/aui/components/AppShell.PageHeader";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";

/** Shared geometry for global surfaces; each surface owns its actions. */
export function GlobalPageHeader(props: PageHeaderProps) {
  return <div className={sx(styles.root)}><PageHeader {...props} /></div>;
}
const styles = stylex.create({ root: {
  flexShrink: 0, paddingBlock: vars["--aui-space-12"], paddingInline: vars["--aui-space-20"],
  borderBottomWidth: vars["--aui-border-width-hairline"], borderBottomStyle: "solid", borderBottomColor: vars["--aui-color-border-subtle"],
} });
