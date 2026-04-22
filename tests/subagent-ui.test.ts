import { describe, expect, test } from "bun:test";
import { parseSubagentToolInput } from "@/components/ai-elements/subagent";

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
});
