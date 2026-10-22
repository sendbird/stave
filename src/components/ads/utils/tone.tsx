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
