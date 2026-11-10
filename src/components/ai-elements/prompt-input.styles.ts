import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

const diffStep = "--prompt-diff-step";
const diffIndex = "--prompt-diff-i";

const promptDiffWord = stylex.keyframes({
  from: { opacity: 0, backgroundColor: `color-mix(in oklch, ${vars["--aui-color-accent"]} 22%, transparent)` },
  to: { opacity: 1, backgroundColor: "transparent" },
});

const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.5 },
});

const caretBlink = stylex.keyframes({
  "0%, 49%": { opacity: 1 },
  "50%, 100%": { opacity: 0 },
});

export const promptInputStyles = stylex.create({
  // ---- Editor typography (shared by editor + reveal overlay) ----
  editorTypographyMinimal: {
    fontFamily: vars["--aui-font-mono"],
    fontSize: "var(--composer-font-size)",
    lineHeight: "var(--composer-line-height)",
    letterSpacing: "-0.01em",
  },
  editorTypographyDefault: {
    // Stated, not inherited. The editable is a `contenteditable` div and the
    // placeholder is a sibling `div`; leaving the family to inheritance let
    // whichever ancestor happened to be closest decide, so the placeholder
    // could render in the AUI default stack while the typed text used the
    // app's. `vars["--aui-font-sans"]` resolves to `var(--font-sans)` through
    // `aui-theme.ts`, so both follow the one font setting.
    fontFamily: vars["--aui-font-sans"],
    // The editor, placeholder and reveal inherit the same reader setting.
    fontSize: "var(--composer-font-size)",
    lineHeight: "var(--composer-line-height)",
  },
  enhancementEditorInset: {
    paddingInlineEnd: "2.25rem",
  },

  // ---- Enhancement reveal overlay ----
  revealOverlay: {
    pointerEvents: "none",
    position: "absolute",
    inset: 0,
    userSelect: "none",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  revealWord: {
    borderRadius: "3px",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
    animationName: promptDiffWord,
    animationDuration: `var(${diffStep})`,
    animationDelay: `calc(var(${diffStep}) * var(${diffIndex}))`,
    animationTimingFunction: "ease-out",
    animationFillMode: "both",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },

  // ---- Runtime trigger icon ----
  runtimeTriggerIcon: {
    position: "relative",
    display: "inline-flex",
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  runtimeTriggerGlyph: { width: 16, height: 16 },
  runtimeTriggerDot: {
    position: "absolute",
    right: -4,
    top: -4,
    width: 8,
    height: 8,
    borderRadius: vars["--aui-radius-full"],
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: vars["--aui-color-surface"],
  },
  runtimeDotWarning: { backgroundColor: vars["--aui-color-warning"] },
  runtimeDotCustom: { backgroundColor: vars["--aui-color-accent"] },
  runtimeDotSuccess: { backgroundColor: vars["--aui-color-success-border"] },

  // ---- Tone text helpers ----
  toneWarning: { color: vars["--aui-color-warning"] },
  tonePrimary: { color: vars["--aui-color-accent"] },
  toneSuccess: { color: vars["--aui-color-success-text"] },
  accentThinking: {
    color: {
      default: "var(--prompt-role-thinking)",
      ":hover": "var(--prompt-role-thinking)",
    },
  },

  // ---- Shared visually-hidden (sr-only) ----
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },

  // ---- Common icon sizes ----
  // `flexShrink: 0` is not optional on any of these: every composer control is
  // a flex row whose label is `flex: 1`, and in a 3.125rem wing the row is
  // narrower than icon + gap + label. Without it the glyph — not the label —
  // gave up the width and the wing rendered squashed icons.
  icon4: { width: vars["--aui-control-icon-size-md"], height: vars["--aui-control-icon-size-md"], flexShrink: 0 },
  icon3: { width: 12, height: 12, flexShrink: 0 },
  icon35: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"], flexShrink: 0 },
  icon35Shrink: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"], flexShrink: 0 },

  pulseAnimation: {
    animationName: pulse,
    animationDuration: vars["--aui-motion-duration-loop"],
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },

  // ---- Surfaces / toolbar buttons ----
  toolbarIconButton: {
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: { default: "transparent", ":hover": vars["--aui-color-overlay-hover"] },
    padding: 0,
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },
  floatingSurface: {
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--aui-color-canvas"]} 90%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--aui-color-canvas"]} 95%, transparent)`,
    },
    color: vars["--aui-color-text"],
  },
  surfacePrimaryFocus: {
    outline: { default: "none", ":focus-visible": "none" },
    borderColor: { ":focus-visible": "transparent" },
  },

  // ---- Lens annotation popovers ----
  lensPopover72: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    width: "18rem",
  },
  lensPopover64: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    width: "16rem",
  },
  fieldGrid: { display: "grid", gap: vars["--aui-space-8"] },
  fieldGridCols2: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: vars["--aui-space-8"],
  },
  fieldLabel: { display: "grid", gap: vars["--aui-space-4"], fontSize: vars["--aui-font-size-caption"] },
  fieldLabelText: { fontWeight: vars["--aui-font-weight-medium"], color: vars["--aui-color-text-muted"] },
  inputField: {
    height: 28,
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
  },
  fullWidth: { width: "100%" },

  scopeIcon: {
    width: "0.875rem",
    height: "0.875rem",
    color: `color-mix(in oklch, ${vars["--aui-color-text"]} 80%, transparent)`,
  },
  cursorDisabled: { cursor: "not-allowed", opacity: vars["--aui-opacity-disabled"] },
  toneMutedHalf: {
    color: vars["--aui-color-text-muted"],
  },
  iconThinking: { color: "var(--prompt-role-thinking)" },
  pendingShell: {
    position: "relative",
    zIndex: vars["--aui-z-index-panel"],
    borderRadius: vars["--aui-radius-panel"],
    backgroundColor: vars["--aui-color-surface"],
    outline: "none",
  },

  /*
   * Height cap only. The drawer panel is a detached global surface and the AUI
   * drawer surface already carries `elevationModal` for exactly that role;
   * restating it here (from `className`, where StyleX cannot reconcile the
   * duplicate) painted the same modal band twice on one element.
   */
  drawerContent: {
    backgroundColor: vars["--aui-color-surface-raised"],
    maxHeight: "78vh",
  },
  drawerHeader: {
    gap: 6,
    paddingInline: vars["--aui-space-20"],
    paddingBottom: vars["--aui-space-16"],
    paddingTop: vars["--aui-space-16"],
    textAlign: "left",
  },
  rowBaseline: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: vars["--aui-space-16"],
  },
  titleBase: { fontSize: vars["--aui-font-size-lead"], fontWeight: vars["--aui-font-weight-semibold"] },
  toneLabel: { fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-semibold"] },
  drawerScroll: { minHeight: 0, flex: 1, overflowY: "auto" },
  /*
   * Width only. Radius, fill, border and elevation belong to the AUI popover
   * surface, and the padding/gap reset is what `density="flush"` is for — the
   * copy that used to live here re-declared all of it from `className`, where
   * StyleX cannot reconcile the duplicates: the surface kept its own 16px
   * padding, every section added `space20` on top of it, and the extra
   * `0 0 0 1px` ring painted a second hairline just inside the real border.
   */
  runtimePopover: {
    width: "min(25rem, calc(100vw - 2rem))",
  },
  /*
   * The flush panel's single inner gutter, on the AUI popover scale
   * (`space16` inline, `space16` above, `space12` under the title group) —
   * matching `Popover`'s own `headerFlush`. The sections below share that
   * inline gutter, so the header's baseline and every section rule align.
   */
  runtimePopoverHeader: {
    paddingInline: vars["--aui-space-16"],
    paddingBottom: vars["--aui-space-12"],
    paddingTop: vars["--aui-space-16"],
  },
  mt1: { marginTop: vars["--aui-space-4"] },
  menuSeparator: {
    marginBlock: 6,
    height: 1,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
  },
  customizeButton: {
    width: "100%",
    justifyContent: "flex-start",
    gap: 6,
    fontSize: vars["--aui-font-size-caption"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },

  composerShell: {
    position: "relative",
    zIndex: vars["--aui-z-index-panel"],
    borderRadius: vars["--aui-radius-panel"],
  },
  formBase: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    transitionProperty: "border-color, background-color",
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  formMinimal: {
    gap: vars["--aui-space-8"],
    borderWidth: 0,
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
    backgroundColor: "transparent",
    padding: 0,
    paddingTop: vars["--aui-space-12"],
  },
  /** `chrome="tray"`: the form is the raised input (`composerTray.field`); no top hairline. */
  formTray: {
    // Clear the terminal-only edge so the field recipe owns every state,
    // including invalid, focus and hover, on all four sides.
    borderTopColor: null,
    borderTopWidth: vars["--aui-border-width-hairline"],
    gap: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  formDefault: {
    borderRadius: vars["--aui-radius-panel"],
    borderWidth: 0,
    backgroundColor: vars["--aui-color-surface"],
    padding: vars["--aui-space-12"],
  },
  /** A task row dragged over the composer: the drop attaches it as context. */
  formTaskDrop: {
    outlineWidth: 2,
    outlineStyle: "dashed",
    outlineColor: vars["--aui-color-accent"],
    outlineOffset: -2,
    backgroundColor: vars["--aui-color-accent-soft"],
  },
  suggestions: { marginLeft: -6, marginBottom: 2 },
  suggestionChip: {
    height: 28,
    borderRadius: vars["--aui-radius-full"],
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 40%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 70%, transparent)`,
    },
    paddingInline: "0.875rem",
    fontSize: vars["--aui-font-size-caption"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },
  stackSm: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"] },
  stackMd: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"] },
  minimalBox: {
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
    backgroundColor: vars["--aui-color-canvas"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: 10,
  },
  /** Inside the tray's raised input the editor box draws no second edge. */
  minimalBoxTray: { borderWidth: 0, backgroundColor: "transparent", paddingInline: 0, paddingBlock: vars["--aui-space-4"] },
  minimalRow: { display: "flex", alignItems: "flex-start", gap: vars["--aui-space-12"] },
  promptCaretGlyph: {
    userSelect: "none",
    fontFamily: vars["--aui-font-mono"],
    fontSize: "var(--composer-font-size)",
    lineHeight: "var(--composer-line-height)",
    color: `color-mix(in oklch, ${vars["--aui-color-accent"]} 90%, transparent)`,
  },
  editorArea: { position: "relative", minWidth: 0, flex: 1 },

  enhanceOverlay: {
    pointerEvents: "none",
    position: "absolute",
    right: 0,
    top: 0,
  },
  enhanceGradientMinimal: {
    paddingLeft: vars["--aui-space-16"],
    backgroundImage: `linear-gradient(to left, ${vars["--aui-color-canvas"]}, transparent)`,
  },
  enhanceGradientDefault: {
    paddingLeft: vars["--aui-space-16"],
    backgroundImage: `linear-gradient(to left, ${vars["--aui-color-surface"]}, transparent)`,
  },
  enhanceButtonBase: {
    pointerEvents: "auto",
    opacity: { ":disabled": 1 },
  },
  enhanceBusyMinimal: {
    height: 28,
    gap: 6,
    borderRadius: vars["--aui-radius-full"],
    borderColor: `color-mix(in oklch, ${vars["--aui-color-accent"]} 25%, transparent)`,
    paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-accent"],
    backgroundColor: vars["--aui-color-canvas"],
  },
  enhanceBusyDefault: {
    height: 28,
    gap: 6,
    borderRadius: vars["--aui-radius-full"],
    borderColor: `color-mix(in oklch, ${vars["--aui-color-accent"]} 25%, transparent)`,
    paddingInline: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-accent"],
    backgroundColor: vars["--aui-color-surface"],
  },
  enhanceIdle: {
    width: 28,
    height: 28,
    opacity: { default: 0.7, ":hover": 1 },
  },
  loaderPrimary: { color: vars["--aui-color-accent"] },
  maxW64: { maxWidth: "16rem" },

  editorReset: {
    resize: "none",
    overflowY: "auto",
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingInline: 0,
    paddingBlock: 0,
    // Explicitly flat, on the elevation scale: the editor is the composer
    // surface's own text plane, not a layer above it.
    boxShadow: vars["--aui-elevation-flat"],
    outline: { default: "none", ":focus-visible": "none" },
  },
  editorSizeMinimal: {
    minBlockSize: "2lh",
    maxBlockSize: 168,
    caretColor: vars["--aui-color-accent"],
  },
  // Rests at two lines of its own text (`lh` follows the typography above)
  // and grows with the draft up to the cap.
  editorSizeDefault: {
    minBlockSize: "2lh",
    maxBlockSize: 240,
  },
  editorProgress: {
    cursor: "progress",
    userSelect: "none",
    color: vars["--aui-color-text-muted"],
  },
  editorRevealing: {
    cursor: "progress",
    userSelect: "none",
  },
  editorHidden: { opacity: 0 },
  terminalCaret: {
    pointerEvents: "none",
    position: "absolute",
    left: 0,
    top: "calc(var(--composer-font-size) * (var(--composer-line-height) - 1) / 2)",
    height: "var(--composer-font-size)",
    width: 8,
    borderRadius: 1,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-text"]} 85%, transparent)`,
    animationName: caretBlink,
    animationDuration: vars["--aui-motion-duration-loop"],
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },
  /*
   * Geometry only. Radius, fill, border and elevation are the AUI popover
   * surface's; restating them here (from `className`, where the duplicate
   * could not be reconciled) drew a second hairline just inside the real
   * border. `space4` padding is deliberate and stays: this popup hosts rows,
   * which own their own inner padding, exactly like the AUI menu surface.
   */
  commandPopover: {
    maxHeight: "min(40rem, var(--available-height))",
    width: "min(44rem, calc(100vw - 2rem))",
    gap: 0,
    overflow: "hidden",
    padding: vars["--aui-space-4"],
  },
  commandRoot: {
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas"]} 70%, transparent)`,
    padding: 0,
  },
  commandList: { maxHeight: "32rem", scrollPaddingBlock: vars["--aui-space-8"] },
  itemStandard: {
    minHeight: 56,
    cursor: "pointer",
    alignItems: "flex-start",
    gap: vars["--aui-space-12"],
    borderRadius: vars["--aui-radius-control"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: 10,
  },
  itemTall: {
    height: "4.5rem",
    minHeight: "4.5rem",
    cursor: "pointer",
    alignItems: "flex-start",
    gap: vars["--aui-space-12"],
    overflow: "hidden",
    borderRadius: vars["--aui-radius-control"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: 10,
  },
  /*
   * Icon slots stand next to `minWidth: 0` copy, so they have to opt out of
   * flex shrinking explicitly — a shrinking wrapper squeezes the glyph inside
   * it and the row's leading edge stops lining up.
   */
  iconWrapPrimary: {
    display: "flex",
    flexShrink: 0,
    alignItems: "flex-start",
    paddingBlockStart: vars["--aui-space-2"],
    color: vars["--aui-color-accent"],
  },
  iconWrap: {
    display: "flex",
    flexShrink: 0,
    alignItems: "flex-start",
    paddingBlockStart: vars["--aui-space-2"],
  },
  flex1Min: { minWidth: 0, flex: 1 },
  rowCenter: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"] },
  rowCenterMin: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--aui-space-8"],
  },
  fontMedium: { fontWeight: vars["--aui-font-weight-medium"] },
  truncMedium: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars["--aui-font-weight-medium"],
  },
  badgeUpper: {
    height: 20,
    paddingInline: 6,
    fontSize: vars["--aui-font-size-micro"],
    textTransform: "uppercase",
    letterSpacing: "0.025em",
  },
  badgeUpperShrink: {
    height: 20,
    flexShrink: 0,
    paddingInline: 6,
    fontSize: vars["--aui-font-size-micro"],
    textTransform: "uppercase",
    letterSpacing: "0.025em",
  },
  badgeMonoShrink: {
    height: 20,
    flexShrink: 0,
    paddingInline: 6,
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-micro"],
    letterSpacing: "0.025em",
  },
  badgePlain: { height: 20, paddingInline: 6, fontSize: vars["--aui-font-size-micro"] },
  itemDesc: {
    marginTop: vars["--aui-space-2"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  itemDescClamp: {
    marginTop: vars["--aui-space-2"],
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "16px",
    color: vars["--aui-color-text-muted"],
  },
  iconMuted: { inlineSize: vars["--aui-control-icon-size-md"], blockSize: vars["--aui-control-icon-size-md"], flexShrink: 0, color: vars["--aui-color-text-muted"] },
  paletteFooter: {
    borderTopWidth: vars["--aui-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: 10,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  paletteFooterTitle: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  paletteFooterTitlePlain: {
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  mt2: { marginTop: vars["--aui-space-8"] },
  mt2Title: {
    marginTop: vars["--aui-space-8"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text"],
  },
  mt1Pre: { marginTop: vars["--aui-space-4"], whiteSpace: "pre-line" },

  commentBox: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 15%, transparent)`,
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
  },
  captionMuted: { fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  flexWrapGap: { display: "flex", flexWrap: "wrap", gap: 6 },
  commentChip: {
    display: "flex",
    maxWidth: "100%",
    alignItems: "center",
    gap: 6,
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas"]} 75%, transparent)`,
    paddingInline: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
  },
  chipIndex: {
    flexShrink: 0,
    fontWeight: vars["--aui-font-weight-medium"],
    color: vars["--aui-color-text-muted"],
  },
  chipTrunc: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars["--aui-color-text"],
  },
  chipAttachCount: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--aui-space-2"],
    color: vars["--aui-color-text-muted"],
  },
  // The painted box stays 16px so the chip keeps its height; the pseudo
  // element bleeds past it to a 24px pointer target.
  chipRemove: {
    position: "relative",
    borderRadius: vars["--aui-radius-mark"],
    padding: vars["--aui-space-2"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    "::after": {
      content: '""',
      insetBlock: `min(0px, calc((100% - ${vars["--aui-space-24"]}) / 2))`,
      insetInline: `min(0px, calc((100% - ${vars["--aui-space-24"]}) / 2))`,
      position: "absolute",
    },
  },
  lensChip: {
    display: "flex",
    maxWidth: "100%",
    alignItems: "center",
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 50%, transparent)`,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text"],
  },
  lensChipTrigger: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: 6,
    paddingInline: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 70%, transparent)`,
    },
  },
  truncPlain: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  maxW80: { maxWidth: "20rem" },
  // Geometry only — see `commandPopover`. The AUI surface owns radius, fill,
  // border and elevation, so a popover keeps the one anchored-surface radius
  // instead of stepping down to the control radius on this one call site.
  lensPopoverContent: {
    maxHeight: "24rem",
    width: "min(42rem, calc(100vw - 2rem))",
    overflow: "auto",
    padding: vars["--aui-space-12"],
  },
  lensPre: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "20px",
    color: vars["--aui-color-text"],
  },
  lensChipRemove: {
    borderLeftWidth: vars["--aui-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    paddingInline: 6,
    paddingBlock: vars["--aui-space-4"],
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },

  annotationChip: {
    display: "flex",
    maxWidth: "100%",
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 50%, transparent)`,
    paddingInline: vars["--aui-space-8"],
    paddingBlock: 6,
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text"],
  },
  annotationPin: {
    marginTop: vars["--aui-space-2"],
    display: "flex",
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--aui-radius-full"],
    backgroundColor: vars["--aui-color-accent"],
    fontSize: vars["--aui-font-size-micro"],
    fontWeight: vars["--aui-font-weight-semibold"],
    color: vars["--aui-color-accent-text"],
  },
  screenshotButton: {
    flexShrink: 0,
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: {
      default: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
      ":hover": vars["--aui-color-border"],
    },
    backgroundColor: vars["--aui-color-canvas"],
    padding: vars["--aui-space-2"],
  },
  screenshotImage: {
    height: 40,
    width: 64,
    borderRadius: 2,
    objectFit: "cover",
  },
  annotationTextButton: {
    minWidth: 0,
    flex: 1,
    textAlign: "left",
    color: { ":hover": vars["--aui-color-text"] },
  },
  annotationComment: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars["--aui-font-weight-medium"],
  },
  annotationMeta: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },

  attachmentsRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  attachmentsCount: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  fileChip: {
    display: "flex",
    maxWidth: "100%",
    alignItems: "center",
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    padding: vars["--aui-space-2"],
    fontSize: vars["--aui-font-size-body"],
  },
  fileChipMinimal: {
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
    backgroundColor: "transparent",
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  fileChipDefault: {
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 80%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 50%, transparent)`,
  },
  fileOpenButton: {
    height: 28,
    minWidth: 0,
    justifyContent: "flex-start",
    gap: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-mark"],
    paddingInline: 6,
    fontFamily: "inherit",
    fontSize: "inherit",
    color: "inherit",
  },
  // Layout only. The muted→text hover ink this used to restate is what
  // `variant="ghost"` (AUI `quiet`) already resolves, and the glyph box comes
  // from the control's `size` through `--aui-control-icon-size`.
  fileRemoveButton: {
    flexShrink: 0,
  },
  imageChip: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
    borderRadius: vars["--aui-radius-mark"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    padding: vars["--aui-space-4"],
  },
  imageChipMinimal: {
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 60%, transparent)`,
    backgroundColor: "transparent",
  },
  imageChipDefault: {
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 80%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-surface-tint"]} 50%, transparent)`,
  },
  imagePreviewButton: {
    borderRadius: vars["--aui-radius-mark"],
    outline: "none",
  },
  imagePreview: {
    maxHeight: 64,
    maxWidth: 96,
    cursor: "zoom-in",
    borderRadius: vars["--aui-radius-mark"],
    objectFit: "cover",
  },
  /*
   * Placement only. The opaque circle that keeps this control legible over
   * the thumbnail — round corners, raised surface, hairline border, elevation,
   * muted ink — is AUI `variant="floating"`, the weight for exactly this kind
   * of detached action. It used to be re-derived here on top of `ghost`, which
   * is why it carried `radiusFull` and an `elevationRaised` that the system
   * spells `elevationLift` for a detached control.
   */
  imageRemoveButton: {
    position: "absolute",
    right: -4,
    top: -4,
  },

  // One line at any width: controls that do not fit move into the `⋯` menu
  // (`useComposerToolbarFit`) instead of stacking the composer rows deep.
  toolbarRow: {
    display: "flex",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--aui-space-8"],
  },
  toolbarRowEnd: { justifyContent: "flex-end" },
  // Neither half shrinks: a squeezed control would report a width it does not
  // have, and the fit that decides what leaves the row reads natural widths.
  actionsRow: { display: "flex", alignItems: "center", gap: vars["--aui-space-8"], flexShrink: 0 },
  controlLane: {
    position: "relative",
    display: "flex",
    flexWrap: "nowrap",
    flexShrink: 0,
    alignItems: "center",
    // The row's own gap, on the space scale, matching `toolbarRow` and
    // `actionsRow` either side of it.
    gap: vars["--aui-space-8"],
  },
  customizeAnchor: {
    pointerEvents: "none",
    position: "absolute",
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  },
  // Geometry only — see `commandPopover`.
  customizePopover: {
    width: "min(30rem, calc(100vw - 2rem))",
    gap: 0,
    padding: vars["--aui-space-8"],
  },
  customizeTitle: {
    paddingInline: vars["--aui-space-8"],
    paddingBottom: vars["--aui-space-4"],
    paddingTop: vars["--aui-space-4"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  stopButton: {
    color: {
      default: vars["--aui-color-danger"],
      ":hover": vars["--aui-color-danger"],
    },
    backgroundColor: {
      ":hover": `color-mix(in oklch, ${vars["--aui-color-danger"]} 10%, transparent)`,
    },
  },
  stopButtonMinimal: {
    height: 32,
    width: 32,
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--aui-color-danger"]} 30%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas"]} 50%, transparent)`,
  },
  inlineGap1: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"] },
  roundedMd: { borderRadius: vars["--aui-radius-control"] },
  tooltipColStart: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: vars["--aui-space-2"],
  },
  inlineGapBg70: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-4"],
    color: `color-mix(in oklch, ${vars["--aui-color-text-inverted"]} 70%, transparent)`,
  },
  // The stop glyph, not a control icon: it is a filled square drawn inside an
  // icon button, so it stays off the `controlIconSizes` ramp on purpose. What
  // it did need is a fixed box that cannot shrink in the actions row.
  iconSquare: { inlineSize: 12, blockSize: 12, flexShrink: 0, fill: "currentColor" },
});