import { afterAll, describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "../src/i18n";
import {
  DEFAULT_TARS_TRANSCRIPT_LAYOUT, parseTarsTranscriptLayout, splitTarsTranscript, tarsDaysAgo, tarsLocalDayKey, TARS_RUN_GAP_MS,
} from "../src/lib/tars/transcript-layout";
import { layoutTarsTranscript, tarsClockLabel, tarsDayLabel } from "../src/components/tars/TarsTranscriptLayout";
import { TarsRecordList, TarsRecordRow } from "../src/components/tars/TarsRecord";
import { TarsRecordStyleContext } from "../src/components/tars/tars-transcript-layout-context";

/** A local wall-clock instant, so day breaks follow the machine's own midnight as they do in the app. */
const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();

afterAll(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });

describe("transcript layout options", () => {
  test("the query string picks each axis; anything else keeps what ships today", () => {
    expect(parseTarsTranscriptLayout(new URLSearchParams(""))).toEqual(DEFAULT_TARS_TRANSCRIPT_LAYOUT);
    expect(parseTarsTranscriptLayout(new URLSearchParams("recordStyle=a&timeStyle=grouped&daySeparator=pill")))
      .toEqual({ recordStyle: "quiet", timeStyle: "grouped", daySeparator: "pill" });
    expect(parseTarsTranscriptLayout(new URLSearchParams("recordStyle=B&timeStyle=run&daySeparator=rule")))
      .toEqual({ recordStyle: "card", timeStyle: "run", daySeparator: "rule" });
    expect(parseTarsTranscriptLayout(new URLSearchParams("recordStyle=c"))).toMatchObject({ recordStyle: "rail" });
    expect(parseTarsTranscriptLayout(new URLSearchParams("recordStyle=z&timeStyle=sometimes&daySeparator=yes"))).toEqual(DEFAULT_TARS_TRANSCRIPT_LAYOUT);
  });

  test("entries split on local midnight, and into runs where the gap passes the threshold", () => {
    const entries = [local(8, 23, 50), local(8, 23, 58), local(9, 0, 5), local(9, 0, 15), local(9, 0, 31), local(9, 9, 0)].map((at, index) => ({ at, id: `e${index}` }));
    const days = splitTarsTranscript(entries);
    expect(days.map((day) => day.key)).toEqual([tarsLocalDayKey(local(8, 12)), tarsLocalDayKey(local(9, 12))]);
    // 23:58 → 00:05 is seven minutes, but a run never crosses midnight; 00:15 → 00:31 is 16 minutes, past the 15-minute gap.
    expect(days.map((day) => day.runs.map((run) => run.map((entry) => entry.id)))).toEqual([[["e0", "e1"]], [["e2", "e3"], ["e4"], ["e5"]]]);
    expect(TARS_RUN_GAP_MS).toBe(15 * 60_000);
    expect(splitTarsTranscript([])).toEqual([]);
  });

  test("days are counted on the calendar, not in 24-hour spans", () => {
    expect(tarsDaysAgo(local(10, 0, 1), local(10, 23, 59))).toBe(0);
    expect(tarsDaysAgo(local(9, 23, 59), local(10, 0, 1))).toBe(1);
    expect(tarsDaysAgo(local(4, 12), local(10, 9))).toBe(6);
  });

  test("day and clock labels read Today, Yesterday, then the date, in both languages", async () => {
    const now = Date.parse(local(10, 16));
    applyAppLocale("en"); await i18n.changeLanguage("en");
    expect(tarsDayLabel(local(10, 9), now)).toBe("Today");
    expect(tarsDayLabel(local(9, 9), now)).toBe("Yesterday");
    expect(tarsDayLabel(local(4, 9), now)).toBe("Wed, Nov 4");
    expect(tarsClockLabel(local(10, 14, 32), { withDay: true, now })).toBe("2:32 PM");
    expect(tarsClockLabel(local(9, 14, 32), { withDay: true, now })).toBe("Yesterday, 2:32 PM");
    expect(tarsClockLabel(local(9, 14, 32), { withDay: false, now })).toBe("2:32 PM");
    // Older days take the locale's own date-and-time pattern ("Wed, Nov 4 at 2:32 PM" in current ICU).
    expect(tarsClockLabel(local(4, 14, 32), { withDay: true, now })).toMatch(/^Wed, Nov 4\b.*2:32\sPM$/);
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    expect(tarsDayLabel(local(10, 9), now)).toBe("오늘");
    expect(tarsDayLabel(local(9, 9), now)).toBe("어제");
    expect(tarsDayLabel(local(4, 9), now)).toBe("11월 4일 (수)");
    expect(tarsClockLabel(local(9, 14, 32), { withDay: true, now })).toBe("어제 오후 2:32");
  });

  test("the default layout leaves the transcript as it was: one record list per run of records, no breaks or times", async () => {
    applyAppLocale("en"); await i18n.changeLanguage("en");
    const row = (id: string) => ({ record: <TarsRecordRow key={id} state="applied" lead={id} /> });
    const entries = [
      { id: "m1", at: local(9, 9), node: <p key="m1">first</p> as ReactNode },
      { id: "r1", at: local(9, 9, 1), node: row("r1") }, { id: "r2", at: local(10, 9, 2), node: row("r2") },
      { id: "m2", at: local(10, 9, 3), node: <p key="m2">second</p> as ReactNode },
    ];
    const plain = renderToStaticMarkup(<>{layoutTarsTranscript(entries, DEFAULT_TARS_TRANSCRIPT_LAYOUT)}</>);
    expect(plain.match(/data-tars-records=""/g)).toHaveLength(1);
    expect(plain).not.toContain("data-tars-day-separator");
    expect(plain).not.toContain("data-tars-run-time");
    // A day break ends a run of records: the two rows now sit in two lists, one per day, each after its day's break.
    const split = renderToStaticMarkup(<>{layoutTarsTranscript(entries, { timeStyle: "grouped", daySeparator: "rule" })}</>);
    expect(split.match(/data-tars-records=""/g)).toHaveLength(2);
    expect(split.match(/data-tars-day-separator="rule"/g)).toHaveLength(2);
    expect(split.match(/data-tars-run-time="grouped"/g)).toHaveLength(2);
    const pill = renderToStaticMarkup(<>{layoutTarsTranscript(entries, { timeStyle: "run", daySeparator: "pill" })}</>);
    expect(pill.match(/<section[^>]*data-tars-day=/g)).toHaveLength(2);
    expect(pill.match(/data-tars-run-time="run"/g)).toHaveLength(2);
  });

  test("a record style reaches rows through the transcript, and an explicit variant wins", () => {
    const list = (variant?: "card") => createElement(TarsRecordList, { variant, children: [createElement(TarsRecordRow, { key: "a", state: "applied", lead: "Pause", at: local(10, 9) }),
      createElement(TarsRecordRow, { key: "b", state: "refused", lead: "Resume", at: local(10, 9, 1) })] });
    expect(renderToStaticMarkup(list())).not.toContain("data-tars-record-style");
    const rail = renderToStaticMarkup(createElement(TarsRecordStyleContext, { value: "rail", children: list() }));
    expect(rail.match(/data-tars-record-style="rail"/g)).toHaveLength(3);
    expect(rail.match(/data-tars-record-time=""/g)).toHaveLength(2);
    const card = renderToStaticMarkup(createElement(TarsRecordStyleContext, { value: "rail", children: list("card") }));
    expect(card).toContain('data-tars-record-style="card"');
    expect(card).not.toContain("data-tars-record-time");
  });
});
