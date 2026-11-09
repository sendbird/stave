import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

const disclosureRest = `color-mix(in oklab, ${vars["--aui-color-surface-tint"]} 76%, transparent)`;
const disclosureHover = `color-mix(in oklab, ${vars["--aui-color-canvas-subtle"]} 84%, transparent)`;
const disclosurePress = `color-mix(in oklab, ${vars["--aui-color-text"]} 5%, ${vars["--aui-color-canvas-subtle"]})`;

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
    borderRadius: vars["--aui-radius-control"],
    borderWidth: 0,
    color: vars["--aui-color-text-muted"],
    cursor: "pointer",
    display: "flex",
    fontFamily: vars["--aui-font-sans"],
    gap: vars["--aui-space-8"],
    inlineSize: "100%",
    justifyContent: "flex-start",
    minBlockSize: vars["--aui-control-height-sm"],
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-4"],
    // The agent-row left edge. `agentSurface.row` is locked to this value so a
    // payload-less row and a disclosure row share one glyph column.
    paddingInline: vars["--aui-space-8"],
    textAlign: "start",
  },
  triggerIntrinsic: {
    inlineSize: "fit-content",
    maxInlineSize: "100%",
  },
  triggerOpen: {
    color: vars["--aui-color-text"],
  },
  panel: {
    inlineSize: "100%",
    minInlineSize: 0,
  },
  body: {
    backgroundColor: disclosureRest,
    borderRadius: vars["--aui-radius-control"],
    boxSizing: "border-box",
    display: "grid",
    gap: vars["--aui-space-4"],
    inlineSize: "100%",
    marginBlockStart: vars["--aui-space-4"],
    minInlineSize: 0,
    padding: vars["--aui-space-8"],
  },
});
