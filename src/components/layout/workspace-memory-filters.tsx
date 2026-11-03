import type { RefObject } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { Button } from "@/components/ui";
import { useTranslation, type I18nKey } from "@/i18n";
import type { RepositoryMemoryKind } from "@/lib/repository-memory";
import { InformationListSearchField } from "./information-list-search-field";
import {
  shouldShowMemoryKindChips,
  type MemoryKindFilter,
  type MemoryListView,
} from "./workspace-memory-list-state";
import { workspaceMemorySectionStyles as styles } from "./workspace-memory-section.styles";

/** A chip names a set, so it reads "Decision", where a row's badge says "decision". */
const KIND_FILTER_LABEL_KEYS = {
  decision: "workspace:memory.filters.kinds.decision",
  convention: "workspace:memory.filters.kinds.convention",
  gotcha: "workspace:memory.filters.kinds.gotcha",
  fact: "workspace:memory.filters.kinds.fact",
} as const satisfies Record<RepositoryMemoryKind, I18nKey>;

/**
 * The search over the memory text and one chip per kind, each with how many of
 * the query's matches it holds. The chips are a single choice (a radio group),
 * and pressing one leaves the keyboard in the search field.
 */
export function MemoryListFilters(props: {
  view: MemoryListView<unknown>;
  query: string;
  onQueryChange: (query: string) => void;
  onSearchFocusChange: (focused: boolean) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  kind: MemoryKindFilter;
  onKindChange: (kind: MemoryKindFilter) => void;
}) {
  const { t } = useTranslation(["workspace"]);
  const { view, kind } = props;
  const options = [
    { value: "all" as MemoryKindFilter, label: t("memory.filters.all"), count: view.counts.all },
    ...view.kinds.map((value) => ({
      value: value as MemoryKindFilter,
      label: t(KIND_FILTER_LABEL_KEYS[value]),
      count: view.counts[value],
    })),
  ];
  return (
    <div className={sx(styles.filters)} data-memory-filters="">
      <InformationListSearchField
        query={props.query}
        onQueryChange={props.onQueryChange}
        onFocusChange={props.onSearchFocusChange}
        inputRef={props.searchInputRef}
        label={t("memory.filters.searchLabel")}
        placeholder={t("memory.filters.searchPlaceholder")}
        clearLabel={t("memory.filters.clearSearch")}
        data-memory-search=""
      />
      {shouldShowMemoryKindChips(view, kind) ? (
        <SegmentedControl
          aria-label={t("memory.filters.kindLabel")}
          value={kind}
          onValueChange={props.onKindChange}
          options={options}
          keepFocusOnPointer
          testId="memory-kind-filter"
        />
      ) : null}
    </div>
  );
}

/**
 * What a narrowed list holds, as a status region so a changing count is
 * announced, and a way back when nothing is left.
 */
export function MemoryListFilterStatus(props: {
  matched: number;
  total: number;
  onClear: () => void;
}) {
  const { t } = useTranslation("workspace");
  return (
    <div className={sx(styles.filterStatus)} data-memory-filter-status="">
      <span className={sx(styles.filterStatusText)} role="status">
        {props.matched > 0
          ? t("memory.filters.matchCount", { matched: props.matched, count: props.total })
          : t("memory.filters.noMatch")}
      </span>
      {props.matched === 0 ? (
        <Button type="button" size="sm" variant="ghost" onClick={props.onClear}>
          {t("memory.filters.clear")}
        </Button>
      ) : null}
    </div>
  );
}
