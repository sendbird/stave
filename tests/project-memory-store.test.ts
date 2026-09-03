import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { ProjectMemoryStore } from "../electron/persistence/project-memory-store";
import {
  PROJECT_MEMORY_INJECTION_MAX_CHARS,
  PROJECT_MEMORY_INJECTION_MAX_ITEMS,
  PROJECT_MEMORY_STALE_AFTER_MS,
} from "../src/lib/project-memory";
import { buildProjectMemoryRetrievedContextPart } from "../src/lib/task-context/project-memory";

const PROJECT_P = "/tmp/stave-memory/project-p";
const PROJECT_Q = "/tmp/stave-memory/project-q";
const NOW = Date.parse("2026-09-03T00:00:00.000Z");

function seedDistinctFacts(args: {
  database: Database;
  projectPath: string;
  count: number;
  now: number;
}) {
  const insert = args.database.prepare(`
    INSERT INTO project_memories (
      id, project_path, kind, content, source_task_id, source_turn_id,
      confidence, created_at, last_confirmed_at, updated_at, deleted_at
    ) VALUES (?, ?, 'fact', ?, NULL, NULL, 0.9, ?, ?, ?, NULL)
  `);
  const seed = args.database.transaction(() => {
    for (let index = 0; index < args.count; index += 1) {
      const at = args.now + index;
      insert.run(
        `mem-${index}`,
        args.projectPath,
        `Fact number ${index}: ${Array.from(
          { length: 10 },
          (_, word) => `token${(index * 7919 + word * 104_729) % 99_991}`,
        ).join(" ")}`,
        at,
        at,
        at,
      );
    }
  });
  seed();
}

