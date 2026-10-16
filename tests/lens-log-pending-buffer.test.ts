import { describe, expect, test } from "bun:test";
import {
  LENS_LOG_LIMIT,
  appendPendingEntriesLimited,
} from "@/lib/lens/lens-log-format";

type Entry = { id: string; value: number };
const getId = (entry: Entry) => entry.id;

describe("appendPendingEntriesLimited", () => {
  test("keeps every entry while the buffer is small", () => {
    const pending = appendPendingEntriesLimited<Entry>(
      [{ id: "a", value: 1 }],
      [
        { id: "a", value: 2 },
        { id: "b", value: 1 },
      ],
      getId,
    );
    expect(pending).toEqual([
      { id: "a", value: 1 },
      { id: "a", value: 2 },
      { id: "b", value: 1 },
    ]);
  });

  test("stays bounded when frames never flush", () => {
    let pending: Entry[] = [];
    const total = LENS_LOG_LIMIT * 50;
    for (let index = 0; index < total; index += 1) {
      pending = appendPendingEntriesLimited(
        pending,
        [{ id: `entry-${index}`, value: index }],
        getId,
      );
      expect(pending.length).toBeLessThanOrEqual(LENS_LOG_LIMIT * 2);
    }
    expect(pending.at(-1)).toEqual({
      id: `entry-${total - 1}`,
      value: total - 1,
    });
  });

  test("merges repeated ids to their latest value when compacting", () => {
    let pending: Entry[] = [];
    for (let index = 0; index <= LENS_LOG_LIMIT * 2; index += 1) {
      pending = appendPendingEntriesLimited(
        pending,
        [{ id: index > 10 && index % 2 === 1 ? "request" : `other-${index}`, value: index }],
        getId,
      );
    }
    expect(pending.length).toBeLessThanOrEqual(LENS_LOG_LIMIT);
    expect(pending.filter((entry) => entry.id === "request")).toEqual([
      { id: "request", value: LENS_LOG_LIMIT * 2 - 1 },
    ]);
    expect(new Set(pending.map(getId)).size).toBe(pending.length);
  });
});
