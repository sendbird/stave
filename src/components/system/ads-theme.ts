import type { CSSProperties } from "react";
import { vars } from "../ads/tokens/tokens.stylex";

/** Saved Stave themes remain the color authority during source migration. */
const roles = {
  colorCanvas: "var(--background)",
  colorCanvasSubtle: "var(--muted)",
  // The ground behind the frame must sit BEHIND `colorCanvasSubtle`, and ADS
  // reads depth as darkness (light: ground 0.93 < canvasSubtle 0.97). Stave's
  // `--sidebar` and `--muted` share a lightness in the default themes, so the
  // raw alias left a panel unable to recede from what it sits on. A 5% ink mix
  // restores the step in both modes (light 0.918 vs muted 0.955; dark 0.184 vs
  // 0.245 — `--foreground` is the light pole there, so the same expression
  // lifts instead of darkens and the ordering survives).
  colorGround: "color-mix(in oklab, var(--foreground) 5%, var(--sidebar))",
  colorSurface: "var(--card)",
  colorSurfaceRaised: "var(--popover)",
  colorSurfaceTint: "var(--muted)",
  colorText: "var(--foreground)",
  // Text ramp. All three used to alias `--muted-foreground`, which collapsed
  // ADS's three tiers into one value, so a placeholder read as filled-in copy
  // and "subtle" carried body-weight contrast. ADS inserts two half-steps
  // between muted and the surface (light 0.505 < 0.532 < 0.62; dark 0.735 >
  // 0.6315 > 0.62) and its floors are muted/placeholder >= 4.5:1, subtle >= 3:1.
  //
  // The operand is `--background`, not a fixed lightness: mixing TOWARDS the
  // page reduces contrast in both modes, so the same two expressions lighten in
  // a light theme and darken in a dark one without a per-theme flag. `in oklab`
  // for the reason documented on `colorAccentHover` below.
  //
  // Measured on the default themes against card/background/muted/sidebar:
  // placeholder 5.15/4.97/4.55/4.55 (light, L 0.534) and 5.65/6.04/5.12/6.25
  // (dark, L 0.654); subtle 3.62/3.49/3.20/3.20 (light, L 0.619) and
  // 3.90/4.17/3.54/4.31 (dark, L 0.563). 5% is the largest step that keeps the
  // placeholder floor on `--muted`; 23% lands subtle on ADS's own 0.62.
  // Themes whose own `--muted-foreground` already misses the muted floor
  // (Dracula 2.51:1, Ayu, Solarized) stay under it here too — that is the
  // theme's authored contrast, not this mapping's.
  colorTextMuted: "var(--muted-foreground)",
  colorTextSubtle:
    "color-mix(in oklab, var(--background) 23%, var(--muted-foreground))",
  colorTextPlaceholder:
    "color-mix(in oklab, var(--background) 5%, var(--muted-foreground))",
  colorTextInverted: "var(--background)",
  colorBorder: "var(--border)",
  colorBorderSubtle: "color-mix(in oklab, var(--border) 60%, transparent)",
  colorBorderStrong: "var(--muted-foreground)",
  colorBorderFocus: "var(--ring)",
  colorAccent: "var(--primary)",
  /*
   * Interaction states are derived, not authored, so all 20+ saved themes get
   * them from their own `--primary` instead of inheriting ADS's.
   *
   * Two rules, both ADS's own (tokens.stylex.ts on `colorMixInk`/`colorMixLift`,
   * design-direction "A state step is sized in OKLCH lightness"):
   *
   * 1. The operand is picked by the FILL, not by the theme — a light fill
   *    darkens, a dark fill lifts. `--primary-foreground` IS that operand for
   *    any theme by construction: it is the pole the accent had to contrast
   *    against to carry a label, so it is on the far side of the accent's own
   *    lightness whichever way round the theme is. That is what makes this one
   *    expression correct for a dark-blue primary in a light theme and a
   *    light-blue primary in a dark theme, with no per-theme flag.
   * 2. `in oklab`, never `in oklch`. OKLCH interpolates HUE, and a near-neutral
   *    operand still carries a nominal one, so the mix dragged the accent's hue
   *    toward it: measured `oklch(0.54 0.18 260)` hovering to
   *    `oklch(0.585 0.1623 277.5)` — the blue button turned violet under the
   *    pointer. OKLAB is rectangular, so the same mix moves lightness and
   *    leaves hue where it was.
   *
   * 8% lands ΔL ~= 0.036-0.044 across the built-in themes, against the
   * documented hover step of ~0.038; 16% doubles it for the pressed step, which
   * is the ~0.077 the same table gives.
   */
  colorAccentHover:
    "color-mix(in oklab, var(--primary-foreground) 8%, var(--primary))",
  // `colorAccentSoft` is the hover wash; `colorSelectionFill` is the persistent
  // selected fill. Both aliased `--accent`, so hovering a row looked exactly
  // like selecting it. ADS keeps soft one step LIGHTER than selection in light
  // (0.97 vs 0.93); mixing the accent back towards the surface reproduces that
  // (light 0.958 vs 0.910) and in dark lands soft between the surface and the
  // selection fill (0.241, between card 0.205 and accent 0.285) rather than
  // collapsing onto it.
  colorAccentSoft: "color-mix(in oklab, var(--accent) 45%, var(--card))",
  colorAccentText: "var(--primary-foreground)",
  colorSelectionFill: "var(--accent)",
  colorDanger: "var(--destructive)",
  // Same two rules. The operand is the ink the destructive fill contrasts
  // against, and the space is oklab so a red does not swing toward orange.
  colorDangerHover:
    "color-mix(in oklab, var(--foreground) 8%, var(--destructive))",
  // Semantic TEXT steps. These four aliased their own fills, and a fill only
  // has to clear the 3:1 mark floor, so `colorDangerText` on `colorDangerSoft`
  // measured 4.36:1 and `colorWarningText` on `colorWarningSoft` just 2.28:1 in
  // light. ADS ships a separate, darker text step for exactly this reason
  // (warning 0.693 -> 0.489, danger 0.577 -> 0.444, info 0.546 -> 0.424).
  //
  // A 45% `--foreground` mix reproduces those steps from the theme's own fill
  // (light L: warning 0.497 vs ADS 0.489, danger 0.409 vs 0.444, info 0.398 vs
  // 0.424) and clears 4.5:1 on the matching soft in both default modes:
  // warning 2.28 -> 5.51 light / 7.79 -> 9.41 dark, danger 4.36 -> 7.89 /
  // 4.97 -> 7.68, info 4.40 -> 7.95 / 5.94 -> 8.34, success 4.56 -> 8.09 /
  // 6.84 -> 8.86. In dark `--foreground` is the light pole, so the same
  // expression lifts the step instead of darkening it — the legible direction
  // there too.
  //
  // `--warning-foreground` and friends were rejected as operands: they are the
  // label colour that sits ON the fill, so they are near-black or near-white by
  // construction. Measured on the same softs they swing from 15.97:1 to 1.09:1
  // depending on the theme, and they discard the semantic hue entirely.
  //
  // Editor-ported themes whose `--foreground` is itself low-contrast against
  // their `--card` (Solarized Light tops out at 3.28:1, Ayu Light at 5.73:1
  // only at a 100% mix) cannot reach 4.5:1 from any mix ratio; that ceiling is
  // the theme's authored ink, not this expression.
  colorDangerText: "color-mix(in oklab, var(--foreground) 45%, var(--destructive))",
  colorDangerBorder: "var(--destructive)",
  colorDangerSoft: "color-mix(in oklab, var(--destructive) 12%, var(--card))",
  colorMixInk: "var(--foreground)",
  colorMixLift: "var(--background)",
  // Interaction washes. ADS states hover/pressed as a TRANSLUCENT overlay at
  // 6%/12%, and its own themes flip the operand (ink on light, light on dark).
  // Deriving the operand from `--foreground` reproduces that flip for every
  // saved Stave theme and, unlike the ADS default, carries the theme's own hue
  // instead of the warm neutral — a blue-grey theme was hovering to warm grey.
  colorOverlayHover: "color-mix(in oklab, var(--foreground) 6%, transparent)",
  colorOverlayPressed: "color-mix(in oklab, var(--foreground) 12%, transparent)",
  // Modal scrim. Stave already owns a semantic scrim.
  colorOverlay: "var(--overlay)",
  // Scroll chrome: the same overlay mechanism at ADS's 6/24/48 weights.
  colorScrollbarTrack: "color-mix(in oklab, var(--foreground) 6%, transparent)",
  colorScrollbarThumb: "color-mix(in oklab, var(--foreground) 24%, transparent)",
  colorScrollbarThumbHover:
    "color-mix(in oklab, var(--foreground) 48%, transparent)",
  // Inset hairline under recessed keycaps/chips; ink-on-light, light-on-dark.
  colorInsetEdge: "color-mix(in oklab, var(--foreground) 6%, transparent)",
  zIndexSticky: "1",
  zIndexPanel: "10",
  zIndexAppChrome: "30",
  zIndexOverlay: "79",
  zIndexModal: "80",
  zIndexDropdown: "90",
  zIndexToast: "120",
  colorSuccess: "var(--success)",
  colorSuccessText: "color-mix(in oklab, var(--foreground) 45%, var(--success))",
  colorSuccessSoft: "color-mix(in oklab, var(--success) 12%, var(--card))",
  colorSuccessBorder: "var(--success)",
  // VCS / diff identity. Stave already authors `--diff-*` per theme (GitHub
  // green/red on github, Solarized yellow-green on solarized). Mapping these
  // through `--success` / `--destructive` was what painted a Dracula added
  // line in the remixed status teal instead of `#50FA7B`.
  colorDiffAdded: "var(--diff-added)",
  colorDiffAddedText: "var(--diff-added-foreground)",
  colorDiffRemoved: "var(--diff-removed)",
  colorDiffRemovedText: "var(--diff-removed-foreground)",
  colorWarning: "var(--warning)",
  colorWarningText: "color-mix(in oklab, var(--foreground) 45%, var(--warning))",
  colorWarningSoft: "color-mix(in oklab, var(--warning) 12%, var(--card))",
  colorWarningBorder: "var(--warning)",
  colorInfo: "var(--info)",
  colorInfoText: "color-mix(in oklab, var(--foreground) 45%, var(--info))",
  colorInfoSoft: "color-mix(in oklab, var(--info) 12%, var(--card))",
  colorInfoBorder: "var(--info)",
  fontSans: "var(--font-sans)",
  fontMono: "var(--font-mono)",
  // Deliberately NOT remapped, so ADS stays the authority:
  // - `colorMediaEdge` is theme-scoped in ADS on purpose (transparent in light
  //   and dark, ink only under high contrast); giving it a light/dark value is
  //   explicitly banned by its token comment.
  // - `colorWorkflow*`, `colorPriority*`, `colorCsat*` and `chart1..14` are
  //   categorical data ink whose steps are picked against ADS's own contrast
  //   floors and CVD separation. Stave owns only five chart hues, so a partial
  //   remap would break both the ordering guarantee and `check:colors`.
  // - `fontSize*`, `fontWeight*`, `lineHeight*` and the space/radius ramps have
  //   no Stave counterpart; Stave only ever owned colors and `--radius`.
  // `colorDiff*` IS remapped: Stave authors `--diff-*` per theme, and those
  // values must not follow the success/danger remix.
} satisfies Partial<
  Record<Extract<keyof typeof vars, `color${string}` | `font${string}` | `zIndex${string}`>, string>
>;

// StyleX exports CSS var() references, so the canonical hashes stay authoritative.
export const adsThemeVariables = Object.fromEntries(
  Object.entries(roles).map(([role, value]) => [
    vars[role as keyof typeof roles].slice(4, -1),
    value,
  ]),
) as CSSProperties & Record<string, string>;
