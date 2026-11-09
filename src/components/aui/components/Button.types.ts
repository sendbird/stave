import type { ControlScale } from "../recipes/control-metrics";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "soft"
  | "outlined"
  | "dashed"
  | "quiet"
  | "link"
  | "floating";

/**
 * Button's rungs: the shared control scale plus `2xs` (24px), the in-surface
 * secondary action (#809 · R1 A1) — Pause, Cancel, Log, a row close inside a
 * card or panel. Decisions (Allow/Deny, Save) stay on `xs` 28 and up. `2xs` is
 * Button-only: no field shares its row, so it does not join `ControlScale`.
 * The square icon-only shape is `iconOnly`, not a size.
 */
export type ButtonSize = "2xs" | ControlScale;

/**
 * Semantic intent, orthogonal to visual weight (`variant`). `neutral` is a
 * routine action with no consequence to signal — the spelling the rest of the
 * `tone` axis uses. It is reflected as `data-tone="default"`.
 */
export type ButtonTone = "neutral" | "success" | "warning" | "danger";

/** Width-safe press geometry; `settle` is the default. */
export type ButtonPress = "settle" | "scale" | "none";
