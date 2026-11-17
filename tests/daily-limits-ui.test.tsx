import { afterEach, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyLimitSettingsLink, DailyUsageRows } from "../src/components/usage/DailyLimits";
import { openDailyLimitSettings } from "../src/lib/usage/daily-limit-navigation";
import { applyAppLocale } from "../src/i18n";
import type { DailyUsageReport } from "../src/lib/usage/daily-limit";

afterEach(() => applyAppLocale("en"));
const report: DailyUsageReport = {
  from: "2026-11-12T00:00:00.000Z", to: "2026-11-13T00:00:00.000Z",
  providers: [{ providerId: "codex", limit: { unit: "tokens", amount: 12345 }, tokens: 12345,
    costUsd: null, costAvailable: false, costReportedTurns: 0, turns: 2, reached: true }],
};

test("daily usage renders exact usage against the limit, the reached reason and an accessible settings editor in EN and KO", () => {
  for (const locale of ["en", "ko"] as const) {
    applyAppLocale(locale);
    const html = renderToStaticMarkup(<DailyUsageRows report={report} editable />);
    expect(html).toContain("12,345 / 12,345");
    expect(html).toContain('value="12345"');
    expect(html).toContain(locale === "en" ? "Daily limit reached" : "일일 한도에 도달");
    expect(html).toContain(locale === "en" ? "Codex daily limit amount" : "Codex 일일 한도 값");
    expect(html).toContain('aria-valuenow="100"');
  }
});

test("off is explicit and a provider without reported cost cannot choose USD", () => {
  const html = renderToStaticMarkup(<DailyUsageRows report={{ ...report, providers: [{ ...report.providers[0]!, limit: null, reached: false }] }} editable />);
  expect(html).toContain("limit off");
  expect(html).not.toContain('role="meter"');
  expect(html).not.toContain('value="usd"');
  expect(html).toContain("Off");
});

test("small reported costs and configured USD limits retain their precision", () => {
  const html = renderToStaticMarkup(<DailyUsageRows report={{ ...report, providers: [{ ...report.providers[0]!,
    limit: { unit: "usd", amount: 0.00001 }, costUsd: 0.00001, costAvailable: true, costReportedTurns: 1 }] }} />);
  expect(html).toContain("$0.00001 / 0.00001 USD");
});

test("the translated recovery link opens Providers at the daily limit editor", () => {
  expect(renderToStaticMarkup(<DailyLimitSettingsLink />)).toContain("Change daily limit");
  const originalWindow = globalThis.window;
  const events: Event[] = [];
  try {
    globalThis.window = { dispatchEvent: (event: Event) => { events.push(event); return true; } } as unknown as Window & typeof globalThis;
    openDailyLimitSettings();
    expect((events[0] as CustomEvent).detail).toEqual({ section: "providers", focus: "daily-limits" });
  } finally { globalThis.window = originalWindow; }
});
