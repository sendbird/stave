import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

export const toolRunStyles = stylex.create({
  actions: {
    display: "flex",
    justifyContent: "flex-start",
  },
  /** Closed panels must not leave a phantom gap below the trigger. */
  root: {
    containerType: "inline-size",
    gap: 0,
  },
  row: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minBlockSize: vars.controlHeightSm,
  },
  summary: {
    alignItems: "center",
    display: "flex",
    flex: "1 1 auto",
    // A command belongs to the run's register, not a second transcript row.
    // Above the intentional narrow arm, keep the summary on one line and let
    // the command's own ellipsis spend the remaining width.
    flexWrap: {
      default: "nowrap",
      "@container (max-width: 14rem)": "wrap",
    },
    gap: {
      default: `${vars.space4} ${vars.space8}`,
      "@container (max-width: 14rem)": vars.space4,
    },
    minInlineSize: 0,
  },
  primary: {
    alignItems: "center",
    display: {
      default: "flex",
      "@container (max-width: 14rem)": "contents",
    },
    // The title/status pair keeps its natural compact width but may not take
    // more than half the row: the command needs a real shrinking lane.
    flex: "0 1 auto",
    gap: vars.space8,
    maxInlineSize: "50%",
    minInlineSize: 0,
  },
  trigger: {
    appearance: "none",
    borderStyle: "none",
    borderWidth: 0,
    inlineSize: "min(100%, 44rem)",
    textAlign: "start",
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars.opacityDisabled,
  },
  title: {
    color: vars.colorText,
    flex: {
      default: "0 1 auto",
      "@container (max-width: 14rem)": "1 1 100%",
    },
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tool: {
    // `1 1 0`, and the `minInlineSize: 0` below is what makes the shrink
    // reachable: a flex item's min-content contribution is its floor, and for a
    // long unbroken command string that floor is the whole string, so the item
    // could not shrink and the wrapping row put it on a line of its own instead.
    // Zeroing the floor lets it take the ellipsis it already declares.
    flex: "1 1 0",
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statusWord: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space4,
    lineHeight: vars.lineHeightTight,
    whiteSpace: "nowrap",
  },
  secondary: {
    alignItems: "baseline",
    display: {
      default: "flex",
      "@container (max-width: 14rem)": "contents",
    },
    // This owns the remaining lane. Its tool child shrinks before count or time,
    // which remain whole; only the narrow container arm below stacks.
    flex: "1 1 0",
    gap: {
      default: vars.space8,
      "@container (max-width: 14rem)": vars.space4,
    },
    marginInlineStart: {
      default: "auto",
      "@container (max-width: 14rem)": 0,
    },
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
  secondaryMeta: {
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  groupList: {
    gap: vars.space4,
  },
  groupItem: {
    minInlineSize: 0,
  },
  panel: {
    inlineSize: "100%",
    minInlineSize: 0,
  },
  payload: {
    gap: vars.space12,
  },
  wellOpen: {
    borderRadius: vars.radiusControl,
  },
  wellDanger: {
    backgroundColor: vars.colorDangerSoft,
  },
  section: {
    display: "grid",
    gap: vars.space4,
    minInlineSize: 0,
    padding: vars.space8,
  },
  sectionLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
  },
  // Machine output keeps line breaks but may break long tokens before they
  // establish a min-content width wider than the disclosure owner.
  sectionContent: {
    color: vars.colorText,
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
    fontVariantLigatures: "none",
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  group: {
    gap: 0,
  },
});
