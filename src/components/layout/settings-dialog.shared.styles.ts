import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * Styles for the shared Settings primitives (`SettingsCard`, `LabeledField`,
 * `SwitchField`, `ChoiceButtons`, `ToggleChipGroup`, and friends). These
 * components are consumed by every settings section, so their public prop
 * shapes are frozen; only their internal styling moved to StyleX.
 *
 * ## The one Settings rhythm
 *
 * Every section reads from the single ramp below; nothing in
 * `settings-dialog-*.styles.ts` may re-derive a spacing, alignment or type
 * step for the same role. Values are ADS tokens on the 4px scale and the ADS
 * type ramp (micro / caption / body / lead) only.
 *
 * | Role                              | Token                    |
 * | --------------------------------- | ------------------------ |
 * | Card padding (block)              | `space24`                |
 * | Card title -> description         | `space4`                 |
 * | Card header -> body               | `space20`                |
 * | Body block -> block               | `space20`                |
 * | Field row: label col <-> control  | `space20`                |
 * | Field row alignment               | `start` (one idiom)      |
 * | Label -> its control (stacked)    | `space8`                 |
 * | Label <-> inline affordance       | `space8`                 |
 * | Intra-label (title/description)   | `space4`                 |
 * | Chip / segment group gap          | `space8`                 |
 * | Title, label                      | `fontSizeBody` + medium  |
 * | Description                       | `fontSizeBody` + muted   |
 * | Chip, segment, meta label         | `fontSizeCaption`        |
 * | Eyebrow / overline                | `fontSizeMicro`          |
 *
 * ### Label / control alignment
 *
 * Rows top-align (`alignItems: "start"`) — the single idiom, replacing the
 * former mix of `start` / `flex-start` / bare flex. A single-line control on
 * this surface is `controlHeightLg` (40px) with a `lineHeightControl` (20px)
 * text box, so its first line sits ~10px below the cell top. `fieldLead`
 * pushes the label column down by the nearest step on the 4px scale
 * (`space8`) so the label's first line lands on the control's, instead of
 * floating 10px above it. Multi-line label blocks keep flowing from there, so
 * one offset serves both cases.
 */
