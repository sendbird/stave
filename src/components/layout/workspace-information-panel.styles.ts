import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

/**
 * Workspace Information panel.
 *
 * Two reveal-on-hover patterns here used to be Tailwind `group/*` variants.
 * StyleX has no ancestor selector, so each hovered container publishes an
 * inherited custom property (`--info-*`) that its descendants read. The parent
 * still owns the `:hover` condition, so the behaviour is unchanged; only the
 * transport differs.
 */
export const workspaceInformationPanelStyles = stylex.create({
  // ---- shell -------------------------------------------------------------
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    overflow: "auto",
    transformOrigin: "top left",
  },
  body: { paddingBlock: vars["--ads-space-8"], paddingInline: vars["--ads-space-12"] },
  topCards: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    marginBlockEnd: vars["--ads-space-8"],
  },

  // ---- section header ----------------------------------------------------
  // The shared accordion root separates rows with a gap and rounds each item.
  // A bottom rule on that rounded box bends at the corners, and the gap
  // detaches it from the next row, so themes where the subtle border is a
  // soft translucent ink draw a drop shadow under every section.
  sectionList: {
    gap: 0,
  },
  sectionItem: {
    borderBottomColor: vars["--ads-color-border-subtle"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderRadius: 0,
    position: "relative",
  },
  sectionItemFirst: { borderTopWidth: 0 },
  sectionItemDragging: { opacity: vars["--ads-opacity-disabled"] },
  sectionRow: {
    // Hover hand-off for the icon -> chevron cross-fade below.
    "--info-section-chevron-opacity": { default: "0", ":hover": "1" },
    "--info-section-chevron-scale": { default: "0.75", ":hover": "1" },
    "--info-section-icon-opacity": { default: "1", ":hover": "0" },
    "--info-section-icon-scale": { default: "1", ":hover": "0.75" },
    alignItems: "center",
    display: "flex",
  },
  sectionTrigger: {
    flex: 1,
    gap: vars["--ads-space-8"],
    paddingBlock: 10,
    paddingInlineEnd: vars["--ads-space-4"],
    paddingInlineStart: 0,
    textDecorationLine: { default: "none", ":hover": "none" },
  },
  sectionTriggerDraggable: {
    cursor: { default: "grab", ":active": "grabbing" },
  },
  sectionTitleRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    textAlign: "start",
  },
  sectionMark: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexShrink: 0,
    height: 18,
    justifyContent: "center",
    position: "relative",
    width: 18,
  },
  sectionMarkIcon: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    opacity: "var(--info-section-icon-opacity)",
    transform: "scale(var(--info-section-icon-scale))",
    transitionDuration: {
      default: vars["--ads-motion-duration-quick"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "opacity, transform",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  sectionMarkChevronSlot: {
    alignItems: "center",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    pointerEvents: "none",
    position: "absolute",
  },
  sectionMarkChevron: {
    height: 18,
    opacity: "var(--info-section-chevron-opacity)",
    transform: "scale(var(--info-section-chevron-scale))",
    transitionDuration: {
      default: vars["--ads-motion-duration-quick"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "opacity, transform",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
    width: 18,
  },
  sectionTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  sectionCount: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  sectionAction: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    marginInlineStart: "auto",
  },
  sectionActionGroup: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-2"],
  },
  sectionPanel: {
    paddingBlockEnd: vars["--ads-space-12"],
    paddingBlockStart: 0,
    paddingInlineStart: vars["--ads-space-8"],
  },
  sectionStamp: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    paddingInlineEnd: vars["--ads-space-4"],
  },

  // ---- inline link row ---------------------------------------------------
  linkRow: {
    "--info-row-action-opacity": { default: "0", ":hover": "1" },
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":focus-within": vars["--ads-color-overlay-hover"],
    },
    borderRadius: vars["--ads-radius-control"],
    display: "flex",
    gap: 10,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: 6,
  },
  linkRowMark: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  linkRowBody: { flex: 1, minWidth: 0 },
  linkRowTitleLine: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  linkRowTitle: {
    color: { default: vars["--ads-color-text"], ":hover": vars["--ads-color-accent"] },
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textDecorationLine: { default: "none", ":hover": "underline" },
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  linkRowSublabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  linkRowTrail: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-2"],
  },
  linkRowTrailReveal: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-2"],
    opacity: "var(--info-row-action-opacity)",
    transitionDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": vars["--ads-motion-duration-micro"],
    },
    transitionProperty: "opacity",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },

  // ---- icon buttons ------------------------------------------------------
  iconButton: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-mark"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    display: "flex",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  iconButtonQuiet: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-mark"],
    color: { default: vars["--ads-color-text-subtle"], ":hover": vars["--ads-color-text"] },
    display: "flex",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  iconButtonDanger: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-danger-soft"],
    },
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-danger-text"] },
  },
  iconButtonDisabledQuiet: {
    opacity: { default: 1, ":disabled": 0.4 },
    pointerEvents: { default: "auto", ":disabled": "none" },
  },
  iconButtonShrink0: { flexShrink: 0 },
  iconButtonPinned: { color: vars["--ads-color-accent"], opacity: 1 },
  iconButtonPinReveal: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    opacity: "var(--info-row-action-opacity)",
  },
  iconButtonPinBase: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderRadius: vars["--ads-radius-mark"],
    display: "flex",
    height: 28,
    justifyContent: "center",
    transitionDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": vars["--ads-motion-duration-micro"],
    },
    transitionProperty: "opacity",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
    width: 28,
  },
  iconButtonHoverSurface: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
  },
  glyphSm: { height: 14, width: 14 },
  glyphMd: { height: 16, width: 16 },
  glyphFilled: { fill: "currentColor" },
  glyphSpinning: {
    animationDuration: {
      default: "1s",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
  brandGlyph: { height: 16, width: 16 },
  amplifyGlyph: { height: 16, flexShrink: 0, width: "auto" },
  mutedGlyph: { color: vars["--ads-color-text-muted"], height: 16, width: 16 },

  // ---- pin tooltip -------------------------------------------------------
  pinTooltip: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    maxWidth: "15rem",
    overflowWrap: "normal",
    textAlign: "start",
    whiteSpace: "normal",
    wordBreak: "normal",
  },
  pinTooltipTitle: { fontWeight: vars["--ads-font-weight-medium"] },
  pinTooltipBody: { color: vars["--ads-color-text-inverted"] },

  // ---- inline url input --------------------------------------------------
  urlInputRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    paddingBlock: 6,
    paddingInline: 6,
  },
  urlInputMark: {
    alignItems: "center",
    color: vars["--ads-color-text-subtle"],
    display: "flex",
    flexShrink: 0,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  bareInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    boxShadow: "none",
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    height: 32,
    outlineWidth: { default: 0, ":focus-visible": 0 },
    paddingInline: 0,
  },
  bareInputPadded: {
    backgroundColor: "transparent",
    borderWidth: 0,
    boxShadow: "none",
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    height: 32,
    outlineWidth: { default: 0, ":focus-visible": 0 },
    paddingInline: vars["--ads-space-4"],
  },
  bareInputStrong: { fontWeight: vars["--ads-font-weight-medium"] },
  bareInputDone: {
    color: vars["--ads-color-text-subtle"],
    textDecorationLine: "line-through",
  },

  // ---- github pr row -----------------------------------------------------
  // Row anatomy — box, hover wash, title, meta and the action trail — now
  // lives in `information-row.styles.ts`, shared with the saved-plan and
  // memory lists so the three cannot drift. Only the status glyph's ink is
  // specific to a pull request.
  prStatusGlyph: { flexShrink: 0, height: 18, width: 18 },
  prStatusMerged: {
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-merged))`,
  },
  prStatusClosed: {
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-closed))`,
  },
  prStatusDraft: { color: vars["--ads-color-text-muted"] },
  prStatusOpen: {
    color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--service-git-open))`,
  },
  // ---- badges / chips ----------------------------------------------------
  chip: {
    borderRadius: vars["--ads-radius-full"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-regular"],
    height: 20,
    lineHeight: 1,
    paddingBlock: 0,
    paddingInline: vars["--ads-space-8"],
  },
  chipTight: {
    borderRadius: vars["--ads-radius-full"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-regular"],
    height: 20,
    lineHeight: 1,
    paddingBlock: 0,
    paddingInline: 6,
  },
  chipStatus: {
    borderRadius: vars["--ads-radius-full"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    height: 20,
    lineHeight: 1,
    paddingBlock: 0,
    paddingInline: 6,
  },
  chipRepo: { maxWidth: "9rem" },
  chipRepoLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // ---- custom fields -----------------------------------------------------
  fieldStack: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  control: { fontSize: vars["--ads-font-size-body"], height: 36 },
  controlBlock: { fontSize: vars["--ads-font-size-body"], height: 36, width: "100%" },
  controlFlex: { flex: 1, fontSize: vars["--ads-font-size-body"], height: 36 },
  controlTextarea: { fontSize: vars["--ads-font-size-body"], minHeight: 80 },
  datePickerTrigger: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-regular"],
    height: 36,
    justifyContent: "flex-start",
    textAlign: "start",
    width: "100%",
  },
  datePickerTriggerEmpty: { color: vars["--ads-color-text-muted"] },
  datePickerIcon: { height: 16, marginInlineEnd: vars["--ads-space-8"], width: 16 },
  datePickerPopover: { padding: 0, width: "auto" },
  switchRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
  },
  switchLabel: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-body"] },
  urlFieldRow: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  urlFieldOpen: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-mark"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  customField: {
    "--info-row-action-opacity": { default: "0", ":hover": "1" },
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingInline: 6,
  },
  customFieldHead: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  customFieldType: {
    backgroundColor: "transparent",
    borderWidth: 0,
    boxShadow: "none",
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    height: 32,
    minWidth: "5.5rem",
    width: "auto",
  },
  rowRemove: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-mark"],
    color: { default: vars["--ads-color-text-subtle"], ":hover": vars["--ads-color-danger-text"] },
    display: "flex",
    flexShrink: 0,
    height: 28,
    justifyContent: "center",
    opacity: "var(--info-row-action-opacity)",
    transitionDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": vars["--ads-motion-duration-micro"],
    },
    transitionProperty: "opacity",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
    width: 28,
  },
  rowRemoveSm: { height: 24, width: 24 },

  // ---- empty state / notes ----------------------------------------------
  emptyHint: {
    color: vars["--ads-color-text-subtle"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
  },
  notesEditor: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  notesTextarea: {
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
    minHeight: 160,
    resize: "vertical",
  },
  notesFooter: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  notesHint: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },
  notesActions: {
    alignItems: "center",
    display: "flex",
    gap: 6,
  },
  notesButton: { height: 32 },
  notesPlaceholder: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-subtle"],
    fontSize: vars["--ads-font-size-body"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-8"],
    textAlign: "start",
    width: "100%",
  },
  notesPreview: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderRadius: vars["--ads-radius-control"],
    cursor: "text",
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
    textAlign: "start",
    width: "100%",
  },

  // ---- summary / todo ----------------------------------------------------
  // The Summary empty state is the ADS `EmptyState` (plain variant); it needs
  // no local box, type, or spacing styles here.
  todoProgressRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    marginBlockEnd: 6,
    paddingInline: 2,
  },
  todoProgressTrack: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-full"],
    flex: 1,
    height: 4,
    overflow: "hidden",
  },
  todoProgressFill: {
    backgroundColor: vars["--ads-color-accent"],
    borderRadius: vars["--ads-radius-full"],
    height: "100%",
    transitionDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "width",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  todoProgressCount: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
  },
  itemList: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    marginInline: -8,
  },
  itemListLoose: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    marginInline: -8,
  },
  todoRow: {
    "--info-row-action-opacity": { default: "0", ":hover": "1" },
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderRadius: vars["--ads-radius-control"],
    display: "flex",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  todoStatus: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-mark"],
    display: "flex",
    flexShrink: 0,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  todoStatusPending: {
    color: { default: vars["--ads-color-text-subtle"], ":hover": vars["--ads-color-text-muted"] },
  },
  todoStatusActive: { color: vars["--ads-color-accent"] },
});
