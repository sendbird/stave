import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

const disclosureRest = `color-mix(in oklab, ${vars.colorSurfaceTint} 76%, transparent)`;
const disclosureHover = `color-mix(in oklab, ${vars.colorCanvasSubtle} 84%, transparent)`;
const disclosurePress = `color-mix(in oklab, ${vars.colorText} 5%, ${vars.colorCanvasSubtle})`;

/**
 * Compact progressive disclosure for evidence, reasoning, and tool details.
 * It deliberately does not replace the 44px `Collapsible` used for settings
 * and list sections: inline transcript evidence needs a smaller reading
 * affordance, not another full-width header row.
 */
export const inlineDisclosure = stylex.create({
  root: {
    display: "grid",
    inlineSize: "100%",
    minInlineSize: 0,
  },
  trigger: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": disclosurePress,
      "@media (hover: hover) and (pointer: fine)": {
        default: "transparent",
        ":active": disclosurePress,
        ":hover": disclosureHover,
      },
    },
    borderRadius: vars.radiusControl,
    borderWidth: 0,
    color: vars.colorTextMuted,
    cursor: "pointer",
    display: "flex",
    fontFamily: vars.fontSans,
    gap: vars.space8,
    inlineSize: "100%",
    justifyContent: "flex-start",
    minBlockSize: vars.controlHeightSm,
    minInlineSize: 0,
    paddingBlock: vars.space4,
    // The agent-row left edge. `agentSurface.row` is locked to this value so a
    // payload-less row and a disclosure row share one glyph column.
    paddingInline: vars.space8,
    textAlign: "start",
  },
  triggerIntrinsic: {
    inlineSize: "fit-content",
    maxInlineSize: "100%",
  },
  triggerOpen: {
    color: vars.colorText,
  },
  panel: {
    inlineSize: "100%",
    minInlineSize: 0,
  },
  body: {
    backgroundColor: disclosureRest,
    borderRadius: vars.radiusControl,
    boxSizing: "border-box",
    display: "grid",
    gap: vars.space4,
    inlineSize: "100%",
    marginBlockStart: vars.space4,
    minInlineSize: 0,
    padding: vars.space8,
  },
});
