import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WORKER_PRESET_ID,
  WORKER_AGENT_NAME,
  WORKER_AUTO_VALUE,
  WORKER_PRESETS,
  buildWorkerPrimaryInstructions,
  buildWorkerRuntimeIntent,
  canPrimaryOrchestrateWorker,
  formatWorkerRuntimeStatusValue,
  getWorkerPreset,
  isWorkerCapableModel,
  listWorkerEffortsForModel,
  listWorkerModelOptions,
  listWorkerPrimaryModels,
  normalizeWorkerConfigByProvider,
  normalizeWorkerProviderConfig,
  resolveWorkerArmState,
  resolveWorkerProfile,
  workerToolsEnforced,
  type WorkerRuntimeIntent,
} from "@/lib/providers/worker-mode";

function intent(overrides: Partial<WorkerRuntimeIntent> = {}) {
  return {
    mode: "task-executor" as const,
    presetId: DEFAULT_WORKER_PRESET_ID,
    workerModel: WORKER_AUTO_VALUE,
    workerEffort: WORKER_AUTO_VALUE,
    ...overrides,
  } satisfies WorkerRuntimeIntent;
}

describe("worker preset catalog", () => {
  test("every preset carries per-provider auto model and effort", () => {
    expect(WORKER_PRESETS.length).toBeGreaterThan(0);
    for (const preset of WORKER_PRESETS) {
      for (const providerId of ["claude-code", "codex"] as const) {
        const model = preset.autoModel[providerId];
        expect(model).toBeTruthy();
        // A preset's own default must itself be worker-capable, or `Auto` would
        // resolve straight into an unavailable state.
        expect(isWorkerCapableModel({ providerId, model })).toBe(true);
        expect(preset.autoEffort[providerId]).toBeTruthy();
      }
    }
  });

  test("preset auto effort is supported by its auto model", () => {
    for (const preset of WORKER_PRESETS) {
      for (const providerId of ["claude-code", "codex"] as const) {
        const model = preset.autoModel[providerId];
        const supported = listWorkerEffortsForModel({ providerId, model });
        if (supported.length === 0) {
          continue;
        }
        const resolution = resolveWorkerProfile({
          providerId,
          primaryModel: listWorkerPrimaryModels(providerId)[0]!,
          intent: intent({ presetId: preset.id }),
        });
        expect(resolution.status).toBe("ready");
        if (resolution.status === "ready") {
          expect(supported).toContain(resolution.profile.resolvedWorkerEffort!);
        }
      }
    }
  });

  test("unknown preset id falls back to the default preset", () => {
    expect(getWorkerPreset("nope" as never).id).toBe(DEFAULT_WORKER_PRESET_ID);
  });
});

describe("worker capability table", () => {
  test("only Sol and Terra can orchestrate on Codex", () => {
    // codex-cli 0.145.0 advertises `ultra` (auto task delegation) for these two
    // models only.
    expect(listWorkerPrimaryModels("codex")).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
    ]);
    expect(
      canPrimaryOrchestrateWorker({ providerId: "codex", model: "gpt-5.6-luna" }),
    ).toBe(false);
  });

  test("Codex cannot hard-enforce worker tools but Claude can", () => {
    expect(workerToolsEnforced("claude-code")).toBe(true);
    expect(workerToolsEnforced("codex")).toBe(false);
  });

  test("Claude Haiku exposes no selectable effort", () => {
    // The Claude API errors on `effort` for Haiku-class models, so the field has
    // to be dropped rather than clamped.
    expect(
      listWorkerEffortsForModel({
        providerId: "claude-code",
        model: "claude-haiku-4-5",
      }),
    ).toEqual([]);
  });

  test("Claude effort scale excludes Codex's ultra tier", () => {
    expect(
      listWorkerEffortsForModel({
        providerId: "claude-code",
        model: "claude-sonnet-5",
      }),
    ).not.toContain("ultra");
  });

  test("Codex Luna remains a model but is not worker-capable", () => {
    expect(listWorkerModelOptions("codex")).toEqual(["gpt-5.6-terra", "gpt-5.6-sol"]);
    expect(
      isWorkerCapableModel({ providerId: "codex", model: "gpt-5.6-luna" }),
    ).toBe(false);
  });
});

