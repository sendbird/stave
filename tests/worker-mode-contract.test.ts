import { describe, expect, test } from "bun:test";
import { RuntimeOptionsObjectSchema } from "../electron/main/ipc/schemas";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";
import { arePromptDraftRuntimeOverridesEqual } from "@/store/prompt-draft-runtime";
import {
  collectActiveComposerControls,
  COMPOSER_CONTROL_DESCRIPTIONS,
  COMPOSER_CONTROL_IDS,
  COMPOSER_CONTROL_LABELS,
  resolveComposerControlLayout,
} from "@/lib/composer-controls";
import { PROVIDER_RUNTIME_OPTION_KEYS } from "@/lib/providers/runtime-option-contract";
import { resolveWorkerShortcutAction } from "@/lib/worker-shortcuts";
import {
  buildWorkerEffortPatch,
  buildWorkerModelPatch,
  buildWorkerPresetPatch,
  buildWorkerTogglePatch,
} from "@/components/ai-elements/prompt-input-worker-mode.utils";
import { resolveWorkerArmState } from "@/lib/providers/worker-mode";
import { NormalizedProviderEventSchema } from "@/lib/providers/schemas";

const validIntent = {
  mode: "task-executor",
  presetId: "verified-patch",
  workerModel: "auto",
  workerEffort: "auto",
} as const;

describe("worker intent IPC schema", () => {
  test("accepts an absent intent for backward compatibility", () => {
    expect(RuntimeOptionsObjectSchema.safeParse({}).success).toBe(true);
  });

  test("accepts a minimal valid intent", () => {
    const parsed = RuntimeOptionsObjectSchema.safeParse({
      workerIntent: validIntent,
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts explicit model and effort", () => {
    expect(
      RuntimeOptionsObjectSchema.safeParse({
        workerIntent: {
          ...validIntent,
          workerModel: "gpt-5.6-luna",
          workerEffort: "max",
        },
      }).success,
    ).toBe(true);
  });

  test("rejects an unknown mode", () => {
    expect(
      RuntimeOptionsObjectSchema.safeParse({
        workerIntent: { ...validIntent, mode: "swarm" },
      }).success,
    ).toBe(false);
  });

  test("rejects an unknown effort", () => {
    expect(
      RuntimeOptionsObjectSchema.safeParse({
        workerIntent: { ...validIntent, workerEffort: "banana" },
      }).success,
    ).toBe(false);
  });

  test("rejects extra fields", () => {
    expect(
      RuntimeOptionsObjectSchema.safeParse({
        workerIntent: { ...validIntent, sneaky: true },
      }).success,
    ).toBe(false);
  });

  test("rejects an oversized model string", () => {
    expect(
      RuntimeOptionsObjectSchema.safeParse({
        workerIntent: { ...validIntent, workerModel: "x".repeat(201) },
      }).success,
    ).toBe(false);
  });

  test("rejects oversized instructions", () => {
    expect(
      RuntimeOptionsObjectSchema.safeParse({
        workerIntent: { ...validIntent, instructions: "x".repeat(8_001) },
      }).success,
    ).toBe(false);
  });

  test("rejects an out-of-range maxTurns", () => {
    expect(
      RuntimeOptionsObjectSchema.safeParse({
        workerIntent: { ...validIntent, maxTurns: 0 },
      }).success,
    ).toBe(false);
    expect(
      RuntimeOptionsObjectSchema.safeParse({
        workerIntent: { ...validIntent, maxTurns: 201 },
      }).success,
    ).toBe(false);
  });

  test("rejects an over-long tool list", () => {
    expect(
      RuntimeOptionsObjectSchema.safeParse({
        workerIntent: {
          ...validIntent,
          tools: Array.from({ length: 41 }, (_, index) => `Tool${index}`),
        },
      }).success,
    ).toBe(false);
  });

  test("workerIntent is declared in the runtime option key contract", () => {
    expect(PROVIDER_RUNTIME_OPTION_KEYS).toContain("workerIntent");
  });
});

describe("ACP Worker approval metadata", () => {
  test("survives the normalized event schema for Cursor and Kiro", () => {
    for (const providerId of ["cursor", "kiro"] as const) {
      expect(
        NormalizedProviderEventSchema.safeParse({
          type: "approval",
          requestId: `worker:${providerId}:permission-1`,
          toolName: "Bash",
          description: "Worker · Run tests",
          workerExecution: {
            providerId,
            primaryModel: "primary-model",
            presetId: "verified-patch",
            workerModel: "worker-model",
            workerEffort: null,
          },
        }).success,
      ).toBe(true);
    }
  });
});

describe("worker draft persistence", () => {
  // Routed through the real snapshot parse rather than the schema directly,
  // because that parse is all-or-nothing: the property under test is that a bad
  // worker field cannot take the whole workspace down with it.
  const snapshotWithDraftOverrides = (
    runtimeOverrides: Record<string, unknown>,
  ) => ({
    activeTaskId: "task-1",
    tasks: [
      {
        id: "task-1",
        title: "Task 1",
        provider: "codex" as const,
        updatedAt: "2026-04-01T00:00:00.000Z",
        unread: false,
      },
    ],
    messagesByTask: { "task-1": [] },
    promptDraftByTask: {
      "task-1": {
        text: "",
        attachedFilePaths: [],
        attachments: [],
        runtimeOverrides,
      },
    },
    providerSessionByTask: {},
    editorTabs: [],
    activeEditorTabId: null,
  });

  test("round-trips a full per-provider config", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: snapshotWithDraftOverrides({
        workerEnabled: true,
        workerConfigByProvider: {
          codex: {
            presetId: "sweep",
            model: "gpt-5.6-luna",
            effort: "max",
            description: "d",
            instructions: "i",
            tools: ["Read", "Edit"],
            maxTurns: 12,
          },
        },
      }),
    });
    const overrides = parsed?.promptDraftByTask["task-1"]?.runtimeOverrides;
    expect(overrides?.workerEnabled).toBe(true);
    expect(overrides?.workerConfigByProvider?.codex?.presetId).toBe("sweep");
    expect(overrides?.workerConfigByProvider?.codex?.model).toBe("gpt-5.6-luna");
    expect(overrides?.workerConfigByProvider?.codex?.effort).toBe("max");
    expect(overrides?.workerConfigByProvider?.codex?.maxTurns).toBe(12);
  });

  test("a corrupt worker config degrades instead of rejecting the workspace", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: snapshotWithDraftOverrides({
        codexPlanMode: true,
        workerEnabled: "yes-please",
        workerConfigByProvider: { codex: { effort: "banana", maxTurns: -5 } },
      }),
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.tasks).toHaveLength(1);
    const overrides = parsed?.promptDraftByTask["task-1"]?.runtimeOverrides;
    expect(overrides?.codexPlanMode).toBe(true);
    expect(overrides?.workerEnabled).toBeUndefined();
    expect(overrides?.workerConfigByProvider?.codex?.effort).toBeUndefined();
    expect(overrides?.workerConfigByProvider?.codex?.maxTurns).toBeUndefined();
  });

  test("an unknown provider key is dropped without failing the parse", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: snapshotWithDraftOverrides({
        workerEnabled: true,
        workerConfigByProvider: { "bogus-provider": { model: "x" } },
      }),
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.promptDraftByTask["task-1"]?.runtimeOverrides?.workerEnabled).toBe(
      true,
    );
  });
});

