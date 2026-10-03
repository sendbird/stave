import { describe, expect, test } from "bun:test";
import { AGENT_RUN_CONTEXT_SOURCE_ID } from "@/lib/agent-runs/briefing";
import {
  TURN_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS,
  withoutTurnScopedContexts,
} from "@/lib/task-context/turn-scoped-context";

describe("turn-scoped retrieved context", () => {
  test("covers the parts Stave attaches to the turns it starts", () => {
    expect(TURN_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS.has(AGENT_RUN_CONTEXT_SOURCE_ID)).toBe(true);
    expect(TURN_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS.has("stave:wake-up")).toBe(true);
    // Saved by retired project coordinator turns; still filtered from older tasks.
    expect(TURN_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS.has("stave:project-coordinator")).toBe(true);
    // The agent run part's id before agent runs were renamed; still filtered from older tasks.
    expect(TURN_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS.has("stave:mission")).toBe(true);
  });

  test("keeps durable sources and drops turn-scoped ones", () => {
    const parts = [
      { sourceId: "crane:CRANE-1" },
      { sourceId: AGENT_RUN_CONTEXT_SOURCE_ID },
      { sourceId: "pr:https://example.test/pr/1" },
      { sourceId: "stave:wake-up" },
    ];
    expect(withoutTurnScopedContexts(parts).map((part) => part.sourceId)).toEqual([
      "crane:CRANE-1",
      "pr:https://example.test/pr/1",
    ]);
  });
});
