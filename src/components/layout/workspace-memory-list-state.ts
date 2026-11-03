/**
 * Which memories the Information panel's Memory list draws: a search over the
 * memory text and a kind filter, both offered only once the list is long
 * enough to need them.
 */

import {
  REPOSITORY_MEMORY_KINDS,
  type RepositoryMemory,
  type RepositoryMemoryKind,
} from "@/lib/repository-memory";

/**
 * Below this many memories the whole list fits in a glance, and a search
 * field and a chip row would take more room than they save.
 */
export const MEMORY_FILTERS_MIN_COUNT = 8;

export type MemoryKindFilter = RepositoryMemoryKind | "all";

/** Composed (NFC) and lower-cased, so a decomposed Korean syllable still matches. */
function searchForm(text: string): string {
  return text.normalize("NFC").toLocaleLowerCase();
}

function queryWords(query: string): string[] {
  return searchForm(query).trim().split(/\s+/u).filter(Boolean);
}

/**
 * The filters appear at `MEMORY_FILTERS_MIN_COUNT` memories and stay while a
 * query is typed, a kind is chosen or the search field has focus: forgetting a
 * memory that drops the list below the threshold must not pull the controls
 * out from under the reader.
 */
export function shouldOfferMemoryFilters(args: {
  total: number;
  query: string;
  kind: MemoryKindFilter;
  focused?: boolean;
}): boolean {
  return (
    args.total >= MEMORY_FILTERS_MIN_COUNT ||
    queryWords(args.query).length > 0 ||
    args.kind !== "all" ||
    args.focused === true
  );
}

export interface MemoryListView<T> {
  rows: T[];
  /** Every memory the list holds. */
  total: number;
  /** A query or a kind narrows the list. */
  filtering: boolean;
  /** Matches of the typed query, overall and per kind: the chips' counts. */
  counts: Record<MemoryKindFilter, number>;
  /**
   * The kinds that get a chip: those the repository holds at all (not only
   * the query's matches, so chips do not come and go while typing) and the
   * chosen one. One kind alone needs no chips beside "All".
   */
  kinds: RepositoryMemoryKind[];
}

export function selectMemoryListView<
  T extends Pick<RepositoryMemory, "kind" | "content">,
>(args: { items: readonly T[]; query: string; kind: MemoryKindFilter }): MemoryListView<T> {
  const words = queryWords(args.query);
  const matches =
    words.length > 0
      ? args.items.filter((memory) => {
          const text = searchForm(memory.content);
          return words.every((word) => text.includes(word));
        })
      : [...args.items];
  const counts = { all: matches.length } as Record<MemoryKindFilter, number>;
  for (const kind of REPOSITORY_MEMORY_KINDS) counts[kind] = 0;
  for (const memory of matches) counts[memory.kind] += 1;
  const kinds = REPOSITORY_MEMORY_KINDS.filter(
    (kind) => kind === args.kind || args.items.some((memory) => memory.kind === kind),
  );
  return {
    rows: args.kind === "all" ? matches : matches.filter((memory) => memory.kind === args.kind),
    total: args.items.length,
    filtering: words.length > 0 || args.kind !== "all",
    counts,
    kinds,
  };
}

/** Chips earn their row once there are two kinds to tell apart, or one is chosen. */
export function shouldShowMemoryKindChips(view: MemoryListView<unknown>, kind: MemoryKindFilter): boolean {
  return view.kinds.length > 1 || kind !== "all";
}
