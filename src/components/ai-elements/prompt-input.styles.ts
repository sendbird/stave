import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

const diffStep = "--prompt-diff-step";
const diffIndex = "--prompt-diff-i";

const promptDiffWord = stylex.keyframes({
  from: { opacity: 0, backgroundColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 22%, transparent)` },
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
    fontFamily: vars["--ads-font-mono"],
    fontSize: "15px",
    lineHeight: "1.75rem",
    letterSpacing: "-0.01em",
  },
  editorTypographyDefault: {
    // Stated, not inherited. The editable is a `contenteditable` div and the
    // placeholder is a sibling `div`; leaving the family to inheritance let
    // whichever ancestor happened to be closest decide, so the placeholder
    // could render in the ADS default stack while the typed text used the
    // app's. `vars["--ads-font-sans"]` resolves to `var(--font-sans)` through
    // `ads-theme.ts`, so both follow the one font setting.
    fontFamily: vars["--ads-font-sans"],
    fontSize: "18px",
    lineHeight: "2rem",
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
    borderRadius: vars["--ads-radius-full"],
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: vars["--ads-color-surface"],
  },
  runtimeDotWarning: { backgroundColor: vars["--ads-color-warning"] },
  runtimeDotCustom: { backgroundColor: vars["--ads-color-accent"] },
  runtimeDotSuccess: { backgroundColor: vars["--ads-color-success-border"] },

  // ---- Tone text helpers ----
  toneWarning: { color: vars["--ads-color-warning"] },
  tonePrimary: { color: vars["--ads-color-accent"] },
  toneSuccess: { color: vars["--ads-color-success-text"] },
  accentThinking: {
    color: {
      default: "var(--prompt-role-thinking)",
      ":hover": "var(--prompt-role-thinking)",
    },
  },
  accentPlan: {
    color: {
      default: "var(--prompt-role-plan)",
      ":hover": "var(--prompt-role-plan)",
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
  // a flex row whose label is `flex: 1`, and in a 3.75rem wing the row is
  // narrower than icon + gap + label. Without it the glyph — not the label —
  // gave up the width and the wing rendered squashed icons.
  icon4: { width: vars["--ads-control-icon-size-md"], height: vars["--ads-control-icon-size-md"], flexShrink: 0 },
  icon3: { width: 12, height: 12, flexShrink: 0 },
  icon35: { width: vars["--ads-control-icon-size-sm"], height: vars["--ads-control-icon-size-sm"], flexShrink: 0 },
  icon35Shrink: { width: vars["--ads-control-icon-size-sm"], height: vars["--ads-control-icon-size-sm"], flexShrink: 0 },

  pulseAnimation: {
    animationName: pulse,
    animationDuration: vars["--ads-motion-duration-loop"],
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },

  // ---- Surfaces / toolbar buttons ----
  toolbarIconButton: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-overlay-hover"] },
    padding: 0,
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  floatingSurface: {
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 90%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-canvas"]} 95%, transparent)`,
    },
    color: vars["--ads-color-text"],
  },
  surfacePrimaryFocus: {
    outline: { default: "none", ":focus-visible": "none" },
    borderColor: { ":focus-visible": "transparent" },
  },

  // ---- Lens annotation popovers ----
  lensPopover72: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    width: "18rem",
  },
  lensPopover64: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    width: "16rem",
  },
  fieldGrid: { display: "grid", gap: vars["--ads-space-8"] },
  fieldGridCols2: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: vars["--ads-space-8"],
  },
  fieldLabel: { display: "grid", gap: vars["--ads-space-4"], fontSize: vars["--ads-font-size-caption"] },
  fieldLabelText: { fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text-muted"] },
  inputField: {
    height: 28,
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
  },
  fullWidth: { width: "100%" },

  scopeIcon: {
    width: "0.875rem",
    height: "0.875rem",
    color: `color-mix(in oklch, ${vars["--ads-color-text"]} 80%, transparent)`,
  },
  cursorDisabled: { cursor: "not-allowed", opacity: 0.6 },
  toneMutedHalf: {
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 50%, transparent)`,
  },
  iconThinking: { color: "var(--prompt-role-thinking)" },
  pendingShell: {
    position: "relative",
    zIndex: vars["--ads-z-index-panel"],
    borderRadius: vars["--ads-radius-panel"],
    backgroundColor: vars["--ads-color-surface"],
    outline: "none",
  },

  /*
   * Height cap only. The drawer panel is a detached global surface and the ADS
   * drawer surface already carries `elevationModal` for exactly that role;
   * restating it here (from `className`, where StyleX cannot reconcile the
   * duplicate) painted the same modal band twice on one element.
   */
  drawerContent: {
    backgroundColor: vars["--ads-color-surface-raised"],
    maxHeight: "78vh",
  },
  drawerHeader: {
    gap: 6,
    paddingInline: vars["--ads-space-20"],
    paddingBottom: vars["--ads-space-16"],
    paddingTop: vars["--ads-space-16"],
    textAlign: "left",
  },
  rowBaseline: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: vars["--ads-space-16"],
  },
  titleBase: { fontSize: vars["--ads-font-size-lead"], fontWeight: vars["--ads-font-weight-semibold"] },
  toneLabel: { fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-semibold"] },
  drawerScroll: { minHeight: 0, flex: 1, overflowY: "auto" },
  /*
   * Width only. Radius, fill, border and elevation belong to the ADS popover
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
   * The flush panel's single inner gutter, on the ADS popover scale
   * (`space16` inline, `space16` above, `space12` under the title group) —
   * matching `Popover`'s own `headerFlush`. The sections below share that
   * inline gutter, so the header's baseline and every section rule align.
   */
  runtimePopoverHeader: {
    paddingInline: vars["--ads-space-16"],
    paddingBottom: vars["--ads-space-12"],
    paddingTop: vars["--ads-space-16"],
  },
  mt1: { marginTop: vars["--ads-space-4"] },
  menuSeparator: {
    marginBlock: 6,
    height: 1,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
  },
  customizeButton: {
    width: "100%",
    justifyContent: "flex-start",
    gap: 6,
    fontSize: vars["--ads-font-size-caption"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },

  borderBeamTransition: {
    transitionProperty: "box-shadow",
    transitionDuration: { default: "200ms", "@media (prefers-reduced-motion: reduce)": "0ms" },
    transitionTimingFunction: "ease-out",
  },
  composerShell: {
    position: "relative",
    zIndex: vars["--ads-z-index-panel"],
    borderRadius: vars["--ads-radius-panel"],
  },
  formBase: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    transitionProperty: "border-color, background-color",
    transitionDuration: vars["--ads-motion-duration-fast"],
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  formMinimal: {
    gap: vars["--ads-space-8"],
    borderWidth: 0,
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    backgroundColor: "transparent",
    padding: 0,
    paddingTop: vars["--ads-space-12"],
  },
  formDefault: {
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: 0,
    backgroundColor: vars["--ads-color-surface"],
    padding: vars["--ads-space-12"],
  },
  suggestions: { marginLeft: -6, marginBottom: 2 },
  suggestionChip: {
    height: 28,
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 40%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 70%, transparent)`,
    },
    paddingInline: "0.875rem",
    fontSize: vars["--ads-font-size-caption"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  stackSm: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"] },
  stackMd: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  minimalBox: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    backgroundColor: vars["--ads-color-canvas"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: 10,
  },
  minimalRow: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-12"] },
  promptCaretGlyph: {
    userSelect: "none",
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-lead"],
    lineHeight: "1.75rem",
    color: `color-mix(in oklch, ${vars["--ads-color-accent"]} 90%, transparent)`,
  },
  editorArea: { position: "relative", minWidth: 0, flex: 1 },

  enhanceOverlay: {
    pointerEvents: "none",
    position: "absolute",
    right: 0,
    top: 0,
  },
  enhanceGradientMinimal: {
    paddingLeft: vars["--ads-space-16"],
    backgroundImage: `linear-gradient(to left, ${vars["--ads-color-canvas"]}, transparent)`,
  },
  enhanceGradientDefault: {
    paddingLeft: vars["--ads-space-16"],
    backgroundImage: `linear-gradient(to left, ${vars["--ads-color-surface"]}, transparent)`,
  },
  enhanceButtonBase: {
    pointerEvents: "auto",
    opacity: { ":disabled": 1 },
  },
  enhanceBusyMinimal: {
    height: 28,
    gap: 6,
    borderRadius: vars["--ads-radius-full"],
    borderColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 25%, transparent)`,
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-accent"],
    backgroundColor: vars["--ads-color-canvas"],
  },
  enhanceBusyDefault: {
    height: 28,
    gap: 6,
    borderRadius: vars["--ads-radius-full"],
    borderColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 25%, transparent)`,
    paddingInline: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-accent"],
    backgroundColor: vars["--ads-color-surface"],
  },
  enhanceIdle: {
    width: 28,
    height: 28,
    opacity: { default: 0.7, ":hover": 1 },
  },
  loaderPrimary: { color: vars["--ads-color-accent"] },
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
    boxShadow: vars["--ads-elevation-flat"],
    outline: { default: "none", ":focus-visible": "none" },
  },
  editorSizeMinimal: {
    minBlockSize: 32,
    maxBlockSize: 168,
    caretColor: vars["--ads-color-accent"],
  },
  editorSizeDefault: {
    minBlockSize: 104,
    maxBlockSize: 240,
  },
  editorProgress: {
    cursor: "progress",
    userSelect: "none",
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 70%, transparent)`,
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
    top: 6,
    height: 20,
    width: 8,
    borderRadius: 1,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-text"]} 85%, transparent)`,
    animationName: caretBlink,
    animationDuration: vars["--ads-motion-duration-loop"],
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },
  /*
   * Geometry only. Radius, fill, border and elevation are the ADS popover
   * surface's; restating them here (from `className`, where the duplicate
   * could not be reconciled) drew a second hairline just inside the real
   * border. `space4` padding is deliberate and stays: this popup hosts rows,
   * which own their own inner padding, exactly like the ADS menu surface.
   */
  commandPopover: {
    maxHeight: "min(40rem, var(--available-height))",
    width: "min(44rem, calc(100vw - 2rem))",
    gap: 0,
    overflow: "hidden",
    padding: vars["--ads-space-4"],
  },
  commandRoot: {
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 70%, transparent)`,
    padding: 0,
  },
  commandList: { maxHeight: "32rem", scrollPaddingBlock: vars["--ads-space-8"] },
  itemStandard: {
    minHeight: 56,
    cursor: "pointer",
    alignItems: "flex-start",
    gap: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-control"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: 10,
  },
  itemTall: {
    height: "4.5rem",
    minHeight: "4.5rem",
    cursor: "pointer",
    alignItems: "flex-start",
    gap: vars["--ads-space-12"],
    overflow: "hidden",
    borderRadius: vars["--ads-radius-control"],
    paddingInline: vars["--ads-space-12"],
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
    paddingBlockStart: vars["--ads-space-2"],
    color: vars["--ads-color-accent"],
  },
  iconWrap: {
    display: "flex",
    flexShrink: 0,
    alignItems: "flex-start",
    paddingBlockStart: vars["--ads-space-2"],
  },
  flex1Min: { minWidth: 0, flex: 1 },
  rowCenter: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"] },
  rowCenterMin: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  fontMedium: { fontWeight: vars["--ads-font-weight-medium"] },
  truncMedium: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  badgeUpper: {
    height: 20,
    paddingInline: 6,
    fontSize: vars["--ads-font-size-micro"],
    textTransform: "uppercase",
    letterSpacing: "0.025em",
  },
  badgeUpperShrink: {
    height: 20,
    flexShrink: 0,
    paddingInline: 6,
    fontSize: vars["--ads-font-size-micro"],
    textTransform: "uppercase",
    letterSpacing: "0.025em",
  },
  badgeMonoShrink: {
    height: 20,
    flexShrink: 0,
    paddingInline: 6,
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    letterSpacing: "0.025em",
  },
  badgePlain: { height: 20, paddingInline: 6, fontSize: vars["--ads-font-size-micro"] },
  itemDesc: {
    marginTop: vars["--ads-space-2"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  itemDescClamp: {
    marginTop: vars["--ads-space-2"],
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "16px",
    color: vars["--ads-color-text-muted"],
  },
  iconMuted: { inlineSize: vars["--ads-control-icon-size-md"], blockSize: vars["--ads-control-icon-size-md"], flexShrink: 0, color: vars["--ads-color-text-muted"] },
  paletteFooter: {
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: 10,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  paletteFooterTitle: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  paletteFooterTitlePlain: {
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  mt2: { marginTop: vars["--ads-space-8"] },
  mt2Title: {
    marginTop: vars["--ads-space-8"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  mt1Pre: { marginTop: vars["--ads-space-4"], whiteSpace: "pre-line" },

  commentBox: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 15%, transparent)`,
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  captionMuted: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  flexWrapGap: { display: "flex", flexWrap: "wrap", gap: 6 },
  commentChip: {
    display: "flex",
    maxWidth: "100%",
    alignItems: "center",
    gap: 6,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 75%, transparent)`,
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
  },
  chipIndex: {
    flexShrink: 0,
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text-muted"],
  },
  chipTrunc: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: vars["--ads-color-text"],
  },
  chipAttachCount: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: vars["--ads-space-2"],
    color: vars["--ads-color-text-muted"],
  },
  chipRemove: {
    borderRadius: vars["--ads-radius-mark"],
    padding: vars["--ads-space-2"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  lensChip: {
    display: "flex",
    maxWidth: "100%",
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 50%, transparent)`,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text"],
  },
  lensChipTrigger: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: 6,
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 70%, transparent)`,
    },
  },
  truncPlain: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  maxW80: { maxWidth: "20rem" },
  // Geometry only — see `commandPopover`. The ADS surface owns radius, fill,
  // border and elevation, so a popover keeps the one anchored-surface radius
  // instead of stepping down to the control radius on this one call site.
  lensPopoverContent: {
    maxHeight: "24rem",
    width: "min(42rem, calc(100vw - 2rem))",
    overflow: "auto",
    padding: vars["--ads-space-12"],
  },
  lensPre: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "20px",
    color: vars["--ads-color-text"],
  },
  lensChipRemove: {
    borderLeftWidth: vars["--ads-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    paddingInline: 6,
    paddingBlock: vars["--ads-space-4"],
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },

  annotationChip: {
    display: "flex",
    maxWidth: "100%",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 50%, transparent)`,
    paddingInline: vars["--ads-space-8"],
    paddingBlock: 6,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text"],
  },
  annotationPin: {
    marginTop: vars["--ads-space-2"],
    display: "flex",
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: vars["--ads-radius-full"],
    backgroundColor: vars["--ads-color-accent"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-accent-text"],
  },
  screenshotButton: {
    flexShrink: 0,
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
      ":hover": vars["--ads-color-border"],
    },
    backgroundColor: vars["--ads-color-canvas"],
    padding: vars["--ads-space-2"],
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
    color: { ":hover": vars["--ads-color-text"] },
  },
  annotationComment: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  annotationMeta: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
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
    gap: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  fileChip: {
    display: "flex",
    maxWidth: "100%",
    alignItems: "center",
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    padding: vars["--ads-space-2"],
    fontSize: vars["--ads-font-size-body"],
  },
  fileChipMinimal: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    backgroundColor: "transparent",
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  fileChipDefault: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 80%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 50%, transparent)`,
  },
  fileOpenButton: {
    height: 28,
    minWidth: 0,
    justifyContent: "flex-start",
    gap: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-mark"],
    paddingInline: 6,
    fontFamily: "inherit",
    fontSize: "inherit",
    color: "inherit",
  },
  // Layout only. The muted→text hover ink this used to restate is what
  // `variant="ghost"` (ADS `quiet`) already resolves, and the glyph box comes
  // from the control's `size` through `--ads-control-icon-size`.
  fileRemoveButton: {
    flexShrink: 0,
  },
  imageChip: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    padding: vars["--ads-space-4"],
  },
  imageChipMinimal: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    backgroundColor: "transparent",
  },
  imageChipDefault: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 80%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 50%, transparent)`,
  },
  imagePreviewButton: {
    borderRadius: vars["--ads-radius-mark"],
    outline: "none",
  },
  imagePreview: {
    maxHeight: 64,
    maxWidth: 96,
    cursor: "zoom-in",
    borderRadius: vars["--ads-radius-mark"],
    objectFit: "cover",
  },
  /*
   * Placement only. The opaque circle that keeps this control legible over
   * the thumbnail — round corners, raised surface, hairline border, elevation,
   * muted ink — is ADS `variant="floating"`, the weight for exactly this kind
   * of detached action. It used to be re-derived here on top of `ghost`, which
   * is why it carried `radiusFull` and an `elevationRaised` that the system
   * spells `elevationLift` for a detached control.
   */
  imageRemoveButton: {
    position: "absolute",
    right: -4,
    top: -4,
  },

  toolbarRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
  },
  toolbarRowEnd: { justifyContent: "flex-end" },
  actionsRow: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"] },
  controlLane: {
    position: "relative",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    // The row's own gap, on the space scale, matching `toolbarRow` and
    // `actionsRow` either side of it.
    gap: vars["--ads-space-8"],
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
    padding: vars["--ads-space-8"],
  },
  customizeTitle: {
    paddingInline: vars["--ads-space-8"],
    paddingBottom: vars["--ads-space-4"],
    paddingTop: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  attachButtonMinimal: {
    height: 32,
    width: 32,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 60%, transparent)`,
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 50%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-surface-tint"]} 40%, transparent)`,
    },
    color: vars["--ads-color-text"],
  },
  stopButton: {
    color: {
      default: vars["--ads-color-danger"],
      ":hover": vars["--ads-color-danger"],
    },
    backgroundColor: {
      ":hover": `color-mix(in oklch, ${vars["--ads-color-danger"]} 10%, transparent)`,
    },
  },
  stopButtonMinimal: {
    height: 32,
    width: 32,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-danger"]} 30%, transparent)`,
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 50%, transparent)`,
  },
  inlineGap1: { display: "inline-flex", alignItems: "center", gap: vars["--ads-space-4"] },
  roundedMd: { borderRadius: vars["--ads-radius-control"] },
  sendButtonMinimal: {
    height: 32,
    width: 32,
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 40%, transparent)`,
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-accent"]} 10%, transparent)`,
      ":hover": `color-mix(in oklch, ${vars["--ads-color-accent"]} 15%, transparent)`,
    },
    color: vars["--ads-color-accent"],
  },
  tooltipColStart: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: vars["--ads-space-2"],
  },
  inlineGapBg70: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
    color: `color-mix(in oklch, ${vars["--ads-color-text-inverted"]} 70%, transparent)`,
  },
  // The stop glyph, not a control icon: it is a filled square drawn inside an
  // icon button, so it stays off the `controlIconSizes` ramp on purpose. What
  // it did need is a fixed box that cannot shrink in the actions row.
  iconSquare: { inlineSize: 12, blockSize: 12, flexShrink: 0, fill: "currentColor" },
});