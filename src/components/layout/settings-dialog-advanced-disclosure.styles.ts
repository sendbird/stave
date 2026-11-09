import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Collapsed "Advanced" group used by settings sections. The trigger carries
 * the settings column's hairline rule and inline padding. AUI's compound
 * Accordion.Trigger renders only what it is given — the title span and the
 * chevron affordance belong to the call site.
 */
export const advancedDisclosureStyles = stylex.create({
  trigger: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderRadius: vars["--aui-space-0"],
    paddingBlock: vars["--aui-space-20"],
    paddingInline: vars["--aui-space-0"],
  },
  // Nested inside a SettingsCard the disclosure sits between field rows, so
  // it uses the field-title scale instead of the section-title scale.
  triggerCompact: {
    paddingBlock: vars["--aui-space-12"],
  },
  titleGroup: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    minInlineSize: 0,
    textAlign: "start",
  },
  title: {
    color: "inherit",
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.015em",
    lineHeight: vars["--aui-line-height-normal"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  titleCompact: {
    fontSize: vars["--aui-font-size-body"],
    letterSpacing: "normal",
  },
  description: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-regular"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  chevron: {
    blockSize: vars["--aui-control-icon-size-sm"],
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  chevronOpen: {
    transform: "rotate(180deg)",
  },
  panel: {
    paddingBlockEnd: vars["--aui-space-8"],
  },
  // Matches SettingsCard's body rhythm so folded fields keep their spacing.
  panelStack: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-20"],
  },
});
