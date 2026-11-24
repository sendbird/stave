import { ChevronLeft, ChevronRight } from "lucide-react";
import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { themeSlotProps } from "../theming/theme-props";
import { sx } from "../utils/stylex";
import { Button } from "./Button";
import { footerStyles } from "./DataTable.footer.styles";
import { panelStyles } from "./DataTable.panel.styles";
import type { DataTablePagination } from "./DataTable.types";
import { Select } from "./Select";
import { Text } from "./Typography";

type DataTableFooterProps = {
  pagination: DataTablePagination;
  /** The footer closes the table's panel: hairline above, panel gutters. */
  panel?: boolean;
  rowCount: number;
};

/** The footer's quiet summary line (12px muted, tabular digits). */
function FooterLabel({
  children,
  live,
}: {
  children: React.ReactNode;
  live?: boolean;
}) {
  return (
    <Text
      aria-live={live ? "polite" : undefined}
      as="span"
      size="xs"
      tabularNums
      tone="muted"
      xstyle={footerStyles.paginationLabel}
    >
      {children}
    </Text>
  );
}

/**
 * F2 compact pager: two 2xs quiet chevrons (A1 in-surface actions) around an
 * optional "page / count" counter. Named by `previousLabel` / `nextLabel`, so
 * the accessible names stay "Previous" / "Next".
 */
function PagerButtons({
  counter,
  hasNext,
  hasPrevious,
  loading,
  loadingLabel,
  nextLabel,
  onNext,
  onPrevious,
  previousLabel,
}: {
  counter?: React.ReactNode;
  hasNext: boolean;
  hasPrevious: boolean;
  loading?: "next" | "previous";
  loadingLabel?: React.ReactNode;
  nextLabel?: React.ReactNode;
  onNext?: () => void;
  onPrevious?: () => void;
  previousLabel?: React.ReactNode;
}) {
  useTranslation();
  const busy = loading !== undefined;
  // An icon-only control needs a string name; a non-string label falls back.
  const nameOf = (label: React.ReactNode, fallback: string) =>
    typeof label === "string" ? label : fallback;
  return (
    <>
      <Button
        aria-label={nameOf(
          previousLabel,
          i18n.t("ui:dataTable.pagination.previous"),
        )}
        disabled={!hasPrevious || busy}
        iconOnly
        loading={loading === "previous"}
        loadingLabel={
          loadingLabel ?? i18n.t("ui:dataTable.pagination.loadingPrevious")
        }
        onClick={onPrevious}
        size="2xs"
        variant="quiet"
      >
        <ChevronLeft aria-hidden size={14} />
      </Button>
      {counter === undefined ? null : (
        <Text as="span" size="xs" tabularNums xstyle={footerStyles.counter}>
          {counter}
        </Text>
      )}
      <Button
        aria-label={nameOf(nextLabel, i18n.t("ui:dataTable.pagination.next"))}
        disabled={!hasNext || busy}
        iconOnly
        loading={loading === "next"}
        loadingLabel={
          loadingLabel ?? i18n.t("ui:dataTable.pagination.loadingNext")
        }
        onClick={onNext}
        size="2xs"
        variant="quiet"
      >
        <ChevronRight aria-hidden size={14} />
      </Button>
    </>
  );
}

function PaginationRecovery({
  pagination,
}: {
  pagination: DataTablePagination;
}) {
  useTranslation();
  if (pagination.error === undefined) return null;

  return (
    <span aria-live="assertive" className={sx(footerStyles.paginationError)}>
      <span>{pagination.error}</span>
      <Button flushInline onClick={pagination.onRetry} size="xs" variant="link">
        {pagination.retryLabel ?? i18n.t("ui:dataTable.pagination.retry")}
      </Button>
    </span>
  );
}

/**
 * Page and cursor data sources share one quiet table footer. Cursor loading is
 * deliberately user-triggered rather than tied to scroll position: dense work
 * surfaces keep a stable reading position, keyboard users retain a real action,
 * and a failed request can be retried through the same control.
 */
/**
 * The rows-per-page control, shared by the page-number footer and the
 * cursor previous/next footer. The current value is always included in the
 * option list, so a server-chosen size that is not one of the offered steps
 * still shows what is in effect rather than an empty trigger.
 */
function PageSizeControl({
  pagination,
}: {
  pagination: {
    onPageSizeChange: (pageSize: number) => void;
    pageSize: number;
    pageSizeLabel?: React.ReactNode;
    pageSizeOptions: readonly number[];
  };
}) {
  useTranslation();
  const options = Array.from(
    new Set([
      pagination.pageSize,
      ...pagination.pageSizeOptions.filter(
        (value) => Number.isFinite(value) && value > 0,
      ),
    ]),
  ).sort((first, second) => first - second);

  return (
    <label className={sx(footerStyles.pageSizeControl)}>
      <Text as="span" size="xs" tone="muted">
        {pagination.pageSizeLabel ??
          i18n.t("ui:dataTable.pagination.rowsPerPage")}
      </Text>
      <span className={sx(footerStyles.pageSizeSelect)}>
        <Select
          aria-label={i18n.t("ui:dataTable.pagination.rowsPerPage")}
          onValueChange={(value) => pagination.onPageSizeChange(Number(value))}
          options={options.map((value) => ({
            label: String(value),
            value: String(value),
          }))}
          size="xs"
          value={String(pagination.pageSize)}
        />
      </span>
    </label>
  );
}

