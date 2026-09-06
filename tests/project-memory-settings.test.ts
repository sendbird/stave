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

  const candidate = (overrides: Record<string, unknown> = {}) => ({
    projectPath: PROJECT,
    kind: "gotcha" as const,
    content: "Check the cache epoch before restoring a session.",
    confidence: 0.6,
    now: NOW,
    ...overrides,
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
          content: "Explicit knowledge can still be saved.",
          confidence: 0.9,
        }),
      ),
    ).not.toBeNull();
  });

  test("enforces allowed kinds even when a generated candidate ignores its prompt", () => {
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
    store.remember(candidate());
    store.remember(
      candidate({
        content: "Always check the schema version.",
        confidence: 0.9,
        recallMode: "core",
      }),
    );
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
