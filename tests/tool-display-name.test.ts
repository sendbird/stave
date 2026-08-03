import { describe, expect, test } from "bun:test";
import { toToolDisplayName } from "@/lib/tool-display-name";

describe("toToolDisplayName", () => {
  test("turns Stave Lens identifiers into action-oriented labels", () => {
    expect(toToolDisplayName("stave-local:stave_lens_evaluate")).toBe(
      "Check page state",
    );
    expect(toToolDisplayName("mcp__stave-local-mcp__stave_lens_screenshot")).toBe(
      "Capture screen",
    );
    expect(toToolDisplayName("stave_lens_navigate")).toBe("Open page");
  });

  test("also recognizes the already-formatted MCP namespace", () => {
    expect(toToolDisplayName("stave local:stave lens evaluate")).toBe(
      "Check page state",
    );
  });

  test("does not reinterpret external MCP names", () => {
    expect(toToolDisplayName("mcp__github__get_file_contents")).toBe(
      "mcp__github__get_file_contents",
    );
    expect(toToolDisplayName("mcp__github__stave_issue")).toBe(
      "mcp__github__stave_issue",
    );
    expect(toToolDisplayName("collaboration.spawn_agent")).toBe(
      "collaboration.spawn_agent",
    );
  });

  test("keeps empty and ordinary tool names readable", () => {
    expect(toToolDisplayName("")).toBe("Tool");
    expect(toToolDisplayName("Bash")).toBe("Bash");
    expect(toToolDisplayName("tool:custom_action")).toBe("tool:custom_action");
  });
});
