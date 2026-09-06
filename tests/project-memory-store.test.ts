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
      confidence, created_at, last_confirmed_at, updated_at, deleted_at, recall_mode
    ) VALUES (?, ?, 'fact', ?, NULL, NULL, 0.9, ?, ?, ?, NULL, 'contextual')
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
    expect(store.recall({ projectPath: PROJECT_Q, query: "release", now: NOW })).toHaveLength(1);
    expect(
      store.recall({ projectPath: PROJECT_P, query: "Bun", now: NOW })[0]?.sourceTaskId,
    ).toBe("task-a");
  });

  test("an exact same-kind duplicate confirms the existing row instead of inserting", () => {
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
      content: "tests/sqlite-store.test.ts  is skipped under bun test.",
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
    expect(store.update({ id: inserted.memory.id, projectPath: PROJECT_P, content: "x" })).toBeNull();
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
      projectPath: PROJECT_P,
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
    ).toEqual([]);
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
      confidence: 0.9,
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
    expect(recalled.map((m) => m.kind)).toEqual(["gotcha"]);
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
      store.recall({ projectPath: PROJECT_P, query: "explicit", now: NOW }).map((m) => m.content),
    ).toEqual(["An old explicit fact stays because confidence is high."]);
    expect(
      store.recall({
        projectPath: PROJECT_P,
        query: "nobody confirmed",
        now: NOW,
      }),
    ).toHaveLength(0);
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

