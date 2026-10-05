import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  History,
  Search,
  SplitSquareHorizontal,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { Badge, Button, Input } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COMPARE_RUN_HISTORY_STATUS_FILTERS,
  listCompareRunHistoryEntries,
  type CompareRunHistoryStatusFilter,
} from "@/lib/compare-run-history";
import type { CompareRun, CompareRunStatus } from "@/lib/compare-runs";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { compareRunHistoryDialogStyles as styles } from "./compare-run-history-dialog.styles";

interface CompareRunHistoryDialogProps {
  open: boolean;
  runsById: Record<string, CompareRun | undefined>;
  onOpenChange: (open: boolean) => void;
  onOpenRun: (compareRunId: string) => void;
}

function StatusIcon(props: { status: CompareRunStatus }) {
  if (props.status === "failed") {
    return <CircleAlert className={sx(styles.statusIconDanger)} />;
  }
  if (props.status === "cancelled") {
    return <XCircle className={sx(styles.statusIconMuted)} />;
  }
  if (props.status === "completed") {
    return <CheckCircle2 className={sx(styles.statusIconSuccess)} />;
  }
  return <Clock3 className={sx(styles.statusIconAccent)} />;
}

function getStatusBadgeVariant(status: CompareRunStatus) {
  if (status === "failed") {
    return "destructive" as const;
  }
  if (status === "completed") {
    return "success" as const;
  }
  if (status === "starting" || status === "running") {
    return "secondary" as const;
  }
  return "outline" as const;
}

export function CompareRunHistoryDialog(props: CompareRunHistoryDialogProps) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CompareRunHistoryStatusFilter>("all");
  const allEntries = useMemo(
    () => listCompareRunHistoryEntries({ runsById: props.runsById }),
    [props.runsById],
  );
  const visibleEntries = useMemo(
    () =>
      listCompareRunHistoryEntries({
        runsById: props.runsById,
        query,
        status,
      }),
    [props.runsById, query, status],
  );
  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        COMPARE_RUN_HISTORY_STATUS_FILTERS.map((option) => [
          option.value,
          option.value === "all"
            ? allEntries.length
            : allEntries.filter((entry) => entry.status === option.value)
                .length,
        ]),
      ),
    [allEntries],
  );
  const hasFilters = Boolean(query.trim()) || status !== "all";

  function clearFilters() {
    setQuery("");
    setStatus("all");
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent xstyle={styles.content}>
        <DialogHeader className={sx(styles.header)}>
          <div className={sx(styles.headerRow)}>
            <span className={sx(styles.headerMark)}>
              <SplitSquareHorizontal className={sx(styles.markIcon)} />
            </span>
            <div className={sx(styles.headerText)}>
              <DialogTitle className={sx(styles.headerTitle)}>
                {t("compare:compareRunHistoryDialog.compareHistory")}</DialogTitle>
              <DialogDescription>
                {t("compare:compareRunHistoryDialog.searchEverySavedComparisonThenReopen")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className={sx(styles.filters)}>
          <div className={sx(styles.searchWrap)}>
            <Search className={sx(styles.searchIcon)} />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t("compare:compareRunHistoryDialog.searchCompareRuns")}
              placeholder={t("compare:compareRunHistoryDialog.searchPromptsStateOrJudgeResult")}
              xstyle={styles.searchInput}
            />
          </div>
          <div
            className={sx(styles.filterGroup)}
            role="group"
            aria-label={t("compare:compareRunHistoryDialog.filterCompareRunsByStatus")}
          >
            {COMPARE_RUN_HISTORY_STATUS_FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={status === option.value ? "secondary" : "ghost"}
                className={sx(
                  styles.filterButton,
                  status === option.value && styles.filterButtonActive,
                )}
                aria-pressed={status === option.value}
                onClick={() => setStatus(option.value)}
              >
                {option.label}
                <span className={sx(styles.filterCount)}>
                  {statusCounts[option.value] ?? 0}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <div className={sx(styles.list)}>
          {visibleEntries.length > 0 ? (
            <ul aria-label={t("compare:compareRunHistoryDialog.compareRuns")}>
              {visibleEntries.map((entry, entryIndex) => (
                <li
                  key={entry.id}
                  className={sx(
                    styles.listItem,
                    entryIndex === visibleEntries.length - 1 &&
                      styles.listItemLast,
                  )}
                >
                  <AdsButton
                    layout="host"
                    type="button"
                    xstyle={styles.rowButton}
                    aria-label={i18n.t("compare:compareRunHistoryDialog.openCompareRun", { value1: entry.title })}
                    onClick={() => {
                      props.onOpenRun(entry.id);
                      props.onOpenChange(false);
                    }}
                  >
                    <span className={sx(styles.rowMark)}>
                      <StatusIcon status={entry.status} />
                    </span>
                    <span className={sx(styles.rowBody)}>
                      <span className={sx(styles.rowTitleRow)}>
                        <span className={sx(styles.rowTitle)}>
                          {entry.title}
                        </span>
                        <Badge variant={getStatusBadgeVariant(entry.status)}>
                          {entry.stateLabel}
                        </Badge>
                      </span>
                      <span className={sx(styles.rowPrompt)}>
                        {entry.seedPrompt}
                      </span>
                      <span className={sx(styles.rowMeta)}>
                        <span>{entry.progressLabel}</span>
                        {entry.judgeLabel ? (
                          <span>{entry.judgeLabel}</span>
                        ) : null}
                        <span>{t("compare:messages.updated", { updatedAt: formatTaskUpdatedAt({ value: entry.updatedAt }) })}</span>
                      </span>
                    </span>
                  </AdsButton>
                </li>
              ))}
            </ul>
          ) : (
            <div className={sx(styles.empty)} role="status">
              <span className={sx(styles.emptyMark)}>
                <History className={sx(styles.markIcon)} />
              </span>
              <h3 className={sx(styles.emptyTitle)}>{t("compare:compareRunHistoryDialog.noMatchingRuns")}</h3>
              <p className={sx(styles.emptyText)}>
                {t("compare:compareRunHistoryDialog.tryAnotherPromptOrIncludeMore")}</p>
              {hasFilters ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={sx(styles.clearButton)}
                  onClick={clearFilters}
                >
                  {t("compare:compareRunHistoryDialog.clearFilters")}</Button>
              ) : null}
            </div>
          )}
        </div>

        <div className={sx(styles.footer)}>
          <span>{t("compare:messages.historyTotal", { shown: visibleEntries.length, total: allEntries.length })}</span>
          <span>{t("compare:compareRunHistoryDialog.newestFirst")}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
