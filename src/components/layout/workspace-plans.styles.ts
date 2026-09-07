import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/** Saved-plan list: header, empty state, and the per-plan row cluster. */
export const planStyles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: vars.space12 },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  headerText: { display: "flex", flexDirection: "column", gap: vars.space2 },
  headerTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  headerHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightTight,
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  headerBadge: { borderRadius: vars.radiusMark },
  refreshButton: {
    borderRadius: vars.radiusMark,
    blockSize: vars.controlHeightSm,
  },
  refreshIcon: {
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
    marginRight: vars.space4,
  },
  spinning: {
    animationDuration: {
      default: vars.motionDurationLoop,
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
  unavailable: {
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusPanel,
    borderStyle: "dashed",
    borderWidth: vars.borderWidthHairline,
    backgroundColor: vars.colorSurfaceTint,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  loading: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
    paddingBlock: vars.space16,
    paddingInline: vars.space8,
  },
  smallIcon: { blockSize: vars.controlIconSizeSm, inlineSize: vars.controlIconSizeSm },
  // Box, type ramp, and spacing all come from ADS `EmptyState` now; only the
  // action row (a centered wrap row, not the default stacked grid) and the
  // medallion glyph size stay local.
  emptyIcon: {
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  emptyActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    justifyContent: "center",
  },
  /* Row shape, hover wash and trail live in `information-row.styles.ts`, which
     this list shares with the linked-pull-request rows above it. Only the two
     things that belong to a plan specifically stay here. */
  rowMark: { color: vars.colorTextMuted },
  rowAction: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    blockSize: vars.iconButtonSize,
    borderRadius: vars.radiusControl,
    color: {
      default: vars.colorTextSubtle,
      ":hover": vars.colorText,
    },
    display: "flex",
    flexShrink: 0,
    inlineSize: vars.iconButtonSize,
    justifyContent: "center",
  },
  rowActionDanger: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorDangerSoft,
    },
    color: {
      default: vars.colorTextSubtle,
      ":focus-visible": vars.colorDangerText,
      ":hover": vars.colorDangerText,
    },
  },
  rowActionIcon: {
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  card: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorderSubtle,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
  },
  cardContent: { paddingTop: vars.space16 },
});
