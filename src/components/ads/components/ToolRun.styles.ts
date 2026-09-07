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
    //
    // The arm is 22rem, and it is a measured value, not a round one. On one
    // line the title lane gets `summary / 2 - gap - status`, because `primary`
    // is capped at 50% below. Holding the title at a readable 5rem with an
    // 8px gap and a ~66px status word needs `summary >= 2 * (80 + 8 + 66)`
    // = 308.8px, and the summary runs 40px narrower than this container
    // (chevron + row gap) — so 348.8px, and 22rem/352px is the next rem step
    // that clears it. Below that the row genuinely cannot hold both lanes, so
    // the secondary register wraps instead of the title shrinking to a sliver.
    // Every key carrying this arm must move together; a partial move splits
    // the row between the two layouts.
    flexWrap: {
      default: "nowrap",
      "@container (max-width: 22rem)": "wrap",
    },
    gap: {
      default: `${vars.space4} ${vars.space8}`,
      "@container (max-width: 22rem)": vars.space4,
    },
    minInlineSize: 0,
  },
  primary: {
    alignItems: "center",
    display: {
      default: "flex",
      "@container (max-width: 22rem)": "contents",
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
      "@container (max-width: 22rem)": "1 1 100%",
    },
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    // Zero, deliberately: the title yields rather than overflowing. A floor
    // here cannot be honoured inside `primary`'s 50% cap — a flex child whose
    // min-inline-size exceeds its parent's max-inline-size paints outside it,
    // and `primary` declares no `overflow`, so a 5rem floor put the status
    // word 47px past the lane and on top of the count. The readable-title
    // guarantee belongs to the 22rem container arm above (which hands the
    // title a line of its own before the row gets that tight), not to a clamp
    // that trades an unreadable title for overlapping text.
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
      "@container (max-width: 22rem)": "contents",
    },
    // This owns the remaining lane. Its tool child shrinks before count or time,
    // which remain whole; only the narrow container arm below stacks.
    flex: "1 1 0",
    gap: {
      default: vars.space8,
      "@container (max-width: 22rem)": vars.space4,
    },
    marginInlineStart: {
      default: "auto",
      "@container (max-width: 22rem)": 0,
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
