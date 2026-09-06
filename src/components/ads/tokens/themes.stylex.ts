import * as stylex from "@stylexjs/stylex";

import { vars } from "./tokens.stylex";

export const lightTheme = stylex.createTheme(vars, {
  colorCanvas: "oklch(0.985 0.007 89)",
  colorCanvasSubtle: "oklch(0.97 0.007 89)",
  colorGround: "oklch(0.93 0.007 89)",
  colorSurface: "oklch(1 0 0)",
  colorSurfaceRaised: "oklch(1 0 0)",
  colorSurfaceTint: "oklch(0.97 0.007 89)",
  colorText: "oklch(0 0 0)",
  colorTextMuted: "oklch(0.505 0.007 89)",
  colorTextSubtle: "oklch(0.62 0.007 89)",
  colorTextPlaceholder: "oklch(0.505 0.007 89)",
  colorTextInverted: "oklch(0.97 0.007 89)",
  colorBorder: "oklch(0.89 0.007 89)",
  colorBorderSubtle: "oklch(0.275 0.007 89 / 0.06)",
  colorMediaEdge: "transparent",
  colorBorderStrong: "oklch(0.505 0.007 89)",
  colorBorderFocus: "oklch(0.505 0.007 89)",
  colorInsetEdge: "oklch(0.275 0.007 89 / 0.06)",
  colorScrollbarTrack: "oklch(0.275 0.007 89 / 0.06)",
  colorScrollbarThumb: "oklch(0.275 0.007 89 / 0.24)",
  colorScrollbarThumbHover: "oklch(0.275 0.007 89 / 0.48)",
  colorAccent: "oklch(0.275 0.007 89)",
  colorAccentHover: "oklch(0.3095 0.007 89)",
  colorSelectionFill: "oklch(0.93 0.007 89)",
  colorAccentSoft: "oklch(0.97 0.007 89)",
  colorAccentText: "oklch(0.97 0.007 89)",
  colorInfo: "oklch(0.546 0.245 262)",
  colorInfoSoft: "oklch(0.943 0.027 292)",
  colorInfoText: "oklch(0.424 0.194 262)",
  colorInfoBorder: "oklch(0.546 0.245 262)",
  colorWarning: "oklch(0.693 0.139 86)",
  colorWarningSoft: "oklch(0.965 0.035 86)",
  colorWarningText: "oklch(0.489 0.096 86)",
  colorWarningBorder: "oklch(0.693 0.139 86)",
  colorSuccess: "oklch(0.701 0.132 164)",
  colorSuccessSoft: "oklch(0.962 0.038 164)",
  colorSuccessText: "oklch(0.465 0.085 164)",
  colorSuccessBorder: "oklch(0.613 0.131 164)",
  colorDanger: "oklch(0.577 0.229 30)",
  colorDangerHover: "oklch(0.505 0.200 30)",
  colorDangerSoft: "oklch(0.936 0.029 30)",
  colorDangerText: "oklch(0.444 0.175 30)",
  colorDangerBorder: "oklch(0.577 0.229 30)",
  colorWorkflowInProgress: "oklch(0.623 0.200 262)",
  colorWorkflowInReview: "oklch(0.56 0.112 86)",
  colorWorkflowDone: "oklch(0.527 0.098 164)",
  colorWorkflowOverdue: "oklch(0.577 0.229 30)",
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
  colorOverlayHover: "oklch(0.275 0.007 89 / 0.06)",
  colorOverlayPressed: "oklch(0.275 0.007 89 / 0.12)",
  colorMixInk: "oklch(0.275 0.007 89)",
  colorMixLift: "oklch(0.985 0.007 89)",
  // Restated (identical to the `defineVars` defaults) so a `lightTheme`
  // subtree nested inside a `darkTheme` one resets depth too — otherwise the
  // dark theme's near-black shadows leak into the light island.
  elevationRaised: "0 1px 2px 0 oklch(0.1375 0.007 89 / 0.05)",
  elevationLift:
    "0 2px 4px -1px oklch(0.1375 0.007 89 / 0.08), 0 1px 2px -1px oklch(0.1375 0.007 89 / 0.06)",
  elevationOverlay:
    "0 10px 15px -3px oklch(0.1375 0.007 89 / 0.1), 0 4px 6px -4px oklch(0.1375 0.007 89 / 0.1), 0 24px 48px -12px oklch(0.1375 0.007 89 / 0.05)",
  elevationModal:
    "0 20px 25px -5px oklch(0.1375 0.007 89 / 0.12), 0 8px 10px -6px oklch(0.1375 0.007 89 / 0.1), 0 40px 72px -24px oklch(0.1375 0.007 89 / 0.12)",
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
});