describe("worker draft equality", () => {
  test("flipping the arm flag is a change", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { workerEnabled: true },
        { workerEnabled: false },
      ),
    ).toBe(false);
  });

  test("changing one provider's config is a change", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { workerConfigByProvider: { codex: { model: "gpt-5.6-luna" } } },
        { workerConfigByProvider: { codex: { model: "gpt-5.6-terra" } } },
      ),
    ).toBe(false);
  });

  test("every worker field participates in equality", () => {
    const base = { workerConfigByProvider: { codex: { presetId: "sweep" } } };
    const fields = [
      { presetId: "scout" },
      { model: "gpt-5.6-terra" },
      { effort: "max" as const },
      { description: "x" },
      { instructions: "y" },
      { maxTurns: 3 },
      { tools: ["Read"] },
    ];
    for (const field of fields) {
      expect(
        arePromptDraftRuntimeOverridesEqual(base, {
          workerConfigByProvider: {
            codex: { presetId: "sweep", ...field },
          },
        }),
      ).toBe(false);
    }
  });

  test("an untouched provider entry compares equal", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        { workerConfigByProvider: { codex: { model: "gpt-5.6-luna" } } },
        { workerConfigByProvider: { codex: { model: "gpt-5.6-luna" } } },
      ),
    ).toBe(true);
  });

  test("editing Codex does not report Claude as changed", () => {
    expect(
      arePromptDraftRuntimeOverridesEqual(
        {
          workerConfigByProvider: {
            codex: { model: "gpt-5.6-luna" },
            "claude-code": { model: "claude-haiku-4-5" },
          },
        },
        {
          workerConfigByProvider: {
            codex: { model: "gpt-5.6-terra" },
            "claude-code": { model: "claude-haiku-4-5" },
          },
        },
      ),
    ).toBe(false);
  });
});

