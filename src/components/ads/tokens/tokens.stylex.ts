import * as stylex from "@stylexjs/stylex";

export const vars = stylex.defineVars({
  // Pretendard for the interface, JetBrains Mono for code. Both are loaded by
  // `styles.css`, which also has to repeat the sans stack verbatim on `:root`:
  // StyleX hashes a `defineVars` key to something like `--xwymy5f`, so plain CSS
  // cannot name this token. `check:tokens` compares the two so the copy cannot
  // drift — the same arrangement `--ads-selection-*` uses for `::selection`.
  fontSans:
    'Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  // Pretendard ships no monospace. JetBrains Mono is variable (wght 100-800,
  // covering the 400/500/600 the weight roles use), and its ligatures — which
  // would swallow the space in " --" — are already switched off wherever code
  // renders (`CodeBlock`, `fontVariantLigatures: "none"`).
  fontMono:
    '"JetBrains Mono Variable", "JetBrains Mono", "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace',

  // Warm neutral scale — Sparkler Neutral (oklch hue 89, chroma 0.007), adopted
  // from the Sendbird dashboard design system so Atelier and the dashboard
  // share one neutral. Pure-gray neutrals read cold/AI-generated; the
  // low-chroma warm cast is the house look. Surfaces are Sparkler bg-1/2/3
  // plus its near-white Neutral50. Defaults == lightTheme so an unthemed tree
  // renders correctly.
  colorCanvas: "oklch(0.985 0.007 89)",
  colorCanvasSubtle: "oklch(0.97 0.007 89)",
  // The ground behind the application frame. Its own role because the frame,
  // the sidebar and the ground all shared `colorCanvas`, so a panel could not
  // recede from what it sits on. Depth reads as darkness: ground furthest
  // back and darkest, content nearest and lightest. It is not a general
  // reading surface: only `colorText` and `colorTextMuted` may land on it,
  // enforced as their own rules in `color-policy.mjs` (subtle is 2.96:1 here).
  colorGround: "oklch(0.93 0.007 89)",
  colorSurface: "oklch(1 0 0)",
  colorSurfaceRaised: "oklch(1 0 0)",
  colorSurfaceTint: "oklch(0.97 0.007 89)",
  colorText: "oklch(0 0 0)",
  // Text ramp floors (§1.6, gated by `bun run check:colors`): body >= 7:1,
  // muted and placeholder >= 4.5:1, subtle >= 3:1 — measured against every
  // surface the role can sit on, including the tinted ones.
  //
  // Muted is Sparkler content-2 (Neutral700) verbatim. Placeholder and subtle are
  // ADS-side HALF-STEPS on Sparkler's hue/chroma, not ramp steps it ships:
  // Sparkler has no placeholder role, and its Neutral600 misses the subtle floor
  // by 0.04 (2.96:1 on `colorCanvasSubtle`, needs 3:1). Dropping both to
  // Neutral700 would clear the floors but collapse muted == placeholder ==
  // subtle into one colour, so a placeholder would read as filled-in copy.
  // The inserted steps keep the three-tier ordering the roles depend on:
  // muted 0.505 < placeholder 0.532 (4.61:1) < subtle 0.61 (3.08:1).
  // Sparkler sanctions this — its Do/Don't table prefers inserting a step
  // between two existing ones over renaming the scale.
  colorTextMuted: "oklch(0.505 0.007 89)",
  colorTextSubtle: "oklch(0.62 0.007 89)",
  colorTextPlaceholder: "oklch(0.505 0.007 89)",
  colorTextInverted: "oklch(0.97 0.007 89)",
  colorBorder: "oklch(0.89 0.007 89)",
  colorBorderSubtle: "oklch(0.275 0.007 89 / 0.06)",
  // Edge where *media* (a photo, a thumbnail) meets a surface. Transparent in
  // light and dark on purpose: §1.3 bans rings on small inline objects, and in
  // dark a pale image already has an edge against the surface. The high
  // contrast theme is the exception — it flattens its surface ramp
  // (`colorSurface` == `colorSurfaceRaised` == pure white) and leans on ink
  // borders, so a pale photo there rests on nothing. Theme-scoped, exactly as
  // §1.3 requires; do NOT give this a value in light or dark.
  colorMediaEdge: "transparent",
  // Three distinct border roles — they used to share one value, so a focused
  // input looked identical to a hovered one and "strong border" read as
  // `colorTextSubtle`. `colorBorderStrong` is the visible resting outline
  // (unchecked checkbox/radio, switch off-track, hover borders);
  // `colorBorderFocus` is emphasis-only and must clear 3:1 against both the
  // surface and the subtle wash (WCAG 1.4.11 / 2.4.11 focus indicator) — the
  // old 0.708 gray sat at ~2.8:1 on white and failed that floor.
  //
  // `colorBorderStrong` is held to the same 3:1 floor for the same reason: it
  // draws the boundary that identifies an unchecked control. Sparkler's own
  // border-2 (Neutral400) measures 1.29–1.58:1 across the surface set and cannot
  // take this role, so strong shares the inserted 0.61 half-step with
  // `colorTextSubtle`. That sharing is a consequence of the floor, not a
  // regression of the split above — do NOT lighten either one back to
  // "separate" them. They never paint the same kind of mark (a 1px outline vs.
  // glyph-height text), and the ordering that matters still holds with room to
  // spare: strong 0.61 < focus 0 (Sparkler border-primary, black).
  colorBorderStrong: "oklch(0.505 0.007 89)",
  colorBorderFocus: "oklch(0.505 0.007 89)",
  // Inset bottom hairline for recessed keycaps/chips (Kbd). Theme-aware:
  // ink-on-light, light-on-dark — a fixed dark value vanishes in dark mode.
  colorInsetEdge: "oklch(0.275 0.007 89 / 0.06)",
  // Scroll chrome stays quiet at rest and strengthens only on interaction.
  // Sparkler overlay-black steps (6/24/48%) over the surface, so the chrome
  // reads as a shade of whatever it sits on and the surface hierarchy shows
  // through.
  colorScrollbarTrack: "oklch(0.275 0.007 89 / 0.06)",
  colorScrollbarThumb: "oklch(0.275 0.007 89 / 0.24)",
  colorScrollbarThumbHover: "oklch(0.275 0.007 89 / 0.48)",
  colorAccent: "oklch(0.275 0.007 89)",
  // Neutral870. It shipped identical to `colorAccent`, so in light every
  // accent-filled control had a hover that changed nothing. Sized in OKLCH
  // lightness, not relative luminance: see design-direction.md §1.5.
  colorAccentHover: "oklch(0.3095 0.007 89)",
  colorSelectionFill: "oklch(0.93 0.007 89)", // Selection-only fill; §1.7 has the split, the HC fix, and the measured light cap. Do NOT darken light to match dark.
  colorAccentSoft: "oklch(0.97 0.007 89)",
  colorAccentText: "oklch(0.97 0.007 89)",
  /** @deprecated Alias of `colorWarning` (identical in every theme). Use `colorWarning`; removal reserved for the next major. */
  /** @deprecated Alias of `colorWarningSoft` (identical in every theme). Use `colorWarningSoft`; removal reserved for the next major. */
  /** @deprecated Alias of `colorWarningText` (identical in every theme). Use `colorWarningText`; removal reserved for the next major. */
  colorInfo: "oklch(0.546 0.245 262)",
  colorInfoSoft: "oklch(0.943 0.027 292)",
  colorInfoText: "oklch(0.424 0.194 262)",
  colorInfoBorder: "oklch(0.546 0.245 262)",
  colorWarning: "oklch(0.693 0.139 86)",
  colorWarningSoft: "oklch(0.965 0.035 86)",
  colorWarningText: "oklch(0.489 0.096 86)",
  colorWarningBorder: "oklch(0.693 0.139 86)",
  /** @deprecated Alias of `colorInfoSoft` (identical in every theme). Use `colorInfoSoft`; removal reserved for the next major. */
  /** @deprecated Alias of `colorInfoBorder` (identical in every theme; also equals `colorInfo` in light/high-contrast). Use `colorInfoBorder` for outlines or `colorInfo` for fills; removal reserved for the next major. */
  /** @deprecated Off-scale one-off with no consumers. Use `colorSuccessSoft` (nearest semantic soft green); removal reserved for the next major. */
  colorSuccess: "oklch(0.701 0.132 164)",
  colorSuccessSoft: "oklch(0.962 0.038 164)",
  colorSuccessText: "oklch(0.465 0.085 164)",
  colorSuccessBorder: "oklch(0.613 0.131 164)",
  colorDanger: "oklch(0.577 0.229 30)",
  // Pressed/hover shade for solid danger fills. Mirrors the
  // `colorAccent` → `colorAccentHover` pair so a destructive button reacts
  // like every other solid button instead of sitting inert under the cursor.
  colorDangerHover: "oklch(0.505 0.200 30)",
  colorDangerSoft: "oklch(0.936 0.029 30)",
  colorDangerText: "oklch(0.444 0.175 30)",
  colorDangerBorder: "oklch(0.577 0.229 30)",
  // Workflow data ink draws from Sparkler's chromatic ramps. Most roles take
  // the -600 step; in-review takes -700 because Sparkler's yellow is light by
  // design (Yellow600 measures 2.25:1 on `colorCanvasSubtle`, below the 3:1
  // non-text mark floor) and -700 clears it at 3.82:1.
  colorWorkflowInProgress: "oklch(0.623 0.200 262)",
  colorWorkflowInReview: "oklch(0.56 0.112 86)",
  colorWorkflowDone: "oklch(0.527 0.098 164)",
  colorWorkflowOverdue: "oklch(0.577 0.229 30)",
  // Priority is ordinal, not nominal: hue and chroma escalate from low blue
  // through amber/orange to the red risk endpoint. Medium and high step to
  // Sparkler -700 (Yellow700, Orange700) because the -600 steps measure
  // 2.25:1 and 2.88:1 against `colorCanvasSubtle`, under the 3:1 mark floor.
  // Bar count and labels remain the primary distinction because adjacent warm
  // hues converge for some CVD profiles.
  colorPriorityLow: "oklch(0.623 0.200 262)",
  colorPriorityMedium: "oklch(0.613 0.131 164)",
  colorPriorityHigh: "oklch(0.825 0.166 86)",
  colorPriorityUrgent: "oklch(0.637 0.237 30)",
  colorPriorityNone: "oklch(0.735 0.007 89)",
  colorCsat1: "oklch(0.637 0.237 30)",
  colorCsat2: "oklch(0.705 0.193 43)",
  colorCsat3: "oklch(0.825 0.166 86)",
  colorCsat4: "oklch(0.613 0.131 164)",
  colorCsat5: "oklch(0.623 0.200 262)",
  colorOverlay: "oklch(0.275 0.007 89 / 0.24)",

  // Interaction washes for quiet surfaces. Sparkler states a hover/pressed as an
  // OVERLAY, not a surface swap: "hover 6%, pressed 12%" on a transparent or
  // bordered control, doubling to 12/24 on a filled one (a filled variant reaches
  // for its own `*Hover` token instead). Translucent on purpose — the wash reads
  // against whatever surface it sits on, so a row inside a card and the same row
  // on the canvas each keep their own ground. Dark lightens rather than darkens,
  // which is the same rule read from the other side; high contrast doubles both
  // steps because its surface ramp is flat and has no depth to borrow from.
  colorOverlayHover: "oklch(0.275 0.007 89 / 0.06)",
  colorOverlayPressed: "oklch(0.275 0.007 89 / 0.12)",

  // The OPAQUE operand the two washes above are made from. A translucent wash can
  // be painted straight onto a transparent resting fill, but an opaque one — a
  // white input, a bordered trigger — would lose its own surface and let the page
  // show through. Sparkler's answer is the same operand used the other way:
  // `color-mix(in srgb, <resting fill>, <operand> N%)`, at the same 6/12 weights.
  // sRGB, not oklab: Sparkler's Gotchas note that an oklab mix leaves 12% over a
  // near-black fill practically invisible.
  colorMixInk: "oklch(0.275 0.007 89)",

  // The operand for the OTHER side. `colorMixInk` darkens, which is right
  // for a light fill; a dark fill has to be lifted instead, or the step lands
  // back on the resting colour and the press reads as nothing happening. That is
  // exactly what a black primary button did: its hover and its pressed state
  // resolved to the same value. Sparkler states the rule as "the opposite side
  // from the text" — pick by the fill, not by the theme.
  colorMixLift: "oklch(0.985 0.007 89)",

  // Nominal chart series (categorical, fixed slot order — never cycled).
  // Seven hues then the same seven one ramp family lighter: blue, orange,
  // yellow, green, violet, red, purple. Slots 1-7 are the -500 steps and carry a
  // series alone; 8-14 are the -300 pair — the area under a line whose stroke is
  // its 500, the second half of a stacked bar — which is why they sit in
  // `REPORTED_ONLY` rather than under the 3:1 ink floor.
  //
  // The ORDER is the safety property. Slots are consumed in sequence, so N and
  // N+1 land next to each other in every stack and line set, and the first three
  // are compared ALL-PAIRS because that is what a pie does. Six of the 21 hue
  // pairs fall under ΔE 10 somewhere (blue/purple worst at 1.3), so yellow sits
  // third rather than fifth: the naive rotation puts green there, colliding with
  // orange under protan (7.9) and blue under tritan (5.3). Moving yellow forward
  // is the smallest change that clears every adjacent pair and the opening triad.
  chart1: "oklch(0.623 0.200 262)",
  chart2: "oklch(0.705 0.193 43)",
  chart3: "oklch(0.613 0.131 164)",
  chart4: "oklch(0.627 0.265 313)",
  chart5: "oklch(0.825 0.166 86)",
  chart6: "oklch(0.637 0.237 30)",
  chart7: "oklch(0.606 0.232 292)",
  chart8: "oklch(0.809 0.093 262)",
  chart9: "oklch(0.837 0.092 43)",
  chart10: "oklch(0.792 0.109 164)",
  chart11: "oklch(0.827 0.119 313)",
  chart12: "oklch(0.895 0.095 86)",
  chart13: "oklch(0.808 0.106 30)",
  chart14: "oklch(0.811 0.101 292)",

  // DEPRECATED: use elevationRaised/elevationOverlay — kept as aliases for compat.
  /** @deprecated Alias of `elevationRaised`. Use `elevationRaised`; removal reserved for the next major. */
  /** @deprecated No elevation-scale equivalent (inset hairline edge, static across themes). Inline the value if needed; removal reserved for the next major. */
  /** @deprecated Alias of `elevationOverlay`. Use `elevationOverlay`; removal reserved for the next major. */

  // Layering scheme (low → high). In-surface layers first: sticky chrome
  // (table headers, pinned code-block actions) must stay below in-surface
  // docked panels (PeekPanel/side peeks), which slide OVER that chrome. Above
  // those sits the host shell chrome (Atelier's application rail) — a sub-app's
  // in-surface layers must never paint over the global nav. Above the shell
  // sit the modal layers (overlay backdrop + modal surface), and ABOVE the
  // modal surface sit the transient floating popups (menus, selects, popovers,
  // datepickers, tooltips) — because those are routinely opened from *inside*
  // a dialog/drawer and must win, otherwise a Select opened in a Dialog paints
  // behind it. Toasts sit highest so global feedback is never occluded.
  //
  // The `appChrome` boundary splits the scale into two bands: everything BELOW
  // it is sub-app content that the rail must cover as it expands; everything
  // ABOVE it is a deliberately global surface (modals, popups, toasts) that may
  // cover the rail. When adding a layer, decide which band it belongs to first.
  //
  // Raw `zIndex: 1` on positioned chrome is banned — it silently beats a
  // z-auto panel (that bug shipped: a sticky DataTable header painted over an
  // open PeekPanel). `scripts/check-layers.mjs` enforces this in `bun run
  // check`; component-local sibling ordering must be opted out explicitly with
  // a `layer-ok:` comment.
  zIndexSticky: 1,
  zIndexPanel: 10,
  zIndexAppChrome: 30,
  zIndexOverlay: 40,
  zIndexModal: 50,
  zIndexDropdown: 60,
  zIndexToast: 70,

  // Spacing ramp (§8). `spaceN` IS N pixels — renamed from the old multiplier
  // naming in 2026-08 so a 2px step could exist at all (it would have been
  // `space0.5`). Values come from the primitive scale in `scale.stylex.ts`;
  // what makes these the SEMANTIC layer is that the theme moves them, which it
  // never does to a primitive. 4/8/12/16 are the padding vocabulary; 20+ are
  // layout sizes, gutters, and grid tracks. Write a literal `0`, not `space0`.
  // `compactDensityTheme` shifts 12 and up down one step and leaves 0/2/4/8
  // alone, so under compact `space12` === `space8`. The ramp bottom cannot
  // shift, which is why this is the THEME's density axis alone (§8).
  space0: "0",
  space2: "0.125rem",
  space4: "0.25rem",
  space8: "0.5rem",
  space12: "0.75rem",
  space16: "1rem",
  space20: "1.25rem",
  space24: "1.5rem",
  space32: "2rem",
  space40: "2.5rem",
  space48: "3rem",
  space64: "4rem",

  // Hairline border width (single source; raw `1` was un-themeable).
  borderWidthHairline: "1px",

  // Radius roles, not a size scale (§7): pick by what the element IS, and the
  // value comes from the primitive scale in `scale.stylex.ts` — which is what
  // catches a number belonging to no scale, the way the deleted 14px
  // `radiusLg` did. The ladder runs container-outward (mark in control in panel
  // in frame in shell) because "container corner >= content corner" is the
  // rule, and the top three rungs all shared 12px until 2026-08. Never compute
  // a nested corner: step a rung, or clip with `overflow: hidden`. Theme- and
  // density-invariant. `radiusDisplay` has no occupant yet, declared anyway.
  radiusMark: "0.25rem",
  radiusControl: "0.5rem",
  radiusPanel: "0.75rem",
  radiusFrame: "1rem",
  radiusShell: "1.5rem",
  radiusDisplay: "2rem",
  // There is deliberately NO `radiusLg`. A 14px "immersive frame" corner was
  // added for FullScreenModal and Lightbox, then never used, because both of
  // those surfaces are `position: fixed; inset: 0` and opaque — measured, they
  // carry `elevationFlat` with an in-file note that "there is no edge for a shadow
  // to fall on". A corner on a viewport-filling surface would notch the page
  // behind out of all four screen corners, which reads as a paint bug, not a
  // refinement. ADS has no surface that is both immersive AND inset from the
  // viewport, so the role had no possible occupant. Do not re-add it (§7).
  radiusFull: "9999px",

  // Non-focus emphasis rings. Five components hand-rolled `0 0 0 2|3px`
  // literals; these name the two widths so a status halo and a selection halo
  // cannot drift apart. NOT the keyboard focus ring — that stays
  // `focusRingWidth` via `recipes/focus-ring.ts`.
  ringWidthSm: "2px",
  ringWidthMd: "3px",
  /** Inset leading accent rail on a selected row (Inbox, DataTable, Table). */
  railWidth: "3px",

  // Control-height scale (4px grid; common headless-UI heights). Same across themes.
  controlHeightXs: "28px",
  controlHeightSm: "32px",
  controlHeightMd: "36px",
  controlHeightLg: "40px",
  controlHeightXl: "44px",
  // Semantic density defaults (single knob for platform-wide density):
  // `controlHeight` is THE default height for interactive controls (buttons,
  // inputs, select/menu triggers — the 36px baseline); `menuItemHeight` is the
  // default row height for menu/listbox/command items.
  controlHeight: "36px",
  menuItemHeight: "32px",
  iconButtonSize: "32px",
  // Control glyph scale (§9). The CONTROL owns the glyph box: a component sets
  // `--ads-control-icon-size` from these and marks itself `data-ads-control` /
  // `data-ads-control-icon-slot`; `styles.css` normalizes the direct SVG child.
  // Never pass a Lucide `size` prop inside a marked control. Stroke weight is
  // Lucide's default 2 and is not set by hand (sole exception: a check mark at
  // <=14px uses 3). Marks that track text rather than controls — StatusDot's
  // 6/8/12 — are off this scale on purpose.
  controlIconSizeSm: "14px",
  controlIconSizeMd: "16px",
  controlIconSizeLg: "18px",
  treeRowHeightCompact: "24px",
  treeRowHeightRegular: "32px",
  rowHeightRegular: "52px",

  // Application chrome row (§D): the one horizontal chrome bar height, used by
  // the ADS `Topbar` and an app's own header strip. Those two and the platform
  // GNB each hard-coded their own — 48, 52 and 56 — before this token; the GNB
  // has since become a vertical rail and left the set. Density does NOT scale
  // this: chrome is chrome, and a compact table must not move an app's own bar.
  chromeRowHeight: "48px",

  // Disabled state + focus ring (single source; was duplicated/divergent per component).
  opacityDisabled: 0.5,
  focusRingWidth: "2px",
  focusRingOffset: "2px",

  // Elevation scale — the shadow half of the layering scheme. The full step
  // ladder (which component belongs to which step, and the z-index band each
  // maps to) is in `docs/design-system/design-direction.md`; keep them in sync.
  //
  // §1.5 governs *zone* separation — the ground, a chrome panel and the
  // content plane. That is a lightness step plus a hairline, never a shadow:
  // see `colorCanvas` / `colorSurfacePanel` / `colorSurfaceRaised` above.
  // Elevation is only for surfaces that genuinely leave the page plane.
  //
  // These values are THEME-AWARE. A 5-12% black shadow is invisible on a dark
  // canvas, so dark/high-contrast override every step below; a dark popup that
  // relied on shadow alone had no depth cue at all.
  elevationFlat: "none",
  elevationRaised: "0 1px 2px 0 oklch(0.1375 0.007 89 / 0.05)",
  elevationLift:
    "0 2px 4px -1px oklch(0.1375 0.007 89 / 0.08), 0 1px 2px -1px oklch(0.1375 0.007 89 / 0.06)",
  // `elevationOverlay`/`elevationModal` each carry a third, wide/very-low-alpha ambient
  // layer (24-48px / 40-72px blur) on top of the contact+mid pair above — the
  // popup/modal bands only (§1.5). That ambient layer is what reads as
  // "floating in air" instead of "card with a drop shadow"; `elevationFlat-2`
  // keep their original two-layer geometry untouched.
  elevationOverlay:
    "0 10px 15px -3px oklch(0.1375 0.007 89 / 0.1), 0 4px 6px -4px oklch(0.1375 0.007 89 / 0.1), 0 24px 48px -12px oklch(0.1375 0.007 89 / 0.05)",
  elevationModal:
    "0 20px 25px -5px oklch(0.1375 0.007 89 / 0.12), 0 8px 10px -6px oklch(0.1375 0.007 89 / 0.1), 0 40px 72px -24px oklch(0.1375 0.007 89 / 0.12)",

  fontSizeMicro: "0.6875rem",
  fontSizeCaption: "0.75rem",
  fontSizeBody: "0.875rem",
  // 16px, and there is deliberately no 15px or 17px any more: the scale is
  // 11/12/14/16/20/24/36 and every step is a whole even pixel at the 16px root,
  // so a size never lands on a half-pixel line box. `fontSizeLead` absorbed the
  // retired `fontSizeLg` — 15px and 17px both round to 16px, so keeping two
  // names for one value would have been a duplicate, and `md` is the step
  // directly above `sm` (14px).
  fontSizeLead: "1rem",
  // Heading steps continue the 14px interface scale. 16/20/24 keeps page
  // hierarchy visible on dense product screens; 36px is display-only and pairs
  // with `lineHeightDisplay` (48px), the one place the scale is allowed to read
  // like a title rather than a control label.
  fontSizeHeading: "1.25rem",
  fontSizeTitle: "1.5rem",
  fontSizeDisplay: "2.25rem",

  // Tracking is role-based: body/control copy stays neutral, headings tighten
  // progressively, and positive tracking is reserved for compact labels.

  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightSemibold: 600,

  lineHeightTight: "1.35",
  // 20px at the 14px body baseline: compact enough for internal tools and
  // aligned to the same 4px vertical grid as controls and headings.
  lineHeightNormal: "1.428571",
  lineHeightRelaxed: "1.625",
  // Heading line boxes snap to the 4px layout grid. Prefer these over a
  // generic ratio when the text size is one of the heading steps above.
  lineHeightLead: "24px",
  lineHeightHeading: "28px",
  lineHeightTitle: "32px",
  lineHeightDisplay: "48px",
  // Single-line control rows (menu items, listbox/select options): a fixed
  // integer line box so 14px option text centers on whole pixels inside the
  // 32px row (1.35 → 18.9px lands on half-pixels and reads subtly off), while
  // staying tall enough to never clip descenders under `overflow: hidden`.
  lineHeightControl: "20px",

  // Motion's primitive layer is `--atelier-motion-*` in styles.css, not a StyleX
  // module: the motion stylesheets read it 75 times and plain CSS cannot name a
  // hashed StyleX var. `check:tokens` proves each `var()` below resolves — an
  // unresolved one is an animation that silently never runs. Reasons in §5.
  motionDurationMicro: "var(--atelier-motion-duration-micro)",
  motionDurationFast: "var(--atelier-motion-duration-fast)",
  motionDurationQuick: "var(--atelier-motion-duration-quick)",
  motionDurationNormal: "var(--atelier-motion-duration-normal)",
  motionDurationEmphasis: "var(--atelier-motion-duration-emphasis)",
  motionDurationPanel: "var(--atelier-motion-duration-panel)",
  // Looping/indeterminate cadences. Transitions answer "how fast does this
  // settle"; loops answer "how fast does this breathe", so they are a separate
  // family — 19 sites used to hard-code values between 0.9s and 2.9s.
  motionDurationLoopFast: "var(--atelier-motion-duration-loop-fast)",
  motionDurationLoop: "var(--atelier-motion-duration-loop)",
  motionDurationLoopSlow: "var(--atelier-motion-duration-loop-slow)",
  motionEaseStandard: "var(--atelier-motion-ease-standard)",
  motionEaseExpressive: "var(--atelier-motion-ease-expressive)",
  motionEaseInOut: "var(--atelier-motion-ease-in-out)",
  // Overshoot curve for "bouncy" reveals (accordion/collapsible panels). It
  // existed as a raw CSS custom property that StyleX styles could not reach.

  // Tokenized enter/exit primitives for the CSS motion layer (transitions.dev
  // principles: distance · blur · scale). JS spring presets for the Motion
  // layer live below as plain exports (see `springs`). Same across themes.
  motionDistanceSmall: "var(--atelier-motion-distance-small)",

  // Static `backdrop-filter` value for a modal scrim (Dialog, AlertDialog,
  // Drawer, MorphingModal, Command, AppShell's mobile sidebar scrim). Not
  // theme-varying — the blur amount is the same regardless of theme, only
  // `colorOverlay`'s ink/alpha changes per theme — so it lives here with the
  // other static geometry rather than in a per-theme block. Pairs with the
  // lightened `colorOverlay` (§3): the blur does the suppressing, not the ink.
  motionBlurOverlay: "blur(6px)",
});

