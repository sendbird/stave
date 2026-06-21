import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type TurnVerificationStatus,
  VERIFICATION_STATUS_VISUAL,
} from "@/lib/workspace-scripts/verification";

// ---------------------------------------------------------------------------
// Icon lookup – maps verification status to its Lucide component
// ---------------------------------------------------------------------------

const ICON_MAP: Record<TurnVerificationStatus, LucideIcon> = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
};

// ---------------------------------------------------------------------------
// VerificationStatusIcon – status icon tinted with an existing semantic token
// (isomorphic to PrStatusIcon)
// ---------------------------------------------------------------------------

export function VerificationStatusIcon(props: {
  status: TurnVerificationStatus;
  className?: string;
}) {
  const Icon = ICON_MAP[props.status];
  const colorClass = VERIFICATION_STATUS_VISUAL[props.status].iconClassName;

  return <Icon className={cn("size-3.5 shrink-0", colorClass, props.className)} />;
}
