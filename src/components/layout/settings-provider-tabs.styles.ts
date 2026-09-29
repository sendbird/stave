import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The one provider tab strip used across Settings (Providers, Worker mode,
 * Selector Models). Each surface used to restyle its own strip, so the same
 * four providers rendered with a glued icon, a spaced icon, or no icon at all
 * depending on where the user looked.
 */
export const settingsProviderTabsStyles = stylex.create({
  list: {
    inlineSize: "100%",
    justifyContent: "flex-start",
  },
  // The ADS tab is `inline-flex` with no gap, so an icon + label pair needs
  // its spacing stated here rather than relying on whitespace.
  trigger: {
    gap: vars["--ads-space-8"],
  },
  icon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
});
