import { afterAll, describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "../src/i18n";
import { splitTarsTranscriptDays, tarsDaysAgo, tarsLocalDayKey } from "../src/lib/tars/transcript-layout";
import { layoutTarsTranscript, tarsClockLabel, tarsDayLabel } from "../src/components/tars/TarsTranscriptLayout";
import { TarsRecordList, TarsRecordOpenWorkContext, TarsRecordRow, TarsWorkChip } from "../src/components/tars/TarsRecord";
import { TarsActionRecordLine } from "../src/components/tars/TarsActionRecordLine";
import { TarsReceiptRow } from "../src/components/tars/TarsReceiptRow";
import type { TarsActionReceipt, TarsActionRecord } from "../src/lib/tars/conversation";

/** A local wall-clock instant, so day breaks follow the machine's own midnight as they do in the app. */
const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();

afterAll(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });

describe("transcript days and times", () => {
  test("entries split on local midnight", () => {
    const entries = [local(8, 23, 50), local(8, 23, 58), local(9, 0, 5), local(9, 9, 0)].map((at, index) => ({ at, id: `e${index}` }));
    const days = splitTarsTranscriptDays(entries);
    expect(days.map((day) => day.key)).toEqual([tarsLocalDayKey(local(8, 12)), tarsLocalDayKey(local(9, 12))]);
    expect(days.map((day) => day.entries.map((entry) => entry.id))).toEqual([["e0", "e1"], ["e2", "e3"]]);
    expect(splitTarsTranscriptDays([])).toEqual([]);
  });

  test("days are counted on the calendar, not in 24-hour spans", () => {
    expect(tarsDaysAgo(local(10, 0, 1), local(10, 23, 59))).toBe(0);
    expect(tarsDaysAgo(local(9, 23, 59), local(10, 0, 1))).toBe(1);
    expect(tarsDaysAgo(local(4, 12), local(10, 9))).toBe(6);
  });

  test("day labels read Today, Yesterday, then the date, and times are the clock alone, in both languages", async () => {
    const now = Date.parse(local(10, 16));
    applyAppLocale("en"); await i18n.changeLanguage("en");
    expect(tarsDayLabel(local(10, 9), now)).toBe("Today");
    expect(tarsDayLabel(local(9, 9), now)).toBe("Yesterday");
    expect(tarsDayLabel(local(4, 9), now)).toBe("Wed, Nov 4");
    expect(tarsClockLabel(local(9, 14, 32))).toBe("2:32 PM");
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    expect(tarsDayLabel(local(10, 9), now)).toBe("오늘");
    expect(tarsDayLabel(local(9, 9), now)).toBe("어제");
    expect(tarsDayLabel(local(4, 9), now)).toBe("11월 4일 (수)");
    expect(tarsClockLabel(local(9, 14, 32))).toBe("오후 2:32");
    applyAppLocale("en"); await i18n.changeLanguage("en");
  });

  test("a thin day rule starts each day, and ends a run of records so a record list never spans midnight", () => {
    const row = (id: string) => ({ record: <TarsRecordRow key={id} state="applied" lead={id} /> });
    const entries = [
      { id: "m1", at: local(9, 9), node: <p key="m1">first</p> as ReactNode },
      { id: "r1", at: local(9, 9, 1), node: row("r1") }, { id: "r2", at: local(9, 9, 2), node: row("r2") },
      { id: "r3", at: local(10, 9, 2), node: row("r3") },
      { id: "m2", at: local(10, 9, 3), node: <p key="m2">second</p> as ReactNode },
    ];
    const html = renderToStaticMarkup(<>{layoutTarsTranscript(entries)}</>);
    expect(html.match(/data-tars-day-separator="rule"/g)).toHaveLength(2);
    expect(html.match(/data-tars-records=""/g)).toHaveLength(2);
    expect(html).not.toMatch(/data-tars-run-time|data-tars-record-style|data-tars-day-separator="pill"/);
  });
});

