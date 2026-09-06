import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/**
 * The chip sizes itself in `em` because it sits inline inside prompt text at
 * whatever font size the host line uses; keep the relative units.
 */
export const tokenChipStyles = stylex.create({
  chip: {
    display: "inline-flex",
    maxWidth: "100%",
    userSelect: "none",
    alignItems: "center",
    borderRadius: vars.radiusMark,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    verticalAlign: "baseline",
    fontWeight: vars.fontWeightMedium,
    lineHeight: 1,
  },
  compact: {
    height: "1.45em",
    gap: "0.3em",
    paddingInline: "0.35em",
    fontSize: "0.78em",
  },
  roomy: {
    gap: "0.375rem",
    paddingInline: vars.space8,
    paddingBlock: vars.space4,
    fontSize: "0.8125em",
  },
  information: {
    borderColor: `color-mix(in oklch, ${vars.colorAccent} 25%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorAccent} 10%, transparent)`,
    color: vars.colorAccent,
  },
  skill: {
    borderColor: "color-mix(in oklch, var(--prompt-role-thinking) 30%, transparent)",
    backgroundColor: "color-mix(in oklch, var(--prompt-role-thinking) 10%, transparent)",
    color: "var(--prompt-role-thinking)",
  },
  plain: {
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 80%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvasSubtle} 55%, transparent)`,
    color: vars.colorText,
  },
  informationDetail: { color: `color-mix(in oklch, ${vars.colorAccent} 70%, transparent)` },
  skillDetail: { color: "color-mix(in oklch, var(--prompt-role-thinking) 70%, transparent)" },
  plainDetail: { color: vars.colorTextMuted },
  icon: { flexShrink: 0 },
  iconCompact: { width: "0.9em", height: "0.9em" },
  iconRoomy: { width: "0.875rem", height: "0.875rem" },
  serviceIconCompact: { height: "0.9em", width: "auto" },
  serviceIconRoomy: { height: "0.875rem", width: "auto" },
  label: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  detail: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: vars.fontWeightRegular },
});
