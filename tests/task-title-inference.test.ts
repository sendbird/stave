import { afterEach, describe, expect, test } from "bun:test";
import { buildInitialTaskTitle } from "@/lib/tasks";
import { defaultSettings } from "@/store/app-settings";
import { resolveAuxLaneRuntime } from "@/lib/providers/auxiliary-inference-policy";
import { maybeSuggestUtilityTaskName } from "@/store/utility-inference-runtime";
import { createUnavailableUtilityInferenceMetadata } from "@/lib/providers/utility-inference";
import type { Task } from "@/types/chat";

const originalWindow = (globalThis as { window?: unknown }).window;
afterEach(() => { (globalThis as { window?: unknown }).window = originalWindow; });

const task: Task = { id: "task-title", title: "New Task", provider: "codex", unread: false, updatedAt: "2026-10-01T00:00:00Z", archivedAt: null, controlMode: "interactive", controlOwner: "stave" };
const utility = { ...createUnavailableUtilityInferenceMetadata("Test result"), degraded: false };
const args = { task, priorUserTurnCount: 0, prompt: "Add report CSV export", history: [], context: { activeProviderId: "codex" as const } };

describe("task title fallback and inference", () => {
  test.each(["New Task", "New task", "새 작업", ""]) ("seeds an untitled task in either language (%s)", (title) => {
    expect(buildInitialTaskTitle({ task: { ...task, title }, prompt: "\nAdd report CSV export\nDetails" })).toBe("Add report CSV export");
  });

  test("never replaces a manual name or an existing descriptive name with the prompt", () => {
    expect(buildInitialTaskTitle({ task: { ...task, titleManuallySet: true }, prompt: args.prompt })).toBeNull();
    expect(buildInitialTaskTitle({ task: { ...task, title: "Review persistence" }, prompt: args.prompt })).toBeNull();
    expect(buildInitialTaskTitle({ task, prompt: "\n " })).toBeNull();
  });

  test("keeps a prompt title without calling the disabled AI lane", () => {
    let queries = 0;
    (globalThis as { window?: unknown }).window = { api: { provider: { suggestTaskName: () => { queries++; throw new Error("Disabled lane called"); } } } };
    const titles: string[] = [];
    const lane = resolveAuxLaneRuntime({ lane: "taskName", policy: { ...defaultSettings.auxiliaryInferencePolicy, taskName: { enabled: false } }, shared: defaultSettings.auxiliaryInferenceDefault, activeProviderId: "codex" });
    maybeSuggestUtilityTaskName({ ...args, lane, onTitle: (title) => titles.push(title) });
    expect(queries).toBe(0);
    expect(titles).toEqual([args.prompt]);
  });

  test.each([false, true])("retains the prompt title when AI fails or returns an invalid name (invalid: %s)", async (invalid) => {
    (globalThis as { window?: unknown }).window = { api: { provider: { suggestTaskName: async () => ({ ok: invalid, title: "I cannot generate a title", utility }) } } };
    const titles: string[] = [];
    maybeSuggestUtilityTaskName({ ...args, onTitle: (title) => titles.push(title) });
    await Promise.resolve();
    expect(titles).toEqual([args.prompt]);
  });

  test("discards an older naming result that arrives after the next result", async () => {
    const resolves: Array<(result: { ok: boolean; title: string; utility: typeof utility }) => void> = [];
    (globalThis as { window?: unknown }).window = { api: { provider: { suggestTaskName: () => new Promise((resolve) => resolves.push(resolve)) } } };
    const titles: string[] = [];
    for (const prompt of ["Fix persistence", "Fix title generation"]) {
      maybeSuggestUtilityTaskName({ ...args, task: { ...task, title: "Original" }, prompt, onTitle: (title) => titles.push(title) });
    }
    resolves[1]!({ ok: true, title: "Fix title generation", utility });
    await Promise.resolve();
    resolves[0]!({ ok: true, title: "Fix persistence", utility });
    await Promise.resolve();
    expect(titles).toEqual(["Fix title generation"]);
  });
});
