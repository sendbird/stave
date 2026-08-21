import { Check, CircleDashed, Minus, X } from "lucide-react";

import type { AdvisorCheck } from "@/components/session/advisor-exchange.utils";

/**
 * Status mark for one `buildAdvisorChecks` row.
 *
 * Shared by the floating exchange card and the consult log dialog so the same
 * check never renders as a tick in one surface and a dash in the other.
 */
export function AdvisorCheckIcon(props: { status: AdvisorCheck["status"] }) {
  if (props.status === "pass") {
    return <Check className="mt-0.5 size-3.5 shrink-0 text-success" />;
  }
  if (props.status === "fail") {
    return <X className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  }
  if (props.status === "pending") {
    return (
      <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-muted-foreground motion-safe:animate-spin" />
    );
  }
  return <Minus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />;
}
