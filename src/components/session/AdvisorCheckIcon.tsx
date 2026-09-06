import { Check, CircleDashed, Minus, X } from "lucide-react";
import { sessionCoreStyles } from "./session-core.styles";
import { sx } from "../ads/utils/stylex";

import type { AdvisorCheck } from "@/components/session/advisor-exchange.utils";

/**
 * Status mark for one `buildAdvisorChecks` row.
 *
 * Shared by the floating exchange card and the consult log dialog so the same
 * check never renders as a tick in one surface and a dash in the other.
 */
export function AdvisorCheckIcon(props: { status: AdvisorCheck["status"] }) {
  if (props.status === "pass") {
    return <Check className={sx(sessionCoreStyles.statusIcon, sessionCoreStyles.pass)} />;
  }
  if (props.status === "fail") {
    return <X className={sx(sessionCoreStyles.statusIcon, sessionCoreStyles.fail)} />;
  }
  if (props.status === "pending") {
    return (
      <CircleDashed className={sx(sessionCoreStyles.statusIcon, sessionCoreStyles.muted, sessionCoreStyles.spinning)} />
    );
  }
  return <Minus className={sx(sessionCoreStyles.statusIcon, sessionCoreStyles.mutedSoft)} />;
}