describe("ProjectMemoryStore", () => {
  let database: Database;
  let store: ProjectMemoryStore;

  beforeEach(() => {
    database = new Database(":memory:");
    store = new ProjectMemoryStore(database);
  });

  test("uses the FTS5 trigram index when the SQLite build has it", () => {
    expect(store.index).toBe("fts5-trigram");
  });

  test("inserts and lists project-scoped rows only", () => {
    const inserted = store.remember({
      projectPath: PROJECT_P,
      kind: "convention",
      content: "Use Bun commands and `bunx --bun`.",
      confidence: 0.9,
      sourceTaskId: "task-a",
      now: NOW,
    });
    expect(inserted?.outcome).toBe("inserted");
    store.remember({
      projectPath: PROJECT_Q,
      kind: "fact",
      content: "Project Q deploys from the release branch.",
      confidence: 0.9,
      now: NOW,
    });

    expect(
      store.list({ projectPath: PROJECT_P }).map((m) => m.content),
    ).toEqual(["Use Bun commands and `bunx --bun`."]);
    expect(store.recall({ projectPath: PROJECT_Q, now: NOW })).toHaveLength(1);
    expect(
      store.recall({ projectPath: PROJECT_P, now: NOW })[0]?.sourceTaskId,
    ).toBe("task-a");
  });

  test("a same-kind near-duplicate confirms the existing row instead of inserting", () => {
    const first = store.remember({
      projectPath: PROJECT_P,
      kind: "gotcha",
      content: "tests/sqlite-store.test.ts is skipped under bun test.",
      confidence: 0.6,
      now: NOW,
    });
    const second = store.remember({
      projectPath: PROJECT_P,
      kind: "gotcha",
      content: "tests/sqlite-store.test.ts  is skipped under `bun test`",
      confidence: 0.9,
      now: NOW + 1_000,
    });

    expect(second?.outcome).toBe("confirmed");
    expect(second?.memory.id).toBe(first!.memory.id);
    expect(second?.memory.confidence).toBe(0.9);
    expect(second?.memory.lastConfirmedAt).toBe(NOW + 1_000);
    expect(store.list({ projectPath: PROJECT_P })).toHaveLength(1);

    // Same text, different kind: a separate memory.
    const other = store.remember({
      projectPath: PROJECT_P,
      kind: "fact",
      content: "tests/sqlite-store.test.ts is skipped under bun test.",
      confidence: 0.6,
      now: NOW,
    });
    expect(other?.outcome).toBe("inserted");
  });

  test("soft delete hides the row and blocks re-extraction from resurrecting it", () => {
    const inserted = store.remember({
      projectPath: PROJECT_P,
      kind: "decision",
      content:
        "Memory writes go through the host-service SqliteStore directly.",
      confidence: 0.6,
      now: NOW,
    })!;
    expect(store.softDelete({ id: inserted.memory.id, now: NOW })).toBe(true);
    expect(store.softDelete({ id: inserted.memory.id, now: NOW })).toBe(false);
    expect(store.list({ projectPath: PROJECT_P })).toEqual([]);
    expect(
      store.list({ projectPath: PROJECT_P, includeDeleted: true })[0]
        ?.deletedAt,
    ).toBe(NOW);

    const again = store.remember({
      projectPath: PROJECT_P,
      kind: "decision",
      content:
        "Memory writes go through the host-service SqliteStore directly.",
      confidence: 0.6,
      now: NOW + 5,
    });
    expect(again).toBeNull();
    expect(store.recall({ projectPath: PROJECT_P, now: NOW + 5 })).toEqual([]);
    expect(store.update({ id: inserted.memory.id, content: "x" })).toBeNull();
  });

  test("update rewrites content and kind and refreshes the FTS index", () => {
    const inserted = store.remember({
      projectPath: PROJECT_P,
      kind: "fact",
      content: "The renderer talks to main over IPC.",
      confidence: 0.9,
      now: NOW,
    })!;
    const updated = store.update({
      id: inserted.memory.id,
      kind: "convention",
      content: "Renderer reaches main only through preload IPC.",
      now: NOW + 1,
    });
    expect(updated?.kind).toBe("convention");
    expect(
      store.recall({ projectPath: PROJECT_P, query: "preload", now: NOW + 1 }),
    ).toHaveLength(1);
    expect(
      store
        .recall({
          projectPath: PROJECT_P,
          query: "talks over zzz",
          now: NOW + 1,
        })
        .map((m) => m.content),
    ).toEqual(["Renderer reaches main only through preload IPC."]);
  });

  test("recall promotes query hits ahead of stronger rows and never crosses projects", () => {
    store.remember({
      projectPath: PROJECT_P,
      kind: "fact",
      content:
        "The Information panel is rendered by WorkspaceInformationPanel.tsx.",
      confidence: 0.9,
      now: NOW,
    });
    store.remember({
      projectPath: PROJECT_P,
      kind: "gotcha",
      content: "Terminal snapshots are keyed by slotKey, not by tab id.",
      confidence: 0.6,
      now: NOW,
    });
    store.remember({
      projectPath: PROJECT_Q,
      kind: "gotcha",
      content: "Terminal snapshots in project Q are disabled.",
      confidence: 0.95,
      now: NOW,
    });

    const recalled = store.recall({
      projectPath: PROJECT_P,
      query: "Why does the terminal snapshot restore the wrong tab?",
      now: NOW,
    });
    expect(recalled.map((m) => m.kind)).toEqual(["gotcha", "fact"]);
    expect(recalled.every((m) => m.projectPath === PROJECT_P)).toBe(true);
  });

  test("stale low-confidence rows drop out of recall but stay listed", () => {
    store.remember({
      projectPath: PROJECT_P,
      kind: "fact",
      content: "An old auto-extracted fact nobody confirmed.",
      confidence: 0.6,
      now: NOW - PROJECT_MEMORY_STALE_AFTER_MS - 1,
    });
    store.remember({
      projectPath: PROJECT_P,
      kind: "fact",
      content: "An old explicit fact stays because confidence is high.",
      confidence: 0.9,
      now: NOW - PROJECT_MEMORY_STALE_AFTER_MS - 1,
    });

    expect(
      store.recall({ projectPath: PROJECT_P, now: NOW }).map((m) => m.content),
    ).toEqual(["An old explicit fact stays because confidence is high."]);
    expect(
      store.recall({
        projectPath: PROJECT_P,
        query: "nobody confirmed",
        now: NOW,
      }),
    ).toHaveLength(1);
    expect(store.list({ projectPath: PROJECT_P })).toHaveLength(2);
  });

  test("the injected block never exceeds the cap even with 1,000 stored rows", () => {
    // Seed through SQL so the cap is checked against a large table without
    // paying per-row FTS MATCH + Jaccard from `remember()`.
    seedDistinctFacts({
      database,
      projectPath: PROJECT_P,
      count: 1_000,
      now: NOW,
    });
    expect(store.list({ projectPath: PROJECT_P })).toHaveLength(1_000);

    const recalled = store.recall({
      projectPath: PROJECT_P,
      query: "Fact number 999 lorem",
      now: NOW + 2_000,
    });
    expect(recalled.length).toBeLessThanOrEqual(
      PROJECT_MEMORY_INJECTION_MAX_ITEMS,
    );

    const part = buildProjectMemoryRetrievedContextPart({ memories: recalled });
    expect(part).not.toBeNull();
    expect(part!.content.length).toBeLessThanOrEqual(
      PROJECT_MEMORY_INJECTION_MAX_CHARS,
    );
    const itemLines = part!.content
      .split("\n")
      .filter((line) => line.startsWith("- ("));
    expect(itemLines.length).toBeLessThanOrEqual(
      PROJECT_MEMORY_INJECTION_MAX_ITEMS,
    );
    expect(
      itemLines.reduce((total, line) => total + line.length + 1, 0),
    ).toBeLessThanOrEqual(PROJECT_MEMORY_INJECTION_MAX_CHARS);
  });

  test("rejects empty and over-long content", () => {
    expect(() =>
      store.remember({
        projectPath: PROJECT_P,
        kind: "fact",
        content: "   ",
        confidence: 0.9,
      }),
    ).toThrow(/required/);
    expect(() =>
      store.remember({
        projectPath: PROJECT_P,
        kind: "fact",
        content: "x".repeat(281),
        confidence: 0.9,
      }),
    ).toThrow(/280/);
  });
});
