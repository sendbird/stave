import { describe, expect, test } from "bun:test";
import { ChatMessageSchema, readLegacyAgentRunPromptKey } from "../src/lib/task-context/schemas";

const row = {
  id: "run-prompt-1",
  role: "user",
  model: "user",
  providerId: "user",
  content: "## Assignment\n\nAdd CSV export.",
  parts: [{ type: "text", text: "## Assignment\n\nAdd CSV export." }],
};

describe("temporary migration: agent-run-prompt-provenance", () => {
  test("a message saved with the old missionId key still marks its run's prompt", () => {
    const parsed = ChatMessageSchema.parse({ ...row, agentRunPrompt: { missionId: "run-1", assignment: "Add CSV export." } });
    expect(parsed.agentRunPrompt).toEqual({ agentRunId: "run-1", assignment: "Add CSV export." });
  });

  test("reading is idempotent and leaves the new key alone", () => {
    const once = readLegacyAgentRunPromptKey({ missionId: "run-1", assignment: null });
    expect(once).toEqual({ agentRunId: "run-1", assignment: null });
    expect(readLegacyAgentRunPromptKey(once)).toEqual(once);
    const current = { agentRunId: "run-2", assignment: null };
    expect(readLegacyAgentRunPromptKey(current)).toBe(current);
    expect(readLegacyAgentRunPromptKey(undefined)).toBeUndefined();
  });

  test("an old mark that is malformed still drops to undefined", () => {
    const parsed = ChatMessageSchema.parse({ ...row, agentRunPrompt: { missionId: "", assignment: 4 } });
    expect(parsed.agentRunPrompt).toBeUndefined();
  });
});
