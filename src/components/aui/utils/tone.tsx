import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

/**
 * Shared semantic-tone vocabulary for message surfaces (Alert, Banner, …).
 *
 * One source for the tone → icon mapping and the tone → ARIA-role rule so the
 * surfaces can't drift (they used to duplicate both). Per
 * `docs/design-direction.md` §1.2 the tone renders on the ICON only — the
 * surface itself stays neutral.
 */
export type MessageTone = "info" | "success" | "warning" | "danger";

export const toneIcons = {
  danger: ShieldAlert,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
} as const satisfies Record<MessageTone, unknown>;

/**
 * Interruptive tones announce assertively (`alert`); informational ones stay
 * polite (`status`). An explicit `role` prop always wins.
 */
export function resolveToneRole(
  tone: MessageTone,
  role?: React.AriaRole,
): React.AriaRole {
  return role ?? (tone === "danger" || tone === "warning" ? "alert" : "status");
}

/**
 * Host extension: the one tone vocabulary for product code — the seven tones
 * `StatusDot` draws (`StatusDotTone`). A product union that means a tone is
 * `Tone` or an `Extract<Tone, …>`; one that means a work state is a `*State`
 * drawn through `StateMark`, and one that names an identity or a category (a
 * provider, a PR palette, a diff side) is a `*Hue`.
 */
export type Tone =
  | "neutral"
  | "muted"
  | "accent"
  | "info"
  | "warning"
  | "success"
  | "danger";

/** One step of a threshold scale: from `from` (inclusive) up, the reading is `tone`. */
export interface ToneThreshold<T extends Tone = Tone> {
  from: number;
  tone: T;
}

/**
 * Host extension: the tone of a reading on a threshold scale. The highest
 * threshold the value reaches (`value >= from`) wins, whatever order the
 * scale is written in; below them all, or for a reading that is not a number,
 * the reading takes `fallback`, so a missing figure never reads as a warning.
 */
export function thresholdTone<T extends Tone, F extends Tone>(
  value: number,
  thresholds: readonly ToneThreshold<T>[],
  fallback: F,
): T | F {
  if (Number.isNaN(value)) {
    return fallback;
  }
  let reached: ToneThreshold<T> | null = null;
  for (const threshold of thresholds) {
    if (value >= threshold.from && (!reached || threshold.from > reached.from)) {
      reached = threshold;
    }
  }
  return reached ? reached.tone : fallback;
}
