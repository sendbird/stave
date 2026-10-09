import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * Collapsed "Advanced" group used by settings sections. The trigger carries
 * the settings column's hairline rule and inline padding. ADS's compound
 * Accordion.Trigger renders only what it is given — the title span and the
 * chevron affordance belong to the call site.
 */
export const advancedDisclosureStyles = stylex.create({
  trigger: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderRadius: vars["--ads-space-0"],
    paddingBlock: vars["--ads-space-20"],
    paddingInline: vars["--ads-space-0"],
  },
  // Nested inside a SettingsCard the disclosure sits between field rows, so
  // it uses the field-title scale instead of the section-title scale.
  triggerCompact: {
    paddingBlock: vars["--ads-space-12"],
  },
  titleGroup: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    minInlineSize: 0,
    textAlign: "start",
  },
  title: {
    color: "inherit",
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.015em",
    lineHeight: vars["--ads-line-height-normal"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  titleCompact: {
    fontSize: vars["--ads-font-size-body"],
    letterSpacing: "normal",
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-regular"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  chevron: {
    blockSize: vars["--ads-control-icon-size-sm"],
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  chevronOpen: {
    transform: "rotate(180deg)",
  },
  panel: {
    paddingBlockEnd: vars["--ads-space-8"],
  },
  // Matches SettingsCard's body rhythm so folded fields keep their spacing.
  panelStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-20"],
  },
});
