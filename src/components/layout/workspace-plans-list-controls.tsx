import type { RefObject } from "react";
import { useTranslation } from "@/i18n";
import { sx } from "@/components/aui/utils/stylex";
import { Button } from "@/components/ui";
import { InformationListSearchField } from "./information-list-search-field";
import type { PlansListRows } from "./workspace-plans-list-state";
import { planListControlStyles as styles } from "./workspace-plans.styles";

/** Searches every document the list holds, not just the recent ones. */
export function PlansSearchField(props: {
  query: string;
  onQueryChange: (query: string) => void;
  /** Whether the field holds focus; the list keeps the field while it does. */
  onFocusChange: (focused: boolean) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation("workspace");
  return (
    <InformationListSearchField
      {...props}
      label={t("workspacePlansSection.searchLabel")}
      placeholder={t("workspacePlansSection.searchPlaceholder")}
      clearLabel={t("workspacePlansSection.clearSearch")}
      data-workspace-plans-search=""
    />
  );
}

/**
 * The line under a long list: how many of the documents are shown and the way
 * to the rest, or how many match a search. It is mounted with the search, and
 * its text is a status region, so a changing count is announced.
 */
export function PlansListStatus(props: {
  view: PlansListRows<unknown>;
  showAll: boolean;
  onShowAllChange: (showAll: boolean) => void;
  onClearSearch: () => void;
}) {
  const { t } = useTranslation("workspace");
  const { view } = props;
  let text: string;
  let action: { label: string; run: () => void } | null = null;
  if (view.searching) {
    text = view.matched > 0
      ? t("workspacePlansSection.matchCount", { matched: view.matched, total: view.total })
      : t("workspacePlansSection.noMatch");
    if (view.matched === 0) action = { label: t("workspacePlansSection.clearSearch"), run: props.onClearSearch };
  } else if (props.showAll) {
    text = t("workspacePlansSection.showingAll", { total: view.total });
    action = { label: t("workspacePlansSection.showRecentOnly"), run: () => props.onShowAllChange(false) };
  } else {
    text = t("workspacePlansSection.recentOfTotal", { shown: view.rows.length, total: view.total });
    action = { label: t("workspacePlansSection.showAll"), run: () => props.onShowAllChange(true) };
  }
  return (
    <div className={sx(styles.status)} data-workspace-plans-status="">
      <span className={sx(styles.statusText)} role="status">
        {text}
      </span>
      {action ? (
        <Button type="button" size="sm" variant="ghost" onClick={action.run}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
