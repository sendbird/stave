/**
 * Fleet search matching and the order of a workspace card's task rows.
 *
 * The board and the card share one rule: a value matches when it contains the
 * trimmed query, ignoring case. A card lists its first `limit` rows before the
 * "N more" disclosure. While a query is active, the rows that match come first
 * and all of them stay above the disclosure, even past the limit, so a match
 * never hides behind "N more".
 */

export function normalizeFleetSearchQuery(query: string | undefined): string {
  return query?.trim().toLowerCase() ?? "";
}

/** True when any value contains the normalized query. An empty query matches. */
export function fleetSearchMatches(
  values: readonly string[],
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) {
    return true;
  }
  return values.some((value) => value.toLowerCase().includes(normalizedQuery));
}

export type FleetCardTaskRowOrder<Row> = {
  /** Display order: matching rows first while a query is active. */
  orderedRows: Row[];
  /** How many of `orderedRows` show before the "N more" disclosure. */
  collapsedCount: number;
  /** Rows the query matched; 0 when no query is active. */
  matchedCount: number;
  /**
   * A query is active and no task row matched it, so the card is on the board
   * because of its own name, project or branch.
   */
  noTaskMatched: boolean;
};

export function orderFleetCardTaskRows<Row>(args: {
  rows: readonly Row[];
  limit: number;
  query?: string;
  searchableTextOf: (row: Row) => readonly string[];
}): FleetCardTaskRowOrder<Row> {
  const query = normalizeFleetSearchQuery(args.query);
  if (!query) {
    return {
      orderedRows: [...args.rows],
      collapsedCount: Math.min(args.limit, args.rows.length),
      matchedCount: 0,
      noTaskMatched: false,
    };
  }
  const matched: Row[] = [];
  const others: Row[] = [];
  for (const row of args.rows) {
    (fleetSearchMatches(args.searchableTextOf(row), query) ? matched : others).push(row);
  }
  return {
    orderedRows: [...matched, ...others],
    collapsedCount: Math.min(Math.max(args.limit, matched.length), args.rows.length),
    matchedCount: matched.length,
    noTaskMatched: matched.length === 0,
  };
}

/**
 * The first case-insensitive occurrence of the query in `text`, split for
 * highlighting. Returns null when the query is empty or absent from the text.
 */
export function splitFleetSearchMatch(
  text: string,
  normalizedQuery: string,
): { before: string; match: string; after: string } | null {
  const lowered = text.toLowerCase();
  // Some characters change length when lowercased; an offset into `lowered`
  // would then cut `text` in the wrong place, so skip the highlight.
  if (!normalizedQuery || lowered.length !== text.length) {
    return null;
  }
  const index = lowered.indexOf(normalizedQuery);
  if (index === -1) {
    return null;
  }
  return {
    before: text.slice(0, index),
    match: text.slice(index, index + normalizedQuery.length),
    after: text.slice(index + normalizedQuery.length),
  };
}
