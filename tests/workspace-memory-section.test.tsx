import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import type { RepositoryMemory } from "@/lib/repository-memory";
import { MemoryRow } from "@/components/layout/WorkspaceMemorySection";
import {
  MemoryListFilters,
  MemoryListFilterStatus,
} from "@/components/layout/workspace-memory-filters";
import {
  forgetMemoryWithUndo,
  memoryToastExcerpt,
} from "@/components/layout/workspace-memory-forget";
import {
  MEMORY_FILTERS_MIN_COUNT,
  selectMemoryListView,
  shouldOfferMemoryFilters,
  shouldShowMemoryKindChips,
  type MemoryKindFilter,
} from "@/components/layout/workspace-memory-list-state";

afterEach(() => applyAppLocale("en"));

const NOW = Date.parse("2026-09-03T12:00:00.000Z");
const REPOSITORY = "/tmp/stave-memory/project-p";
const noop = () => {};

function memory(patch: Partial<RepositoryMemory> & Pick<RepositoryMemory, "id" | "kind" | "content">): RepositoryMemory {
  return {
    repositoryPath: REPOSITORY,
    recallMode: "contextual",
    sourceTaskId: null,
    sourceTurnId: null,
    confidence: 0.9,
    createdAt: NOW - 86_400_000,
    lastConfirmedAt: NOW - 3 * 3_600_000,
    updatedAt: NOW - 3 * 3_600_000,
    deletedAt: null,
    ...patch,
  };
}

const TEN: RepositoryMemory[] = [
  memory({ id: "c1", kind: "convention", content: "Use Bun for install, test and build." }),
  memory({ id: "c2", kind: "convention", content: "Run the Pages build before a PR is ready." }),
  memory({ id: "c3", kind: "convention", content: "Keep every string in both catalogs." }),
  memory({ id: "d1", kind: "decision", content: "Author styles with stylex.create." }),
  memory({ id: "d2", kind: "decision", content: "Toasts stack top-center for notifications." }),
  memory({ id: "g1", kind: "gotcha", content: "The provider event schema has two copies." }),
  memory({ id: "g2", kind: "gotcha", content: "Settings sections remount on tab change." }),
  memory({ id: "g3", kind: "gotcha", content: "터미널 스냅숏은 안정된 키를 씁니다." }),
  memory({ id: "f1", kind: "fact", content: "The dev bridge listens on port 3001." }),
  memory({ id: "f2", kind: "fact", content: "Memory rows are scoped by project path." }),
];

function filtersHtml(items: RepositoryMemory[], query = "", kind: MemoryKindFilter = "all") {
  return renderToStaticMarkup(
    createElement(MemoryListFilters, {
      view: selectMemoryListView({ items, query, kind }),
      query,
      onQueryChange: noop,
      onSearchFocusChange: noop,
      searchInputRef: { current: null },
      kind,
      onKindChange: noop,
    }),
  );
}