export const darkTheme = stylex.createTheme(vars, {
  // Dark neutral ramp — a dedicated scale, not the light ramp inverted.
  //
  // The four light surface roles used to collapse onto two dark values
  // (`colorSurface` == `colorSurfaceRaised`, `colorCanvasSubtle` ==
  // `colorSurfaceTint`), so a menu floating over a card and the card itself
  // painted the same color and every depth cue came from a shadow that dark
  // mode could not show. Ordering, low → high:
  //
  //   canvas .147 → surface .198 → surfaceTint .224 → surfaceRaised .238
  //   → canvasSubtle .272 (interaction wash) → accentSoft .308 (selected)
  //
  // Steps are wider than the light ramp's on purpose: equal OKLCH ΔL reads as
  // less separation at low lightness on a typical display.
  colorCanvas: "oklch(0.165 0.007 89)",
  colorCanvasSubtle: "oklch(0.275 0.007 89)",
  colorGround: "oklch(0.1375 0.007 89)",
  colorSurface: "oklch(0.1925 0.007 89)",
  colorSurfaceRaised: "oklch(0.2475 0.007 89)",
  colorSurfaceTint: "oklch(0.22 0.007 89)",
  colorText: "oklch(0.985 0.007 89)",
  colorTextMuted: "oklch(0.735 0.007 89)",
  colorTextSubtle: "oklch(0.62 0.007 89)",
  colorTextPlaceholder: "oklch(0.6315 0.007 89)",
  colorTextInverted: "oklch(0.1925 0.007 89)",
  colorBorder: "oklch(0.985 0.007 89 / 0.12)",
  colorBorderSubtle: "oklch(0.985 0.007 89 / 0.06)",
  colorMediaEdge: "transparent",
  // Solid for the same reason `colorBorderFocus` below is: this border is the
  // only boundary an unchecked Checkbox and an OFF Switch have, so it is held
  // to the 3:1 control-boundary floor, and an alpha value cannot hold a floor
  // it re-derives from whatever sits behind it. At `oklch(1 0 0 / 0.26)` it
  // rendered 2.23–2.36:1 across the five dark surfaces; the gate scored it 5.47
  // only because it composited alpha in linear light (fixed in
  // `scripts/lib/color-metrics.mjs`). Lightness carries the fix; chroma and hue
  // stay on the light theme's `colorBorderStrong` ramp.
  colorBorderStrong: "oklch(0.62 0.007 89)",
  // Focus must out-rank `colorBorderStrong`, and an alpha border cannot: it
  // composites against whatever sits behind it. A solid bright warm neutral
  // reads at the same strength on canvas, surface, and popup alike.
  colorBorderFocus: "oklch(0.85 0.007 89)",
  colorInsetEdge: "oklch(0.985 0.007 89 / 0.06)",
  colorScrollbarTrack: "oklch(0.985 0.007 89 / 0.06)",
  colorScrollbarThumb: "oklch(0.985 0.007 89 / 0.24)",
  colorScrollbarThumbHover: "oklch(0.985 0.007 89 / 0.48)",
  colorAccent: "oklch(0.93 0.007 89)",
  colorAccentHover: "oklch(0.985 0.007 89)",
  colorSelectionFill: "oklch(0.3095 0.007 89)",
  colorAccentSoft: "oklch(0.3095 0.007 89)",
  colorAccentText: "oklch(0.1925 0.007 89)",
  colorInfo: "oklch(0.707 0.150 262)",
  colorInfoSoft: "oklch(0.3 0.06 262)",
  colorInfoText: "oklch(0.809 0.093 262)",
  colorInfoBorder: "oklch(0.623 0.200 262)",
  colorWarning: "oklch(0.825 0.166 86)",
  colorWarningSoft: "oklch(0.3 0.06 86)",
  colorWarningText: "oklch(0.895 0.095 86)",
  colorWarningBorder: "oklch(0.825 0.166 86)",
  colorSuccess: "oklch(0.701 0.132 164)",
  colorSuccessSoft: "oklch(0.3 0.06 164)",
  colorSuccessText: "oklch(0.792 0.109 164)",
  colorSuccessBorder: "oklch(0.701 0.132 164)",
  colorDanger: "oklch(0.704 0.185 30)",
  colorDangerHover: "oklch(0.704 0.185 30)",
  colorDangerSoft: "oklch(0.3 0.06 30)",
  colorDangerText: "oklch(0.885 0.058 30)",
  colorDangerBorder: "oklch(0.637 0.237 30)",
  colorWorkflowInProgress: "oklch(0.707 0.150 262)",
  colorWorkflowInReview: "oklch(0.693 0.139 86)",
  colorWorkflowDone: "oklch(0.701 0.132 164)",
  // Exact Delight brand seed (#FF5E69) in the file's oklch notation; it has
  // 7.06:1 contrast on the raised dark surface and therefore needs no
  // lightness adjustment here.
  colorWorkflowOverdue: "oklch(0.704 0.185 30)",
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
  colorOverlay: "oklch(0.275 0.007 89 / 0.48)",
  colorOverlayHover: "oklch(0.985 0.007 89 / 0.06)",
  colorOverlayPressed: "oklch(0.985 0.007 89 / 0.12)",
  colorMixInk: "oklch(0.985 0.007 89)",
  colorMixLift: "oklch(0.275 0.007 89)",
  // Dark elevation is near-black at high alpha, not the light ramp's 5–12%
  // ink: a shadow only reads on a dark canvas when it is darker than the
  // canvas itself. Each step keeps the light scale's geometry (same offsets
  // and blur radii) so a surface does not change shape between themes — only
  // the ink strength changes.
  elevationRaised: "0 1px 2px 0 oklch(0 0 0 / 0.4)",
  elevationLift:
    "0 2px 4px -1px oklch(0 0 0 / 0.48), 0 1px 2px -1px oklch(0 0 0 / 0.4)",
  elevationOverlay:
    "0 10px 15px -3px oklch(0 0 0 / 0.56), 0 4px 6px -4px oklch(0 0 0 / 0.48), 0 24px 48px -12px oklch(0 0 0 / 0.28)",
  elevationModal:
    "0 20px 25px -5px oklch(0 0 0 / 0.64), 0 8px 10px -6px oklch(0 0 0 / 0.52), 0 40px 72px -24px oklch(0 0 0 / 0.64)",
  // Same neutral-first hierarchy stepped for the dark surface.
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
});

