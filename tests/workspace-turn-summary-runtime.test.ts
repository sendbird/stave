import { afterEach, expect, test } from "bun:test";
import { createWorkspaceTurnSummaryGenerator } from "../src/store/workspace-turn-summary-runtime";
import { defaultSettings } from "../src/store/app-settings";
import {
  DEFAULT_PROJECT_MEMORY_SETTINGS,
  type ProjectMemorySettings,
} from "../src/lib/project-memory-settings";
import type { AppState } from "../src/store/app-store.types";

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (previousWindow)
    Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

async function generate(policy: ProjectMemorySettings | null) {
  const prompts: string[] = [];
  const writes: unknown[] = [];
  const summaries: unknown[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      api: {
        projectMemory: {
          getSettings: async () =>
            policy ? { ok: true, settings: policy } : { ok: false },
        },
        provider: {
          streamTurn: (args: { prompt: string }) => {
            prompts.push(args.prompt);
            return [];
          },
        },
      },
    },
  });
  const state = {
    projectPath: "/tmp/memory-summary",
    activeWorkspaceId: "active",
    workspacePathById: { workspace: "/tmp/memory-summary/worktree" },
    workspaceDefaultById: {},
    settings: defaultSettings,
    workspaceRuntimeCacheById: {
      workspace: {
        workspaceInformation: {},
        tasks: [{ id: "task", title: "Session recovery", provider: "codex" }],
        messagesByTask: {
          task: [
            { role: "user", content: "Fix recovery." },
            {
              role: "assistant",
              content: "Validated cache epochs before restoring.",
            },
          ],
        },
      },
    },
  } as unknown as AppState;
  const done = Promise.withResolvers<void>();
  const run = createWorkspaceTurnSummaryGenerator({
    getState: () => state,
    applySummary: (args) => {
      summaries.push(args);
      done.resolve();
    },
    rememberDurableFacts: (args) => writes.push(args),
    collectProviderEvents: async () => [
      {
        type: "text",
        text: JSON.stringify({
          requestSummary: "Fix recovery",
          workSummary: "Validated epochs",
          durableFacts: [
            {
              kind: "gotcha",
              content: "Validate the cache epoch before restoring.",
            },
          ],
        }),
      },
    ],
  });
  run({ workspaceId: "workspace", taskId: "task", turnId: "turn" });
  await done.promise;
  return { prompts, writes, summaries };
}

test("summary generation uses the saved collection template in its existing call and forwards its revision", async () => {
  const result = await generate({
    ...DEFAULT_PROJECT_MEMORY_SETTINGS,
    revision: 7,
    collectionTemplate: "Collect session recovery pitfalls only.",
  });
  expect(result.prompts).toHaveLength(1);
  expect(result.prompts[0]).toContain(
    "Collect session recovery pitfalls only.",
  );
  expect(result.summaries).toHaveLength(1);
  expect(result.writes).toEqual([
    {
      projectPath: "/tmp/memory-summary",
      taskId: "task",
      turnId: "turn",
      collectionRevision: 7,
      facts: [
        {
          kind: "gotcha",
          content: "Validate the cache epoch before restoring.",
        },
      ],
    },
  ]);
});

test("disabled or unavailable collection still summarizes but never persists model-proposed memories", async () => {
  for (const policy of [
    null,
    { ...DEFAULT_PROJECT_MEMORY_SETTINGS, collectAutomatically: false },
  ]) {
    const result = await generate(policy);
    expect(result.prompts[0]).toContain("durableFacts: []");
    expect(result.summaries).toHaveLength(1);
    expect(result.writes).toEqual([]);
  }
});
