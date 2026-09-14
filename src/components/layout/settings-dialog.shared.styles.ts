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
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  infoRowLabel: {
    color: vars["--ads-color-text-muted"],
  },
  infoRowValue: {
    color: vars["--ads-color-text"],
    maxInlineSize: "70%",
    overflowWrap: "break-word",
    textAlign: "end",
    wordBreak: "break-all",
  },
  infoRowValueMono: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },

  sectionStack: {
    display: "flex",
    flexDirection: "column",
  },

  card: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--ads-border-width-hairline"],
      ":first-child": vars["--ads-space-0"],
    },
    borderBottomStyle: {
      default: null,
      ":last-child": "solid",
    },
    borderBottomWidth: {
      default: null,
      ":last-child": vars["--ads-border-width-hairline"],
    },
    borderBottomColor: {
      default: null,
      ":last-child": vars["--ads-color-border"],
    },
    outline: "none",
    paddingBlock: vars["--ads-space-24"],
    paddingBlockStart: {
      default: vars["--ads-space-24"],
      ":first-child": vars["--ads-space-0"],
    },
    scrollMarginTop: vars["--ads-space-24"],
  },
  cardHeaderRow: {
    alignItems: "start",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  cardTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.015em",
  },
  cardDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
    marginBlockStart: vars["--ads-space-4"],
    maxInlineSize: "56rem",
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-20"],
    marginBlockStart: vars["--ads-space-20"],
  },

  choiceMark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas"],
    blockSize: vars["--ads-space-20"],
    borderRadius: vars["--ads-radius-mark"],
    display: "flex",
    flexShrink: 0,
    inlineSize: vars["--ads-space-20"],
    justifyContent: "center",
  },

  radioGroupGrid: {
    display: "grid",
    gap: vars["--ads-space-8"],
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
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "inline-flex",
    flexWrap: "wrap",
    maxInlineSize: "100%",
    padding: vars["--ads-space-2"],
  },
  radio: {
    alignItems: "center",
    backgroundClip: "padding-box",
    backgroundColor: {
      default: "transparent",
      ":is([data-checked])": vars["--ads-color-accent"],
    },
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    // This renders on a real radio control, so `null` would delete the
    // property and hand the label to the UA's `buttontext`.
    color: {
      default: vars["--ads-color-text"],
      ":is([data-checked])": vars["--ads-color-accent-text"],
    },
    cursor: "default",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    justifyContent: "center",
    opacity: {
      default: null,
      ":is([data-disabled])": vars["--ads-opacity-disabled"],
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
      default: vars["--ads-color-surface"],
      ":is([data-checked])": vars["--ads-color-accent"],
      ":is([data-unchecked]:hover)": vars["--ads-color-selection-fill"],
    },
    borderColor: {
      default: vars["--ads-color-border"],
      ":is([data-checked])": vars["--ads-color-accent"],
      ":is([data-unchecked]:hover)": vars["--ads-color-accent"],
    },
    blockSize: "auto",
    justifyContent: "flex-start",
    minBlockSize: "3.5rem",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
    textAlign: "start",
    whiteSpace: "normal",
  },
  radioSegment: {
    borderRadius: vars["--ads-radius-mark"],
    // See `radioCard`: restating `:is([data-checked])` is mandatory, because
    // this object replaces `radio`'s `color`/`background-color` wholesale.
    color: {
      default: vars["--ads-color-text-muted"],
      ":is([data-checked])": vars["--ads-color-accent-text"],
      ":is([data-unchecked]:hover)": vars["--ads-color-text"],
    },
    backgroundColor: {
      default: "transparent",
      ":is([data-checked])": vars["--ads-color-accent"],
      ":is([data-unchecked]:hover)": vars["--ads-color-overlay-hover"],
    },
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: vars["--ads-control-height-sm"],
    paddingInline: vars["--ads-space-12"],
  },
  radioContent: {
    alignItems: "start",
    display: "flex",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  radioTextWrap: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  radioLabel: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  radioDescription: {
    fontSize: vars["--ads-font-size-body"],
    opacity: 0.75,
  },
  radioInline: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },

  toggleGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  toggle: {
    backgroundColor: {
      default: vars["--ads-color-surface"],
      ':is([aria-pressed="true"])': vars["--ads-color-accent"],
    },
    borderColor: {
      default: vars["--ads-color-border"],
      ':is([aria-pressed="true"])': "transparent",
    },
    borderRadius: vars["--ads-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: {
      default: vars["--ads-color-text"],
      ':is([aria-pressed="true"])': vars["--ads-color-accent-text"],
    },
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: vars["--ads-control-height-xs"],
    paddingInline: vars["--ads-space-12"],
  },
  toggleWithMark: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-4"],
  },
  toggleCheck: {
    blockSize: vars["--ads-space-12"],
    inlineSize: vars["--ads-space-12"],
  },
  toggleLabel: {
    maxInlineSize: "10rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tooltipContent: {
    fontSize: vars["--ads-font-size-caption"],
    maxInlineSize: "16rem",
  },

  fieldStacked: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  fieldGrid: {
    alignItems: "start",
    display: "grid",
    gap: vars["--ads-space-20"],
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 640px)":
        "minmax(15rem, 0.85fr) minmax(20rem, 1.15fr)",
    },
  },
  fieldLabelBlock: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
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
      "@media (min-width: 640px)": vars["--ads-space-8"],
    },
  },
  fieldLabelRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  fieldTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  fieldDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
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
    minBlockSize: vars["--ads-control-height-lg"],
  },
  switchLabelBlock: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  switchControl: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    justifySelf: "start",
    // Centre the switch on the label's first text line instead of nudging it
    // with an off-scale `marginTop: 2`.
    minBlockSize: vars["--ads-line-height-control"],
  },

  selectTrigger: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    fontSize: vars["--ads-font-size-body"],
    inlineSize: "100%",
    minBlockSize: vars["--ads-control-height-lg"],
  },

  guideTriggerIcon: {
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
  },
  guideIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  guideTriggerInline: {
    display: "inline-flex",
  },
  guidePopover: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    inlineSize: "24rem",
    maxInlineSize: "calc(100vw - 2rem)",
  },
  guideHeader: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-0"],
    paddingInline: vars["--ads-space-0"],
  },
  guideTitle: {
    fontSize: vars["--ads-font-size-body"],
  },
  guideList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  guideItem: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  guideItemLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  guideItemDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
  },
  guideExampleLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  guideNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
  },
});