/**
 * The compact preset is a **uniform −4px offset over every control metric**, and
 * it must shift the whole named ramp — not just the unnamed default.
 *
 * Every override below is exactly −4px from its `tokens.stylex.ts` value, and
 * that was already true before the ramp entries existed: 36→32, 32→28, 32→28,
 * 32→28, 52→48. The preset was always an offset; it just reached four of the
 * five metrics. `controlHeightXs..Lg` were missing, so `size` steps that read
 * them did not move while `size="md"` — which reads the *semantic*
 * `controlHeight` — did. The result was a collapse: under compact,
 * `controlHeightSm` stayed 32px and `controlHeight` became 32px, so
 * `size="sm"` and `size="md"` rendered at the same height on every control
 * routed through `controlHeightBySize` (Button, TextField, Field, NumberField,
 * Popover and Select triggers, …). A density preset that makes two named size
 * steps indistinguishable has destroyed the axis it was supposed to modulate.
 *
 * Shifting the ramp keeps it strictly ordered — 24 < 28 < 32 < 36 — so `size`
 * stays meaningful at either density and the two axes compose instead of
 * overwriting each other. `tests/visual/density-precedence.spec.ts` asserts
 * both properties.
 *
 * Two entries are deliberately absent:
 * - **`controlHeightXl` is NOT overridden.** It is the `(pointer: coarse)`
 *   target every `controlHeights` arm escalates to for WCAG 2.5.8 (44px
 *   minimum). Compacting it would shrink touch targets below the floor, which
 *   is a conformance failure, not a density preference.
 * - **`controlHeightMd` and `controlHeight` are both 36px and both listed.**
 *   They are redundant by history — `controlHeight` is the documented semantic
 *   default while `controlHeightMd` is the ramp's middle step, and consumers
 *   pick between them inconsistently (32 sites read the ramp entry). Both must
 *   move together or that split becomes a second collapse.
 *
 * The 24px floor is not a new number: `treeRowHeightCompact` has shipped at
 * 24px, so the shifted `xs` step lands on a height the system already renders.
 */
export const compactDensityTheme = stylex.createTheme(vars, {
  controlHeightXs: "24px",
  controlHeightSm: "28px",
  controlHeightMd: "32px",
  controlHeightLg: "36px",
  controlHeight: "32px",
  menuItemHeight: "28px",
  iconButtonSize: "28px",
  treeRowHeightRegular: "28px",
  rowHeightRegular: "48px",
  space12: "0.5rem",
  space16: "0.75rem",
  space20: "1rem",
  space24: "1.25rem",
  space32: "1.5rem",
  space40: "2rem",
  space48: "2.5rem",
  space64: "3rem",
});