describe("memory list filters", () => {
  test(`search and chips appear from ${MEMORY_FILTERS_MIN_COUNT} memories and stay while they are in use`, () => {
    expect(MEMORY_FILTERS_MIN_COUNT).toBe(8);
    expect(shouldOfferMemoryFilters({ total: 7, query: "", kind: "all" })).toBe(false);
    expect(shouldOfferMemoryFilters({ total: 8, query: "", kind: "all" })).toBe(true);
    // Forgetting down to seven must not pull the controls out from under the reader.
    expect(shouldOfferMemoryFilters({ total: 7, query: "bun", kind: "all" })).toBe(true);
    expect(shouldOfferMemoryFilters({ total: 7, query: "  ", kind: "all" })).toBe(false);
    expect(shouldOfferMemoryFilters({ total: 7, query: "", kind: "gotcha" })).toBe(true);
    expect(shouldOfferMemoryFilters({ total: 7, query: "", kind: "all", focused: true })).toBe(true);
  });

  test("the search matches every word of the memory text, in any case or Unicode form", () => {
    const view = selectMemoryListView({ items: TEN, query: "BUN build", kind: "all" });
    expect(view.rows.map((item) => item.id)).toEqual(["c1"]);
    expect(view.filtering).toBe(true);
    // A decomposed Korean query still finds the composed text.
    const korean = selectMemoryListView({ items: TEN, query: "스냅숏".normalize("NFD"), kind: "all" });
    expect(korean.rows.map((item) => item.id)).toEqual(["g3"]);
    expect(selectMemoryListView({ items: TEN, query: "", kind: "all" }).filtering).toBe(false);
  });

  test("a kind narrows the rows; chip counts follow the query and chips stay put while typing", () => {
    const all = selectMemoryListView({ items: TEN, query: "", kind: "all" });
    expect(all.counts).toEqual({ all: 10, decision: 2, convention: 3, gotcha: 3, fact: 2 });
    expect(all.kinds).toEqual(["decision", "convention", "gotcha", "fact"]);

    const gotchas = selectMemoryListView({ items: TEN, query: "", kind: "gotcha" });
    expect(gotchas.rows.map((item) => item.id)).toEqual(["g1", "g2", "g3"]);

    const typed = selectMemoryListView({ items: TEN, query: "the", kind: "all" });
    expect(typed.counts.decision).toBe(0);
    expect(typed.kinds).toContain("decision");
  });

  test("one kind alone gets no chips, unless it is the chosen one", () => {
    const onlyFacts = TEN.filter((item) => item.kind === "fact");
    expect(shouldShowMemoryKindChips(selectMemoryListView({ items: onlyFacts, query: "", kind: "all" }), "all")).toBe(false);
    expect(shouldShowMemoryKindChips(selectMemoryListView({ items: onlyFacts, query: "", kind: "fact" }), "fact")).toBe(true);
    expect(filtersHtml(onlyFacts)).not.toContain('role="radiogroup"');
  });

  test("renders a named search field and one radio per kind with its count", () => {
    const html = filtersHtml(TEN);
    expect(html).toContain('aria-label="Search memory"');
    expect(html).toContain('placeholder="Search memory text"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Filter memory by kind"');
    for (const label of ["All", "Decision", "Convention", "Gotcha", "Fact"]) {
      expect(html).toContain(`>${label}</span>`);
    }
    expect(html).toContain(">10</span>");
    expect(html.match(/role="radio"/g)).toHaveLength(5);
    expect(html).not.toContain("Clear search");
    expect(filtersHtml(TEN, "bun")).toContain('aria-label="Clear search"');
  });

  test("the status says how many match, or that none does with a way back", () => {
    const some = renderToStaticMarkup(createElement(MemoryListFilterStatus, { matched: 3, total: 10, onClear: noop }));
    expect(some).toContain("3 of 10 memories match");
    expect(some).toContain('role="status"');
    expect(some).not.toContain("<button");
    const none = renderToStaticMarkup(createElement(MemoryListFilterStatus, { matched: 0, total: 10, onClear: noop }));
    expect(none).toContain("No memories match these filters.");
    expect(none).toContain("Clear filters");
  });

  test("Korean", () => {
    applyAppLocale("ko");
    const html = filtersHtml(TEN);
    expect(html).toContain('aria-label="메모리 검색"');
    for (const label of ["전체", "결정", "규칙", "주의점", "사실"]) {
      expect(html).toContain(`>${label}</span>`);
    }
    expect(
      renderToStaticMarkup(createElement(MemoryListFilterStatus, { matched: 2, total: 10, onClear: noop })),
    ).toContain("메모리 10개 중 2개 일치");
  });
});

function rowHtml(patch: Partial<Parameters<typeof MemoryRow>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(MemoryRow, {
      memory: TEN[0]!,
      onSave: async () => true,
      onRemove: async () => true,
      now: new Date(NOW),
      ...patch,
    }),
  );
}

