import { describe, expect, test } from "bun:test";
import { DEFAULT_AUXILIARY_INFERENCE_POLICY } from "../src/lib/providers/auxiliary-inference-policy";
import { defaultSettings } from "../src/store/app-settings";
import { buildUtilityInferenceContext } from "../src/store/provider-runtime-options";

function contextFor(settings: Partial<typeof defaultSettings>) {
  return buildUtilityInferenceContext({
    provider: "claude-code",
    model: "claude-sonnet-5",
    settings: { ...defaultSettings, ...settings },
  });
}

describe("utility inference context follows Background AI", () => {
  test("a utility model on auto leaves the runner order on Auto", () => {
    const context = contextFor({});
    expect(context.utilityProviderId).toBe("auto");
    expect(context.utilityModel).toBe("claude-haiku-5-5");
  });

  test("the shared default provider and model reach the main-process runner", () => {
    const context = contextFor({
      auxiliaryInferenceDefault: { providerId: "codex", model: "gpt-5.6-luna" },
    });
    expect(context.utilityProviderId).toBe("codex");
    expect(context.utilityModel).toBe("gpt-5.6-luna");
  });

  test("the utility lane's override wins over the shared default", () => {
    const context = contextFor({
      auxiliaryInferenceDefault: { providerId: "codex", model: "gpt-5.6-luna" },
      auxiliaryInferencePolicy: {
        ...DEFAULT_AUXILIARY_INFERENCE_POLICY,
        utility: { enabled: true, providerId: "claude-code", maxProviderAttempts: 2 },
      },
    });
    expect(context.utilityProviderId).toBe("claude-code");
    expect(context.utilityModel).toBe("claude-haiku-5-5");
  });
});
