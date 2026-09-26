import { useState } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import type { MissionReport } from "@/lib/missions/report";
import { describeReportTitle, formatMissionReportMarkdown } from "@/lib/missions/report-markdown";
import { EvidenceList } from "./EvidenceList";
import { missionStyles as styles } from "./missions.styles";

/**
 * The Mission report: what the mission did, why, and what proves it. Static:
 * a finished mission never animates.
 */
export function MissionReportView({ report }: { report: MissionReport }) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const evidence = report.stages.flatMap((stage) => stage.evidence);
  const verifiedFirst = [...evidence].sort(
    (left, right) => Number(right.source === "stave") - Number(left.source === "stave"),
  );
  const decisions = report.stages.flatMap((stage) => stage.decisions);
  const open = report.acceptanceCriteria.filter((criterion) => criterion.status !== "met");
  return (
    <section className={sx(styles.panel)} aria-label="Mission report" data-testid="mission-report">
      <p className={sx(styles.panelTitle)}>{describeReportTitle(report)}</p>
      <dl className={sx(styles.facts)}>
        <dt className={sx(styles.factLabel)}>Assignment</dt>
        <dd className={sx(styles.factValue)}>{report.assignment}</dd>
        {report.reason ? (
          <>
            <dt className={sx(styles.factLabel)}>Reason</dt>
            <dd className={sx(styles.factValue)}>{report.reason}</dd>
          </>
        ) : null}
        {decisions.length > 0 ? (
          <>
            <dt className={sx(styles.factLabel)}>Decisions</dt>
            <dd className={sx(styles.factValue)}>
              <ul className={sx(styles.list)}>
                {decisions.map((item) => (
                  <li key={item.decision}>
                    {item.decision} — <span className={sx(styles.factLabel)}>{item.reason}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
        {open.length > 0 ? (
          <>
            <dt className={sx(styles.factLabel)}>Open</dt>
            <dd className={sx(styles.factValue)}>
              <ul className={sx(styles.list)}>
                {open.map((criterion) => (
                  <li key={criterion.text}>
                    {criterion.text} — {criterion.status}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
        {report.leftBehind.length > 0 ? (
          <>
            <dt className={sx(styles.factLabel)}>Left behind</dt>
            <dd className={sx(styles.factValue)}>
              <ul className={sx(styles.list)}>
                {report.leftBehind.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
      </dl>
      {verifiedFirst.length > 0 ? (
        <>
          <p className={sx(styles.subheading)}>Evidence</p>
          <EvidenceList evidence={verifiedFirst} />
        </>
      ) : null}
      <div className={sx(styles.actions)}>
        <ActionButton
          size="xs"
          onClick={() => {
            void navigator.clipboard
              .writeText(formatMissionReportMarkdown(report))
              .then(
                () => setCopyNotice("Copied the report as Markdown."),
                () => setCopyNotice("The clipboard is unavailable."),
              );
          }}
        >
          Copy Markdown
        </ActionButton>
        {copyNotice ? (
          <span className={sx(styles.notice)} role="status">
            {copyNotice}
          </span>
        ) : null}
      </div>
    </section>
  );
}
