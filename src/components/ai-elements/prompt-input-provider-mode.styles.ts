import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const providerModeStyles = stylex.create({
  iconManual: { color: "var(--prompt-mode-manual)" },
  iconGuided: { color: "var(--prompt-mode-guided)" },
  iconAuto: { color: "var(--prompt-mode-auto)" },
  iconCustom: { color: "var(--prompt-mode-custom)" },

  optionManual: {
    borderColor: "color-mix(in oklch, var(--prompt-mode-manual) 25%, transparent)",
    backgroundColor: {
      default: "color-mix(in oklch, var(--prompt-mode-manual) 10%, transparent)",
      ":hover": "color-mix(in oklch, var(--prompt-mode-manual) 14%, transparent)",
    },
  },
  optionGuided: {
    borderColor: "color-mix(in oklch, var(--prompt-mode-guided) 25%, transparent)",
    backgroundColor: {
      default: "color-mix(in oklch, var(--prompt-mode-guided) 10%, transparent)",
      ":hover": "color-mix(in oklch, var(--prompt-mode-guided) 14%, transparent)",
    },
  },
  optionAuto: {
    borderColor: "color-mix(in oklch, var(--prompt-mode-auto) 30%, transparent)",
    backgroundColor: {
      default: "color-mix(in oklch, var(--prompt-mode-auto) 10%, transparent)",
      ":hover": "color-mix(in oklch, var(--prompt-mode-auto) 14%, transparent)",
    },
  },
  optionCustom: {
    borderColor: "color-mix(in oklch, var(--prompt-mode-custom) 30%, transparent)",
    backgroundColor: {
      default: "color-mix(in oklch, var(--prompt-mode-custom) 10%, transparent)",
      ":hover": "color-mix(in oklch, var(--prompt-mode-custom) 14%, transparent)",
    },
  },

  icon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  triggerPill: {
    maxWidth: "100%",
    justifyContent: "flex-start",
    textAlign: "left",
  },
  label: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars.fontWeightMedium,
    lineHeight: 1,
  },
  popover: { width: "22rem" },
  optionList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
});
