import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "../src/i18n";
import { emptyUsageMetrics, type UsageMetrics, type UsageStatisticsReport } from "../src/lib/providers/usage-statistics";
import { deltaPercentParts, previousUsageRange, usageDelta, usageShare } from "../src/components/usage/usage-compare";
import { pickUsageRangeDay, usagePeriodPresets, usageRange, usageRangeDayCount } from "../src/components/usage/usage-view.utils";
import { nextChartIndex, UsageBreakdowns, UsageFigures, UsageTimeline } from "../src/components/usage/UsageParts";

const metrics = (patch: Partial<UsageMetrics>): UsageMetrics => ({ ...emptyUsageMetrics(), ...patch });
const tokens = (value: number, extra: Partial<UsageMetrics> = {}) => metrics({ turns: 4, measuredTurns: 4, tokens: value, ...extra });
const readTokens = (row: UsageMetrics) => row.tokens;

describe("previous period", () => {
  test("is the same number of calendar days, ending where the period starts", () => {
    const now = new Date("2026-10-04T09:00:00Z");
    const thirty = usageRange({ period: "30", start: "", end: "", utc: true, now })!;
    expect(previousUsageRange(thirty, true)).toEqual({ from: "2026-08-06T00:00:00.000Z", to: thirty.from });
    const today = usageRange({ period: "today", start: "", end: "", utc: true, now })!;
    expect(previousUsageRange(today, true)).toEqual({ from: "2026-10-03T00:00:00.000Z", to: "2026-10-04T00:00:00.000Z" });
    // This month so far (4 days) compares with the 4 days before it, not the whole previous month.
    const month = usageRange({ period: "month", start: "", end: "", utc: true, now })!;
    expect(previousUsageRange(month, true)).toEqual({ from: "2026-09-27T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" });
  });
});

describe("delta", () => {
  test("up and down carry the earlier value and the change over it", () => {
    expect(usageDelta({ current: tokens(118), previous: tokens(100), measurement: "tokens", read: readTokens })).toEqual({ kind: "up", previous: 100, ratio: 0.18 });
    expect(usageDelta({ current: tokens(94), previous: tokens(100), measurement: "tokens", read: readTokens })).toEqual({ kind: "down", previous: 100, ratio: 0.06 });
    expect(usageDelta({ current: tokens(100), previous: tokens(100), measurement: "tokens", read: readTokens })).toEqual({ kind: "same", previous: 100 });
  });

  test("a zero earlier value moves without a percentage", () => {
    expect(usageDelta({ current: tokens(5), previous: tokens(0), measurement: "tokens", read: readTokens })).toEqual({ kind: "up", previous: 0, ratio: null });
  });

  test("an unmeasured period is not compared, whichever side it is on", () => {
    expect(usageDelta({ current: tokens(5), previous: emptyUsageMetrics(), measurement: "tokens", read: readTokens }))
      .toEqual({ kind: "not-compared", reason: "no-earlier-turns" });
    expect(usageDelta({ current: tokens(5), previous: metrics({ turns: 3, measuredTurns: 0 }), measurement: "tokens", read: readTokens }))
      .toEqual({ kind: "not-compared", reason: "earlier-not-reported" });
    expect(usageDelta({ current: metrics({ turns: 2, measuredTurns: 0 }), previous: tokens(5), measurement: "tokens", read: readTokens }))
      .toEqual({ kind: "not-compared", reason: "not-reported" });
    // Cost is measured by its own counter: tokens reported without a cost are not a $0 period.
    expect(usageDelta({ current: tokens(5, { costUsd: 2, costReportedTurns: 1 }), previous: tokens(9), measurement: "cost", read: (row) => row.costUsd ?? 0 }))
      .toEqual({ kind: "not-compared", reason: "earlier-not-reported" });
  });

  test("a change that rounds to nothing still reads as under one percent", () => {
    expect(deltaPercentParts(0.18)).toEqual({ lessThanOne: false, percent: 18 });
    expect(deltaPercentParts(0.004)).toEqual({ lessThanOne: true, percent: 1 });
  });

  test("a share needs a measured row and a total", () => {
    expect(usageShare(31, 100, true)).toBe(0.31);
    expect(usageShare(31, 100, false)).toBeNull();
    expect(usageShare(5, 0, true)).toBeNull();
  });
});

