import { afterEach, expect, test } from "bun:test";
import { applyRuntimeLocale } from "@/i18n/runtime";
import { formatProviderErrorDisplay } from "@/lib/providers/error-display";
import { isUsageLimitErrorText } from "@/lib/providers/usage-limit-stop";
import { parseProviderErrorNotice } from "@/lib/providers/provider-error-recovery";
import { formatSystemEventDisplay } from "@/components/session/system-event-display";
import { toCodexUserFacingErrorMessage } from "../electron/providers/codex-app-server-errors";

afterEach(() => applyRuntimeLocale("en"));

test("Korean error presentation preserves canonical usage-limit and recovery classification", () => {
  const raw = toCodexUserFacingErrorMessage({ message: "usage_limit_exceeded" });
  applyRuntimeLocale("ko");
  expect(toCodexUserFacingErrorMessage({ message: "usage_limit_exceeded" })).toBe(raw);
  expect(isUsageLimitErrorText(raw)).toBe(true);
  expect(formatProviderErrorDisplay(raw)).toContain("사용량 한도에 도달");
  const notice = parseProviderErrorNotice("[error] model is overloaded\nRetry later, or choose another model before resuming.");
  expect(notice?.capacityFailure).toBe(true);
  expect(formatProviderErrorDisplay(notice!.guidance)).toContain("나중에 다시 시도");
  expect(formatProviderErrorDisplay("provider original output: user model name")).toBe("provider original output: user model name");
});

test("known Claude limits and system wrappers translate whole messages without rewriting provider content", () => {
  applyRuntimeLocale("ko");
  expect(formatProviderErrorDisplay("Rate limit reached (5-hour limit). Resets at unknown. Extra usage credits are also exhausted.")).toBe("5시간 한도에 도달했습니다. 알 수 없는 시간에 초기화됩니다. 추가 사용 크레딧도 모두 소진되었습니다.");
  expect(formatProviderErrorDisplay("Approaching weekly Opus limit (95% used). Consider pacing requests. Extra usage credits are covering the overflow.")).toBe("Opus 주간 한도에 가까워지고 있습니다(95% 사용). 요청 간격을 늘려 주세요. 초과 사용량은 추가 사용 크레딧으로 처리하고 있습니다.");
  expect(formatSystemEventDisplay("Compacting conversation context…")).not.toContain("Compacting");
  expect(formatSystemEventDisplay("Sending request to model…")).toBe("모델에 요청 보내는 중…");
  expect(formatSystemEventDisplay("Subagent progress: provider original summary")).toBe("하위 에이전트 진행 상황: provider original summary");
  expect(formatSystemEventDisplay("Plugin install failed: user-plugin — provider error")).toBe("플러그인 설치 실패: user-plugin — provider error");
});
