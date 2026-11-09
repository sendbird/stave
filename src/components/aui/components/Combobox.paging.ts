import type * as React from "react";

import type { ComboboxPagingProps } from "./Combobox.loadMore";

/**
 * The async / paged half of the array pickers (`Combobox`, `Autocomplete`),
 * as ONE object instead of eight flat props.
 *
 * Every field is the flat prop of the same name (see `Combobox.loadMore` for
 * the two-loading-states contract), with one rename: `loadingMoreText` is
 * `loadingMoreLabel`, the `*Label` spelling every other ReactNode copy prop
 * uses. Grouping them is what makes "this picker pages" one decision at the
 * call site — `paging={query.paging}` — rather than eight props that have to
 * be kept in step by hand.
 */
export type ComboboxPaging = {
  /** The server has more rows after `options`. @default false */
  hasMore?: boolean;
  /** Failure of the current remote option request — see `loadError`. */
  loadError?: React.ReactNode;
  /** Label for the manual fallback button. @default "Load more" */
  loadMoreLabel?: React.ReactNode;
  /** A page is being appended below the options on screen. @default false */
  loadingMore?: boolean;
  /** Copy for the appended row. @default "Loading more…" */
  loadingMoreLabel?: React.ReactNode;
  /** Fetch the next page; never called while loading. */
  onLoadMore?: () => void;
  /** Retry the request represented by `loadError`. */
  onLoadRetry?: () => void;
  /** Label for the request recovery action. @default "Retry" */
  retryLabel?: React.ReactNode;
};

export type ComboboxPagingInput = {
  /**
   * Infinite scroll / paged loading in one object — `hasMore`, `loadingMore`,
   * `onLoadMore`, `loadError`, `onLoadRetry` and their labels.
   */
  paging?: ComboboxPaging;
};

/**
 * Unfold `paging` into the internal flat contract the pickers render from.
 */
export function resolveComboboxPaging<Props extends ComboboxPagingInput>({
  paging,
  ...rest
}: Props): Omit<Props, keyof ComboboxPagingInput> & ComboboxPagingProps {
  return {
    ...rest,
    hasMore: paging?.hasMore,
    loadError: paging?.loadError,
    loadMoreLabel: paging?.loadMoreLabel,
    loadingMore: paging?.loadingMore,
    loadingMoreText: paging?.loadingMoreLabel,
    onLoadMore: paging?.onLoadMore,
    onLoadRetry: paging?.onLoadRetry,
    retryLabel: paging?.retryLabel,
  };
}
