import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { ProjectMemoryStore } from "../electron/persistence/project-memory-store";
import {
  buildMemoryCollectionInstruction,
  DEFAULT_PROJECT_MEMORY_SETTINGS,
  ProjectMemorySettingsPatchSchema,
} from "../src/lib/project-memory-settings";

const PROJECT = "/tmp/memory/settings";
const OTHER = "/tmp/memory/other";
const NOW = 1_800_000_000_000;

describe("project memory controls", () => {
  let db: Database;
  let store: ProjectMemoryStore;
  beforeEach(() => {
    db = new Database(":memory:");
    store = new ProjectMemoryStore(db);
  });
  afterEach(() => db.close());

  function enableCollection(projectPath = PROJECT) {
    db.prepare(
      `INSERT INTO project_memory_settings
      (project_path, settings_json, collection_opt_in) VALUES (?, ?, 1)`,
    ).run(projectPath, JSON.stringify({ collectAutomatically: true }));
  }

  const candidate = (overrides: Record<string, unknown> = {}) => ({
    projectPath: PROJECT,
    kind: "gotcha" as const,
    content: "Check the cache epoch before restoring a session.",
    confidence: 0.6,
    now: NOW,
    ...overrides,
  });

  test("new projects reject both summary and agent saves until explicit opt-in", () => {
    expect(store.settings.get(PROJECT).collectAutomatically).toBe(false);
    expect(
      buildMemoryCollectionInstruction(store.settings.get(PROJECT)),
    ).toContain("durableFacts: []");
    for (const confidence of [0.6, 0.9]) {
      expect(store.remember(candidate({ confidence }))).toBeNull();
    }
    const settings = store.settings.save({
      projectPath: PROJECT,
      expectedRevision: 0,
      patch: { collectAutomatically: true },
    });
    expect(
      new ProjectMemoryStore(db).settings.get(PROJECT).collectAutomatically,
    ).toBe(true);
    expect(store.settings.get(OTHER).collectAutomatically).toBe(false);
    expect(store.remember(candidate({ collectionRevision: 0 }))).toBeNull();
    expect(
      store.remember(candidate({ collectionRevision: settings.revision })),
    ).not.toBeNull();
    expect(
      store.remember(
        candidate({ confidence: 0.9, content: "Keep stable task ownership." }),
      ),
    ).not.toBeNull();
    store.settings.save({
      projectPath: PROJECT,
      expectedRevision: 1,
      patch: { collectAutomatically: false },
    });
    expect(
      store.remember(
        candidate({ collectionRevision: 1, content: "In-flight candidate." }),
      ),
    ).toBeNull();
    expect(
      store.remember(
        candidate({ confidence: 0.9, content: "Agent write after disabling." }),
      ),
    ).toBeNull();
    expect(store.list({ projectPath: PROJECT })).toHaveLength(2);
  });

  test("legacy enabled defaults require fresh consent without losing settings or memories", () => {
    enableCollection();
    const memory = store.remember(candidate({ confidence: 0.9 }))!.memory;
    // Recreate the pre-opt-in settings table, including a saved enabled default.
    db.exec("DROP TABLE project_memory_settings");
    db.exec(`CREATE TABLE project_memory_settings (
      project_path TEXT PRIMARY KEY, settings_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0, reset_before INTEGER NOT NULL DEFAULT 0
    )`);
    db.prepare("INSERT INTO project_memory_settings VALUES (?, ?, 4, 123)").run(
      PROJECT,
      JSON.stringify({
        collectAutomatically: true,
        useMemory: false,
        collectionTemplate: "Only lasting decisions.",
      }),
    );
    store = new ProjectMemoryStore(db);
    expect(store.settings.get(PROJECT)).toMatchObject({
      collectAutomatically: false,
      useMemory: false,
      revision: 4,
      resetBefore: 123,
      collectionTemplate: "Only lasting decisions.",
    });
    expect(store.get(memory.id)?.content).toBe(memory.content);
    expect(store.remember(candidate({ confidence: 0.9 }))).toBeNull();
    store.settings.save({
      projectPath: PROJECT,
      expectedRevision: 4,
      patch: { useMemory: true },
    });
    expect(
      new ProjectMemoryStore(db).settings.get(PROJECT).collectAutomatically,
    ).toBe(false);
    store.settings.save({
      projectPath: PROJECT,
      expectedRevision: 5,
      patch: { collectAutomatically: true },
    });
    expect(
      new ProjectMemoryStore(db).settings.get(PROJECT).collectAutomatically,
    ).toBe(true);
  });

  test("persists project-specific controls and rejects stale settings saves", () => {
    expect(store.settings.get(PROJECT)).toEqual(
      DEFAULT_PROJECT_MEMORY_SETTINGS,
    );
    const settings = store.settings.save({
      projectPath: PROJECT,
      expectedRevision: 0,
      patch: {
        useMemory: false,
        kinds: ["gotcha"],
        collectionTemplate: "Keep recovery pitfalls only.",
      },
    });
    expect(new ProjectMemoryStore(db).settings.get(PROJECT)).toEqual(settings);
    expect(store.settings.get(OTHER)).toEqual(DEFAULT_PROJECT_MEMORY_SETTINGS);
    expect(() =>
      store.settings.save({
        projectPath: PROJECT,
        expectedRevision: 0,
        patch: { useMemory: true },
      }),
    ).toThrow("changed elsewhere");
    expect(store.settings.get(PROJECT)).toEqual(settings);
  });

  test("recall and collection can be disabled independently without losing saved rows", () => {
    enableCollection();
    store.remember(candidate({ confidence: 0.9, recallMode: "core" }));
    store.settings.save({
      projectPath: PROJECT,
      expectedRevision: 0,
      patch: { useMemory: false },
    });
    expect(store.recall({ projectPath: PROJECT, now: NOW })).toEqual([]);
    expect(
      store.remember(
        candidate({
          content: "Use transaction boundaries for cache updates.",
          collectionRevision: 1,
        }),
      ),
    ).not.toBeNull();
    store.settings.save({
      projectPath: PROJECT,
      expectedRevision: 1,
      patch: { useMemory: true, collectAutomatically: false },
    });
    expect(store.recall({ projectPath: PROJECT, now: NOW })).toHaveLength(1);
    expect(store.list({ projectPath: PROJECT })).toHaveLength(2);
    expect(
      store.remember(
        candidate({
          content: "Do not retain a closed session handle.",
          collectionRevision: 2,
        }),
      ),
    ).toBeNull();
    expect(
      store.remember(
        candidate({
          content: "Agent saves also require collection to be enabled.",
          confidence: 0.9,
        }),
      ),
    ).toBeNull();
  });

  test("enforces allowed kinds even when a generated candidate ignores its prompt", () => {
    enableCollection();
    store.settings.save({
      projectPath: PROJECT,
      expectedRevision: 0,
      patch: { kinds: ["gotcha"] },
    });
    expect(
      store.remember(candidate({ kind: "fact", collectionRevision: 1 })),
    ).toBeNull();
    expect(store.remember(candidate({ collectionRevision: 1 }))).not.toBeNull();
    store.settings.save({
      projectPath: PROJECT,
      expectedRevision: 1,
      patch: { kinds: [] },
    });
    expect(
      store.remember(
        candidate({ content: "Another candidate", collectionRevision: 2 }),
      ),
    ).toBeNull();
  });

  test("clears candidates only and invalidates pending extraction without affecting another project", () => {
    enableCollection();
    store.remember(candidate());
    store.remember(
      candidate({
        content: "Always check the schema version.",
        confidence: 0.9,
        recallMode: "core",
      }),
    );
    enableCollection(OTHER);
    store.remember(candidate({ projectPath: OTHER }));
    expect(
      store.settings.clear({
        projectPath: PROJECT,
        scope: "candidates",
        now: NOW + 1,
      }),
    ).toBe(1);
    expect(
      store.list({ projectPath: PROJECT }).map((m) => m.recallMode),
    ).toEqual(["core"]);
    expect(store.list({ projectPath: OTHER })).toHaveLength(1);
    expect(
      store.remember(
        candidate({
          content: "A pending result",
          collectionRevision: 0,
          sourceCreatedAt: NOW + 2,
        }),
      ),
    ).toBeNull();
  });

  test("reset blocks old and unknown source turns even after the new revision is read", () => {
    enableCollection();
    store.remember(candidate({ confidence: 0.9 }));
    store.settings.save({
      projectPath: PROJECT,
      expectedRevision: 0,
      patch: { collectionTemplate: "Remember recovery rules." },
    });
    expect(
      store.settings.clear({
        projectPath: PROJECT,
        scope: "all",
        now: NOW + 10,
      }),
    ).toBe(1);
    expect(store.settings.get(PROJECT)).toMatchObject({
      revision: 2,
      resetBefore: NOW + 10,
      collectionTemplate: "Remember recovery rules.",
    });
    expect(store.list({ projectPath: PROJECT })).toEqual([]);
    for (const sourceCreatedAt of [undefined, null, NOW, NOW + 10]) {
      expect(
        store.remember(
          candidate({
            content: "Rephrased old knowledge",
            collectionRevision: 2,
            sourceCreatedAt,
          }),
        ),
      ).toBeNull();
    }
    expect(
      store.remember(
        candidate({
          content: "Newly learned recovery knowledge",
          collectionRevision: 2,
          sourceCreatedAt: NOW + 11,
          now: NOW + 12,
        }),
      ),
    ).not.toBeNull();
    expect(
      store.remember(
        candidate({
          collectionRevision: 2,
          sourceCreatedAt: NOW + 11,
          now: NOW + 12,
        }),
      ),
    ).toBeNull();
  });

  test("resetting an empty project still invalidates in-flight extraction", () => {
    expect(
      store.settings.clear({ projectPath: PROJECT, scope: "all", now: NOW }),
    ).toBe(0);
    expect(
      store.remember(
        candidate({ collectionRevision: 0, sourceCreatedAt: NOW + 1 }),
      ),
    ).toBeNull();
    expect(store.settings.get(PROJECT).revision).toBe(1);
  });
});