describe("resolveWorkerProfile", () => {
  test("returns off with no intent", () => {
    expect(
      resolveWorkerProfile({
        providerId: "codex",
        primaryModel: "gpt-5.6-sol",
      }).status,
    ).toBe("off");
  });

  test("auto resolves deterministically and reports both request and result", () => {
    const resolution = resolveWorkerProfile({
      providerId: "codex",
      primaryModel: "gpt-5.6-sol",
      intent: intent(),
    });
    expect(resolution.status).toBe("ready");
    if (resolution.status !== "ready") return;
    expect(resolution.profile.requestedWorkerModel).toBe(WORKER_AUTO_VALUE);
    expect(resolution.profile.resolvedWorkerModel).toBe("gpt-5.6-terra");
    expect(resolution.profile.workerName).toBe(WORKER_AGENT_NAME);
    expect(resolution.profile.maxConcurrency).toBe(1);
    expect(resolution.profile.foreground).toBe(true);
  });

  test("explicit Terra and Sol selections are honoured on Codex", () => {
    for (const model of ["gpt-5.6-terra", "gpt-5.6-sol"] as const) {
      const resolution = resolveWorkerProfile({
        providerId: "codex",
        primaryModel: "gpt-5.6-sol",
        intent: intent({ workerModel: model }),
      });
      expect(resolution.status).toBe("ready");
      if (resolution.status === "ready") {
        expect(resolution.profile.resolvedWorkerModel).toBe(model);
      }
    }
  });

  test("Luna is rejected before spawn_agent", () => {
    const resolution = resolveWorkerProfile({
      providerId: "codex", primaryModel: "gpt-5.6-sol",
      intent: intent({ workerModel: "gpt-5.6-luna" }),
    });
    expect(resolution.status).toBe("unavailable");
    if (resolution.status === "unavailable") expect(resolution.reason).toBe("worker_model_not_supported");
  });

  test("an ineligible primary is unavailable, not silently solo", () => {
    const resolution = resolveWorkerProfile({
      providerId: "codex",
      primaryModel: "gpt-5.6-luna",
      intent: intent(),
    });
    expect(resolution.status).toBe("unavailable");
    if (resolution.status === "unavailable") {
      expect(resolution.reason).toBe("primary_not_supported");
    }
  });

  test("an unknown worker model reports not_found without substituting", () => {
    const resolution = resolveWorkerProfile({
      providerId: "codex",
      primaryModel: "gpt-5.6-sol",
      intent: intent({ workerModel: "gpt-9000-imaginary" }),
    });
    expect(resolution.status).toBe("unavailable");
    if (resolution.status === "unavailable") {
      expect(resolution.reason).toBe("worker_model_not_found");
    }
  });

  test("a known but non-worker model reports not_supported", () => {
    const resolution = resolveWorkerProfile({
      providerId: "claude-code",
      primaryModel: "claude-opus-5",
      // Present in the Claude catalog but deliberately absent from the worker
      // list.
      intent: intent({ workerModel: "claude-opus-5[1m]" }),
    });
    expect(resolution.status).toBe("unavailable");
    if (resolution.status === "unavailable") {
      expect(resolution.reason).toBe("worker_model_not_supported");
    }
  });

  test("supported worker effort is preserved", () => {
    const resolution = resolveWorkerProfile({
      providerId: "codex",
      primaryModel: "gpt-5.6-sol",
      intent: intent({ workerModel: "gpt-5.6-terra", workerEffort: "ultra" }),
    });
    expect(resolution.status).toBe("ready");
    if (resolution.status === "ready") {
      expect(resolution.profile.requestedWorkerEffort).toBe("ultra");
      expect(resolution.profile.resolvedWorkerEffort).toBe("ultra");
    }
  });

  test("effort is dropped entirely for a model that rejects the field", () => {
    const resolution = resolveWorkerProfile({
      providerId: "claude-code",
      primaryModel: "claude-opus-5",
      intent: intent({
        workerModel: "claude-haiku-4-5",
        workerEffort: "max",
      }),
    });
    expect(resolution.status).toBe("ready");
    if (resolution.status === "ready") {
      expect(resolution.profile.resolvedWorkerEffort).toBeNull();
    }
  });

  test("warns when the worker is not cheaper than the primary", () => {
    const same = resolveWorkerProfile({
      providerId: "codex",
      primaryModel: "gpt-5.6-terra",
      intent: intent({ workerModel: "gpt-5.6-terra" }),
    });
    expect(same.status).toBe("ready");
    if (same.status === "ready") {
      expect(same.profile.costWarning).toContain("same model");
    }

    const pricier = resolveWorkerProfile({
      providerId: "codex",
      primaryModel: "gpt-5.6-terra",
      intent: intent({ workerModel: "gpt-5.6-sol" }),
    });
    expect(pricier.status).toBe("ready");
    if (pricier.status === "ready") {
      expect(pricier.profile.costWarning).toContain("cost more");
    }
  });

  test("no cost warning when the worker is genuinely cheaper", () => {
    const resolution = resolveWorkerProfile({
      providerId: "codex",
      primaryModel: "gpt-5.6-sol",
      intent: intent({ workerModel: "gpt-5.6-terra" }),
    });
    expect(resolution.status).toBe("ready");
    if (resolution.status === "ready") {
      expect(resolution.profile.costWarning).toBeNull();
    }
  });

  test("custom description and instructions override the preset", () => {
    const resolution = resolveWorkerProfile({
      providerId: "claude-code",
      primaryModel: "claude-opus-5",
      intent: intent({
        description: "  Custom trigger  ",
        instructions: "  Custom brief  ",
        maxTurns: 7,
      }),
    });
    expect(resolution.status).toBe("ready");
    if (resolution.status === "ready") {
      expect(resolution.profile.description).toBe("Custom trigger");
      expect(resolution.profile.instructions).toBe("Custom brief");
      expect(resolution.profile.maxTurns).toBe(7);
    }
  });

  test("blank overrides fall back to the preset rather than emptying it", () => {
    const preset = getWorkerPreset(DEFAULT_WORKER_PRESET_ID);
    const resolution = resolveWorkerProfile({
      providerId: "claude-code",
      primaryModel: "claude-opus-5",
      intent: intent({ description: "   ", instructions: "" }),
    });
    expect(resolution.status).toBe("ready");
    if (resolution.status === "ready") {
      expect(resolution.profile.description).toBe(preset.description);
      expect(resolution.profile.instructions).toBe(preset.instructions);
    }
  });
});

