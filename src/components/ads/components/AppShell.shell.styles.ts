import * as stylex from "@stylexjs/stylex";

import { densityPad } from "../tokens/density.stylex";
import { breakpoints, vars } from "../tokens/tokens.stylex";

/**
 * AppShell stylesheet, part 1 of 2. Split only because the source-size guard
 * caps a file at 500 lines; `AppShell.tsx` merges both halves back into one
 * `styles` object, so callers still see a single stylesheet.
 */
export const shellStyles = stylex.create({
  sidebarProvider: {
    display: "contents",
  },
  shell: {
    // The ground, one step below the scaffold the sidebar paints — they used
    // to share `colorCanvas`, so the panel had nothing to recede from.
    backgroundColor: vars.colorGround,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorText,
    display: "grid",
    // One workspace track by default. The old unconditional navigation track
    // left a phantom `max-content` column in shells with no sidebar and made
    // the only in-flow child depend on grid auto-placement.
    gridTemplateColumns: "minmax(0, 1fr)",
    inlineSize: "100%",
    minBlockSize: 520,
    minInlineSize: 0,
    overflow: "hidden",
  },
  shellWithAppRail: {
    /*
     * The rail is flush to the window edge so its expanded panel reads as a
     * drawer attached to the screen rather than a card floating off it. The
     * gutter lives on the rail↔frame seam instead, which is where the two
     * planes actually meet.
     *
     * The track is `controlHeightXl` plus the rail's own 4px gutter plus the
     * hairline pair a row's border takes. A rail row is a `Button`, which
     * carries a 1px transparent border for variant geometry, and it is
     * `border-box`: without that headroom the row's content box falls below the
     * 16px icon, the glyph overflows to the inline-end, and the row's hover or
     * pressed fill shows more space on one side than the other.
     */
    gridTemplateColumns: `calc(${vars.controlHeightXl} + ${vars.space4} + ${vars.space2}) minmax(0, 1fr)`,
  },
  shellFramedChrome: {
    // This is the ground the framed shell actually shows — it composes after
    // `shell`, so it, not `shell`, decides what sits behind the app frame.
    backgroundColor: vars.colorGround,
    borderRadius: 0,
    borderWidth: 0,
  },
  // Off-screen until focused. `position: fixed` rather than absolute on
  // purpose: the shell is `overflow: hidden` and unpositioned, so an absolute
  // link would either be clipped or land against whatever ancestor happens to
  // be positioned. Fixed also puts it above the shell's own chrome (the app
  // rail, a header row) — the chrome it exists to skip — hence a z-index in
  // the band ABOVE `zIndexAppChrome` (tokens.stylex.ts: everything above that
  // boundary may cover it), and below `zIndexModal` so it never jumps a dialog.
  skipLink: {
    backgroundColor: vars.colorSurfaceRaised,
    blockSize: { default: 1, ":focus-visible": "auto" },
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    clipPath: { default: "inset(50%)", ":focus-visible": "none" },
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    inlineSize: { default: 1, ":focus-visible": "auto" },
    insetBlockStart: vars.space8,
    insetInlineStart: vars.space8,
    overflow: "hidden",
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
    position: "fixed",
    textDecoration: "none",
    whiteSpace: "nowrap",
    zIndex: vars.zIndexOverlay,
  },
  sidebarSlot: {
    minBlockSize: 0,
    minInlineSize: 0,
  },
  appRailSlot: {
    blockSize: "100%",
    gridColumn: "1",
    gridRow: "1 / -1",
    minBlockSize: 0,
    minInlineSize: 0,
    position: "relative",
    zIndex: vars.zIndexAppChrome,
  },
  appHeaderSlot: {
    minBlockSize: vars.chromeRowHeight,
    minInlineSize: 0,
  },
  appFrame: {
    display: "grid",
    gridColumn: "1",
    gridRow: "1",
    gridTemplateColumns: "minmax(0, 1fr)",
    minBlockSize: 0,
    minInlineSize: 0,
    overflow: "hidden",
  },
  appFrameAfterRail: {
    gridColumn: "2",
  },
  /**
   * The app frame paints the body surface on every shell, rail or not.
   *
   * It used to inherit the shell's `colorCanvas` by being transparent, so the
   * container holding the content read as the page BACKGROUND rather than as a
   * surface on it. Canvas is the ground; the frame is what sits on it, and that
   * is true whether or not a rail happens to be present.
   */
  appFrameSurface: {
    backgroundColor: vars.colorSurfaceRaised,
  },
  /**
   * The framed CHROME — inset margins, hairline, corner, lift. Still tied to
   * the rail, because the inset only reads as a frame when there is something
   * beside it to be inset FROM. A rail-less shell is full-bleed and takes the
   * surface above without this.
   */
  appFrameFramed: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationRaised,
    // One gutter on all four sides. It used to be 12 on three and 4 on the
    // rail seam, so the frame sat visibly off-centre inside the ground.
    //
    // Zero on the inline-start when a rail is present: the rail track carries
    // its own 4px gutter on that edge, so a margin here would stack on top of
    // it and make the one seam between two planes twice every other gap.
    marginBlock: vars.space8,
    marginInlineEnd: vars.space8,
    marginInlineStart: 0,
  },
  appFrameWithSidebarLeft: {
    gridTemplateColumns: "max-content minmax(0, 1fr)",
  },
  appFrameWithSidebarRight: {
    gridTemplateColumns: "minmax(0, 1fr) max-content",
  },
  workspace: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "minmax(0, 1fr)",
    minBlockSize: 0,
    minInlineSize: 0,
  },
  workspaceWithHeader: {
    gridTemplateRows: "auto minmax(0, 1fr)",
  },
  workspaceWithTwoHeaders: {
    gridTemplateRows: "auto auto minmax(0, 1fr)",
  },
  workspaceHeaderSlot: {
    minInlineSize: 0,
  },
  content: {
    // Content rows size to their contents. Grid's default `align-content:
    // normal` stretches an auto row when it is the only child, which made a
    // lone PageHeader fill the viewport and expanded its breadcrumb row by
    // hundreds of pixels.
    alignContent: "start",
    display: "grid",
    gap: vars.space16,
    gridTemplateColumns: "minmax(0, 1fr)",
    minBlockSize: 0,
    minInlineSize: 0,
    overflow: "auto",
    padding: vars.space16,
    // Where the OS draws classic scrollbars, a full-width bar read as a
    // permanent gutter rather than chrome. `thin` is the width `Stepper` uses,
    // and the bar only paints while the pointer is in the region it scrolls;
    // `ThemeProvider` sets `scrollbarColor` on the root and it inherits, so the
    // resting value is stated here to win. The column stays reserved — taking
    // it back would reflow the content the moment a list grew past the fold.
    scrollbarColor: {
      default: "transparent transparent",
      ":focus-within": `${vars.colorScrollbarThumb} transparent`,
      ":hover": `${vars.colorScrollbarThumb} transparent`,
    },
    scrollbarWidth: "thin",
  },
  // `contentLayout="fill"`: hand the region to the app. One stretched row with
  // a definite height (so a `100%`/`fillHeight` child has something to resolve
  // against), no inset, no gap, and no scroller of its own — the child owns
  // both, and a region that also scrolled would nest two.
  contentFill: {
    alignContent: "stretch",
    gap: 0,
    gridTemplateRows: "minmax(0, 1fr)",
    overflow: "hidden",
    padding: 0,
  },
  sidebar: {
    // Near-white warm canvas (not a gray wash) + logical hairline; on a white
    // content surface the sidebar should recede by *temperature*, not weight.
    backgroundColor: vars.colorCanvas,
    // Fill the AppShell sidebar slot so the inline-end hairline spans the
    // shell's full height (a content-sized nav leaves the border short).
    blockSize: "100%",
    borderRightColor: vars.colorBorder,
    borderRightStyle: "solid",
    borderRightWidth: vars.borderWidthHairline,
    // Flex column (not a fixed 2-row grid): the header is `display:none` when
    // collapsed, which shifted grid auto-placement so the footer grabbed the
    // stretchy row and floated mid-rail. With flex, the content region grows
    // and the footer stays pinned to the bottom regardless of how many
    // header/content children are visible.
    display: "flex",
    // A sidebar owns a stable navigation width. Let the adjacent workspace
    // absorb narrow layouts (and scroll its wide content) instead of silently
    // compressing this rail without updating the collapsed state.
    flexShrink: 0,
    flexDirection: "column",
    // §8 — `density` arms read `densityPad`, never `spaceN`.
    gap: densityPad.md,
    // One width, no breakpoint arm. The arm that used to live here read
    // `var(--atelier-sidebar-width-mobile, var(--atelier-sidebar-width, 220px))`
    // — its default resolved to the SAME 220px as the wide arm, so it changed
    // nothing while looking like the narrow-viewport answer, and (because
    // StyleX keys a class per property AND condition, and an at-rule class
    // outranks a plain one from any style object) it silently beat
    // `sidebarCollapsed`'s icon width below 768px: a collapsed rail rendered at
    // the expanded width. Narrow behaviour is state, not width — the provider
    // resolves the icon rail on mobile (see `contextOpen` above) — and the two
    // places where a narrow viewport is genuinely a DIFFERENT surface set their
    // own width: the modal drawer, and `sidebarStaticNarrow` for a rail no one
    // can collapse.
    inlineSize: "var(--atelier-sidebar-width, 220px)",
    minBlockSize: 0,
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: densityPad.md,
    paddingInline: densityPad.sm,
    position: "relative",
    transitionDuration: {
      default: vars.motionDurationQuick,
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "inline-size, opacity, transform",
    transitionTimingFunction: vars.motionEaseStandard,
  },
  sidebarCompact: {
    gap: densityPad.sm,
    // Longhands, not the `padding` shorthand. StyleX resolves a longhand over a
    // shorthand regardless of composition order, and the base rule above sets
    // `paddingBlock`/`paddingInline` — so this arm's `padding: 8px` never
    // applied and a compact rail kept the comfortable rail's 12px block inset.
    // Measured before this fix: `padding-top` 12px on a `data-density="compact"`
    // nav. Only `gap` (a property the base sets under the same name) was
    // actually taking effect.
    paddingBlock: densityPad.sm,
    paddingInline: densityPad.sm,
  },
  sidebarCollapsed: {
    inlineSize: "var(--atelier-sidebar-width-icon, 68px)",
    paddingInline: vars.space8,
  },
  /**
   * A rail nobody can collapse — no `SidebarProvider` (so no state, and
   * `SidebarTrigger` does not render) and no `collapsed` prop — capped at the
   * viewport-relative width on a narrow screen. Without this, 220px of the package's
   * supported 320px floor (`styles.css` → `html { min-inline-size: 320px }`)
   * goes to navigation the user cannot dismiss, and `flex-shrink: 0` plus the
   * shell's `max-content` track leave the work surface unusable. The rail keeps
   * enough room for labels; forcing icon width without entering the collapsed
   * state would only clip expanded navigation. Deliberately
   * NOT applied to a collapsible rail the user has chosen to expand, and not to
   * `collapsible="none"`, which asks for a permanent full rail on purpose.
   * Viewport-scoped legitimately (§10): this is the shell against the screen.
   */
  sidebarStaticNarrow: {
    inlineSize: {
      default: null,
      [breakpoints.md]:
        "min(var(--atelier-sidebar-width-mobile, var(--atelier-sidebar-width, 220px)), 40dvw)",
    },
  },
  sidebarOffcanvasCollapsed: {
    // `side` is a physical left/right API (AppShell places the slot by those
    // same names), so clear both physical edge rules while the rail is away.
    borderLeftWidth: 0,
    borderRightWidth: 0,
    inlineSize: 0,
    opacity: 0,
    paddingInline: 0,
    pointerEvents: "none",
  },
  /** Offcanvas rail leaving toward the physical left edge. */
  sidebarOffcanvasSlideLeft: {
    transform: "translateX(-100%)",
  },
  /** Offcanvas rail leaving toward the physical right edge. */
  sidebarOffcanvasSlideRight: {
    transform: "translateX(100%)",
  },
  sidebarMobileOffcanvas: {
    blockSize: "100dvh",
    boxShadow: vars.elevationOverlay,
    // The drawer states its own width instead of inheriting the rail's: it is a
    // modal panel, not an in-flow rail, and it is the surface
    // `--atelier-sidebar-width-mobile` was named for. This is exactly what the
    // base rule's deleted breakpoint arm used to resolve to.
    inlineSize:
      "var(--atelier-sidebar-width-mobile, var(--atelier-sidebar-width, 220px))",
    insetBlockStart: 0,
    // `side="left"` means the physical left edge in both writing directions.
    left: 0,
    maxInlineSize: "calc(100dvw - 2rem)",
    position: "fixed",
    zIndex: vars.zIndexModal,
  },
  sidebarBackdrop: {
    backdropFilter: vars.motionBlurOverlay,
    backgroundColor: vars.colorOverlay,
    inset: 0,
    position: "fixed",
    zIndex: vars.zIndexOverlay,
  },
  sidebarMobileOffcanvasRight: {
    left: "auto",
    right: 0,
  },
  sidebarRight: {
    // Physical edge pair because `side` itself is physical. Logical borders
    // would swap under RTL while AppShell's left/right slot placement does not.
    borderLeftColor: vars.colorBorder,
    borderLeftStyle: "solid",
    borderLeftWidth: vars.borderWidthHairline,
    borderRightWidth: 0,
  },
  sidebarFloating: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationRaised,
    margin: vars.space8,
  },
  sidebarInset: {
    backgroundColor: vars.colorSurfaceRaised,
  },
  sidebarHeader: {
    display: "grid",
    flexShrink: 0,
    gap: vars.space8,
    minInlineSize: 0,
  },
  sidebarHeaderCollapsed: {
    paddingInline: 0,
  },
  sidebarHeaderRow: {
    // `start`: the identity block beside the trigger can run to two lines, and
    // centring the square against that box parks it halfway down the rail. The
    // tall child defines the row, so this only moves the trigger.
    alignItems: "start",
    display: "grid",
    // 4px, not 8px. The trailing track is the ONLY width the header content
    // gives up, and the trigger is now borderless: its 16px glyph is centred in
    // a 32px box, so it already carries 8px of optical inset on the side facing
    // the label. 8px of grid gap on top of that read as a hole and cost width a
    // 220px rail does not have.
    gap: vars.space4,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minInlineSize: 0,
  },
  sidebarHeaderRowCollapsed: {
    gridTemplateColumns: "auto",
    justifyContent: "center",
  },
  // Expanded, this remains rendered even when empty because it keeps a lone
  // trigger in the trailing track. Collapsed, it is rendered only when
  // `collapsedHeader` exists and stacks below the centred expand trigger.
  sidebarHeaderContent: {
    minInlineSize: 0,
  },
  sidebarContent: {
    alignContent: "start",
    display: "grid",
    // Grow to fill the column so the footer is pushed to the bottom; scroll
    // internally when the nav is taller than the rail.
    flexGrow: 1,
    gap: densityPad.md,
    minBlockSize: 0,
    minInlineSize: 0,
    overflow: "auto",
    // Same treatment as the content scroller above — the two sit side by side,
    // so a bar that behaves differently on one of them reads as a mistake.
    scrollbarColor: {
      default: "transparent transparent",
      ":focus-within": `${vars.colorScrollbarThumb} transparent`,
      ":hover": `${vars.colorScrollbarThumb} transparent`,
    },
    scrollbarWidth: "thin",
  },
  sidebarContentCompact: {
    gap: densityPad.sm,
  },
  sidebarFooter: {
    borderBlockStartColor: vars.colorBorder,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    display: "grid",
    flexShrink: 0,
    gap: vars.space8,
    minInlineSize: 0,
    paddingBlockStart: vars.space12,
  },
  sidebarTrigger: {
    // Quiet chrome, not a bordered control. The 1px `colorBorder` that used to
    // live here made this the ONLY outlined button in the rail — the collapsed
    // search button (`sidebarSearchCollapsedButton`), `sidebarMenuAction` and
    // `sidebarGroupAction` are all borderless — so it read as a boxed widget
    // stapled onto the header rather than a peer of the rows beside it.
    alignItems: "center",
    // No `alignSelf`: where this sits is the container's call. Declaring
    // `start` here followed the trigger into every `Topbar` and left it 4px
    // above the tabs beside it.
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
      ":active": vars.colorOverlayPressed,
    },
    borderRadius: vars.radiusControl,
    borderWidth: 0,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space8,
    justifyContent: "center",
    paddingBlock: 0,
    paddingInline: 0,
  },
  sidebarTriggerCollapsed: {
    // In the collapsed icon rail the trigger lives inside grid/flex parents
    // (sidebarFooter is display:grid) whose default `align-items: stretch`
    // would stretch a height-uncapped button (base sets only `minBlockSize`)
    // to fill the track, so the button grows tall. Opt out of stretch so the
    // collapsed trigger stays a clean fixed icon button.
    alignSelf: "center",
  },
  sidebarTriggerIconRtl: {
    transform: "rotate(180deg)",
  },
  sidebarInsetSlot: {
    display: "grid",
    minBlockSize: 0,
    minInlineSize: 0,
  },
  /**
   * Fallback chrome for the `workspace` slot. It used to be a raised, bordered,
   * 12px-padded semibold card — a heavier surface than anything else in the
   * rail, which is why the app name at the top read as oversized next to the
   * nav rows. It is now the same quiet row language as `sidebarItem`: no
   * border, no fill, row-height padding, medium weight at the rail's own
   * `fontSizeBody`. `SidebarMenuButton` (optionally with `description`) is the
   * composed form; this is what a bare node falls back to.
   */
  workspaceSwitcher: {
    alignItems: "center",
    color: vars.colorText,
    display: "flex",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    minBlockSize: vars.controlHeightSm,
    minInlineSize: 0,
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: vars.space8,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sidebarGroup: {
    display: "grid",
    gap: vars.space4,
    minInlineSize: 0,
  },
});

