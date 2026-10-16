import { describe, expect, test } from "bun:test";
import {
  buildConversationDateSeparators,
  getMessageTimeEntries,
} from "@/components/session/conversation-time";

describe("conversation dates", () => {
  test("marks the first known date and each local calendar change, not every turn", () => {
    const first = new Date(2026, 0, 2, 23, 59).toISOString();
    const next = new Date(2026, 0, 3, 0, 1).toISOString();
    expect([
      ...buildConversationDateSeparators([
        { id: "legacy" },
        { id: "a", startedAt: first },
        { id: "b", startedAt: first },
        { id: "invalid", startedAt: "invalid" },
        { id: "c", startedAt: next },
      ]),
    ]).toEqual([
      ["a", first],
      ["c", next],
    ]);
  });

  test("groups offset timestamps by local day rather than their ISO prefix", () => {
    expect([
      ...buildConversationDateSeparators([
        { id: "a", startedAt: "2026-01-02T23:30:00-02:00" },
        { id: "b", startedAt: "2026-01-03T01:30:00Z" },
      ]).keys(),
    ]).toEqual(["a"]);
  });

  test("recalculates the first marker when older history is prepended", () => {
    const later = { id: "later", startedAt: "2026-01-03T12:00:00Z" };
    const earlier = { id: "earlier", startedAt: "2026-01-03T12:00:00Z" };
    expect([...buildConversationDateSeparators([later]).keys()]).toEqual([
      "later",
    ]);
    expect([
      ...buildConversationDateSeparators([earlier, later]).keys(),
    ]).toEqual(["earlier"]);
  });

  test("uses a recorded completion when the start is absent or malformed", () => {
    const value = "2024-12-31T12:00:00Z";
    expect([
      ...buildConversationDateSeparators([
        { id: "old", startedAt: "bad", completedAt: value },
      ]),
    ]).toEqual([["old", value]]);
    expect(buildConversationDateSeparators([{ id: "unknown" }]).size).toBe(0);
  });
});

describe("message timing details", () => {
  const startedAt = "2026-01-02T00:00:01Z";
  const completedAt = "2026-01-02T00:00:13Z";
  test("distinguishes sent, started and completed facts without inventing missing values", () => {
    expect(
      getMessageTimeEntries({ role: "user", startedAt, completedAt }),
    ).toEqual([{ kind: "sent", value: startedAt }]);
    expect(getMessageTimeEntries({ role: "assistant", startedAt })).toEqual([
      { kind: "started", value: startedAt },
    ]);
    expect(
      getMessageTimeEntries({ role: "assistant", startedAt, completedAt }),
    ).toEqual([
      { kind: "started", value: startedAt },
      { kind: "completed", value: completedAt },
    ]);
    expect(
      getMessageTimeEntries({
        role: "assistant",
        startedAt: "bad",
        completedAt,
      }),
    ).toEqual([{ kind: "completed", value: completedAt }]);
    expect(getMessageTimeEntries({ role: "user", startedAt: "bad" })).toEqual(
      [],
    );
  });
});
