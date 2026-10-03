import { describe, expect, test } from "bun:test";
import { MISSION_CONTEXT_SOURCE_ID } from "@/lib/missions/briefing";
import { PROJECT_CONTEXT_SOURCE_ID } from "@/lib/projects/briefing";
import {
  TURN_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS,
  withoutTurnScopedContexts,
} from "@/lib/task-context/turn-scoped-context";

describe("turn-scoped retrieved context", () => {
  test("covers the parts Stave attaches to the turns it starts", () => {
    expect(TURN_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS.has(MISSION_CONTEXT_SOURCE_ID)).toBe(true);
    expect(TURN_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS.has(PROJECT_CONTEXT_SOURCE_ID)).toBe(true);
  });

  test("keeps durable sources and drops turn-scoped ones", () => {
    const parts = [
      { sourceId: "crane:CRANE-1" },
      { sourceId: MISSION_CONTEXT_SOURCE_ID },
      { sourceId: "pr:https://example.test/pr/1" },
      { sourceId: "stave:wake-up" },
    ];
    expect(withoutTurnScopedContexts(parts).map((part) => part.sourceId)).toEqual([
      "crane:CRANE-1",
      "pr:https://example.test/pr/1",
    ]);
  });
});
