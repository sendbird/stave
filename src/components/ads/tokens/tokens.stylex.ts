import * as stylex from "@stylexjs/stylex";

export const vars = stylex.defineVars({
  // Geist Variable for the interface, Pretendard for Hangul, JetBrains Mono
  // for code. All three are loaded by `styles.css`, which also repeats the
  // sans stack verbatim on `:root`. That copy was once forced — StyleX hashed
  // a `defineVars` key to something like `--xwymy5f`, which plain CSS cannot
  // name. Token names are explicit now, so `:root` could read
  // `var(--ads-font-sans)` directly and the copy could go. It has not, and
  // `check:tokens` still compares the two so it cannot drift; retiring it is
  // its own change with its own report. Same story for the `--ads-selection-*`
  // pair `ThemeProvider` publishes for `::selection`.
  "--ads-font-sans":
    '"Geist Variable", "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  // Pretendard ships no monospace. JetBrains Mono is variable (wght 100-800,
  // covering the 400/500/600 the weight roles use), and its ligatures — which
  // would swallow the space in " --" — are already switched off wherever code
  // renders (`CodeBlock`, `fontVariantLigatures: "none"`).
  "--ads-font-mono":
    '"JetBrains Mono Variable", "JetBrains Mono", "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace',

  // Warm neutral scale — Sparkler Neutral (oklch hue 89, chroma 0.007), adopted
  // from the Sendbird dashboard design system so Atelier and the dashboard
  // share one neutral. Pure-gray neutrals read cold/AI-generated; the
  // low-chroma warm cast is the house look. Surfaces are Sparkler bg-1/2/3
  // plus its near-white Neutral50. Defaults == lightTheme so an unthemed tree
  // renders correctly.
  "--ads-color-canvas": "oklch(0.985 0.007 89)",
  "--ads-color-canvas-subtle": "oklch(0.97 0.007 89)",
  // The ground behind the application frame. Its own role because the frame,
  // the sidebar and the ground all shared `colorCanvas`, so a panel could not
  // recede from what it sits on. Depth reads as darkness: ground furthest
  // back and darkest, content nearest and lightest. It is not a general
  // reading surface: only `colorText` and `colorTextMuted` may land on it,
  // enforced as their own rules in `color-policy.mjs` (subtle is 2.96:1 here).
  "--ads-color-ground": "oklch(0.93 0.007 89)",
  "--ads-color-surface": "oklch(1 0 0)",
  "--ads-color-surface-raised": "oklch(1 0 0)",
  "--ads-color-surface-tint": "oklch(0.97 0.007 89)",
  "--ads-color-text": "oklch(0 0 0)",
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
  "--ads-color-text-muted": "oklch(0.505 0.007 89)",
  "--ads-color-text-subtle": "oklch(0.62 0.007 89)",
  "--ads-color-text-placeholder": "oklch(0.505 0.007 89)",
  "--ads-color-text-inverted": "oklch(0.97 0.007 89)",
  "--ads-color-border": "oklch(0.89 0.007 89)",
  "--ads-color-border-subtle": "oklch(0.275 0.007 89 / 0.06)",
  // Edge where *media* (a photo, a thumbnail) meets a surface. Transparent in
  // light and dark on purpose: §1.3 bans rings on small inline objects, and in
  // dark a pale image already has an edge against the surface. The high
  // contrast theme is the exception — it flattens its surface ramp
  // (`colorSurface` == `colorSurfaceRaised` == pure white) and leans on ink
  // borders, so a pale photo there rests on nothing. Theme-scoped, exactly as
  // §1.3 requires; do NOT give this a value in light or dark.
  "--ads-color-media-edge": "transparent",
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
  "--ads-color-border-strong": "oklch(0.505 0.007 89)",
  "--ads-color-border-focus": "oklch(0.505 0.007 89)",
  // Inset bottom hairline for recessed keycaps/chips (Kbd). Theme-aware:
  // ink-on-light, light-on-dark — a fixed dark value vanishes in dark mode.
  "--ads-color-inset-edge": "oklch(0.275 0.007 89 / 0.06)",
  // Scroll chrome stays quiet at rest and strengthens only on interaction.
  // Sparkler overlay-black steps (6/24/48%) over the surface, so the chrome
  // reads as a shade of whatever it sits on and the surface hierarchy shows
  // through.
  "--ads-color-scrollbar-track": "oklch(0.275 0.007 89 / 0.06)",
  "--ads-color-scrollbar-thumb": "oklch(0.275 0.007 89 / 0.24)",
  "--ads-color-scrollbar-thumb-hover": "oklch(0.275 0.007 89 / 0.48)",
  "--ads-color-accent": "oklch(0.275 0.007 89)",
  // Neutral870. It shipped identical to `colorAccent`, so in light every
  // accent-filled control had a hover that changed nothing. Sized in OKLCH
  // lightness, not relative luminance: see design-direction.md §1.5.
  "--ads-color-accent-hover": "oklch(0.3095 0.007 89)",
  "--ads-color-selection-fill": "oklch(0.93 0.007 89)", // Selection-only fill; §1.7 has the split, the HC fix, and the measured light cap. Do NOT darken light to match dark.
  "--ads-color-accent-soft": "oklch(0.97 0.007 89)",
  "--ads-color-accent-text": "oklch(0.97 0.007 89)",
  /** @deprecated Alias of `colorWarning` (identical in every theme). Use `colorWarning`; removal reserved for the next major. */
  /** @deprecated Alias of `colorWarningSoft` (identical in every theme). Use `colorWarningSoft`; removal reserved for the next major. */
  /** @deprecated Alias of `colorWarningText` (identical in every theme). Use `colorWarningText`; removal reserved for the next major. */
  "--ads-color-info": "oklch(0.546 0.245 262)",
  "--ads-color-info-soft": "oklch(0.943 0.027 292)",
  "--ads-color-info-text": "oklch(0.424 0.194 262)",
  "--ads-color-info-border": "oklch(0.546 0.245 262)",
  "--ads-color-warning": "oklch(0.555 0.14 50)",
  "--ads-color-warning-soft": "oklch(0.965 0.043 90)",
  "--ads-color-warning-text": "oklch(0.49 0.115 48)",
  "--ads-color-warning-border": "oklch(0.555 0.14 50)",
  /** @deprecated Alias of `colorInfoSoft` (identical in every theme). Use `colorInfoSoft`; removal reserved for the next major. */
  /** @deprecated Alias of `colorInfoBorder` (identical in every theme; also equals `colorInfo` in light/high-contrast). Use `colorInfoBorder` for outlines or `colorInfo` for fills; removal reserved for the next major. */
  /** @deprecated Off-scale one-off with no consumers. Use `colorSuccessSoft` (nearest semantic soft green); removal reserved for the next major. */
  "--ads-color-success": "oklch(0.53 0.138 152)",
  "--ads-color-success-soft": "oklch(0.962 0.045 152)",
  "--ads-color-success-text": "oklch(0.47 0.121 152)",
  "--ads-color-success-border": "oklch(0.53 0.138 152)",
  "--ads-color-danger": "oklch(0.565 0.229 30)",
  // Pressed/hover shade for solid danger fills. Mirrors the
  // `colorAccent` → `colorAccentHover` pair so a destructive button reacts
  // like every other solid button instead of sitting inert under the cursor.
  "--ads-color-danger-hover": "oklch(0.505 0.200 30)",
  "--ads-color-danger-soft": "oklch(0.936 0.029 30)",
  "--ads-color-danger-text": "oklch(0.444 0.175 30)",
  "--ads-color-danger-border": "oklch(0.565 0.229 30)",
  // Diff / VCS identity. Orthogonal to success/danger: a theme may paint
  // "passed" teal and still keep git added green. Defaults match the success
  // and danger soft/text steps so an unthemed host keeps today's diffs; a host
  // that authors a dedicated ramp remaps only this family.
  "--ads-color-diff-added": "oklch(0.962 0.045 152)",
  "--ads-color-diff-added-text": "oklch(0.47 0.121 152)",
  "--ads-color-diff-removed": "oklch(0.936 0.029 30)",
  "--ads-color-diff-removed-text": "oklch(0.444 0.175 30)",
  // Workflow data ink draws from the chromatic ramps. Most roles take the -600
  // step; in-review takes -700 because the amber ramp is light by design
  // (Yellow600 measures 2.76:1 on `colorCanvasSubtle`, below the 3:1 non-text
  // mark floor) and -700 clears it at 4.31:1.
  "--ads-color-workflow-in-progress": "oklch(0.623 0.200 262)",
  "--ads-color-workflow-in-review": "oklch(0.555 0.14 50)",
  "--ads-color-workflow-done": "oklch(0.53 0.138 152)",
  "--ads-color-workflow-overdue": "oklch(0.565 0.229 30)",
  // Priority is ordinal, not nominal: hue and chroma escalate from low blue
  // through amber/orange to the red risk endpoint. Medium and high step to
  // Sparkler -700 (Yellow700, Orange700) because the -600 steps measure
  // 2.25:1 and 2.88:1 against `colorCanvasSubtle`, under the 3:1 mark floor.
  // Bar count and labels remain the primary distinction because adjacent warm
  // hues converge for some CVD profiles.
  "--ads-color-priority-low": "oklch(0.623 0.200 262)",
  "--ads-color-priority-medium": "oklch(0.62 0.16 152)",
  "--ads-color-priority-high": "oklch(0.78 0.166 70)",
  "--ads-color-priority-urgent": "oklch(0.637 0.237 30)",
  "--ads-color-priority-none": "oklch(0.735 0.007 89)",
  "--ads-color-csat-1": "oklch(0.637 0.237 30)",
  "--ads-color-csat-2": "oklch(0.705 0.193 43)",
  "--ads-color-csat-3": "oklch(0.78 0.166 70)",
  "--ads-color-csat-4": "oklch(0.62 0.16 152)",
  "--ads-color-csat-5": "oklch(0.623 0.200 262)",
  "--ads-color-overlay": "oklch(0.275 0.007 89 / 0.24)",

  // Interaction washes for quiet surfaces. Sparkler states a hover/pressed as an
  // OVERLAY, not a surface swap: "hover 6%, pressed 12%" on a transparent or
  // bordered control, doubling to 12/24 on a filled one (a filled variant reaches
  // for its own `*Hover` token instead). Translucent on purpose — the wash reads
  // against whatever surface it sits on, so a row inside a card and the same row
  // on the canvas each keep their own ground. Dark lightens rather than darkens,
  // which is the same rule read from the other side; high contrast doubles both
  // steps because its surface ramp is flat and has no depth to borrow from.
  "--ads-color-overlay-hover": "oklch(0.275 0.007 89 / 0.06)",
  "--ads-color-overlay-pressed": "oklch(0.275 0.007 89 / 0.12)",

  // The OPAQUE operand the two washes above are made from. A translucent wash can
  // be painted straight onto a transparent resting fill, but an opaque one — a
  // white input, a bordered trigger — would lose its own surface and let the page
  // show through. Sparkler's answer is the same operand used the other way:
  // `color-mix(in srgb, <resting fill>, <operand> N%)`, at the same 6/12 weights.
  // sRGB, not oklab: Sparkler's Gotchas note that an oklab mix leaves 12% over a
  // near-black fill practically invisible.
  "--ads-color-mix-ink": "oklch(0.275 0.007 89)",

  // The operand for the OTHER side. `colorMixInk` darkens, which is right
  // for a light fill; a dark fill has to be lifted instead, or the step lands
  // back on the resting colour and the press reads as nothing happening. That is
  // exactly what a black primary button did: its hover and its pressed state
  // resolved to the same value. Sparkler states the rule as "the opposite side
  // from the text" — pick by the fill, not by the theme.
  "--ads-color-mix-lift": "oklch(0.985 0.007 89)",

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
  "--ads-chart-1": "oklch(0.623 0.200 262)",
  "--ads-chart-2": "oklch(0.705 0.193 43)",
  "--ads-chart-3": "oklch(0.62 0.16 152)",
  "--ads-chart-4": "oklch(0.627 0.265 313)",
  "--ads-chart-5": "oklch(0.78 0.166 70)",
  "--ads-chart-6": "oklch(0.637 0.237 30)",
  "--ads-chart-7": "oklch(0.606 0.232 292)",
  "--ads-chart-8": "oklch(0.809 0.093 262)",
  "--ads-chart-9": "oklch(0.837 0.092 43)",
  "--ads-chart-10": "oklch(0.83 0.16 152)",
  "--ads-chart-11": "oklch(0.827 0.119 313)",
  "--ads-chart-12": "oklch(0.89 0.114 84)",
  "--ads-chart-13": "oklch(0.808 0.106 30)",
  "--ads-chart-14": "oklch(0.811 0.101 292)",

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
  "--ads-z-index-sticky": 1,
  "--ads-z-index-panel": 10,
  "--ads-z-index-app-chrome": 30,
  "--ads-z-index-overlay": 40,
  "--ads-z-index-modal": 50,
  "--ads-z-index-dropdown": 60,
  "--ads-z-index-toast": 70,

  // Spacing ramp (§8). `spaceN` IS N pixels — renamed from the old multiplier
  // naming in 2026-08 so a 2px step could exist at all (it would have been
  // `space0.5`). Values come from the primitive scale in `scale.stylex.ts`;
  // what makes these the SEMANTIC layer is that the theme moves them, which it
  // never does to a primitive. 4/8/12/16 are the padding vocabulary; 20+ are
  // layout sizes, gutters, and grid tracks. Write a literal `0`, not `space0`.
  // `compactDensityTheme` shifts 12 and up down one step and leaves 0/2/4/8
  // alone, so under compact `space12` === `space8`. The ramp bottom cannot
  // shift, which is why this is the THEME's density axis alone (§8).
  "--ads-space-0": "0",
  "--ads-space-2": "0.125rem",
  "--ads-space-4": "0.25rem",
  "--ads-space-8": "0.5rem",
  "--ads-space-12": "0.75rem",
  "--ads-space-16": "1rem",
  "--ads-space-20": "1.25rem",
  "--ads-space-24": "1.5rem",
  "--ads-space-32": "2rem",
  "--ads-space-40": "2.5rem",
  "--ads-space-48": "3rem",
  "--ads-space-64": "4rem",

  // Hairline border width (single source; raw `1` was un-themeable).
  "--ads-border-width-hairline": "1px",

  // Radius roles, not a size scale (§7): pick by what the element IS, and the
  // value comes from the primitive scale in `scale.stylex.ts` — which is what
  // catches a number belonging to no scale, the way the deleted 14px
  // `radiusLg` did. The ladder runs container-outward (mark in control in panel
  // in frame in shell) because "container corner >= content corner" is the
  // rule, and the top three rungs all shared 12px until 2026-08. Never compute
  // a nested corner: step a rung, or clip with `overflow: hidden`. Theme- and
  // density-invariant. `radiusDisplay` has no occupant yet, declared anyway.
  "--ads-radius-mark": "0.25rem",
  "--ads-radius-control": "0.5rem",
  "--ads-radius-panel": "0.75rem",
  "--ads-radius-frame": "1rem",
  "--ads-radius-shell": "1.5rem",
  "--ads-radius-display": "2rem",
  // There is deliberately NO `radiusLg`. A 14px "immersive frame" corner was
  // added for FullScreenModal and Lightbox, then never used, because both of
  // those surfaces are `position: fixed; inset: 0` and opaque — measured, they
  // carry `elevationFlat` with an in-file note that "there is no edge for a shadow
  // to fall on". A corner on a viewport-filling surface would notch the page
  // behind out of all four screen corners, which reads as a paint bug, not a
  // refinement. ADS has no surface that is both immersive AND inset from the
  // viewport, so the role had no possible occupant. Do not re-add it (§7).
  "--ads-radius-full": "9999px",

  // Non-focus emphasis rings. Five components hand-rolled `0 0 0 2|3px`
  // literals; these name the two widths so a status halo and a selection halo
  // cannot drift apart. NOT the keyboard focus ring — that stays
  // `focusRingWidth` via `recipes/focus-ring.ts`.
  "--ads-ring-width-sm": "2px",
  "--ads-ring-width-md": "3px",
  /** Inset leading accent rail on a selected row (Inbox, DataTable, Table). */
  "--ads-rail-width": "3px",

  // Control-height scale (4px grid; common headless-UI heights). Same across themes.
  "--ads-control-height-xs": "28px",
  "--ads-control-height-sm": "32px",
  "--ads-control-height-md": "36px",
  "--ads-control-height-lg": "40px",
  "--ads-control-height-xl": "44px",
  // Semantic density defaults (single knob for platform-wide density):
  // `controlHeight` is THE default height for interactive controls (buttons,
  // inputs, select/menu triggers — the 36px baseline); `menuItemHeight` is the
  // default row height for menu/listbox/command items.
  "--ads-control-height": "36px",
  "--ads-menu-item-height": "32px",
  "--ads-icon-button-size": "32px",
  // Control glyph scale (§9). The CONTROL owns the glyph box: a component sets
  // `--ads-control-icon-size` from these and marks itself `data-ads-control` /
  // `data-ads-control-icon-slot`; `styles.css` normalizes the direct SVG child.
  // Never pass a Lucide `size` prop inside a marked control. Stroke weight is
  // Lucide's default 2 and is not set by hand (sole exception: a check mark at
  // <=14px uses 3). Marks that track text rather than controls — StatusDot's
  // 6/8/12 — are off this scale on purpose.
  "--ads-control-icon-size-sm": "14px",
  "--ads-control-icon-size-md": "16px",
  "--ads-control-icon-size-lg": "18px",
  "--ads-tree-row-height-compact": "24px",
  "--ads-tree-row-height-regular": "32px",
  "--ads-row-height-regular": "52px",

  // Application chrome row (§D): the one horizontal chrome bar height, used by
  // the ADS `Topbar` and an app's own header strip. Those two and the platform
  // GNB each hard-coded their own — 48, 52 and 56 — before this token; the GNB
  // has since become a vertical rail and left the set. Density does NOT scale
  // this: chrome is chrome, and a compact table must not move an app's own bar.
  "--ads-chrome-row-height": "48px",

  // Disabled state + focus ring (single source; was duplicated/divergent per component).
  "--ads-opacity-disabled": 0.5,
  "--ads-focus-ring-width": "2px",
  "--ads-focus-ring-offset": "2px",

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
  "--ads-elevation-flat": "none",
  "--ads-elevation-raised": "0 1px 2px 0 oklch(0.1375 0.007 89 / 0.05)",
  "--ads-elevation-lift":
    "0 2px 4px -1px oklch(0.1375 0.007 89 / 0.08), 0 1px 2px -1px oklch(0.1375 0.007 89 / 0.06)",
  // `elevationOverlay`/`elevationModal` each carry a third, wide/very-low-alpha ambient
  // layer (24-48px / 40-72px blur) on top of the contact+mid pair above — the
  // popup/modal bands only (§1.5). That ambient layer is what reads as
  // "floating in air" instead of "card with a drop shadow"; `elevationFlat-2`
  // keep their original two-layer geometry untouched.
  "--ads-elevation-overlay":
    "0 10px 15px -3px oklch(0.1375 0.007 89 / 0.1), 0 4px 6px -4px oklch(0.1375 0.007 89 / 0.1), 0 24px 48px -12px oklch(0.1375 0.007 89 / 0.05)",
  "--ads-elevation-modal":
    "0 20px 25px -5px oklch(0.1375 0.007 89 / 0.12), 0 8px 10px -6px oklch(0.1375 0.007 89 / 0.1), 0 40px 72px -24px oklch(0.1375 0.007 89 / 0.12)",

  "--ads-font-size-micro": "0.6875rem",
  "--ads-font-size-caption": "0.75rem",
  "--ads-font-size-body": "0.875rem",
  // 16px, and there is deliberately no 15px or 17px any more: the scale is
  // 11/12/14/16/20/24/36 and every step is a whole even pixel at the 16px root,
  // so a size never lands on a half-pixel line box. `fontSizeLead` absorbed the
  // retired `fontSizeLg` — 15px and 17px both round to 16px, so keeping two
  // names for one value would have been a duplicate, and `md` is the step
  // directly above `sm` (14px).
  "--ads-font-size-lead": "1rem",
  // Heading steps continue the 14px interface scale. 16/20/24 keeps page
  // hierarchy visible on dense product screens; 36px is display-only and pairs
  // with `lineHeightDisplay` (48px), the one place the scale is allowed to read
  // like a title rather than a control label.
  "--ads-font-size-heading": "1.25rem",
  "--ads-font-size-title": "1.5rem",
  "--ads-font-size-display": "2.25rem",

  // Tracking is role-based: body/control copy stays neutral, headings tighten
  // progressively, and positive tracking is reserved for compact labels.

  "--ads-font-weight-regular": 400,
  "--ads-font-weight-medium": 500,
  "--ads-font-weight-semibold": 600,

  "--ads-line-height-tight": "1.35",
  // 20px at the 14px body baseline: compact enough for internal tools and
  // aligned to the same 4px vertical grid as controls and headings.
  "--ads-line-height-normal": "1.428571",
  "--ads-line-height-relaxed": "1.625",
  // Heading line boxes snap to the 4px layout grid. Prefer these over a
  // generic ratio when the text size is one of the heading steps above.
  "--ads-line-height-lead": "24px",
  "--ads-line-height-heading": "28px",
  "--ads-line-height-title": "32px",
  "--ads-line-height-display": "48px",
  // Single-line control rows (menu items, listbox/select options): a fixed
  // integer line box so 14px option text centers on whole pixels inside the
  // 32px row (1.35 → 18.9px lands on half-pixels and reads subtly off), while
  // staying tall enough to never clip descenders under `overflow: hidden`.
  "--ads-line-height-control": "20px",

  // Motion's primitive layer is `--atelier-motion-*` in styles.css, not a StyleX
  // module: the motion stylesheets read it 75 times, and when this was decided a
  // StyleX var was hashed and unnameable from plain CSS. Explicit token names
  // remove that constraint; the arrangement below is unchanged for now.
  // `check:tokens` proves each `var()` below resolves — an
  // unresolved one is an animation that silently never runs. Reasons in §5.
  "--ads-motion-duration-micro": "var(--atelier-motion-duration-micro)",
  "--ads-motion-duration-fast": "var(--atelier-motion-duration-fast)",
  "--ads-motion-duration-quick": "var(--atelier-motion-duration-quick)",
  "--ads-motion-duration-normal": "var(--atelier-motion-duration-normal)",
  "--ads-motion-duration-emphasis": "var(--atelier-motion-duration-emphasis)",
  "--ads-motion-duration-panel": "var(--atelier-motion-duration-panel)",
  // Looping/indeterminate cadences. Transitions answer "how fast does this
  // settle"; loops answer "how fast does this breathe", so they are a separate
  // family — 19 sites used to hard-code values between 0.9s and 2.9s.
  "--ads-motion-duration-loop-fast": "var(--atelier-motion-duration-loop-fast)",
  "--ads-motion-duration-loop": "var(--atelier-motion-duration-loop)",
  "--ads-motion-duration-loop-slow": "var(--atelier-motion-duration-loop-slow)",
  "--ads-motion-ease-standard": "var(--atelier-motion-ease-standard)",
  "--ads-motion-ease-expressive": "var(--atelier-motion-ease-expressive)",
  "--ads-motion-ease-in-out": "var(--atelier-motion-ease-in-out)",
  // Overshoot curve for "bouncy" reveals (accordion/collapsible panels). It
  // existed as a raw CSS custom property that StyleX styles could not reach.

  // Tokenized enter/exit primitives for the CSS motion layer (transitions.dev
  // principles: distance · blur · scale). JS spring presets for the Motion
  // layer live below as plain exports (see `springs`). Same across themes.
  "--ads-motion-distance-small": "var(--atelier-motion-distance-small)",

  // Static `backdrop-filter` value for a modal scrim (Dialog, AlertDialog,
  // Drawer, MorphingModal, Command, AppShell's mobile sidebar scrim). Not
  // theme-varying — the blur amount is the same regardless of theme, only
  // `colorOverlay`'s ink/alpha changes per theme — so it lives here with the
  // other static geometry rather than in a per-theme block. Pairs with the
  // lightened `colorOverlay` (§3): the blur does the suppressing, not the ink.
  "--ads-motion-blur-overlay": "blur(6px)",
});

// JS/types only. StyleX `[breakpoints.md]` keys must import the defining
// module — a re-export compiles to an empty media condition.
export { breakpoints } from "./breakpoints.stylex";

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
