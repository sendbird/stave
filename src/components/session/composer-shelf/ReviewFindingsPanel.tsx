import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { useMemo, useState } from "react";
import { ListChecks, Paperclip } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { transition } from "@/components/ads/recipes/transition";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import {
  describeReviewFindingsSummary,
  summarizeReviewFindings,
  type ParsedReviewFindings,
  type PreviousFindingStatus,
  type ReviewFindingSeverity,
  type ReviewVerdict,
} from "@/lib/reviews/review-findings";

const SEVERITY_TONE: Record<ReviewFindingSeverity, BadgeTone> = {
  critical: "danger",
  major: "warning",
  minor: "neutral",
};

const STATUS_TONE: Record<PreviousFindingStatus, BadgeTone> = {
  resolved: "success",
  outdated: "neutral",
  unresolved: "danger",
  unchecked: "warning",
};

const VERDICT_LABEL: Record<ReviewVerdict, string> = {
  get approve() { return i18n.t("composer:reviewFindingsPanel.approve"); },
  get "approve-with-changes"() { return i18n.t("composer:reviewFindingsPanel.approveWithChanges"); },
  get "request-changes"() { return i18n.t("composer:reviewFindingsPanel.requestChanges"); },
};

/**
 * A finished review's structured findings: the verdict, each finding with
 * its severity and location, a choice of which to send back, and a re-check
 * of earlier findings. A reply without a readable findings block says so
 * instead of claiming there are none.
 */
export function ReviewFindingsPanel(props: {
  findings: ParsedReviewFindings;
  /** Findings already chosen on the draft's chip, if any. */
  attachedFindingIds: readonly string[] | null;
  onAttachSelected: (findingIds: string[]) => void;
  onRecheck: (() => void) | null;
  recheckBusy: boolean;
}) {
  useTranslation();
  const report = props.findings.ok ? props.findings.report : null;
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(props.attachedFindingIds ?? report?.findings.map((finding) => finding.id) ?? []),
  );
  const summary = useMemo(() => (report ? summarizeReviewFindings(report) : null), [report]);

  if (!report || !summary) {
    return (
      <section className={sx(styles.root)} aria-label={i18n.t("composer:reviewFindingsPanel.ariaLabel")}>
        <p className={sx(styles.notice)} role="note">
          {i18n.t("composer:reviewFindingsPanel.reviewFindingsPanel")}</p>
      </section>
    );
  }

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const chosen = report.findings.filter((finding) => selected.has(finding.id)).map((finding) => finding.id);

  return (
    <section className={sx(styles.root)} aria-label={i18n.t("composer:reviewFindingsPanel.ariaLabel2")}>
      <div className={sx(styles.header)}>
        <span className={sx(styles.heading)}>{i18n.t("composer:reviewFindingsPanel.reviewFindingsPanel2")}</span>
        <Badge size="sm" tone={summary.verdict === "request-changes" ? "danger" : summary.previous?.unchecked || summary.checkWarnings ? "warning" : summary.verdict === "approve" ? "success" : "warning"}>
          {VERDICT_LABEL[summary.verdict]}
        </Badge>
        <span className={sx(styles.meta)}>{describeReviewFindingsSummary(summary)}</span>
      </div>
      {(report.previousWarnings ?? []).map((warning, index) => (
        <p key={index} className={sx(styles.notice)} role="note">{warning}</p>
      ))}
      {report.previous && report.previous.length > 0 ? (
        <ul className={sx(styles.list)} aria-label={i18n.t("composer:reviewFindingsPanel.ariaLabel3")}>
          {report.previous.map((check) => (
            <li key={check.id} className={sx(styles.row)}>
              <Badge size="sm" tone={STATUS_TONE[check.status]}>{check.status}</Badge>
              <span className={sx(styles.text)}>
                <span className={sx(styles.title)}>{check.id}</span>
                {check.note ? <span className={sx(styles.detail)}>{check.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {report.findings.length > 0 ? (
        <ul className={sx(styles.list)} aria-label={i18n.t("composer:reviewFindingsPanel.ariaLabel4")}>
          {report.findings.map((finding) => (
            <li key={finding.id}>
              <label className={sx(styles.row, styles.selectable, transition.colors)}>
                <Checkbox
                  controlOnly
                  aria-label={i18n.t("composer:reviewFindingsPanel.ariaLabel5", { value1: finding.id, value2: finding.title })}
                  checked={selected.has(finding.id)}
                  onCheckedChange={() => toggle(finding.id)}
                />
                <Badge size="sm" tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
                <span className={sx(styles.text)}>
                  <span className={sx(styles.title)}>{finding.title}</span>
                  {finding.file ? (
                    <span className={sx(styles.location)}>
                      {finding.line ? `${finding.file}:${finding.line}` : finding.file}
                    </span>
                  ) : null}
                  {finding.detail ? <span className={sx(styles.detail)}>{finding.detail}</span> : null}
                  {finding.fix ? <span className={sx(styles.detail)}>{i18n.t("composer:reviewFindingsPanel.sentence56", { value1: finding.fix })}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={sx(styles.actions)}>
        {report.findings.length > 0 ? (
          <Button
            variant="quiet"
            size="sm"
            disabled={chosen.length === 0}
            title={i18n.t("composer:reviewFindingsPanel.title")}
            onClick={() => props.onAttachSelected(chosen)}
          >
            <Paperclip aria-hidden />
            {i18n.t("composer:reviewFindingsPanel.reviewFindingsPanel3")}{chosen.length} {i18n.t("composer:reviewFindingsPanel.reviewFindingsPanel4")}{report.findings.length}
          </Button>
        ) : null}
        {props.onRecheck ? (
          <Button
            variant="quiet"
            size="sm"
            disabled={props.recheckBusy}
            title={i18n.t("composer:reviewFindingsPanel.title2")}
            onClick={props.onRecheck}
          >
            <ListChecks aria-hidden />
            {i18n.t("composer:reviewFindingsPanel.reviewFindingsPanel5")}</Button>
        ) : null}
      </div>
    </section>
  );
}

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
  },
  header: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  heading: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: vars["--ads-color-text-muted"],
  },
  meta: {
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  notice: {
    margin: 0,
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-control"],
  },
  selectable: {
    cursor: "pointer",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-canvas-subtle"],
    },
  },
  text: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    minWidth: 0,
  },
  title: {
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text"],
    overflowWrap: "anywhere",
  },
  location: {
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
    overflowWrap: "anywhere",
  },
  detail: {
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
    overflowWrap: "anywhere",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-4"],
  },
});
