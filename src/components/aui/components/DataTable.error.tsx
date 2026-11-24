import type * as React from "react";

import { i18n } from "@/i18n";

import { DataErrorLine, type DataErrorRetryProps } from "./data-error";
import {
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateRoot,
  EmptyStateTitle,
} from "./EmptyState";

/** The body error `DataTable` resolves from `error`, `errorTitle` and retry. */
export type DataTableBodyError = DataErrorRetryProps & {
  headingLevel?: 2 | 3 | 4;
  message: React.ReactNode;
  title: React.ReactNode;
};

/**
 * Resolve the table's `error` into the body error it draws, or `undefined`
 * when there is none to draw: no error (`null`, `undefined`, `false`, `""`),
 * a load in flight, or rows on screen (a failed continuation keeps its rows;
 * `pagination.error` speaks for it).
 */
export function resolveDataTableError({
  error,
  errorTitle = i18n.t("ui:dataTable.error.title"),
  hasRows,
  headingLevel,
  loading,
  onRetry,
  retryLabel,
}: DataErrorRetryProps & {
  error?: React.ReactNode;
  errorTitle?: React.ReactNode;
  hasRows: boolean;
  headingLevel?: 2 | 3 | 4;
  loading: boolean;
}): DataTableBodyError | undefined {
  if (loading || hasRows) return undefined;
  if (error == null || error === false || error === "") return undefined;
  return {
    headingLevel,
    message: error === true ? i18n.t("ui:dataTable.error.message") : error,
    onRetry,
    retryLabel,
    title: errorTitle,
  };
}

/**
 * The first-load failure, drawn in the empty state's well and anatomy so the
 * frame does not move between empty, error and rows: `EmptyState`'s plain
 * composition (the table frame already owns the surface), its title, and one
 * description line — the shared `DataErrorLine` with the retry link inline, so
 * the error is exactly as tall as the default empty state. The well is the
 * alert; the line inside it does not announce a second time.
 */
export function DataTableErrorState({
  headingLevel = 3,
  message,
  onRetry,
  retryLabel,
  title,
}: DataTableBodyError) {
  return (
    <EmptyStateRoot data-table-error="" role="alert" variant="plain">
      <EmptyStateHeader>
        <EmptyStateTitle as={`h${headingLevel}`}>{title}</EmptyStateTitle>
        <EmptyStateDescription>
          <DataErrorLine
            announce={false}
            message={message}
            onRetry={onRetry}
            retryLabel={retryLabel}
            size="body"
          />
        </EmptyStateDescription>
      </EmptyStateHeader>
    </EmptyStateRoot>
  );
}