export const settingsSharedStyles = stylex.create({
  infoRow: {
    alignItems: "start",
    display: "flex",
    fontSize: vars.fontSizeBody,
    gap: vars.space12,
    justifyContent: "space-between",
  },
  infoRowLabel: {
    color: vars.colorTextMuted,
  },
  infoRowValue: {
    color: vars.colorText,
    maxInlineSize: "70%",
    overflowWrap: "break-word",
    textAlign: "end",
    wordBreak: "break-all",
  },
  infoRowValueMono: {
    fontFamily: vars.fontMono,
    fontSize: vars.fontSizeCaption,
  },

  sectionStack: {
    display: "flex",
    flexDirection: "column",
  },

  card: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars.borderWidthHairline,
      ":first-child": vars.space0,
    },
    borderBottomStyle: {
      default: null,
      ":last-child": "solid",
    },
    borderBottomWidth: {
      default: null,
      ":last-child": vars.borderWidthHairline,
    },
    borderBottomColor: {
      default: null,
      ":last-child": vars.colorBorder,
    },
    outline: "none",
    paddingBlock: vars.space24,
    paddingBlockStart: {
      default: vars.space24,
      ":first-child": vars.space0,
    },
    scrollMarginTop: vars.space24,
  },
  cardHeaderRow: {
    alignItems: "start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  cardTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.015em",
  },
  cardDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightRelaxed,
    marginBlockStart: vars.space4,
    maxInlineSize: "56rem",
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space20,
    marginBlockStart: vars.space20,
  },

  choiceMark: {
    alignItems: "center",
    backgroundColor: vars.colorCanvas,
    blockSize: vars.space20,
    borderRadius: vars.radiusMark,
    display: "flex",
    flexShrink: 0,
    inlineSize: vars.space20,
    justifyContent: "center",
  },

  radioGroupGrid: {
    display: "grid",
    gap: vars.space8,
  },
  radioGroupGridCols2: {
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  radioGroupGridCols3: {
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)": "repeat(3, minmax(0, 1fr))",
    },
  },
  radioGroupInline: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "inline-flex",
    flexWrap: "wrap",
    maxInlineSize: "100%",
    padding: vars.space2,
  },
  radio: {
    alignItems: "center",
    backgroundClip: "padding-box",
    backgroundColor: {
      default: "transparent",
      ":is([data-checked])": vars.colorAccent,
    },
    borderColor: "transparent",
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // This renders on a real radio control, so `null` would delete the
    // property and hand the label to the UA's `buttontext`.
    color: {
      default: vars.colorText,
      ":is([data-checked])": vars.colorAccentText,
    },
    cursor: "default",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    justifyContent: "center",
    opacity: {
      default: null,
      ":is([data-disabled])": vars.opacityDisabled,
    },
    outline: "none",
    pointerEvents: {
      default: null,
      ":is([data-disabled])": "none",
    },
    // Motion comes from `transition.control` + `motionDurationQuick` at the
    // call site. The literal it replaced also named `box-shadow` and
    // `transform`, neither of which this radio or any of its variants ever
    // changes, and it carried no reduced-motion arm.
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  radioCard: {
    alignItems: "start",
    // StyleX merges by property, not by condition: every variant of a property
    // declared here REPLACES the whole `radio` declaration for that property.
    // The checked branch has to be restated in each override or the selected
    // state silently disappears.
    backgroundColor: {
      default: vars.colorSurface,
      ":is([data-checked])": vars.colorAccent,
      ":is([data-unchecked]:hover)": vars.colorSelectionFill,
    },
    borderColor: {
      default: vars.colorBorder,
      ":is([data-checked])": vars.colorAccent,
      ":is([data-unchecked]:hover)": vars.colorAccent,
    },
    blockSize: "auto",
    justifyContent: "flex-start",
    minBlockSize: "3.5rem",
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
    textAlign: "start",
    whiteSpace: "normal",
  },
  radioSegment: {
    borderRadius: vars.radiusMark,
    // See `radioCard`: restating `:is([data-checked])` is mandatory, because
    // this object replaces `radio`'s `color`/`background-color` wholesale.
    color: {
      default: vars.colorTextMuted,
      ":is([data-checked])": vars.colorAccentText,
      ":is([data-unchecked]:hover)": vars.colorText,
    },
    backgroundColor: {
      default: "transparent",
      ":is([data-checked])": vars.colorAccent,
      ":is([data-unchecked]:hover)": vars.colorOverlayHover,
    },
    fontSize: vars.fontSizeCaption,
    minBlockSize: vars.controlHeightSm,
    paddingInline: vars.space12,
  },
  radioContent: {
    alignItems: "start",
    display: "flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  radioTextWrap: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minInlineSize: 0,
  },
  radioLabel: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  radioDescription: {
    fontSize: vars.fontSizeBody,
    opacity: 0.75,
  },
  radioInline: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },

  toggleGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  toggle: {
    backgroundColor: {
      default: vars.colorSurface,
      ':is([aria-pressed="true"])': vars.colorAccent,
    },
    borderColor: {
      default: vars.colorBorder,
      ':is([aria-pressed="true"])': "transparent",
    },
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: {
      default: vars.colorText,
      ':is([aria-pressed="true"])': vars.colorAccentText,
    },
    fontSize: vars.fontSizeCaption,
    minBlockSize: vars.controlHeightXs,
    paddingInline: vars.space12,
  },
  toggleWithMark: {
    alignItems: "center",
    display: "flex",
    gap: vars.space4,
  },
  toggleCheck: {
    blockSize: vars.space12,
    inlineSize: vars.space12,
  },
  toggleLabel: {
    maxInlineSize: "10rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tooltipContent: {
    fontSize: vars.fontSizeCaption,
    maxInlineSize: "16rem",
  },

  fieldStacked: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  fieldGrid: {
    alignItems: "start",
    display: "grid",
    gap: vars.space20,
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)":
        "minmax(15rem, 0.85fr) minmax(20rem, 1.15fr)",
    },
  },
  fieldLabelBlock: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minInlineSize: 0,
  },
  /**
   * Optical lead for the label column of a two-column field row: see the
   * alignment note at the top of this file. Only applies once the row is
   * actually two columns — stacked under 640px the label already sits directly
   * above its control and needs no offset.
   */
  fieldLead: {
    paddingBlockStart: {
      default: null,
      "@media (min-width: 640px)": vars.space8,
    },
  },
  fieldLabelRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
  },
  fieldTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  fieldDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightRelaxed,
  },
  fieldControl: {
    minInlineSize: 0,
  },

  /**
   * Composed ON TOP of `fieldGrid` — a switch row is a field row, so the grid
   * definition lives in exactly one place. This adds only what is specific to
   * it: the row keeps a full control height even though the switch itself is
   * shorter than one.
   */
  switchRow: {
    minBlockSize: vars.controlHeightLg,
  },
  switchLabelBlock: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: vars.space4,
    minInlineSize: 0,
  },
  switchControl: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    justifySelf: "start",
    // Centre the switch on the label's first text line instead of nudging it
    // with an off-scale `marginTop: 2`.
    minBlockSize: vars.lineHeightControl,
  },

  selectTrigger: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    fontSize: vars.fontSizeBody,
    inlineSize: "100%",
    minBlockSize: vars.controlHeightLg,
  },

  guideTriggerIcon: {
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
  },
  guideIcon: {
    blockSize: vars.controlIconSizeSm,
    inlineSize: vars.controlIconSizeSm,
  },
  guideTriggerInline: {
    display: "inline-flex",
  },
  guidePopover: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    inlineSize: "24rem",
    maxInlineSize: "calc(100vw - 2rem)",
  },
  guideHeader: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    paddingBlock: vars.space0,
    paddingInline: vars.space0,
  },
  guideTitle: {
    fontSize: vars.fontSizeBody,
  },
  guideList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  guideItem: {
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  guideItemLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  guideItemDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
  },
  guideExampleLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  guideNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
  },
});
