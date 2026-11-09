import { i18n } from "@/i18n";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import type * as React from "react";

import {
  type ComboboxPagingProps,
  LoadMoreFooter,
  LoadMoreSentinel,
  useLoadMore,
} from "./Combobox.loadMore";
import { type ComboboxListProps, compoundParts } from "./Combobox.parts";

export type ComboboxPagedListProps = ComboboxListProps &
  Omit<ComboboxPagingProps, "loadError" | "onLoadRetry" | "retryLabel"> & {
    /**
     * The first page is still on its way. Holds the sentinel off, the guard
     * the array API's `loading` gives it. @default false
     */
    loading?: boolean;
  };

/**
 * `Combobox.List` with the array API's paging attached, for a compound picker
 * whose list comes from a server a page at a time.
 *
 * The sentinel and the "Loading more…" strip are the ones the `options` path
 * already draws (`Combobox.loadMore`), so a hand-assembled popup pages the way
 * the array one does instead of bringing its own observer or its own "Load
 * more" button — a parent-issue picker was hand-building exactly that
 * footer. The sentinel goes inside the list, so it shares the
 * list's scroll container; the strip goes after it, because a status row is
 * not a valid child of `role="listbox"`.
 */
export function ComboboxPagedList({
  children,
  hasMore,
  loading,
  loadingMore,
  loadingMoreText = i18n.t("ui:combobox.loadingMore"),
  loadMoreLabel = i18n.t("ui:combobox.loadMore"),
  onLoadMore,
  ...props
}: ComboboxPagedListProps) {
  const paging = useLoadMore({ hasMore, loading, loadingMore, onLoadMore });
  return (
    <>
      <compoundParts.List {...props}>
        {/* A render function is the list's per-item form; it goes through
            Base UI's `Collection` so the sentinel can follow the rows. */}
        {typeof children === "function" ? (
          <BaseCombobox.Collection>{children}</BaseCombobox.Collection>
        ) : (
          (children as React.ReactNode)
        )}
        <LoadMoreSentinel paging={paging} />
      </compoundParts.List>
      <LoadMoreFooter
        loadingMoreText={loadingMoreText}
        loadMoreLabel={loadMoreLabel}
        paging={paging}
      />
    </>
  );
}
