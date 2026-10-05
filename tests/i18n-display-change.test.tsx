import { afterEach, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { i18n as sharedI18n } from "@/i18n/runtime";
import { StatusDot } from "@/components/ads/components/StatusDot";
import { Approval } from "@/components/ads/components/Approval";
import { DurationTimer } from "@/components/ads/components/DurationTimer";
import { WORK_STATE } from "@/components/ads/components/state-vocabulary";
import { agentStateLabel } from "@/components/ads/components/agent-state";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { formatElapsed, formatSpokenElapsed } from "@/components/ads/components/Thinking.parts";
import { describePlanDelta } from "@/components/ads/components/Plan.parts";
import { getSeededCompletionPhrase, getSeededCompletionPhraseKey } from "@/lib/completion-phrases";
import { buildProviderOutputTruncationDisplay, PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE } from "@/lib/truncation-visibility";

afterEach(() => applyAppLocale("en"));

test("shared helpers and renderer read the same locale after module initialization", () => {
  expect(sharedI18n).toBe(i18n);
  expect(WORK_STATE.failed.label).toBe("Failed");
  expect(agentStateLabel.running).toBe("Running");
  expect(renderToStaticMarkup(<StatusDot status="canceled" />)).toContain("Stopped");
  applyAppLocale("ko");
  expect(WORK_STATE.failed.label).toBe("실패함");
  expect(agentStateLabel.running).toBe("실행 중");
  expect(renderToStaticMarkup(<StatusDot status="canceled" />)).toContain("중지됨");
  expect(formatTaskUpdatedAt({ value: "2026-01-01T00:00:00Z", now: Date.parse("2026-01-01T00:03:00Z") })).toBe("3분 전");
});

test("Korean timer announcements use complete elapsed phrases", () => {
  applyAppLocale("ko");
  const markup = renderToStaticMarkup(<DurationTimer startedAt={0} now={3_780_000} />);
  expect(markup).toContain('aria-label="경과 시간 1시간 3분"');
});

test("translated audit attribution preserves the user-supplied React node", () => {
  applyAppLocale("ko");
  const markup = renderToStaticMarkup(<Approval title="user content" outcome={{ decision: "allowed", by: <b>user name</b> }} />);
  expect(markup).toContain("user content");
  expect(markup).toContain("user name");
  expect(markup).toContain("작성");
  expect(markup).not.toContain("{{");
});

test("status phrases keep their identity and localize full time and plan announcements", () => {
  const key = getSeededCompletionPhraseKey("message-1");
  const english = getSeededCompletionPhrase("message-1");
  expect(formatSpokenElapsed(61_000)).toBe("1 minute 1 second");
  expect(formatElapsed(124_000)).toBe("2m 04s");
  applyAppLocale("ko");
  expect(getSeededCompletionPhraseKey("message-1")).toBe(key);
  expect(getSeededCompletionPhrase("message-1")).not.toBe(english);
  expect(formatSpokenElapsed(61_000)).toBe("1분 1초");
  expect(formatElapsed(124_000)).toBe("2분 04초");
  expect(describePlanDelta(new Map(), [{ id: "user-step", name: "user title", status: "pending" }], 0, 1)).toBe("1개 단계 추가. 1개 중 0개 완료.");
  expect(buildProviderOutputTruncationDisplay(PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE)).toContain("모델 출력 한도");
  expect(PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE).toBe("Response was cut off because the model output limit was reached.");
});
