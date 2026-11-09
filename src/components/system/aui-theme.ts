import type { CSSProperties } from "react";
import { vars } from "../aui/tokens/tokens.stylex";

/** Saved Stave themes remain the color authority during source migration. */
const roles = {
  "--aui-color-canvas": "var(--background)",
  "--aui-color-canvas-subtle": "var(--muted)",
  // The ground behind the frame must sit BEHIND `colorCanvasSubtle`, and AUI
  // reads depth as darkness (light: ground 0.93 < canvasSubtle 0.97). Stave's
  // `--sidebar` and `--muted` share a lightness in the default themes, so the
  // raw alias left a panel unable to recede from what it sits on. A 5% ink mix
  // restores the step in both modes (light 0.918 vs muted 0.955; dark 0.184 vs
  // 0.245 — `--foreground` is the light pole there, so the same expression
  // lifts instead of darkens and the ordering survives).
  "--aui-color-ground": "color-mix(in oklab, var(--foreground) 5%, var(--sidebar))",
  "--aui-color-surface": "var(--card)",
  "--aui-color-surface-raised": "var(--popover)",
  "--aui-color-surface-tint": "var(--muted)",
  "--aui-color-text": "var(--foreground)",
  // Text ramp. All three used to alias `--muted-foreground`, which collapsed
  // AUI's three tiers into one value, so a placeholder read as filled-in copy
  // and "subtle" carried body-weight contrast. AUI inserts two half-steps
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
  // placeholder floor on `--muted`; 23% lands subtle on AUI's own 0.62.
  // Built-in editor ports author `--muted-foreground` to clear these floors
  // after the mix (`tests/theme-contrast.test.ts`). Keep the mapping honest:
  // do not compensate here for a theme that ships a comment-color muted.
  "--aui-color-text-muted": "var(--muted-foreground)",
  "--aui-color-text-subtle":
    "color-mix(in oklab, var(--background) 23%, var(--muted-foreground))",
  "--aui-color-text-placeholder":
    "color-mix(in oklab, var(--background) 5%, var(--muted-foreground))",
  // Fourth ink (AUI #809, R0 S7): the step past subtle, below 3:1 by design,
  // for marks that carry no meaning a reader needs (a separator dot, a
  // decorative count). AUI spaces muted -> subtle -> faint evenly (light
  // 0.505 / 0.62 / 0.735), so the mix doubles subtle's 23% toward the page.
  "--aui-color-text-faint":
    "color-mix(in oklab, var(--background) 46%, var(--muted-foreground))",
  "--aui-color-text-inverted": "var(--background)",
  "--aui-color-border": "var(--border)",
  "--aui-color-border-subtle": "color-mix(in oklab, var(--border) 60%, transparent)",
  // Resting ring of a raised surface (AUI #809 R0 §1.5, raised to 18% by #810
  // F3): 18% of the theme's ink over whatever it sits on, so it darkens in
  // light themes and lifts in dark ones without a per-theme value, as AUI's
  // own 18% ink / 18% lift pair.
  "--aui-color-ring": "color-mix(in oklab, var(--foreground) 18%, transparent)",
  "--aui-color-border-strong": "var(--muted-foreground)",
  "--aui-color-border-focus": "var(--ring)",
  "--aui-color-accent": "var(--primary)",
  /*
   * Interaction states are derived, not authored, so all 20+ saved themes get
   * them from their own `--primary` instead of inheriting AUI's.
   *
   * Two rules, both AUI's own (tokens.stylex.ts on `colorMixInk`/`colorMixLift`,
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
  "--aui-color-accent-hover":
    "color-mix(in oklab, var(--primary-foreground) 8%, var(--primary))",
  // AUI's soft emphasis is a neutral wash. Using the host's selected accent
  // here spread blue across ordinary rows, chips and payload chrome. Derive
  // the wash from the theme's ink and surface; selection keeps its own role.
  "--aui-color-accent-soft": "color-mix(in oklab, var(--foreground) 4%, var(--card))",
  "--aui-color-accent-text": "var(--primary-foreground)",
  "--aui-color-selection-fill": "var(--accent)",
  "--aui-color-danger": "var(--destructive)",
  // Same two rules. The operand is the ink the destructive fill contrasts
  // against, and the space is oklab so a red does not swing toward orange.
  "--aui-color-danger-hover":
    "color-mix(in oklab, var(--foreground) 8%, var(--destructive))",
  // Semantic TEXT steps. These four aliased their own fills, and a fill only
  // has to clear the 3:1 mark floor, so `colorDangerText` on `colorDangerSoft`
  // measured 4.36:1 and `colorWarningText` on `colorWarningSoft` just 2.28:1 in
  // light. AUI ships a separate, darker text step for exactly this reason
  // (warning 0.693 -> 0.489, danger 0.577 -> 0.444, info 0.546 -> 0.424).
  //
  // A 45% `--foreground` mix reproduces those steps from the theme's own fill
  // (light L: warning 0.497 vs AUI 0.489, danger 0.409 vs 0.444, info 0.398 vs
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
  // A theme whose `--foreground` is itself below 4.5:1 against `--card` cannot
  // be rescued by this mix. Built-in ports keep body ink above that floor
  // (`tests/theme-contrast.test.ts`); user themes that ship comment-color
  // body ink will still inherit that ceiling.
  "--aui-color-danger-text": "color-mix(in oklab, var(--foreground) 45%, var(--destructive))",
  "--aui-color-danger-border": "var(--destructive)",
  "--aui-color-danger-soft": "color-mix(in oklab, var(--destructive) 12%, var(--card))",
  "--aui-color-mix-ink": "var(--foreground)",
  "--aui-color-mix-lift": "var(--background)",
  // Interaction washes. AUI states hover/pressed as a TRANSLUCENT overlay at
  // 6%/12%, and its own themes flip the operand (ink on light, light on dark).
  // Deriving the operand from `--foreground` reproduces that flip for every
  // saved Stave theme and, unlike the AUI default, carries the theme's own hue
  // instead of the warm neutral — a blue-grey theme was hovering to warm grey.
  "--aui-color-overlay-hover": "color-mix(in oklab, var(--foreground) 6%, transparent)",
  "--aui-color-overlay-pressed": "color-mix(in oklab, var(--foreground) 12%, transparent)",
  // Modal scrim. Stave already owns a semantic scrim.
  "--aui-color-overlay": "var(--overlay)",
  // Scroll chrome: the same overlay mechanism at AUI's 6/24/48 weights.
  "--aui-color-scrollbar-track": "color-mix(in oklab, var(--foreground) 6%, transparent)",
  "--aui-color-scrollbar-thumb": "color-mix(in oklab, var(--foreground) 24%, transparent)",
  "--aui-color-scrollbar-thumb-hover":
    "color-mix(in oklab, var(--foreground) 48%, transparent)",
  // Meter and Progress tracks: the 24% step of the same overlay, so a track is
  // a shade of whatever card or panel it sits on. Aliasing `--muted` (via
  // `colorCanvasSubtle`) drew no track at all on a `--muted` card. Measured on
  // every built-in theme against background/card/popover/muted/sidebar: track
  // 1.35:1 at the lowest (everforest-light), 1.5:1+ on 32 of 40 themes; every
  // tone's fill stays 1.54:1+ from the track (`tests/theme-contrast.test.ts`).
  "--aui-color-track": "color-mix(in oklab, var(--foreground) 24%, transparent)",
  // Inset hairline under recessed keycaps/chips; ink-on-light, light-on-dark.
  "--aui-color-inset-edge": "color-mix(in oklab, var(--foreground) 6%, transparent)",
  "--aui-z-index-sticky": "1",
  "--aui-z-index-panel": "10",
  "--aui-z-index-app-chrome": "30",
  "--aui-z-index-overlay": "79",
  "--aui-z-index-modal": "80",
  "--aui-z-index-dropdown": "90",
  "--aui-z-index-toast": "120",
  "--aui-color-success": "var(--success)",
  "--aui-color-success-text": "color-mix(in oklab, var(--foreground) 45%, var(--success))",
  "--aui-color-success-soft": "color-mix(in oklab, var(--success) 12%, var(--card))",
  "--aui-color-success-border": "var(--success)",
  // VCS / diff identity. Stave already authors `--diff-*` per theme (GitHub
  // green/red, palette-specific added/removed ink). Mapping these
  // through `--success` / `--destructive` was what painted a Dracula added
  // line in the remixed status teal instead of `#50FA7B`.
  "--aui-color-diff-added": "var(--diff-added)",
  "--aui-color-diff-added-text": "var(--diff-added-foreground)",
  "--aui-color-diff-removed": "var(--diff-removed)",
  "--aui-color-diff-removed-text": "var(--diff-removed-foreground)",
  "--aui-color-warning": "var(--warning)",
  "--aui-color-warning-text": "color-mix(in oklab, var(--foreground) 45%, var(--warning))",
  "--aui-color-warning-soft": "color-mix(in oklab, var(--warning) 12%, var(--card))",
  "--aui-color-warning-border": "var(--warning)",
  "--aui-color-info": "var(--info)",
  "--aui-color-info-text": "color-mix(in oklab, var(--foreground) 45%, var(--info))",
  "--aui-color-info-soft": "color-mix(in oklab, var(--info) 12%, var(--card))",
  "--aui-color-info-border": "var(--info)",
  "--aui-font-sans": "var(--font-sans)",
  "--aui-font-mono": "var(--font-mono)",
  // Deliberately NOT remapped, so AUI stays the authority:
  // - `colorMediaEdge` is theme-scoped in AUI on purpose (transparent in light
  //   and dark, ink only under high contrast); giving it a light/dark value is
  //   explicitly banned by its token comment.
  // - `colorWorkflow*`, `colorPriority*`, `colorCsat*` and `chart1..14` are
  //   categorical data ink whose steps are picked against AUI's own contrast
  //   floors and CVD separation. Stave owns only five chart hues, so a partial
  //   remap would break both the ordering guarantee and `check:colors`.
  // - `fontSize*`, `fontWeight*`, `lineHeight*` and the space/radius ramps have
  //   no Stave counterpart; Stave only ever owned colors and `--radius`.
  // `colorDiff*` IS remapped: Stave authors `--diff-*` per theme, and those
  // values must not follow the success/danger remix.
} satisfies Partial<
  Record<
    Extract<
      keyof typeof vars,
      `--aui-color-${string}` | `--aui-font-${string}` | `--aui-z-index-${string}`
    >,
    string
  >
>;

// StyleX exports CSS var() references, so the token name stays authoritative:
// `vars["--aui-color-text"]` is the string `var(--aui-color-text)`, and slicing
// the wrapper off yields the custom property this bridge has to publish.
export const auiThemeVariables = Object.fromEntries(
  Object.entries(roles).map(([role, value]) => [
    vars[role as keyof typeof roles].slice(4, -1),
    value,
  ]),
) as CSSProperties & Record<string, string>;

/*
 * Dark high contrast. AUI ships its high-contrast theme for light mode only,
 * so a dark Stave theme flagged `contrast: "high"` keeps AUI's dark theme and
 * gets this emphasis on top of the role mapping: hairlines at the theme's full
 * border color instead of the 60% mix, media edges drawn (AUI inks
 * `colorMediaEdge` only under high contrast, which this is), and a wider
 * focus ring. It does not reproduce AUI's light high-contrast elevation ramp,
 * which a black canvas cannot show.
 */
const darkHighContrastEmphasis = {
  "--aui-color-border-subtle": "var(--border)",
  "--aui-color-media-edge": "var(--border)",
  "--aui-focus-ring-width": "3px",
  // A raised surface's resting ring is opaque under high contrast (AUI's own
  // high-contrast theme draws it solid), not the 12% translucent hairline.
  "--aui-color-ring": "var(--border)",
} as const satisfies Partial<Record<Extract<keyof typeof vars, `--aui-${string}`>, string>>;

/*
 * Light high contrast keeps AUI's own high-contrast theme underneath, but the
 * role mapping above writes over it, so the opaque ring is restored here.
 */
const lightHighContrastEmphasis = {
  "--aui-color-ring": "var(--border)",
} as const satisfies Partial<Record<Extract<keyof typeof vars, `--aui-${string}`>, string>>;

type AuiToken = Extract<keyof typeof vars, `--aui-${string}`>;
function withEmphasis(emphasis: Partial<Record<AuiToken, string>>) {
  return {
    ...auiThemeVariables,
    ...Object.fromEntries(
      (Object.entries(emphasis) as Array<[AuiToken, string]>).map(([token, value]) => [
        (vars[token] as string).slice(4, -1),
        value,
      ]),
    ),
  } as CSSProperties & Record<string, string>;
}

export const auiDarkHighContrastVariables = withEmphasis(darkHighContrastEmphasis);
export const auiLightHighContrastVariables = withEmphasis(lightHighContrastEmphasis);
