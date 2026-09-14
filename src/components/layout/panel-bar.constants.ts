import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";

/**
 * Shared chrome for the 46px panel bar that tops the right rail, the sidebar
 * panel headers, and the editor surface toolbar. Consumers that compose their
 * own StyleX arrays should use `panelBarStyles`; the `*_CLASS` exports stay for
 * call sites that only need a ready-made class string.
 */
export const panelBarStyles = stylex.create({
  bar: { height: 46 },
  headerTitle: {
    alignItems: "center",
    color: vars["--ads-color-text"],
    display: "inline-flex",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-8"],
    lineHeight: 1,
  },
  headerIcon: {
    color: vars["--ads-color-text-muted"],
    height: vars["--ads-control-icon-size-md"],
    width: vars["--ads-control-icon-size-md"],
  },
});

export const PANEL_BAR_HEIGHT_CLASS = sx(panelBarStyles.bar);
export const PANEL_HEADER_TITLE_CLASS = sx(panelBarStyles.headerTitle);
export const PANEL_HEADER_ICON_CLASS = sx(panelBarStyles.headerIcon);
