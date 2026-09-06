import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cx, sx } from "@/components/ads/utils/stylex";
import type { TurnVerificationStatus } from "@/lib/workspace-scripts/verification";
import { prStatusIconStyles, prToneIconStyles } from "./pr-status.styles";

// ---------------------------------------------------------------------------
// Icon lookup – maps verification status to its Lucide component
// ---------------------------------------------------------------------------

const ICON_MAP: Record<TurnVerificationStatus, LucideIcon> = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
};

/**
 * Verification status is a semantic fact; the tone it borrows is the UI's
 * choice, so the mapping lives here rather than in
 * `src/lib/workspace-scripts/verification.ts`.
 */
const TONE_MAP = {
  pass: "open",
  warn: "attention",
  fail: "danger",
} as const satisfies Record<TurnVerificationStatus, keyof typeof prToneIconStyles>;

// ---------------------------------------------------------------------------
// VerificationStatusIcon – status icon tinted with an existing semantic token
// (isomorphic to PrStatusIcon)
// ---------------------------------------------------------------------------

export function VerificationStatusIcon(props: {
  status: TurnVerificationStatus;
  className?: string;
}) {
  const Icon = ICON_MAP[props.status];

  return (
    <Icon
      className={cx(
        sx(prStatusIconStyles.glyph, prToneIconStyles[TONE_MAP[props.status]]),
        props.className,
      )}
    />
  );
}
