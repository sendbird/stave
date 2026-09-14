import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

const disclosureRest = `color-mix(in oklab, ${vars["--ads-color-surface-tint"]} 76%, transparent)`;
const disclosureHover = `color-mix(in oklab, ${vars["--ads-color-canvas-subtle"]} 84%, transparent)`;
const disclosurePress = `color-mix(in oklab, ${vars["--ads-color-text"]} 5%, ${vars["--ads-color-canvas-subtle"]})`;

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
    borderRadius: vars["--ads-radius-control"],
    borderWidth: 0,
    color: vars["--ads-color-text-muted"],
    cursor: "pointer",
    display: "flex",
    fontFamily: vars["--ads-font-sans"],
    gap: vars["--ads-space-8"],
    inlineSize: "100%",
    justifyContent: "flex-start",
    minBlockSize: vars["--ads-control-height-sm"],
    minInlineSize: 0,
    paddingBlock: vars["--ads-space-4"],
    // The agent-row left edge. `agentSurface.row` is locked to this value so a
    // payload-less row and a disclosure row share one glyph column.
    paddingInline: vars["--ads-space-8"],
    textAlign: "start",
  },
  triggerIntrinsic: {
    inlineSize: "fit-content",
    maxInlineSize: "100%",
  },
  triggerOpen: {
    color: vars["--ads-color-text"],
  },
  panel: {
    inlineSize: "100%",
    minInlineSize: 0,
  },
  body: {
    backgroundColor: disclosureRest,
    borderRadius: vars["--ads-radius-control"],
    boxSizing: "border-box",
    display: "grid",
    gap: vars["--ads-space-4"],
    inlineSize: "100%",
    marginBlockStart: vars["--ads-space-4"],
    minInlineSize: 0,
    padding: vars["--ads-space-8"],
  },
});
