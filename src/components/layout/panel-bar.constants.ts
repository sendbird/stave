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
    color: vars.colorText,
    display: "inline-flex",
    fontFamily: vars.fontSans,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space8,
    lineHeight: 1,
  },
  headerIcon: {
    color: vars.colorTextMuted,
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
});

export const PANEL_BAR_HEIGHT_CLASS = sx(panelBarStyles.bar);
export const PANEL_HEADER_TITLE_CLASS = sx(panelBarStyles.headerTitle);
export const PANEL_HEADER_ICON_CLASS = sx(panelBarStyles.headerIcon);
