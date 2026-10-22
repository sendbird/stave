import { i18n, useTranslation } from "@/i18n";
import { sx } from "@/components/ads/utils/stylex";
import { AsyncBoundary, panelLoadState } from "@/components/system/AsyncBoundary";
import { formatDateTime } from "@/i18n/format";
import type { AgentRunStageRecord } from "@/lib/agent-runs/domain";
import { useResultReviews } from "@/lib/reviews/useResultReviews";
import { reviewStyles as styles } from "./review.styles";

/** A turn's saved result: its answer, and whether it was marked reviewed. */
export function TurnOutput(props: { workspaceId: string; taskId: string; turnId: string }) {
  useTranslation();
  const reviews = useResultReviews({ workspaceId: props.workspaceId, taskId: props.taskId, turnId: props.turnId, limit: 1, includeEvidence: false });
  const result = reviews.page.results[0] ?? null;
  const state = panelLoadState({ data: result, loaded: reviews.loaded, loading: reviews.loading, error: reviews.error || null });
  return (
    <section className={sx(styles.section)} aria-label={i18n.t("review:outputs.title")}>
      <h3 className={sx(styles.sectionTitle)}>{i18n.t("review:outputs.title")}</h3>
      <AsyncBoundary state={state} onRetry={reviews.refresh} isEmpty={(value) => value === null} empty={<p className={sx(styles.note)}>{i18n.t("review:outputs.noResult")}</p>}>
        {(value) => value ? (
          <>
            <p className={sx(styles.note)}>
              {value.reviewedAt ? i18n.t("review:outputs.reviewedAt", { time: formatDateTime(value.reviewedAt) }) : i18n.t("review:outputs.notReviewed")}
            </p>
            {value.summary ? <p className={sx(styles.output)}>{value.summary}</p> : null}
          </>
        ) : null}
      </AsyncBoundary>
    </section>
  );
}

/** What a stage reported: its summary, or what it was missing when it blocked. */
export function StageOutput(props: { record: AgentRunStageRecord | undefined }) {
  useTranslation();
  const report = props.record?.report;
  return (
    <section className={sx(styles.section)} aria-label={i18n.t("review:outputs.title")}>
      <h3 className={sx(styles.sectionTitle)}>{i18n.t("review:outputs.title")}</h3>
      {!report ? <p className={sx(styles.note)}>{i18n.t("review:outputs.noReport")}</p>
        : report.outcome === "complete" ? <p className={sx(styles.output)}>{report.summary}</p>
        : <p className={sx(styles.output)}>{i18n.t("review:outputs.blocked", { missing: report.missing })}</p>}
    </section>
  );
}
