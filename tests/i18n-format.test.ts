import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import {
  formatCost,
  formatDuration,
  formatElapsed,
  formatRelativeTimeShort,
  formatTokenCount,
} from "@/i18n/format";

afterEach(() => {
  applyAppLocale("en");
});

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatDuration", () => {
  test("reads two units by default and counts down to the unit shown", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(999)).toBe("0s");
    expect(formatDuration(45 * SECOND)).toBe("45s");
    // A live clock never reads ahead: 59.9s is still 59s, not 1m.
    expect(formatDuration(59_900)).toBe("59s");
    expect(formatDuration(MINUTE)).toBe("1m");
    expect(formatDuration(MINUTE + 4 * SECOND)).toBe("1m 4s");
    expect(formatDuration(HOUR)).toBe("1h");
    expect(formatDuration(HOUR + 2 * MINUTE + 59 * SECOND)).toBe("1h 2m");
    expect(formatDuration(DAY + 2 * HOUR + 5 * MINUTE)).toBe("1d 2h");
    expect(formatDuration(3 * DAY)).toBe("3d");
  });

  test("one unit and tenths are options, not separate formats", () => {
    expect(formatDuration(MINUTE + 4 * SECOND, { units: 1 })).toBe("1m");
    expect(formatDuration(HOUR + 2 * MINUTE, { units: 1 })).toBe("1h");
    expect(formatDuration(400, { tenths: true })).toBe("0.4s");
    expect(formatDuration(4_250, { tenths: true })).toBe("4.2s");
    expect(formatDuration(4_000, { tenths: true })).toBe("4s");
    expect(formatDuration(12 * SECOND, { tenths: true })).toBe("12s");
  });

  test("a negative or unreadable span reads as zero", () => {
    expect(formatDuration(-5 * SECOND)).toBe("0s");
    expect(formatDuration(Number.NaN)).toBe("0s");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0s");
  });

  test("follows the display language", () => {
    applyAppLocale("ko");
    expect(formatDuration(45 * SECOND)).toBe("45초");
    expect(formatDuration(MINUTE + 4 * SECOND)).toBe("1분 4초");
    expect(formatDuration(HOUR + 2 * MINUTE)).toBe("1시간 2분");
    expect(formatDuration(DAY + 2 * HOUR)).toBe("1일 2시간");
    expect(formatDuration(400, { tenths: true })).toBe("0.4초");
  });
});

describe("formatElapsed", () => {
  test("measures from a start instant to now in the same vocabulary", () => {
    expect(formatElapsed("2026-10-22T10:00:00.000Z", "2026-10-22T10:01:04.500Z")).toBe("1m 4s");
    expect(formatElapsed(Date.parse("2026-10-22T10:00:00.000Z"), Date.parse("2026-10-22T12:30:00.000Z"))).toBe("2h 30m");
    // A clock that ran backwards does not read negative.
    expect(formatElapsed("2026-10-22T10:00:05.000Z", "2026-10-22T10:00:00.000Z")).toBe("0s");
    expect(formatElapsed("not a date", Date.now())).toBe("");
  });
});

describe("formatRelativeTimeShort", () => {
  const now = new Date("2026-10-22T12:00:00.000Z");

  test("reads short and relative within a week, then the date", () => {
    expect(formatRelativeTimeShort(now.getTime() - 10 * SECOND, now)).toBe("just now");
    expect(formatRelativeTimeShort(now.getTime() + 20 * SECOND, now)).toBe("in a moment");
    expect(formatRelativeTimeShort(now.getTime() - 2 * MINUTE, now)).toBe("2m ago");
    expect(formatRelativeTimeShort(now.getTime() + 3 * HOUR, now)).toBe("in 3h");
    expect(formatRelativeTimeShort(now.getTime() - 5 * DAY, now)).toBe("5d ago");
    expect(formatRelativeTimeShort("2026-10-10T12:00:00.000Z", now)).toBe("Oct 10");
    expect(formatRelativeTimeShort("2025-10-10T12:00:00.000Z", now)).toBe("Oct 10, 2025");
    expect(formatRelativeTimeShort("not a date", now)).toBe("");
  });

  test("follows the display language", () => {
    applyAppLocale("ko");
    expect(formatRelativeTimeShort(now.getTime() - 10 * SECOND, now)).toBe("방금");
    expect(formatRelativeTimeShort(now.getTime() - 2 * MINUTE, now)).toBe("2분 전");
    expect(formatRelativeTimeShort(now.getTime() + 3 * HOUR, now)).toBe("3시간 후");
    expect(formatRelativeTimeShort("2026-10-10T12:00:00.000Z", now)).toBe("10월 10일");
  });
});

describe("formatTokenCount", () => {
  test("keeps two or three figures and moves to the next unit when rounding reaches it", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(950)).toBe("950");
    expect(formatTokenCount(1_000)).toBe("1k");
    expect(formatTokenCount(1_234)).toBe("1.2k");
    expect(formatTokenCount(9_960)).toBe("10k");
    expect(formatTokenCount(18_234)).toBe("18k");
    expect(formatTokenCount(182_345)).toBe("182k");
    expect(formatTokenCount(999_600)).toBe("1M");
    expect(formatTokenCount(1_234_567)).toBe("1.2M");
    expect(formatTokenCount(18_234_567)).toBe("18M");
    expect(formatTokenCount(Number.NaN)).toBe("0");
    expect(formatTokenCount(-20)).toBe("0");
  });
});

describe("formatCost", () => {
  test("shows cents, and reads anything under a cent as under a cent", () => {
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.004)).toBe("<$0.01");
  });

  test("detail keeps a small amount readable", () => {
    expect(formatCost(12.5, "USD", { precision: "detail" })).toBe("$12.50");
    expect(formatCost(0.0123, "USD", { precision: "detail" })).toBe("$0.012");
    expect(formatCost(0.00123, "USD", { precision: "detail" })).toBe("$0.0012");
  });

  test("a reported currency uses its symbol; a plan unit follows the amount", () => {
    expect(formatCost(1.5, "eur")).toBe("€1.50");
    expect(formatCost(0.0541, "credits")).toBe("0.0541 credits");
    expect(formatCost(3, "credits")).toBe("3.00 credits");
  });

  test("keeps the dollar sign in Korean", () => {
    applyAppLocale("ko");
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(0.004)).toBe("<$0.01");
  });
});

describe("RelativeTime", () => {
  test("renders the shared short phrase on a time element for the instant", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { RelativeTime } = await import("@/components/system/RelativeTime");
    const now = new Date("2026-10-22T12:00:00.000Z");
    const date = new Date(now.getTime() - 2 * MINUTE);
    expect(renderToStaticMarkup(createElement(RelativeTime, { date, now }))).toContain(
      `<time dateTime="${date.toISOString()}">2m ago</time>`,
    );
    applyAppLocale("ko");
    expect(renderToStaticMarkup(createElement(RelativeTime, { date, now }))).toContain(">2분 전</time>");
  });
});
