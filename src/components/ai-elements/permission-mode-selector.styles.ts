import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * `--secondary` is a subtle tinted surface with no ADS token twin, so the
 * quiet trigger fill mixes toward the canvas-subtle token; the popover sits on
 * the raised surface. The hover washes follow the ADS overlay-wash rule rather
 * than re-tinting `secondary`.
 */
export const permissionModeSelectorStyles = stylex.create({
  root: { position: "relative" },
  trigger: {
    display: "inline-flex",
    height: "2rem",
    alignItems: "center",
    gap: "0.375rem",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 80%, transparent)`,
    backgroundColor: vars.colorCanvasSubtle,
    paddingInline: vars.space8,
    fontSize: vars.fontSizeBody,
    color: vars.colorText,
  },
  triggerOpen: {
    borderColor: `color-mix(in oklch, ${vars.colorAccent} 60%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 90%, ${vars.colorMixInk})`,
  },
  triggerIcon: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
    color: vars.colorTextMuted,
  },
  menu: {
    position: "absolute",
    insetBlockEnd: "calc(100% + 0.375rem)",
    insetInlineStart: 0,
    width: "11rem",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 90%, transparent)`,
    backgroundColor: vars.colorSurface,
    padding: vars.space4,
    boxShadow: vars.elevationModal,
  },
  option: {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: vars.radiusMark,
    paddingInline: vars.space8,
    paddingBlock: "0.375rem",
    textAlign: "left",
    fontSize: vars.fontSizeBody,
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
  },
  optionSelected: { backgroundColor: vars.colorOverlayPressed },
  optionCheck: {
    width: vars.controlIconSizeSm,
    height: vars.controlIconSizeSm,
    color: vars.colorAccent,
  },
});
