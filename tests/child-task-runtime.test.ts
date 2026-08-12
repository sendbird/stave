import { describe, expect, test } from "bun:test";

import { buildChildTaskRuntimeOptions } from "../src/lib/runs/child-task-runtime";

describe("child task runtime effort", () => {
  test("omitted effort keeps the automation default", () => {
    expect(
      buildChildTaskRuntimeOptions({
        providerId: "claude-code",
        permissionProfile: "guided",
      }).claudeEffort,
    ).toBe("medium");
    expect(
      buildChildTaskRuntimeOptions({
        providerId: "codex",
        permissionProfile: "guided",
      }).codexReasoningEffort,
    ).toBe("medium");
  });

  test("an explicit effort reaches the child's runtime options", () => {
    expect(
      buildChildTaskRuntimeOptions({
        providerId: "claude-code",
        model: "claude-fable-5-20260620",
        effort: "xhigh",
        permissionProfile: "auto",
      }).claudeEffort,
    ).toBe("xhigh");
    expect(
      buildChildTaskRuntimeOptions({
        providerId: "codex",
        model: "gpt-5.6-sol",
        effort: "ultra",
        permissionProfile: "auto",
      }).codexReasoningEffort,
    ).toBe("ultra");
  });

  test("effort is clamped to what the provider and model accept", () => {
    // Claude has no "ultra" tier: the nearest tier below is "max".
    expect(
      buildChildTaskRuntimeOptions({
        providerId: "claude-code",
        effort: "ultra",
        permissionProfile: "guided",
      }).claudeEffort,
    ).toBe("max");
    // Luna is the GPT-5.6 variant that rejects "ultra": step down to "max"
    // rather than silently reverting to the default tier.
    expect(
      buildChildTaskRuntimeOptions({
        providerId: "codex",
        model: "gpt-5.6-luna",
        effort: "ultra",
        permissionProfile: "guided",
      }).codexReasoningEffort,
    ).toBe("max");
    // GPT-5.5 tops out at "xhigh".
    expect(
      buildChildTaskRuntimeOptions({
        providerId: "codex",
        model: "gpt-5.5",
        effort: "max",
        permissionProfile: "guided",
      }).codexReasoningEffort,
    ).toBe("xhigh");
  });
});
