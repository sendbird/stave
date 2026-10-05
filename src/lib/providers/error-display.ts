import { i18n, I18N_NAMESPACES, type I18nKey } from "@/i18n/runtime";
import { formatNumber } from "@/i18n/format";

const STAVE_ERROR_KEYS = [
  "providers:errors.codexAuthentication", "providers:errors.codexUsageLimit",
  "providers:errors.codexRateLimit", "providers:errors.codexBilling",
  "providers:errors.codexNetwork", "providers:errors.codexAppServer",
  "providers:errors.claudeAuthentication", "providers:errors.claudeBilling",
  "providers:errors.claudeRateLimit", "providers:errors.claudeSdkUnavailable",
  "providers:errors.codexRetry", "providers:errors.codexAccountGuidance",
  "providers:messages.codexUpdate",
] as const satisfies readonly I18nKey[];

/** Keep stored/runtime errors canonical for queue and recovery classification.
 * Translate only Stave's known guidance when rendering; preserve provider output.
 */
export function formatProviderErrorDisplay(message: string): string {
  const english = i18n.getFixedT("en", I18N_NAMESPACES);
  for (const key of STAVE_ERROR_KEYS) {
    if (message.trim() === english(key)) return i18n.t(key);
  }
  // i18n-ignore: canonical runtime error parsed before locale-aware presentation
  const limit = message.match(/^Rate limit reached(?: \(([^)]+)\))?\. Resets at (.+?)\.( Extra usage credits are also exhausted\.)?$/);
  if (limit) {
    const key = limit[1]
      ? limit[3] ? "providers:errors.windowLimitResetCredits" : "providers:errors.windowLimitReset"
      : limit[3] ? "providers:errors.limitResetCredits" : "providers:errors.limitReset";
    return i18n.t(key, { window: formatWindow(limit[1]), time: formatReset(limit[2]!) });
  }
  // i18n-ignore: canonical runtime error parsed before locale-aware presentation
  const credits = message.match(/^Extra usage credits are exhausted\. Resets at (.+)\.$/);
  if (credits) return i18n.t("providers:errors.creditsReset", { time: formatReset(credits[1]!) });
  // i18n-ignore: canonical runtime warning; provider summaries remain untouched
  const warning = message.match(/^Approaching (your extra usage credit limit|.+?)(?: \((\d+)% used\))?\. Consider pacing requests\.( Extra usage credits are (exhausted|covering the overflow)\.)?$/);
  if (warning) {
    const hasPercent = warning[2] != null;
    // i18n-ignore: canonical runtime warning discriminator
    const bucket = warning[1] === "your extra usage credit limit" ? "Credits" : "Window";
    const suffix = warning[4] === "exhausted" ? "Exhausted" : warning[4] ? "Covering" : "";
    const key = `providers:errors.approaching${bucket}${hasPercent ? "Percent" : ""}${suffix}` as const;
    return i18n.t(key, { window: formatWindow(warning[1]), percent: hasPercent ? formatNumber(Number(warning[2])) : "" });
  }
  return message;
}

function formatWindow(value: string | undefined): string {
  const english = i18n.getFixedT("en", I18N_NAMESPACES);
  for (const key of ["fiveHourWindow", "weeklyWindow", "opusWindow", "sonnetWindow", "rateWindow"] as const) {
    const fullKey = `providers:errors.${key}` as const;
    if (value === english(fullKey)) return i18n.t(fullKey);
  }
  return value ?? "";
}

function formatReset(value: string): string {
  return value === i18n.getFixedT("en", I18N_NAMESPACES)("providers:errors.unknownReset")
    ? i18n.t("providers:errors.unknownReset") : value;
}