describe("worker composer control registration", () => {
  test("worker sits directly after advisor in toolbar order", () => {
    const ids = [...COMPOSER_CONTROL_IDS];
    expect(ids.indexOf("worker")).toBe(ids.indexOf("advisor") + 1);
  });

  test("worker has a label and a description", () => {
    expect(COMPOSER_CONTROL_LABELS.worker).toBeTruthy();
    expect(COMPOSER_CONTROL_DESCRIPTIONS.worker).toBeTruthy();
  });

  test("an armed worker counts as active", () => {
    expect(collectActiveComposerControls({ workerArmed: true })).toContain(
      "worker",
    );
    expect(collectActiveComposerControls({ workerArmed: false })).not.toContain(
      "worker",
    );
  });

  test("an armed worker is pulled back onto the toolbar when hidden", () => {
    const layout = resolveComposerControlLayout({
      placements: { worker: "hidden" },
      activeIds: ["worker"],
    });
    expect(layout.toolbar).toContain("worker");
    expect(layout.forced).toContain("worker");
  });

  test("an unavailable worker stays out even while armed", () => {
    const layout = resolveComposerControlLayout({
      placements: {},
      activeIds: ["worker"],
      unavailableIds: ["worker"],
    });
    expect(layout.toolbar).not.toContain("worker");
    expect(layout.overflow).not.toContain("worker");
  });
});

describe("worker shortcuts", () => {
  const base = {
    key: "w",
    code: "KeyW",
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };

  test("Alt+W toggles and Alt+Shift+W opens the picker", () => {
    expect(resolveWorkerShortcutAction(base)).toBe("toggle");
    expect(resolveWorkerShortcutAction({ ...base, shiftKey: true })).toBe(
      "picker",
    );
  });

  test("matches by code so macOS Option composition still binds", () => {
    // Option+W produces "∑" in `event.key` on macOS.
    expect(resolveWorkerShortcutAction({ ...base, key: "∑" })).toBe("toggle");
  });

  test("ignores chords carrying Ctrl or Meta", () => {
    expect(resolveWorkerShortcutAction({ ...base, ctrlKey: true })).toBeNull();
    expect(resolveWorkerShortcutAction({ ...base, metaKey: true })).toBeNull();
  });

  test("ignores other keys and bare presses", () => {
    expect(
      resolveWorkerShortcutAction({ ...base, key: "a", code: "KeyA" }),
    ).toBeNull();
    expect(resolveWorkerShortcutAction({ ...base, altKey: false })).toBeNull();
  });
});

describe("worker patch builders", () => {
  const arm = resolveWorkerArmState({ providerId: "codex" });

  test("toggling preserves the remembered per-provider config", () => {
    const patch = buildWorkerTogglePatch({
      overrides: {
        workerConfigByProvider: { codex: { model: "gpt-5.6-terra" } },
      },
      arm,
    });
    expect(patch.workerEnabled).toBe(true);
    expect(patch.workerConfigByProvider?.codex?.model).toBe("gpt-5.6-terra");
  });

  test("selecting a preset arms Worker mode and clears hand-edited copy", () => {
    const patch = buildWorkerPresetPatch({
      overrides: {
        workerConfigByProvider: {
          codex: { description: "old", instructions: "old", maxTurns: 5 },
        },
      },
      providerId: "codex",
      presetId: "scout",
    });
    expect(patch.workerEnabled).toBe(true);
    expect(patch.workerConfigByProvider?.codex?.presetId).toBe("scout");
    // Stale copy would silently shadow the new preset's text.
    expect(patch.workerConfigByProvider?.codex?.description).toBeUndefined();
    expect(patch.workerConfigByProvider?.codex?.instructions).toBeUndefined();
    expect(patch.workerConfigByProvider?.codex?.maxTurns).toBeUndefined();
  });

  test("clearing copy deletes keys, so a reload cannot resurrect them", () => {
    const patch = buildWorkerPresetPatch({
      overrides: {
        workerConfigByProvider: {
          codex: { description: "old", instructions: "old", maxTurns: 5 },
        },
      },
      providerId: "codex",
      presetId: "scout",
    });
    const cleared = patch.workerConfigByProvider?.codex ?? {};
    // An explicit `undefined` would vanish on JSON serialization, so the draft
    // would read as cleared now but re-inherit the settings copy after a
    // restart. Absent keys make both paths agree.
    expect(Object.keys(cleared)).toEqual(["presetId"]);
    expect(JSON.parse(JSON.stringify(cleared))).toEqual(cleared);
  });

  test("model and effort writes stay scoped to their provider", () => {
    const withModel = buildWorkerModelPatch({
      overrides: {
        workerConfigByProvider: {
          "claude-code": { model: "claude-haiku-4-5" },
        },
      },
      providerId: "codex",
      model: "gpt-5.6-luna",
    });
    expect(withModel.workerConfigByProvider?.codex?.model).toBe("gpt-5.6-luna");
    expect(withModel.workerConfigByProvider?.["claude-code"]?.model).toBe(
      "claude-haiku-4-5",
    );

    const withEffort = buildWorkerEffortPatch({
      overrides: withModel,
      providerId: "codex",
      effort: "max",
    });
    expect(withEffort.workerConfigByProvider?.codex?.effort).toBe("max");
    // The model chosen a moment ago must survive an effort edit.
    expect(withEffort.workerConfigByProvider?.codex?.model).toBe("gpt-5.6-luna");
  });
});
