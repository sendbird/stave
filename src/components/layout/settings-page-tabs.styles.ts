import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The tab strip under a Settings page header. The bar owns the full-width
 * rule and the header's inline padding, so the first tab label lines up with
 * the page title. A `line` list is shrink-wrapped, so its own inset rule
 * would stop after the last label; it is dropped, and a hairline of negative
 * end margin lets the active bar paint over the bar's rule.
 */
export const settingsPageTabsStyles = stylex.create({
  bar: {
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    flexShrink: 0,
    minInlineSize: 0,
    paddingInline: {
      default: vars["--aui-space-16"],
      "@media (min-width: 640px)": vars["--aui-space-32"],
    },
  },
  // The root only holds the strip (the section renders below the scope
  // bar), so its list-to-panel gap would lift the active bar off the rule.
  root: {
    gap: 0,
  },
  list: {
    boxShadow: "none",
    gap: vars["--aui-space-20"],
    marginBlockEnd: `calc(-1 * ${vars["--aui-border-width-hairline"]})`,
  },
  tab: {
    flex: "none",
    paddingInline: 0,
  },
});
