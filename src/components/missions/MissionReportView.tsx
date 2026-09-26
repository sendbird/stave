import { useState } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import type { MissionReport } from "@/lib/missions/report";
import { describeReportTitle, formatMissionReportMarkdown } from "@/lib/missions/report-markdown";
import { EvidenceList } from "./EvidenceList";
import type { MissionReportActions } from "./useMissionReportActions";
import { missionStyles as styles } from "./missions.styles";

/**
 * The Mission report: what the mission did, why, and what proves it. Static:
 * a finished mission never animates.
 */
export function MissionReportView({
  report,
  actions = {},
}: {
  report: MissionReport;
  actions?: MissionReportActions;
}) {
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [running, setRunning] = useState<"pr" | "memory" | null>(null);
  const runAction = async (which: "pr" | "memory", action: () => Promise<string>) => {
    setRunning(which);
    try {
      setNotice({ text: await action(), error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "That did not work.", error: true });
    } finally {
      setRunning(null);
    }
  };
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
                () => setNotice({ text: "Copied the report as Markdown.", error: false }),
                () => setNotice({ text: "The clipboard is unavailable.", error: true }),
              );
          }}
        >
          Copy Markdown
        </ActionButton>
        {actions.addToPullRequest ? (
          <ActionButton
            size="xs"
            disabled={running !== null}
            onClick={() => void runAction("pr", actions.addToPullRequest!)}
          >
            {running === "pr" ? "Adding…" : "Add to PR description"}
          </ActionButton>
        ) : null}
        {actions.saveDecisions ? (
          <ActionButton
            size="xs"
            disabled={running !== null}
            onClick={() => void runAction("memory", actions.saveDecisions!)}
          >
            {running === "memory" ? "Saving…" : "Save decisions to memory"}
          </ActionButton>
        ) : null}
      </div>
      {notice ? (
        <p className={sx(notice.error ? styles.error : styles.notice)} role={notice.error ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