describe("worker arm state and intent", () => {
  test("settings supply the default and the task can override it off", () => {
    const armed = resolveWorkerArmState({
      providerId: "codex",
      settingsEnabled: true,
    });
    expect(armed.enabled).toBe(true);
    expect(armed.overridden).toBe(false);

    const disarmed = resolveWorkerArmState({
      providerId: "codex",
      settingsEnabled: true,
      overrides: { workerEnabled: false },
    });
    expect(disarmed.enabled).toBe(false);
    expect(disarmed.overridden).toBe(true);
    expect(buildWorkerRuntimeIntent(disarmed)).toBeNull();
  });

  test("disarming keeps the remembered per-provider configuration", () => {
    const arm = resolveWorkerArmState({
      providerId: "codex",
      settingsEnabled: true,
      overrides: {
        workerEnabled: false,
        workerConfigByProvider: {
          codex: { presetId: "sweep", model: "gpt-5.6-terra" },
        },
      },
    });
    expect(arm.enabled).toBe(false);
    expect(arm.config.presetId).toBe("sweep");
    expect(arm.config.model).toBe("gpt-5.6-terra");
  });

  test("each provider keeps its own selection", () => {
    const overrides = {
      workerEnabled: true,
      workerConfigByProvider: {
        codex: { model: "gpt-5.6-terra" },
        "claude-code": { model: "claude-haiku-4-5" },
      },
    };
    expect(
      resolveWorkerArmState({ providerId: "codex", overrides }).config.model,
    ).toBe("gpt-5.6-terra");
    expect(
      resolveWorkerArmState({ providerId: "claude-code", overrides }).config
        .model,
    ).toBe("claude-haiku-4-5");
  });

  test("task config layers over the settings default", () => {
    const arm = resolveWorkerArmState({
      providerId: "codex",
      settingsEnabled: true,
      settingsConfig: { presetId: "scout", model: "gpt-5.6-luna" },
      overrides: { workerConfigByProvider: { codex: { model: "gpt-5.6-terra" } } },
    });
    // Preset inherited from settings, model overridden by the task.
    expect(arm.config.presetId).toBe("scout");
    expect(arm.config.model).toBe("gpt-5.6-terra");
  });
});

