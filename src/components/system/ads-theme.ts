import type { CSSProperties } from "react";
import { vars } from "../ads/tokens/tokens.stylex";

/** Saved Stave themes remain the color authority during source migration. */
const roles = {
  colorCanvas: "var(--background)",
  colorCanvasSubtle: "var(--muted)",
  colorGround: "var(--sidebar)",
  colorSurface: "var(--card)",
  colorSurfaceRaised: "var(--popover)",
  colorSurfaceTint: "var(--muted)",
  colorText: "var(--foreground)",
  colorTextMuted: "var(--muted-foreground)",
  colorTextSubtle: "var(--muted-foreground)",
  colorTextPlaceholder: "var(--muted-foreground)",
  colorTextInverted: "var(--background)",
  colorBorder: "var(--border)",
  colorBorderSubtle: "color-mix(in oklch, var(--border) 60%, transparent)",
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
  colorAccentSoft: "var(--accent)",
  colorAccentText: "var(--primary-foreground)",
  colorSelectionFill: "var(--accent)",
  colorDanger: "var(--destructive)",
  // Same two rules. The operand is the ink the destructive fill contrasts
  // against, and the space is oklab so a red does not swing toward orange.
  colorDangerHover:
    "color-mix(in oklab, var(--foreground) 8%, var(--destructive))",
  colorDangerText: "var(--destructive)",
  colorDangerBorder: "var(--destructive)",
  colorDangerSoft: "color-mix(in oklch, var(--destructive) 12%, var(--card))",
  colorMixInk: "var(--foreground)",
  colorMixLift: "var(--background)",
  // Interaction washes. ADS states hover/pressed as a TRANSLUCENT overlay at
  // 6%/12%, and its own themes flip the operand (ink on light, light on dark).
  // Deriving the operand from `--foreground` reproduces that flip for every
  // saved Stave theme and, unlike the ADS default, carries the theme's own hue
  // instead of the warm neutral — a blue-grey theme was hovering to warm grey.
  colorOverlayHover: "color-mix(in oklch, var(--foreground) 6%, transparent)",
  colorOverlayPressed: "color-mix(in oklch, var(--foreground) 12%, transparent)",
  // Modal scrim. Stave already owns a semantic scrim.
  colorOverlay: "var(--overlay)",
  // Scroll chrome: the same overlay mechanism at ADS's 6/24/48 weights.
  colorScrollbarTrack: "color-mix(in oklch, var(--foreground) 6%, transparent)",
  colorScrollbarThumb: "color-mix(in oklch, var(--foreground) 24%, transparent)",
  colorScrollbarThumbHover:
    "color-mix(in oklch, var(--foreground) 48%, transparent)",
  // Inset hairline under recessed keycaps/chips; ink-on-light, light-on-dark.
  colorInsetEdge: "color-mix(in oklch, var(--foreground) 6%, transparent)",
  zIndexSticky: "1",
  zIndexPanel: "10",
  zIndexAppChrome: "30",
  zIndexOverlay: "79",
  zIndexModal: "80",
  zIndexDropdown: "90",
  zIndexToast: "120",
  colorSuccess: "var(--success)",
  colorSuccessText: "var(--success)",
  colorSuccessSoft: "color-mix(in oklch, var(--success) 12%, var(--card))",
  colorSuccessBorder: "var(--success)",
  colorWarning: "var(--warning)",
  colorWarningText: "var(--warning)",
  colorWarningSoft: "color-mix(in oklch, var(--warning) 12%, var(--card))",
  colorWarningBorder: "var(--warning)",
  colorInfo: "var(--info)",
  colorInfoText: "var(--info)",
  colorInfoSoft: "color-mix(in oklch, var(--info) 12%, var(--card))",
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
