import { expect, test } from "bun:test";
import { useAppStore } from "@/store/app.store";

test("applying a preset changes only the new task's model and effort", () => {
  const originalWindow = globalThis.window;
  const storage = new Map<string, string>();
  (globalThis as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    },
  };
  const original = useAppStore.getState();
  const oldDraft = { text: "Existing work", contextParts: [], runtimeOverrides: { model: "gpt-5.5", modelProviderId: "codex" as const, codexReasoningEffort: "high" as const } };
  const settings = {
    ...original.settings,
    modelCodex: "gpt-5.5",
    codexReasoningEffort: "high" as const,
    taskPresets: [{ id: "test-preset", label: "Quick inspection", kind: "task" as const, provider: "codex" as const, model: "gpt-5.6", effort: "low" as const }],
  };
  try {
    useAppStore.setState({
      settings,
      activeWorkspaceId: "preset-workspace",
      workspaces: [{ id: "preset-workspace", name: "Preset workspace", updatedAt: "2026-09-01T00:00:00.000Z" }],
      activeTaskId: "existing-task",
      tasks: [{ id: "existing-task", title: "Existing", provider: "codex", updatedAt: "2026-09-01T00:00:00.000Z", unread: false }],
      promptDraftByTask: { "existing-task": oldDraft },
      messagesByTask: {},
      openTaskTabIds: ["existing-task"],
    });
    useAppStore.getState().applyTaskPreset({ presetId: "test-preset" });
    const state = useAppStore.getState();
    expect(state.activeTaskId).not.toBe("existing-task");
    expect(state.settings).toBe(settings);
    expect(state.promptDraftByTask["existing-task"]).toBe(oldDraft);
    expect(state.promptDraftByTask[state.activeTaskId]?.runtimeOverrides).toMatchObject({
      model: "gpt-5.6", modelProviderId: "codex", codexReasoningEffort: "low", autoRouting: false,
    });
    expect(state.activeTurnIdsByTask[state.activeTaskId]).toBeUndefined();
  } finally {
    useAppStore.setState(original, true);
    (globalThis as { window: unknown }).window = originalWindow;
  }
});