describe("range presets and picking", () => {
  test("presets are the Period menu's fixed periods, in its order, as inclusive dates", () => {
    applyAppLocale("en");
    const presets = usagePeriodPresets(new Date("2026-10-04T09:00:00Z"), true);
    expect(presets.map((preset) => preset.value)).toEqual(["today", "7", "30", "90", "month"]);
    expect(presets.map((preset) => preset.label)).toEqual(["Today", "Last 7 days", "Last 30 days", "Last 90 days", "This month"]);
    expect(presets.find((preset) => preset.value === "30")).toMatchObject({ start: "2026-09-05", end: "2026-10-04" });
    expect(presets.find((preset) => preset.value === "today")).toMatchObject({ start: "2026-10-04", end: "2026-10-04" });
    expect(presets.find((preset) => preset.value === "month")).toMatchObject({ start: "2026-10-01", end: "2026-10-04" });
  });

  test("two clicks make a range, a backwards second click swaps, a third starts again", () => {
    let range = pickUsageRangeDay({ start: "2026-09-05", end: "2026-10-04" }, "2026-09-20");
    expect(range).toEqual({ start: "2026-09-20" });
    expect(pickUsageRangeDay(range, "2026-09-25")).toEqual({ start: "2026-09-20", end: "2026-09-25" });
    range = pickUsageRangeDay(range, "2026-09-10");
    expect(range).toEqual({ start: "2026-09-10", end: "2026-09-20" });
    expect(pickUsageRangeDay({ start: "2026-09-10" }, "2026-09-10")).toEqual({ start: "2026-09-10", end: "2026-09-10" });
    expect(usageRangeDayCount({ start: "2026-09-05", end: "2026-10-04" })).toBe(30);
    expect(usageRangeDayCount({ start: "2026-09-05" })).toBeNull();
  });
});

const report = (): UsageStatisticsReport => {
  const series = Array.from({ length: 168 }, (_, index) => ({
    ...tokens(index * 10), at: `2026-10-0${1 + Math.floor(index / 24)} ${String(index % 24).padStart(2, "0")}:00 GMT`,
    providers: { "claude-code": tokens(index * 6), codex: tokens(index * 4) },
  }));
  return { totals: tokens(1000, { costUsd: 4, costReportedTurns: 2 }), previousTotals: tokens(800), series,
    accounts: [{ providerId: "claude-code", accountProfileId: "system-default", ...tokens(310) }, { providerId: "codex", accountProfileId: "system-default", ...metrics({ turns: 1 }) }],
    models: [{ providerId: "codex", modelId: "fast-model", ...tokens(690) }], knownAccounts: [], turns: [], quota: [], latestQuota: [],
    quotaHistoryTruncated: false, generatedAt: "2026-10-04T09:00:00.000Z" };
};

describe("usage chart", () => {
  test("arrows step one bar, Home and End jump, other keys are left alone", () => {
    expect(nextChartIndex("ArrowRight", 3, 10)).toBe(4);
    expect(nextChartIndex("ArrowLeft", 0, 10)).toBe(0);
    expect(nextChartIndex("ArrowRight", 9, 10)).toBe(9);
    expect(nextChartIndex("Home", 5, 10)).toBe(0);
    expect(nextChartIndex("End", 5, 10)).toBe(9);
    expect(nextChartIndex("Enter", 5, 10)).toBeNull();
    expect(nextChartIndex("ArrowRight", 0, 0)).toBeNull();
  });

  test("168 hourly bars are one tab stop, on the newest bucket, and the read-out names it", () => {
    applyAppLocale("en");
    const html = renderToStaticMarkup(createElement(UsageTimeline, { report: report(), granularity: "hour", timeZone: "UTC", onDay: () => {} }));
    expect(html.match(/data-usage-bar=/g)).toHaveLength(168);
    expect(html.match(/tabindex="0"[^>]*data-usage-bar|data-usage-bar[^>]*tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)?.length).toBeGreaterThanOrEqual(167);
    expect(html).toContain("data-usage-chart-readout");
    expect(html).toContain("2026-10-07 23:00 GMT");
    expect(html).toContain("Enter shows exact buckets");
    // No browser tooltip carries the value any more; the read-out and the bar's name do.
    expect(html).not.toMatch(/data-usage-bar="[^"]*"[^>]*title=/);
  });
});

describe("usage figures and shares", () => {
  test("each figure says how it moved against the earlier period, never by color alone", () => {
    applyAppLocale("en");
    const html = renderToStaticMarkup(createElement(UsageFigures, { totals: report().totals, previousTotals: tokens(800),
      previous: { from: "2026-09-27T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }, timeZone: "UTC" }));
    expect(html).toContain("↑25%");
    expect(html).toContain("Up 25% vs Sep 27");
    // The earlier period reported no cost: cost is not compared.
    expect(html).toContain("Not compared · Sep 27 – 30 not reported");
  });

  test("no comparison is drawn when the earlier period was not read", () => {
    const html = renderToStaticMarkup(createElement(UsageFigures, { totals: report().totals }));
    expect(html).not.toContain("data-usage-delta");
  });

  test("account and model rows show their share of measured tokens as a meter and a percent", () => {
    applyAppLocale("en");
    const html = renderToStaticMarkup(createElement(UsageBreakdowns, { report: report(), profiles: [], onAccount: () => {}, onModel: () => {} }));
    expect(html.match(/<th[^>]*>Share<\/th>/g)).toHaveLength(2);
    expect(html.match(/role="meter"/g)).toHaveLength(2);
    expect(html).toContain('aria-valuetext="31%"');
    expect(html).toContain('aria-valuetext="69%"');
    // The unmeasured row reads as a dash, not 0%.
    expect(html).not.toContain('aria-valuetext="0%"');
  });
});