describe("worker config normalization", () => {
  test("drops malformed fields independently", () => {
    const config = normalizeWorkerProviderConfig({
      presetId: "not-a-preset",
      model: 42,
      effort: "banana",
      description: "   ",
      tools: ["Read", "", "Read", 5],
      maxTurns: -3,
    });
    expect(config.presetId).toBe(DEFAULT_WORKER_PRESET_ID);
    expect(config.model).toBe(WORKER_AUTO_VALUE);
    expect(config.effort).toBe(WORKER_AUTO_VALUE);
    expect(config.description).toBeUndefined();
    // Deduped, blanks and non-strings dropped, good entry preserved.
    expect(config.tools).toEqual(["Read"]);
    expect(config.maxTurns).toBeUndefined();
  });

  test("keeps only known provider keys", () => {
    const byProvider = normalizeWorkerConfigByProvider({
      codex: { model: "gpt-5.6-luna" },
      "claude-code": { model: "claude-haiku-4-5" },
      "bogus-provider": { model: "x" },
    });
    expect(Object.keys(byProvider).sort()).toEqual(["claude-code", "codex"]);
  });

  test("non-object input degrades to empty rather than throwing", () => {
    expect(normalizeWorkerProviderConfig(null)).toEqual({});
    expect(normalizeWorkerConfigByProvider("nope")).toEqual({});
  });
});

describe("worker presentation", () => {
  test("runtime status names the preset, model and effort", () => {
    const resolution = resolveWorkerProfile({
      providerId: "codex",
      primaryModel: "gpt-5.6-sol",
      intent: intent({ workerModel: "gpt-5.6-terra", workerEffort: "max" }),
    });
    expect(formatWorkerRuntimeStatusValue(resolution)).toBe(
      "Verified patch · GPT-5.6 Terra · max",
    );
  });

  test("off and unavailable read differently in the runtime bar", () => {
    expect(formatWorkerRuntimeStatusValue({ status: "off" })).toBe("Off");
    expect(
      formatWorkerRuntimeStatusValue({
        status: "unavailable",
        reason: "primary_not_supported",
        detail: "x",
      }),
    ).toBe("Unavailable");
  });

  test("primary instructions demand review and cap concurrency", () => {
    const resolution = resolveWorkerProfile({
      providerId: "claude-code",
      primaryModel: "claude-opus-5",
      intent: intent(),
    });
    expect(resolution.status).toBe("ready");
    if (resolution.status !== "ready") return;
    const text = buildWorkerPrimaryInstructions(resolution.profile);
    expect(text).toContain(WORKER_AGENT_NAME);
    expect(text).toContain("review its diff");
    expect(text).toContain("at most 1 worker");
  });

  test("Codex instructions carry the tool list as prose since it is unenforced", () => {
    const resolution = resolveWorkerProfile({
      providerId: "codex",
      primaryModel: "gpt-5.6-sol",
      intent: intent(),
    });
    expect(resolution.status).toBe("ready");
    if (resolution.status !== "ready") return;
    const text = buildWorkerPrimaryInstructions(resolution.profile);
    expect(text).toContain("stay within these tools");
  });

  test("Claude instructions omit the tool prose because tools are enforced", () => {
    const resolution = resolveWorkerProfile({
      providerId: "claude-code",
      primaryModel: "claude-opus-5",
      intent: intent(),
    });
    expect(resolution.status).toBe("ready");
    if (resolution.status !== "ready") return;
    expect(buildWorkerPrimaryInstructions(resolution.profile)).not.toContain(
      "stay within these tools",
    );
  });
});

describe("worker model options", () => {
  test("worker lists only contain models from the same provider", () => {
    for (const model of listWorkerModelOptions("codex")) {
      expect(model.startsWith("gpt-")).toBe(true);
    }
    for (const model of listWorkerModelOptions("claude-code")) {
      expect(model.startsWith("claude-")).toBe(true);
    }
  });
});
