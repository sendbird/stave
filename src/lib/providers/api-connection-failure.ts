import { i18n } from "@/i18n/runtime";
import type { ApiConnectionCatalogFailure, ApiConnectionCheckResult } from "./api-connections";

/**
 * The words for a failed check or model-list read, picked from the status
 * Electron main classified. Each says what happened and what to do; none
 * repeats the raw error, which can carry a proxy's or gateway's own text.
 * Null for outcomes main describes itself (`ok`, `models-missing`).
 */
export function describeApiConnectionFailure(status: ApiConnectionCheckResult["status"] | ApiConnectionCatalogFailure): string | null {
  switch (status) {
    case "unreachable":
      return i18n.t("settingsConnections:apiConnectionFailure.unreachable");
    case "timeout":
      return i18n.t("settingsConnections:apiConnectionFailure.timeout");
    case "certificate-untrusted":
      return i18n.t("settingsConnections:apiConnectionFailure.certificateUntrusted");
    case "invalid-key":
      return i18n.t("settingsConnections:apiConnectionFailure.invalidKey");
    case "budget-exhausted":
      return i18n.t("settingsConnections:apiConnectionFailure.budgetExhausted");
    case "rate-limited":
      return i18n.t("settingsConnections:apiConnectionFailure.rateLimited");
    case "missing-key":
      return i18n.t("settingsConnections:apiConnectionFailure.missingKey");
    case "ok":
    case "models-missing":
    case "unexpected":
      return null;
  }
}

/** The line under a connection after "Check connection". */
export function describeApiConnectionCheck(result: ApiConnectionCheckResult) {
  return describeApiConnectionFailure(result.status) ?? result.message;
}
