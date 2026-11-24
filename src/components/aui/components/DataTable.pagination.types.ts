/**
 * The pagination half of the public `DataTable` contract: page-number and
 * cursor models, their page-size control and their recovery fields. Split out
 * of `DataTable.types.ts` (2026-11-14) when that file reached the source size
 * cap; `DataTable.types.ts` re-exports every public name.
 */
import type * as React from "react";

type DataTablePageBoundary =
  | {
      /** Known total: the footer can announce "Page n of m". */
      pageCount: number;
      hasNext?: undefined;
    }
  | {
      /** Unknown total: server only reports whether another page exists. */
      hasNext: boolean;
      pageCount?: undefined;
    };

type DataTablePageSizeControl =
  | {
      onPageSizeChange?: undefined;
      pageSize?: undefined;
      pageSizeLabel?: undefined;
      pageSizeOptions?: undefined;
    }
  | {
      /** Current server/query page size. */
      pageSize: number;
      /** Offered page sizes; the current value is included automatically. */
      pageSizeOptions: readonly number[];
      /** Changing size normally resets the caller-owned page to 1. */
      onPageSizeChange: (pageSize: number) => void;
      pageSizeLabel?: React.ReactNode;
    };

type DataTablePaginationRecovery =
  | {
      error?: undefined;
      onRetry?: undefined;
      retryLabel?: undefined;
    }
  | {
      /** Non-fatal continuation failure. Current rows remain mounted. */
      error: React.ReactNode;
      /** Retry the failed pagination request without changing the current page. */
      onRetry: () => void;
      retryLabel?: React.ReactNode;
    };

export type DataTablePagePagination = DataTablePageBoundary &
  DataTablePageSizeControl &
  DataTablePaginationRecovery & {
    /** Page-number pagination. Omit `mode` to preserve the original contract. */
    /** Identifies the request whose button should retain focus and show busy state. */
    loading?: "next" | "previous";
    loadingLabel?: React.ReactNode;
    mode?: "page";
    nextLabel?: React.ReactNode;
    onPageChange?: (page: number) => void;
    page: number;
    previousLabel?: React.ReactNode;
    totalLabel?: React.ReactNode;
  };

type DataTableCursorPaginationBase = DataTablePaginationRecovery & {
  /**
   * Cursor-backed data source. `navigation` decides whether a fetched page is
   * appended to the current rows or replaces them through previous/next
   * tokens. Neither mode loads on scroll: the reader keeps an explicit action
   * and the table can expose request progress through Button's `aria-busy`
   * contract.
   */
  mode: "cursor";
  totalLabel?: React.ReactNode;
};

export type DataTableCursorLoadMorePagination =
  DataTableCursorPaginationBase & {
    /** Append the next cursor page to the rows already rendered. @default "load-more" */
    navigation?: "load-more";
    endLabel?: React.ReactNode;
    hasMore: boolean;
    loadMoreLabel?: React.ReactNode;
    loading?: boolean;
    loadingLabel?: React.ReactNode;
    onLoadMore?: () => void;
  };

export type DataTableCursorNavigationPagination =
  DataTableCursorPaginationBase &
    /*
     * Previous/next replaces the page, so "how many rows is a page" is a real
     * question here and the control answers it the same way page mode does.
     * Deliberately NOT mixed into `load-more`: that mode appends, so the size
     * would retroactively describe rows already on screen.
     */
    DataTablePageSizeControl & {
      /** Replace the current page through opaque previous/next cursor tokens. */
      navigation: "previous-next";
      /** Place the totalLabel beside the navigation buttons. @default "start" */
      labelPlacement?: "start" | "navigation";
      hasNext: boolean;
      hasPrevious: boolean;
      /** Identifies the request whose button should retain focus and show busy state. */
      loading?: "next" | "previous";
      loadingLabel?: React.ReactNode;
      nextLabel?: React.ReactNode;
      onNext?: () => void;
      onPrevious?: () => void;
      previousLabel?: React.ReactNode;
    };

export type DataTableCursorPagination =
  | DataTableCursorLoadMorePagination
  | DataTableCursorNavigationPagination;

/**
 * One pagination concept with two data-source models. Page-number consumers
 * keep their existing API; cursor-backed products choose appended continuation
 * or previous/next page replacement without adding a second footer component
 * or infinite-scroll behavior.
 */
export type DataTablePagination =
  | DataTablePagePagination
  | DataTableCursorPagination;
