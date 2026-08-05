import { describe, expect, test } from "bun:test";
import { parseSubagentToolInput } from "@/components/ai-elements/subagent";
import { isSubagentToolPart } from "@/components/session/chat-panel.utils";

describe("parseSubagentToolInput", () => {
  test("extracts subagent metadata from Agent tool input json", () => {
    const parsed = parseSubagentToolInput({
      input: JSON.stringify({
        subagent_type: "Explore",
        description: "Inspect tool rendering",
        prompt: "Look through the message pipeline.",
      }),
    });

    expect(parsed.subagentType).toBe("Explore");
    expect(parsed.description).toBe("Inspect tool rendering");
    expect(parsed.prompt).toBe("Look through the message pipeline.");
  });

  test("falls back to raw input for malformed json", () => {
    const raw = "{ definitely not json";
    const parsed = parseSubagentToolInput({ input: raw });

    expect(parsed.subagentType).toBeNull();
    expect(parsed.description).toBeNull();
    expect(parsed.prompt).toBeNull();
    expect(parsed.raw).toBe(raw);
  });

  test("extracts native Codex spawn metadata", () => {
    const parsed = parseSubagentToolInput({
      input: JSON.stringify({
        task_name: "apply_patch",
        message: "Implement and verify the requested patch.",
      }),
    });

    expect(parsed.subagentType).toBe("apply_patch");
    expect(parsed.description).toBe("apply_patch");
    expect(parsed.prompt).toBe("Implement and verify the requested patch.");
  });

  test("recognizes native Codex collaboration spawn tools", () => {
    expect(isSubagentToolPart({ toolName: "collaboration:spawn_agent" })).toBe(true);
    expect(
      isSubagentToolPart({ toolName: "functions:collaboration.spawn_agent" }),
    ).toBe(true);
  });
});