export function DataTableFooter({
  pagination,
  panel = false,
  rowCount,
}: DataTableFooterProps) {
  useTranslation();
  if (pagination.mode === "cursor") {
    const totalLabel =
      pagination.totalLabel ??
      i18n.t("ui:dataTable.pagination.rowsLoaded", { count: rowCount });

    if (pagination.navigation === "previous-next") {
      const loading = pagination.loading !== undefined;
      const hasPageSize = pagination.pageSize !== undefined;
      /*
       * A page size occupies the footer's start region, so the label cannot
       * also move into the navigation group — the start region would be the
       * control alone, with nothing saying what was counted.
       */
      const labelInNavigation =
        pagination.labelPlacement === "navigation" && !hasPageSize;
      const label = <FooterLabel live>{totalLabel}</FooterLabel>;

      return (
        <div
          {...themeSlotProps("data-table", "footer")}
          className={sx(
            footerStyles.pagination,
            panel && panelStyles.footer,
            labelInNavigation && footerStyles.paginationAtEnd,
          )}
        >
          {labelInNavigation ? null : hasPageSize ? (
            <div className={sx(footerStyles.paginationMeta)}>
              {label}
              <PageSizeControl pagination={pagination} />
            </div>
          ) : (
            label
          )}
          <div className={sx(footerStyles.paginationActions)}>
            <PaginationRecovery pagination={pagination} />
            {labelInNavigation ? label : null}
            <PagerButtons
              hasNext={pagination.hasNext && !loading}
              hasPrevious={pagination.hasPrevious && !loading}
              loading={pagination.loading}
              loadingLabel={pagination.loadingLabel}
              nextLabel={pagination.nextLabel}
              onNext={pagination.onNext}
              onPrevious={pagination.onPrevious}
              previousLabel={pagination.previousLabel}
            />
          </div>
        </div>
      );
    }

    return (
      <div
        {...themeSlotProps("data-table", "footer")}
        className={sx(footerStyles.pagination, panel && panelStyles.footer)}
      >
        <FooterLabel live>{totalLabel}</FooterLabel>
        <div className={sx(footerStyles.paginationActions)}>
          <PaginationRecovery pagination={pagination} />
          <Button
            disabled={!pagination.hasMore}
            focusableWhenDisabled={!pagination.hasMore}
            loading={pagination.loading}
            loadingLabel={
              pagination.loadingLabel ??
              i18n.t("ui:dataTable.pagination.loadingMore")
            }
            onClick={pagination.onLoadMore}
            size="xs"
            variant="outlined"
          >
            {pagination.hasMore
              ? (pagination.loadMoreLabel ??
                i18n.t("ui:dataTable.pagination.loadMore"))
              : (pagination.endLabel ??
                i18n.t("ui:dataTable.pagination.allLoaded"))}
          </Button>
        </div>
      </div>
    );
  }

  const pageCount = pagination.pageCount;
  const hasNext =
    pageCount === undefined ? pagination.hasNext : pagination.page < pageCount;
  const loading = pagination.loading !== undefined;
  const totalLabel =
    pagination.totalLabel ??
    (pageCount === undefined
      ? i18n.t("ui:dataTable.pagination.page", { page: pagination.page })
      : i18n.t("ui:dataTable.pagination.pageOf", {
          page: pagination.page,
          pageCount,
        }));
  // A caller summary ("3 services · updated just now") takes the label, so the
  // position moves beside the chevrons as "1 / 3"; the default label already
  // states it.
  const counter =
    pagination.totalLabel !== undefined && pageCount !== undefined
      ? `${pagination.page} / ${pageCount}`
      : undefined;
  return (
    <div
      {...themeSlotProps("data-table", "footer")}
      className={sx(footerStyles.pagination, panel && panelStyles.footer)}
    >
      <div className={sx(footerStyles.paginationMeta)}>
        <FooterLabel>{totalLabel}</FooterLabel>
        {pagination.pageSize !== undefined ? (
          <PageSizeControl pagination={pagination} />
        ) : null}
      </div>
      <div className={sx(footerStyles.paginationActions)}>
        <PaginationRecovery pagination={pagination} />
        <PagerButtons
          counter={counter}
          hasNext={Boolean(hasNext) && !loading}
          hasPrevious={pagination.page > 1 && !loading}
          loading={pagination.loading}
          loadingLabel={pagination.loadingLabel}
          nextLabel={pagination.nextLabel}
          onNext={() => pagination.onPageChange?.(pagination.page + 1)}
          onPrevious={() => pagination.onPageChange?.(pagination.page - 1)}
          previousLabel={pagination.previousLabel}
        />
      </div>
    </div>
  );
}

export type { DataTableFooterProps };
