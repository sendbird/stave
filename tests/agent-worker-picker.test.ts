import { describe, expect, test } from "bun:test";
import {
  buildWorkerAgentPatch,
  buildWorkerPresetPatch,
} from "@/components/ai-elements/prompt-input-worker-mode.utils";
import { duplicateAgent } from "@/lib/agents/library";
import { agentWorkerConfig } from "@/lib/agents/runtime-options";
import { getBuiltinAgent } from "@/lib/agents/starters";
import {
  buildWorkerRuntimeIntent,
  normalizeWorkerProviderConfig,
  resolveWorkerArmState,
} from "@/lib/providers/worker-mode";

const reviewerCopy = () => ({
  ...duplicateAgent(getBuiltinAgent("reviewer")!, []),
  id: "strict-reviewer",
  name: "Strict reviewer",
  instructions: "Review only the diff. Name each defect with a file and line.",
});

describe("a custom agent as the Worker", () => {
  test("its copy replaces the preset text and is what the turn sends", () => {
    const config = agentWorkerConfig(reviewerCopy(), "claude-code");
    expect(config).not.toBeNull();
    const overrides = buildWorkerAgentPatch({ providerId: "claude-code", config: config! });
    const arm = resolveWorkerArmState({ providerId: "claude-code", overrides });
    expect(arm.enabled).toBe(true);
    expect(arm.config).toMatchObject({ agentConfigId: "strict-reviewer", agentName: "Strict reviewer" });
    const intent = buildWorkerRuntimeIntent(arm)!;
    expect(intent.instructions).toContain("Review only the diff.");
    // The agent's id stays in the draft; it never crosses into the turn.
    expect(JSON.stringify(intent)).not.toContain("strict-reviewer");
  });

  test("picking a preset afterwards clears the agent and its copy", () => {
    const withAgent = buildWorkerAgentPatch({ providerId: "codex", config: agentWorkerConfig(reviewerCopy(), "codex")! });
    const back = buildWorkerPresetPatch({ overrides: withAgent, providerId: "codex", presetId: "scout" });
    const config = back.workerConfigByProvider?.codex;
    expect(config?.presetId).toBe("scout");
    expect(config?.agentConfigId).toBeUndefined();
    expect(config?.instructions).toBeUndefined();
  });

  test("an agent that is not a Worker is not offered, and preset users see no change", () => {
    const mainOnly = { ...reviewerCopy(), usableAs: ["primary" as const] };
    expect(agentWorkerConfig(mainOnly, "claude-code")).toBeNull();
    // A stored config without an agent normalizes exactly as before.
    expect(normalizeWorkerProviderConfig({ presetId: "scout", model: "auto" })).toEqual({
      presetId: "scout",
      model: "auto",
      effort: "auto",
    });
    // An id without a name is dropped rather than shown as an unnamed agent.
    expect(normalizeWorkerProviderConfig({ presetId: "scout", agentConfigId: "x" }).agentConfigId).toBeUndefined();
  });
});
