import type { ControlScale } from "../recipes/control-metrics";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "soft"
  | "outline"
  | "dashed"
  | "quiet"
  | "link"
  | "floating"
  /** @deprecated Use `variant="primary" tone="danger"`. */
  | "danger";

/** @deprecated Use `iconOnly` with a scale step. */
export type ButtonIconSize = "icon" | "iconSm" | "iconLg";

/** Shared control scale plus the deprecated icon-shape aliases. */
export type ButtonSize = ControlScale | ButtonIconSize;

/** Semantic intent, orthogonal to visual weight (`variant`). */
export type ButtonTone = "default" | "success" | "warning" | "danger";

/** Width-safe press geometry; `settle` is the default. */
export type ButtonPress = "settle" | "scale" | "none";