/**
 * Breakpoint constants for `@media` conditions in `stylex.create`.
 *
 * CSS custom properties cannot appear inside media queries, so these cannot be
 * `defineVars` tokens. They must be `defineConsts`, NOT a plain object: StyleX
 * only inlines a computed condition key it can resolve at compile time, and
 * `defineConsts` is the one API that makes an imported value resolvable.
 *
 * This was a plain `as const` object for its whole life, which is exactly why it
 * accumulated zero call sites: `[breakpoints.md]: …` against a plain object does
 * not fail at the call site, it compiles the key to an empty condition and blows
 * up in CSS generation with `SyntaxError: Invalid empty selector` from
 * lightningcss, naming no file. Anyone who tried it reverted. With
 * `defineConsts` the emitted CSS is byte-identical to the literal (verified).
 *
 * Use these when the surface is sized against the VIEWPORT; a component's own
 * reflow belongs in `@container` (§10), so most remaining ADS width literals are
 * correct as literals. `scripts/check-tokens.mjs` records which, and why.
 *
 * ONE SHAPE ONLY in StyleX 0.19 — a VALUE-level condition key, never a
 * RULE-level at-rule block:
 *
 *     inlineSize: { default: "220px", [breakpoints.md]: "100%" }   // works
 *     [breakpoints.md]: { inlineSize: "100%" }                     // FAILS
 *
 * The second form dies at build time with `Invalid pseudo or at-rule` — the
 * second reason this went unused, since several ADS width queries are written
 * that way. Restructure to the value-level shape, or keep the literal.
 */
export const breakpoints = stylex.defineConsts({
  /** Phones / narrow panels. */
  sm: "@media (max-width: 560px)",
  /** Tablets / collapsed sidebars. */
  md: "@media (max-width: 768px)",
  /** Small desktops / docs top-nav collapse. */
  lg: "@media (max-width: 960px)",
});

// The JS motion layer's presets are plain objects, not StyleX vars, so they
// live in `motion-presets.ts` — re-exported here because every consumer
// imports the CSS motion tokens and their JS twins from one module.
export {
  motionExitRatio,
  motionPrimitives,
  springBouncy,
  springSmooth,
  springSnappy,
  springs,
  type SpringPreset,
} from "./motion-presets";
