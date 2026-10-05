import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import { describeHookEventLabel, normalizeHookEventToken } from "@/lib/providers/hook-activity";
import { describeToolOperationLabel, resolveToolNameLeaf } from "@/lib/providers/tool-activity";
import { formatProviderTimeoutLabel } from "@/lib/providers/runtime-option-contract";
import { HttpsBaseUrlSchema } from "@/lib/providers/api-connections";
import { getCodexModelUpdateGuidance } from "@/lib/providers/codex-model-requirements";
import { formatCursorEffortLabel } from "@/lib/providers/cursor-model-id";
import { quotaResetCountdown } from "@/components/usage/usage-quota.utils";
import { quotaReadFeedbackText } from "@/components/usage/quota-read-feedback";
import { explainRuleMiss, describeRuleConditions } from "@/components/auto-routing/RouteFlow";
import type { RouteRule, RouterSignals } from "@/lib/providers/auto-routing-profile";

afterEach(() => applyAppLocale("en"));

describe("settings and provider display language", () => {
  test("refreshes imported tool and hook labels while preserving provider identifiers", () => {
    expect(describeToolOperationLabel("Bash")).toBe("Run command");
    expect(describeHookEventLabel("PreToolUse")).toBe("Before tool use");
    applyAppLocale("ko");
    expect(describeToolOperationLabel("Bash")).toBe("명령 실행");
    expect(describeHookEventLabel("PreToolUse")).toBe("도구 사용 전");
    expect(resolveToolNameLeaf("Bash")).toBe("bash");
    expect(normalizeHookEventToken("PreToolUse")).toBe("pretooluse");
  });

  test("uses the selected language and singular or plural duration grammar", () => {
    expect(formatProviderTimeoutLabel(3_600_000)).toBe("1 hour");
    expect(formatProviderTimeoutLabel(7_200_000)).toBe("2 hours");
    applyAppLocale("ko");
    expect(formatProviderTimeoutLabel(3_600_000)).toBe("1시간");
    expect(formatProviderTimeoutLabel(7_200_000)).toBe("2시간");
  });

  test("localizes quota retry explanations without changing read provenance", () => {
    const feedback = { status: "cached", reason: "manual-floor", nextRefreshAt: "2026-10-05T02:00:00.000Z", nextAutomaticReadAt: null, lastReadFailed: false } as const;
    const now = Date.parse("2026-10-05T01:00:00.000Z");
    expect(quotaReadFeedbackText(feedback, "UTC", now)).toContain("Recent reads are reused");
    applyAppLocale("ko");
    const text = quotaReadFeedbackText(feedback, "UTC", now);
    expect(text).toContain("최근 관측값을 재사용");
    expect(text).not.toContain("Recent reads");
    expect(feedback.status).toBe("cached");
  });

  test("localizes rule explanations and conditions after import", () => {
    const rule: RouteRule = { id: "test-rule", enabled: true, when: { sensitive: true }, then: { tier: "standard" } };
    const signals = { sensitive: false } as RouterSignals;
    expect(explainRuleMiss(rule, signals, "primary")).toBe("not sensitive");
    applyAppLocale("ko");
    expect(explainRuleMiss(rule, signals, "primary")).toBe("민감하지 않음");
    expect(describeRuleConditions(rule)).toEqual(["민감함"]);
    expect(rule.id).toBe("test-rule");
  });
  test("evaluates validation and version guidance in the current locale", () => {
    const english = HttpsBaseUrlSchema.safeParse("http://example.org");
    expect(english.success).toBe(false);
    if (!english.success) expect(english.error.issues[0]?.message).toContain("HTTPS base URL");
    applyAppLocale("ko");
    const korean = HttpsBaseUrlSchema.safeParse("http://example.org");
    if (korean.success) throw new Error("An HTTP endpoint unexpectedly passed validation");
    expect(korean.error.issues[0]?.message).toContain("HTTPS 기본 URL");
    expect(getCodexModelUpdateGuidance()).toContain("Codex를 업데이트");
    expect(formatCursorEffortLabel("low")).toBe("낮음");
    const now = Date.parse("2026-10-05T00:00:00Z");
    expect(quotaResetCountdown(now / 1000 + 3660, now)).toBe("1시간 1분 후 초기화");
  });

});