describe("memory row provenance", () => {
  test("the meta line says when the memory was last confirmed", () => {
    const html = rowHtml();
    expect(html).toContain("data-memory-meta-provenance");
    expect(html).toMatch(/Last confirmed <button[^>]*><time dateTime="2026-09-03T09:00:00.000Z">3h ago<\/time><\/button>/);
    expect(html).not.toContain("Source task");
  });

  test("links the source task when it still exists, named by its title", () => {
    const html = rowHtml({
      memory: { ...TEN[0]!, sourceTaskId: "task-a" },
      sourceTask: { taskId: "task-a", workspaceId: "ws-1", title: "Tighten the memory panel" },
      onOpenSourceTask: noop,
    });
    expect(html).toContain("data-memory-source-task");
    expect(html).toContain(">Source task<");
    expect(html).toContain('aria-label="Open source task: Tighten the memory panel"');
  });

  test("marks the search in the memory text", () => {
    expect(rowHtml({ query: "bun" })).toMatch(/<mark[^>]*>Bun<\/mark>/);
  });

  test("forgetting asks nothing first: no dialog is rendered with the row", () => {
    const html = rowHtml();
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("cannot be undone");
  });

  test("Korean", () => {
    applyAppLocale("ko");
    const html = rowHtml({
      sourceTask: { taskId: "task-a", workspaceId: "ws-1", title: "메모리 패널 정리" },
      onOpenSourceTask: noop,
    });
    expect(html).toMatch(/<time[^>]*>3시간 전<\/time><\/button> 마지막 확인/);
    expect(html).toContain(">출처 작업<");
  });
});

describe("forget with Undo", () => {
  type Offer = { title: unknown; undoLabel: unknown; description?: unknown; onUndo: () => void };

  function harness(overrides: {
    deleteResult?: { ok: boolean; message?: string };
    restoreResult?: { ok: boolean; memory?: RepositoryMemory | null; message?: string };
    withoutRestore?: boolean;
  } = {}) {
    const calls: string[] = [];
    const offers: Offer[] = [];
    const errors: string[] = [];
    const api = {
      delete: async (args: { id: string }) => {
        calls.push(`delete:${args.id}`);
        return overrides.deleteResult ?? { ok: true, deleted: true };
      },
      ...(overrides.withoutRestore
        ? {}
        : {
            restore: async (args: { id: string; repositoryPath: string }) => {
              calls.push(`restore:${args.id}:${args.repositoryPath}`);
              return overrides.restoreResult ?? { ok: true, memory: TEN[5]! };
            },
          }),
    };
    const deps = {
      api,
      onChanged: () => calls.push("changed"),
      offerUndo: (title: unknown, options: Omit<Offer, "title">) => {
        offers.push({ title, ...options });
      },
      showError: (message: string) => errors.push(message),
    };
    return { calls, offers, errors, deps };
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  test("forgets at once, then Undo restores it in the same repository", async () => {
    const { calls, offers, errors, deps } = harness();
    expect(await forgetMemoryWithUndo(TEN[5]!, deps)).toBe(true);
    expect(calls).toEqual(["delete:g1", "changed"]);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      title: "Memory forgotten",
      undoLabel: "Undo",
      description: "The provider event schema has two copies.",
    });
    offers[0]!.onUndo();
    await flush();
    expect(calls).toEqual(["delete:g1", "changed", `restore:g1:${REPOSITORY}`, "changed"]);
    expect(errors).toEqual([]);
  });

  test("a failed forget keeps the row, says why and offers no Undo", async () => {
    const { calls, offers, errors, deps } = harness({ deleteResult: { ok: false, message: "database is locked" } });
    expect(await forgetMemoryWithUndo(TEN[5]!, deps)).toBe(false);
    expect(calls).toEqual(["delete:g1"]);
    expect(offers).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toStartWith("Could not forget memory.");
    expect(errors[0]).toContain("database is locked");
  });

  test("an Undo that comes too late says the memory could not be restored", async () => {
    const { calls, offers, errors, deps } = harness({ restoreResult: { ok: true, memory: null } });
    await forgetMemoryWithUndo(TEN[5]!, deps);
    offers[0]!.onUndo();
    await flush();
    expect(calls.filter((call) => call === "changed")).toHaveLength(1);
    expect(errors).toEqual(["Could not restore memory."]);
  });

  test("a desktop build without the restore bridge forgets without promising an Undo", async () => {
    const { offers, deps } = harness({ withoutRestore: true });
    expect(await forgetMemoryWithUndo(TEN[5]!, deps)).toBe(true);
    expect(offers).toEqual([]);
  });

  test("the toast quotes enough of a long memory to recognise it", () => {
    expect(memoryToastExcerpt("Short memory.")).toBe("Short memory.");
    const long = `${"word ".repeat(40)}end.`;
    const excerpt = memoryToastExcerpt(long);
    expect(excerpt.length).toBeLessThanOrEqual(91);
    expect(excerpt.endsWith("word…")).toBe(true);
  });
});