describe("records on the rail", () => {
  test("a run joins its marks with one rail and shows its first time; later times wait for hover", () => {
    const html = renderToStaticMarkup(createElement(TarsRecordList, { children: [
      createElement(TarsRecordRow, { key: "a", state: "applied", lead: "Pause", at: local(10, 9) }),
      createElement(TarsRecordRow, { key: "b", state: "refused", lead: "Resume", at: local(10, 9, 1) }),
      createElement(TarsRecordRow, { key: "c", state: "running", lead: "Hand back", at: local(10, 9, 2) }),
    ] }));
    // N rows draw N-1 joins: each row but the first has a segment above, each but the last one below.
    expect(html.match(/aria-hidden="true" class="[^"]*"><\/span>/g)).toHaveLength(4);
    expect(html.match(/data-tars-record-time=""/g)).toHaveLength(3);
  });

  const record = (source: TarsActionRecord["source"], extra: Partial<TarsActionRecord> = {}): TarsActionRecord => ({
    requestId: "r1", source, requestHash: "a".repeat(64), status: "applied", reason: null, error: null, revision: 2,
    action: { kind: "control", responsibilityId: "w1", operation: "pause", expectedRevision: 1 },
    createdAt: local(10, 9), updatedAt: local(10, 9), ...extra,
  } as TarsActionRecord);

  test("a direct control names its actor in a sentence, never a bare source word", () => {
    for (const [source, hint] of [["click", "You did this in Tars"], ["fleet", "You did this in Fleet"], ["task", "You did this in the task view"],
      ["words", "You answered in the conversation"]] as const) {
      const html = renderToStaticMarkup(<TarsActionRecordLine record={record(source)} title="Fix the upload" />);
      expect(html).toContain(`data-tars-record-actor="you"`);
      expect(html).toContain(`aria-label="${hint}"`);
      expect(html).not.toMatch(/>(click|key|words|Fleet|task view|drag)</);
    }
  });

  test("an action Tars took carries Tars's mark, not the user's", () => {
    const receipt = {
      messageId: "m1", actionIndex: 0, status: "applied", responsibilityId: "w1", error: null, reason: null,
      action: { kind: "control", responsibilityId: "w1", operation: "pause", expectedRevision: 1 },
      createdAt: local(10, 9), updatedAt: local(10, 9),
    } as unknown as TarsActionReceipt;
    const html = renderToStaticMarkup(<TarsReceiptRow receipt={receipt} titleOf={() => "Fix the upload"} />);
    expect(html).toContain(`data-tars-record-actor="tars"`);
    expect(html).toContain('aria-label="Tars did this from your message"');
    expect(html).not.toContain(`data-tars-record-actor="you"`);
  });

  test("a work chip is a button only where the work can be opened; elsewhere it is a plain value", () => {
    const plain = renderToStaticMarkup(<TarsWorkChip title="Fix the upload" responsibilityId="w1" />);
    expect(plain).not.toContain("<button");
    expect(plain).toContain("data-tars-record-work");
    const opened: string[] = [];
    const clickable = renderToStaticMarkup(<TarsRecordOpenWorkContext value={(id) => opened.push(id)}><TarsWorkChip title="Fix the upload" responsibilityId="w1" /></TarsRecordOpenWorkContext>);
    expect(clickable).toMatch(/<button type="button"[^>]*data-tars-record-open="w1"[^>]*aria-label="Open Fix the upload"/);
    // A record's priority is a value chip, not text in a meta run.
    const moved = renderToStaticMarkup(<TarsActionRecordLine title="Fix the upload" record={record("drag", {
      action: { kind: "move", responsibilityId: "w1", expectedRevision: 1, move: { direction: "earlier" } }, priority: 70 })} />);
    expect(moved).toMatch(/data-tars-record-priority-value=""[^>]*>.*Priority 70/);
  });
});