test("custom collection guidance retains bounded output and kind constraints", () => {
  const instruction = buildMemoryCollectionInstruction({
    ...DEFAULT_PROJECT_MEMORY_SETTINGS,
    collectAutomatically: true,
    kinds: ["decision", "gotcha"],
    collectionTemplate:
      "Focus on database migration pitfalls; exclude visual styling.",
  });
  expect(instruction).toContain("Focus on database migration pitfalls");
  expect(instruction).toContain("Allowed kinds: decision, gotcha.");
  expect(instruction).toContain("at most one candidate");
  expect(instruction).toContain("under 200 characters");
  expect(buildMemoryCollectionInstruction(null)).toContain("durableFacts: []");
  expect(
    buildMemoryCollectionInstruction({
      ...DEFAULT_PROJECT_MEMORY_SETTINGS,
      kinds: [],
    }),
  ).toContain("durableFacts: []");
  expect(
    ProjectMemorySettingsPatchSchema.safeParse({ collectionTemplate: " " })
      .success,
  ).toBe(false);
  expect(
    ProjectMemorySettingsPatchSchema.safeParse({
      collectionTemplate: "x".repeat(4001),
    }).success,
  ).toBe(false);
  expect(
    ProjectMemorySettingsPatchSchema.safeParse({ revision: 5 }).success,
  ).toBe(false);
});
