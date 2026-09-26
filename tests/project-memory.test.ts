import { describe, expect, test } from "bun:test";
import {
  REPOSITORY_MEMORY_INJECTION_MAX_CHARS,
  REPOSITORY_MEMORY_INJECTION_MAX_ITEMS,
  REPOSITORY_MEMORY_STALE_AFTER_MS,
  RepositoryMemoryFactInputSchema,
  capRepositoryMemoriesForInjection,
  extractRepositoryMemoryQueryTerms,
  isRepositoryMemoryDuplicate,
  isRepositoryMemoryStale,
  orderRepositoryMemoriesForInjection,
  repositoryMemorySimilarity,
  type RepositoryMemory,
} from "../src/lib/project-memory";
import {
  STAVE_REPOSITORY_MEMORY_SOURCE_ID,
  buildRepositoryMemoryRetrievedContextPart,
  resolveRepositoryMemoryRecallQuery,
} from "../src/lib/task-context/project-memory";

const NOW = Date.parse("2026-09-03T00:00:00.000Z");

function memory(patch: Partial<RepositoryMemory> & { id: string }): RepositoryMemory {
  return {
    repositoryPath: "/tmp/p",
    kind: "fact",
    recallMode: "contextual",
    content: `content ${patch.id}`,
    sourceTaskId: null,
    sourceTurnId: null,
    confidence: 0.9,
    createdAt: NOW,
    lastConfirmedAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...patch,
  };
}

describe("project memory domain rules", () => {
  test("content is one short sentence of at most 280 characters", () => {
    expect(
      RepositoryMemoryFactInputSchema.safeParse({ kind: "fact", content: " ok " }).success,
    ).toBe(true);
    expect(
      RepositoryMemoryFactInputSchema.safeParse({
        kind: "fact",
        content: "x".repeat(281),
      }).success,
    ).toBe(false);
    expect(
      RepositoryMemoryFactInputSchema.safeParse({ kind: "rumor", content: "x" }).success,
    ).toBe(false);
  });

  test("similarity ignores whitespace, case and punctuation", () => {
    expect(repositoryMemorySimilarity("Use Bun.", "use  bun")).toBe(1);
    expect(
      repositoryMemorySimilarity(
        "Run typecheck before finishing.",
        "Run typecheck before finishing a change.",
      ),
    ).toBeGreaterThan(0.75);
    expect(
      repositoryMemorySimilarity("Use Bun commands.", "Deploy from release branch."),
    ).toBeLessThan(0.2);
    expect(
      isRepositoryMemoryDuplicate({
        candidate: { kind: "fact", content: "Use Bun commands." },
        existing: { kind: "convention", content: "Use Bun commands." },
      }),
    ).toBe(false);
  });

  test("stale means low confidence and unconfirmed for 60 days", () => {
    const old = NOW - REPOSITORY_MEMORY_STALE_AFTER_MS - 1;
    expect(
      isRepositoryMemoryStale({
        memory: { confidence: 0.6, lastConfirmedAt: old },
        now: NOW,
      }),
    ).toBe(true);
    expect(
      isRepositoryMemoryStale({
        memory: { confidence: 0.9, lastConfirmedAt: old },
        now: NOW,
      }),
    ).toBe(false);
    expect(
      isRepositoryMemoryStale({
        memory: { confidence: 0.6, lastConfirmedAt: NOW - 1 },
        now: NOW,
      }),
    ).toBe(false);
  });

  test("ordering puts confidence first, then recency, and drops deleted and stale rows", () => {
    const ordered = orderRepositoryMemoriesForInjection(
      [
        memory({ id: "c", confidence: 0.6, lastConfirmedAt: NOW - 10 }),
        memory({ id: "a", confidence: 0.9, lastConfirmedAt: NOW - 100 }),
        memory({ id: "b", confidence: 0.9, lastConfirmedAt: NOW }),
        memory({ id: "deleted", deletedAt: NOW }),
        memory({
          id: "stale",
          confidence: 0.6,
          lastConfirmedAt: NOW - REPOSITORY_MEMORY_STALE_AFTER_MS - 1,
        }),
      ],
      NOW,
    );
    expect(ordered.map((m) => m.id)).toEqual(["b", "a", "c"]);
  });

  test("query terms drop stop words and duplicates and retain Korean terms", () => {
    expect(
      extractRepositoryMemoryQueryTerms("Fix the FTS5 index in the store, the store!"),
    ).toEqual(["index", "store", "fts5"]);
    expect(extractRepositoryMemoryQueryTerms("메모리 모델 수정")).toEqual(["메모리", "모델"]);
    expect(extractRepositoryMemoryQueryTerms("a b")).toEqual([]);
  });

  test("cap holds both the row and the byte bound", () => {
    const rows = Array.from({ length: 1_000 }, (_, index) =>
      memory({ id: `m${index}`, content: `Row ${index} ${"word ".repeat(30)}` }),
    );
    const kept = capRepositoryMemoriesForInjection(rows);
    expect(kept.length).toBeLessThanOrEqual(REPOSITORY_MEMORY_INJECTION_MAX_ITEMS);
    expect(kept.length).toBeGreaterThan(0);
    const rendered = kept.reduce(
      (total, row) => total + `- (${row.kind}) ${row.content}`.length + 1,
      0,
    );
    expect(rendered).toBeLessThanOrEqual(REPOSITORY_MEMORY_INJECTION_MAX_CHARS);

    const short = Array.from({ length: 50 }, (_, index) =>
      memory({ id: `s${index}`, content: "tiny" }),
    );
    expect(capRepositoryMemoriesForInjection(short)).toHaveLength(
      REPOSITORY_MEMORY_INJECTION_MAX_ITEMS,
    );
  });

  test("the retrieved-context part is null when empty and one line per item otherwise", () => {
    expect(buildRepositoryMemoryRetrievedContextPart({ memories: [] })).toBeNull();
    const part = buildRepositoryMemoryRetrievedContextPart({
      memories: [
        memory({ id: "1", kind: "convention", content: "Use Bun." }),
        memory({ id: "2", kind: "gotcha", content: "Native  sqlite\n is skipped." }),
      ],
    });
    expect(part?.sourceId).toBe(STAVE_REPOSITORY_MEMORY_SOURCE_ID);
    expect(part?.content).toContain("- (convention) Use Bun.");
    expect(part?.content).toContain("- (gotcha) Native sqlite is skipped.");
    expect(part?.content).not.toMatch(/\d{13}/);

    const full = buildRepositoryMemoryRetrievedContextPart({
      memories: Array.from({ length: 40 }, (_, index) =>
        memory({ id: `f${index}`, content: `Row ${index} ${"word ".repeat(40)}` }),
      ),
    });
    expect(full!.content.length).toBeLessThanOrEqual(
      REPOSITORY_MEMORY_INJECTION_MAX_CHARS,
    );
  });

  test("recall follows current work, with recent context for short continuations", () => {
    expect(
      resolveRepositoryMemoryRecallQuery({
        history: [
          { role: "assistant", content: "hello" },
          { role: "user", content: "  first ask  " },
          { role: "user", content: "second ask" },
        ],
        prompt: "current terminal request",
      }),
    ).toBe("current terminal request");
    expect(
      resolveRepositoryMemoryRecallQuery({ history: [], prompt: " only ask " }),
    ).toBe("only ask");
  });
});
