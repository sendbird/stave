import { useId } from "react";
import { useTranslation } from "@/i18n";
import { Badge } from "@/components/aui/components/Badge";
import { raisedPanel } from "@/components/aui/recipes/raised-panel";
import { sx } from "@/components/aui/utils/stylex";
import { EvidenceList } from "@/components/agent-runs/EvidenceList";
import { agentRunStyles } from "@/components/agent-runs/agent-runs.styles";
import { STAGE_STATUS_PRESENTATION } from "@/lib/agent-runs/agent-run-view";
import type { TarsReviewModel } from "@/lib/tars/report-model";
import { describeTarsEvidenceRevision } from "./TarsReportPanel";
import { REVIEW_VERDICT_KEY } from "./TarsTray";
import { tarsSideViewStyles as styles } from "./tars-side-view.styles";

/**
 * The independent review: the reviewer's verdict, what it found with its
 * reasons, and the evidence it cited, on the revision it reviewed. The
 * findings are the reviewer's own words.
 */
export function TarsReviewPanel({ review }: { review: TarsReviewModel | null }) {
  const { t } = useTranslation(["shell"]);
  const findingsId = useId();
  if (!review) return <p className={sx(styles.meta)} role="status" data-tars-review="none">{t("shell:tars.side.review.none")}</p>;
  const verdictTone = review.verdict === "passed" ? "success" : review.verdict === "changes-requested" ? "warning" : "neutral";
  return <div className={sx(styles.section)} data-tars-review={review.verdict ?? "pending"}>
    <div className={sx(styles.row)}>
      <Badge size="md" tone={verdictTone}>{t(`shell:tars.side.review.verdict.${REVIEW_VERDICT_KEY[review.verdict ?? "none"]}`)}</Badge>
      <span className={sx(styles.meta)}>{STAGE_STATUS_PRESENTATION[review.status].label}
        {review.attempts > 1 ? ` · ${t("shell:tars.flow.attempt", { attempt: review.attempts })}` : ""}</span>
    </div>
    <p className={sx(styles.meta)} data-tars-review-revision={review.freshness}>{describeTarsEvidenceRevision(review.revision, review.freshness)}</p>
    {review.blocked ? <p className={sx(agentRunStyles.callout)} role="note"><span><strong>{t("shell:tars.side.review.blocked")}.</strong> {review.blocked}</span></p> : null}
    {review.summary ? <p className={sx(styles.text)}>{review.summary}</p> : null}
    <section className={sx(styles.section)} aria-labelledby={findingsId}>
      <h3 id={findingsId} className={sx(styles.sectionTitle)}>{t("shell:tars.side.review.findings", { count: review.findings.length })}</h3>
      {review.findings.length ? <ul className={sx(raisedPanel.panel, styles.panelList)}>
        {review.findings.map((finding) => <li key={finding.decision} className={sx(raisedPanel.row, styles.panelRow)} data-tars-finding="">
          <p className={sx(styles.criterionText)}>{finding.decision}</p>
          <p className={sx(styles.meta)}>{finding.reason}</p>
        </li>)}
      </ul> : <p className={sx(styles.meta)}>{t("shell:tars.side.review.noFindings")}</p>}
    </section>
    {review.evidence.length ? <EvidenceList evidence={review.evidence.map((item) => item.evidence)}
      revisions={review.evidence.map((item) => describeTarsEvidenceRevision(item.revision, item.freshness))} /> : null}
  </div>;
}
