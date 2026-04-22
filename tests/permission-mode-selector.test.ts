import { describe, expect, test } from "bun:test";
import { cyclePermissionMode, getPermissionModeOptions } from "../src/components/ai-elements/permission-mode-selector";

describe("Codex permission mode options", () => {
  test("lists the supported approval policies", () => {
    expect(getPermissionModeOptions("codex").map((option) => option.value)).toEqual([
      "untrusted",
      "on-request",
      "never",
    ]);
  });

  test("cycles through untrusted to on-request", () => {
    expect(cyclePermissionMode({ providerId: "codex", current: "untrusted" })).toBe("on-request");
  });
});

describe("Claude permission mode options", () => {
  test("lists all supported permission modes including auto", () => {
    expect(getPermissionModeOptions("claude-code").map((option) => option.value)).toEqual([
      "default",
      "acceptEdits",
      "bypassPermissions",
      "plan",
      "dontAsk",
      "auto",
    ]);
  });

  test("cycles through dontAsk to auto", () => {
    expect(cyclePermissionMode({ providerId: "claude-code", current: "dontAsk" })).toBe("auto");
  });

  test("cycles through auto back to default", () => {
    expect(cyclePermissionMode({ providerId: "claude-code", current: "auto" })).toBe("default");
  });
});