export const highContrastTheme = stylex.createTheme(vars, {
  colorCanvas: "oklch(1 0 0)",
  colorCanvasSubtle: "oklch(0.97 0.007 89)",
  colorGround: "oklch(1 0 0)",
  colorSurface: "oklch(1 0 0)",
  colorSurfaceRaised: "oklch(1 0 0)",
  colorSurfaceTint: "oklch(0.97 0.007 89)",
  colorText: "oklch(0 0 0)",
  colorTextMuted: "oklch(0.275 0.007 89)",
  colorTextSubtle: "oklch(0.39 0.007 89)",
  colorTextPlaceholder: "oklch(0.39 0.007 89)",
  colorTextInverted: "oklch(1 0 0)",
  colorBorder: "oklch(0.505 0.007 89)",
  colorBorderStrong: "oklch(0.22 0.007 89)",
  colorBorderFocus: "oklch(0 0 0)",
  colorInsetEdge: "oklch(0.275 0.007 89 / 0.24)",
  colorScrollbarTrack: "oklch(0.97 0.007 89)",
  colorScrollbarThumb: "oklch(0.39 0.007 89)",
  colorScrollbarThumbHover: "oklch(0.22 0.007 89)",
  colorAccent: "oklch(0 0 0)",
  colorAccentHover: "oklch(0.275 0.007 89)",
  colorSelectionFill: "oklch(0.89 0.007 89)",
  colorAccentSoft: "oklch(0.97 0.007 89)",
  colorAccentText: "oklch(1 0 0)",
  colorInfo: "oklch(0.488 0.223 262)",
  colorInfoSoft: "oklch(0.943 0.027 292)",
  colorInfoText: "oklch(0.379 0.146 262)",
  colorInfoBorder: "oklch(0.488 0.223 262)",
  colorWarning: "oklch(0.47 0.136 43)",
  colorWarningSoft: "oklch(0.965 0.035 86)",
  colorWarningText: "oklch(0.408 0.118 43)",
  colorWarningBorder: "oklch(0.47 0.136 43)",
  colorSuccess: "oklch(0.527 0.098 164)",
  colorSuccessSoft: "oklch(0.962 0.038 164)",
  colorSuccessText: "oklch(0.345 0.060 164)",
  colorSuccessBorder: "oklch(0.527 0.098 164)",
  colorDanger: "oklch(0.505 0.200 30)",
  colorDangerHover: "oklch(0.444 0.175 30)",
  colorDangerSoft: "oklch(0.97 0.007 89)",
  colorDangerText: "oklch(0.396 0.141 30)",
  colorDangerBorder: "oklch(0.505 0.200 30)",
  colorWorkflowInProgress: "oklch(0.488 0.223 262)",
  colorWorkflowInReview: "oklch(0.47 0.136 43)",
  colorWorkflowDone: "oklch(0.527 0.098 164)",
  colorWorkflowOverdue: "oklch(0.505 0.200 30)",
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
  colorOverlay: "oklch(0.275 0.007 89 / 0.48)",
  colorOverlayHover: "oklch(0.275 0.007 89 / 0.12)",
  colorOverlayPressed: "oklch(0.275 0.007 89 / 0.24)",
  colorMixInk: "oklch(0.275 0.007 89)",
  colorMixLift: "oklch(0.985 0.007 89)",
  colorBorderSubtle: "oklch(0.275 0.007 89 / 0.24)",
  colorMediaEdge: "oklch(0.505 0.007 89)",
  // High contrast inherits the light ramp's geometry but at ink strengths a
  // low-vision reader can actually resolve — the 5–12% light shadows are below
  // the noise floor for this audience, and the theme's flat white surfaces
  // give a floating popup no other depth cue.
  elevationRaised: "0 1px 2px 0 oklch(0 0 0 / 0.22)",
  elevationLift:
    "0 2px 4px -1px oklch(0 0 0 / 0.28), 0 1px 2px -1px oklch(0 0 0 / 0.22)",
  elevationOverlay:
    "0 10px 15px -3px oklch(0 0 0 / 0.34), 0 4px 6px -4px oklch(0 0 0 / 0.3), 0 24px 48px -12px oklch(0 0 0 / 0.17)",
  elevationModal:
    "0 20px 25px -5px oklch(0 0 0 / 0.42), 0 8px 10px -6px oklch(0 0 0 / 0.34), 0 40px 72px -24px oklch(0 0 0 / 0.42)",
  // High contrast keeps the hierarchy neutral-first while pushing every mark
  // past its white-surface contrast floor (worst adjacent CVD ΔE 10.7).
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
});
