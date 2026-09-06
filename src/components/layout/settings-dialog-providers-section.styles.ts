import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const providersStyles = stylex.create({
  // DescribedSelect wrapper: vertical stack with a small gap.
  describedSelectRoot: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  // Trigger width only; the ADS Select trigger owns border, radius, and fill.
  describedSelectTrigger: {
    width: 256,
  },
  // Popup geometry only; the ADS Select popup owns its surface and radius.
  describedSelectContent: {
    minWidth: "var(--anchor-width)",
    maxWidth: "24rem",
  },
  // Muted descriptive copy under a select.
  describedSelectHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
  },
  describedSelectHintTerm: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  // Trusted-tools list.
  trustedList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  trustedRow: {
    alignItems: "center",
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  trustedRowLabel: {
    fontSize: vars.fontSizeBody,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  trustedRemove: {
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    height: 28,
    paddingInline: vars.space8,
  },
  emptyCopy: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
  },
  // Provider tabs.
  tabs: {
    gap: vars.space16,
  },
  tabsList: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    height: "auto",
    justifyContent: "flex-start",
    padding: vars.space4,
    width: "100%",
  },
  tabsTrigger: {
    borderRadius: vars.radiusPanel,
    flex: "none",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    height: 32,
    paddingInline: vars.space12,
  },
  // Sandbox/plan-mode inline field font-family override on the DraftInput.
  fieldMono: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeBody,
    height: vars.controlHeightLg,
  },
  field: {
    height: vars.controlHeightLg,
  },
  presetHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  webSearchHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
  },
});
