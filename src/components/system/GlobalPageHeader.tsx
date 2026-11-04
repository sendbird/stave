import * as stylex from "@stylexjs/stylex";
import { PageHeader, type PageHeaderProps } from "@/components/ads/components/AppShell.PageHeader";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";

/** Shared geometry for global surfaces; each surface owns its actions. */
export function GlobalPageHeader(props: PageHeaderProps) {
  return <div className={sx(styles.root)}><PageHeader {...props} /></div>;
}
const styles = stylex.create({ root: {
  flexShrink: 0, paddingBlock: vars["--ads-space-12"], paddingInline: vars["--ads-space-20"],
  borderBottomWidth: vars["--ads-border-width-hairline"], borderBottomStyle: "solid", borderBottomColor: vars["--ads-color-border-subtle"],
} });
