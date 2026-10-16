import { i18n } from "@/i18n/runtime";
import { formatNumber } from "@/i18n/format";
import { findHumanModelName } from "./model-catalog";
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

/** `840ms` under a second, `2.4s` above it. */
export function formatDecisionElapsed(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  return safe < 1_000 ? `${safe}ms` : `${(safe / 1_000).toFixed(1)}s`;
}

export type RoutingDecisionFactKey = "model" | "elapsed" | "failure" | "cost";

export interface RoutingDecisionFact {
  key: RoutingDecisionFactKey;
  label: string;
  value: string;
  /** The raw id behind a display name, for a hover title. */
  title?: string;
  /** A Gateway failure the decision fell back from. */
  warn?: boolean;
}

/**
 * The recorded decision-model facts as label/value rows. A fact the record
 * does not carry is omitted rather than drawn as "unknown": local rules name
 * no model, only a Gateway failure with its own reason names one, and only a
 * Gateway-reported cost is shown.
 */
export function describeRoutingDecisionFacts(observation: RoutingDecisionObservation | undefined): RoutingDecisionFact[] {
  if (!observation) return [];
  const facts: RoutingDecisionFact[] = [];
  if (observation.model) {
    const name = findHumanModelName({ model: observation.model });
    facts.push({
      key: "model",
      label: i18n.t("session:routingDecision.facts.model"),
      value: name ?? observation.model,
      ...(name && name !== observation.model ? { title: observation.model } : {}),
    });
  }
  facts.push({
    key: "elapsed",
    label: i18n.t("session:routingDecision.facts.elapsed"),
    value: observation.cached
      ? i18n.t("session:routingDecision.cached")
      : formatDecisionElapsed(observation.elapsedMs),
  });
  if (observation.preferred.mode === "gateway" && observation.failure && observation.failure !== "unavailable") {
    facts.push({
      key: "failure",
      label: i18n.t("session:routingDecision.facts.failure"),
      value: i18n.t(failureKeys[observation.failure]),
      warn: true,
    });
  }
  if (observation.reportedCostUsd !== null) {
    facts.push({
      key: "cost",
      label: i18n.t("session:routingDecision.facts.cost"),
      value: formatNumber(observation.reportedCostUsd, { style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 8 }),
    });
  }
  return facts;
}
