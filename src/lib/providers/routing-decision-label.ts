import { i18n } from "@/i18n/runtime";
import { formatNumber } from "@/i18n/format";
import type { RoutingDecisionObservation } from "./routing-decision";
const failureKeys = {
  "missing-key": "session:routingDecision.failures.missingKey", auth: "session:routingDecision.failures.auth",
  budget: "session:routingDecision.failures.budget", "rate-limit": "session:routingDecision.failures.rateLimit",
  timeout: "session:routingDecision.failures.timeout", network: "session:routingDecision.failures.network",
  "invalid-response": "session:routingDecision.failures.invalidResponse", unavailable: "session:routingDecision.failures.unavailable",
} as const;

/** Only bounded recorded metadata is displayed; no backend body or error text. */
export function formatRoutingDecision(observation: RoutingDecisionObservation) {
  return i18n.t("session:routingDecision.description", {
    model: observation.model ?? i18n.t("session:routingDecision.local"),
    elapsed: formatNumber(observation.elapsedMs / 1_000, { maximumFractionDigits: 1 }),
    status: observation.cached ? i18n.t("session:routingDecision.cached") : observation.fallback ? i18n.t("session:routingDecision.fallback") : i18n.t("session:routingDecision.primary"),
    failure: observation.failure ? i18n.t(failureKeys[observation.failure]) : i18n.t("session:routingDecision.none"),
    cost: observation.reportedCostUsd === null ? i18n.t("session:routingDecision.unknownCost") : formatNumber(observation.reportedCostUsd, { style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 8 }),
  });
}
