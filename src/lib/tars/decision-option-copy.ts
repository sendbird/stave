import { i18n } from "@/i18n/runtime";
import type { TarsDecisionOption, TarsDecisionView } from "./decisions";

/** A button's words: the model's label for an ask, Confirm for a proposal, Stave's own words otherwise. */
export function describeTarsDecisionOption(decision: Pick<TarsDecisionView, "kind">, option: TarsDecisionOption): string {
  if (option.kind === "verify") return i18n.t("shell:tars.decision.option.verify");
  if (option.kind === "reply" || option.kind === "prReview" || option.label) return option.label ?? "";
  if (option.kind === "proposal") return i18n.t("shell:tars.conversation.confirm");
  return decision.kind === "confirm" ? i18n.t("shell:tars.conversation.confirm") : i18n.t(`shell:tars.decision.option.${option.control.operation}`);
}

export function tarsOptionRationale(option: TarsDecisionOption): string | null {
  if (option.kind === "verify") return i18n.t("shell:tars.decision.option.verifyRationale");
  if (option.kind === "reply" || option.kind === "prReview" || option.rationale) return option.rationale;
  if (option.kind === "proposal") return null;
  return option.control.operation === "acceptCompletion" ? i18n.t("shell:tars.decision.option.acceptRationale")
    : option.control.operation === "cancel" ? i18n.t("shell:tars.decision.option.cancelRationale") : null;
}