describe("curated memory lifecycle", () => {
  function setup() {
    const database = new Database(":memory:");
    return { database, store: new ProjectMemoryStore(database) };
  }

  test("candidates never enter recall, including matching and repeated extraction", () => {
    const { store } = setup();
    const args = { projectPath: PROJECT_P, kind: "gotcha" as const, content: "Terminal snapshots require stable slot keys.", confidence: 0.6, now: NOW };
    const first = store.remember(args)!;
    store.remember({ ...args, now: NOW + 1 });
    expect(store.list({ projectPath: PROJECT_P })).toHaveLength(1);
    expect(store.recall({ projectPath: PROJECT_P, query: "Terminal", now: NOW })).toEqual([]);
    const updated = store.update({ id: first.memory.id, projectPath: PROJECT_P, recallMode: "contextual", now: NOW + 2 })!;
    expect(updated.recallMode).toBe("contextual");
    expect(store.recall({ projectPath: PROJECT_P, query: "Terminal", now: NOW + 2 })).toHaveLength(1);
    store.remember({ ...args, now: NOW + 3 });
    expect(store.get(first.memory.id)?.lastConfirmedAt).toBe(NOW + 2);
    expect(store.get(first.memory.id)?.recallMode).toBe("contextual");
  });

  test("explicit curation promotes a candidate and unrelated requests do not receive it", () => {
    const { store } = setup();
    const args = { projectPath: PROJECT_P, kind: "decision" as const, content: "Composer shelves use derived theme colors.", now: NOW };
    const candidate = store.remember({ ...args, confidence: 0.6 })!;
    const curated = store.remember({ ...args, confidence: 0.9 })!;
    expect(curated.memory.id).toBe(candidate.memory.id);
    expect(curated.memory.recallMode).toBe("contextual");
    expect(store.recall({ projectPath: PROJECT_P, query: "database migrations", now: NOW })).toEqual([]);
    expect(store.recall({ projectPath: PROJECT_P, query: "composer", now: NOW })).toHaveLength(1);
    expect(store.recall({ projectPath: PROJECT_P, now: NOW })).toEqual([]);
  });

  test("core memory is small and survives unrelated queries; database also enforces its bound", () => {
    const { database, store } = setup();
    for (const content of ["Prefer durable decisions.", "Verify user corrections.", "Keep project context small."]) {
      store.remember({ projectPath: PROJECT_P, kind: "convention", content, confidence: 0.9, recallMode: "core", now: NOW });
    }
    expect(store.recall({ projectPath: PROJECT_P, query: "unrelated", now: NOW })).toHaveLength(3);
    const extra = store.remember({ projectPath: PROJECT_P, kind: "fact", content: "Database writes are serialized.", confidence: 0.9, now: NOW })!;
    expect(() => store.update({ id: extra.memory.id, projectPath: PROJECT_P, recallMode: "core" })).toThrow(/three|3/);
    expect(() => database.prepare("UPDATE project_memories SET recall_mode = 'core' WHERE id = ?").run(extra.memory.id)).toThrow(/full/);
    expect(store.recall({ projectPath: PROJECT_P, limit: 1, now: NOW })).toHaveLength(1);
    expect(store.recall({ projectPath: PROJECT_P, limit: 0, now: NOW })).toEqual([]);
  });

  test("a rewrite preserves identity, changes retrieval, and refuses another project", () => {
    const { store } = setup();
    const first = store.remember({ projectPath: PROJECT_P, kind: "decision", content: "Default engine is alpha.", confidence: 0.9, now: NOW })!;
    expect(store.update({ id: first.memory.id, projectPath: PROJECT_Q, content: "Default engine is beta." })).toBeNull();
    const updated = store.update({ id: first.memory.id, projectPath: PROJECT_P, content: "Default engine is beta.", now: NOW + 1 })!;
    expect(updated.id).toBe(first.memory.id);
    expect(store.recall({ projectPath: PROJECT_P, query: "alpha", now: NOW + 1 })).toEqual([]);
    expect(store.recall({ projectPath: PROJECT_P, query: "beta", now: NOW + 1 })[0]?.content).toBe("Default engine is beta.");
    store.softDelete({ id: updated.id, now: NOW + 2 });
    expect(store.remember({ projectPath: PROJECT_P, kind: "decision", content: updated.content, confidence: 0.6, now: NOW + 3 })).toBeNull();
  });

  test("similar but opposite decisions are not silently confirmed as identical", () => {
    const { store } = setup();
    const args = { projectPath: PROJECT_P, kind: "decision" as const, confidence: 0.9, now: NOW };
    const yes = store.remember({ ...args, content: "Enable the renderer recovery switch for all new projects." })!;
    const no = store.remember({ ...args, content: "Disable the renderer recovery switch for all new projects." })!;
    expect(no.memory.id).not.toBe(yes.memory.id);
  });

  test("candidate accumulation is bounded without deleting existing knowledge", () => {
    const { store } = setup();
    for (let i = 0; i < 60; i++) store.remember({ projectPath: PROJECT_P, kind: "fact", content: `Candidate ${i}.`, confidence: 0.6, now: NOW });
    expect(store.list({ projectPath: PROJECT_P })).toHaveLength(50);
    expect(store.recall({ projectPath: PROJECT_P, query: "candidate", now: NOW })).toEqual([]);
  });

  test("search pages are bounded, filterable and project-scoped", () => {
    const { store } = setup();
    for (let i = 0; i < 30; i++) store.remember({ projectPath: PROJECT_P, kind: "fact", content: `Terminal candidate ${i}.`, confidence: 0.6, now: NOW });
    store.remember({ projectPath: PROJECT_Q, kind: "fact", content: "Terminal private detail.", confidence: 0.9, now: NOW });
    const ids = new Set<string>();
    let offset: number | null = 0;
    do {
      const page = store.search({ projectPath: PROJECT_P, query: "Terminal", recallMode: "candidate", offset });
      expect(page.memories.length).toBeLessThanOrEqual(12);
      for (const memory of page.memories) {
        expect(memory.projectPath).toBe(PROJECT_P);
        expect(ids.has(memory.id)).toBe(false);
        ids.add(memory.id);
      }
      offset = page.nextOffset;
    } while (offset !== null);
    expect(ids.size).toBe(30);
    expect(store.search({ projectPath: PROJECT_P, query: "unmatched" }).memories).toEqual([]);
    expect(() => store.search({ projectPath: PROJECT_P, offset: -1 })).toThrow();
  });

  test("two-character Korean terms and literal underscores work without FTS", () => {
    const { database } = setup();
    const store = new ProjectMemoryStore({
      exec(sql: string) { if (sql.includes("CREATE VIRTUAL TABLE")) throw new Error("FTS unavailable"); return database.exec(sql); },
      prepare(sql: string) { return database.prepare(sql); },
    });
    store.remember({ projectPath: PROJECT_P, kind: "convention", content: "모델 설정은 task_key로 연결한다.", confidence: 0.9, now: NOW });
    expect(store.recall({ projectPath: PROJECT_P, query: "모델", now: NOW })).toHaveLength(1);
    expect(store.recall({ projectPath: PROJECT_P, query: "task_key", now: NOW })).toHaveLength(1);
    expect(store.recall({ projectPath: PROJECT_P, query: "taskXkey", now: NOW })).toHaveLength(0);
  });

  test("legacy migration preserves rows and deletion, and reopening preserves curation", () => {
    const database = new Database(":memory:");
    database.exec(`CREATE TABLE project_memories (
      id TEXT PRIMARY KEY, project_path TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL,
      source_task_id TEXT, source_turn_id TEXT, confidence REAL NOT NULL,
      created_at INTEGER NOT NULL, last_confirmed_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
    );`);
    const insert = database.prepare("INSERT INTO project_memories VALUES (?, ?, 'fact', ?, NULL, NULL, ?, ?, ?, ?, ?)");
    insert.run("auto", PROJECT_P, "Automatic terminal fact.", 0.6, NOW, NOW, NOW, null);
    insert.run("explicit", PROJECT_P, "Explicit terminal fact.", 0.9, NOW, NOW, NOW, null);
    insert.run("deleted", PROJECT_P, "Forgotten terminal fact.", 0.9, NOW, NOW, NOW, NOW);
    const store = new ProjectMemoryStore(database);
    expect(store.get("auto")?.recallMode).toBe("candidate");
    expect(store.get("explicit")?.recallMode).toBe("contextual");
    expect(store.get("deleted")?.deletedAt).toBe(NOW);
    expect(store.recall({ projectPath: PROJECT_P, query: "terminal", now: NOW }).map((m) => m.id)).toEqual(["explicit"]);
    store.update({ id: "auto", projectPath: PROJECT_P, recallMode: "core", now: NOW });
    expect(new ProjectMemoryStore(database).get("auto")?.recallMode).toBe("core");
  });
});
