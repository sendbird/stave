import { useState } from "react";
import { ArrowUpRight, BookmarkPlus, CircleCheck, CircleMinus, CircleX, Copy, GitPullRequestArrow } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { sx } from "@/components/ads/utils/stylex";
import type { MissionReport } from "@/lib/missions/report";
import { formatMissionReportMarkdown } from "@/lib/missions/report-markdown";
import { formatAge } from "@/lib/missions/mission-view";
import { EvidenceList } from "./EvidenceList";
import type { MissionReportActions } from "./useMissionReportActions";
import { missionStyles as styles } from "./missions.styles";

const OUTCOME = {
  completed: { title: "Mission complete", icon: CircleCheck, tone: "success" },
  cancelled: { title: "Mission cancelled", icon: CircleMinus, tone: "neutral" },
  stopped: { title: "Mission stopped", icon: CircleX, tone: "danger" },
} as const;

/**
 * The Mission report: what the mission did, why, and what proves it. It leads
 * with the outcome and four figures, then the links a reviewer opens first,
 * then the reasoning. Static: a finished mission never animates.
 */
export function MissionReportView({
  report,
  actions = {},
  context = "standalone",
}: {
  report: MissionReport;
  actions?: MissionReportActions;
  /**
   * `panel` under the Mission panel's header, which already names the outcome,
   * the reason and the open criteria; `standalone` in Task Results.
   */
  context?: "panel" | "standalone";
}) {
  const standalone = context === "standalone";
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
  const outcome = OUTCOME[report.outcome];
  const OutcomeIcon = outcome.icon;
  const evidence = report.stages.flatMap((stage) => stage.evidence);
  const verifiedFirst = [...evidence].sort(
    (left, right) => Number(right.source === "stave") - Number(left.source === "stave"),
  );
  const verifiedCount = evidence.filter((item) => item.source === "stave").length;
  const decisions = report.stages.flatMap((stage) => stage.decisions);
  const open = report.acceptanceCriteria.filter((criterion) => criterion.status !== "met");
  const completedStages = report.stages.filter((stage) => stage.status === "completed").length;
  const duration = formatAge(Date.parse(report.endedAt) - Date.parse(report.startedAt));
  return (
    <section
      className={sx(styles.section, styles.sectionRoomy, standalone ? null : styles.sectionRule)}
      aria-label="Mission report"
      data-testid="mission-report"
    >
      {standalone ? (
        <div className={sx(styles.sectionHeader)}>
          <IconTile size="xs" tone={outcome.tone}>
            <OutcomeIcon size={iconTileGlyphSizes.xs} />
          </IconTile>
          <div className={sx(styles.headText)}>
            <h3 className={sx(styles.title)}>{outcome.title}</h3>
            <p className={sx(styles.eyebrow)}>
              {report.playbookName} · {report.assignment.split("\n")[0]}
            </p>
          </div>
        </div>
      ) : (
        <div className={sx(styles.sectionHeader)}>
          <h3 className={sx(styles.sectionTitle)}>Report</h3>
        </div>
      )}
      <dl className={sx(styles.stats)} aria-label="Mission figures">
        {(
          [
            ["Duration", duration],
            ["Stages", `${completedStages}/${report.stages.length}`],
            ["Turns", String(report.turnCount)],
            ["Verified", String(verifiedCount)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className={sx(styles.statTile)}>
            <dt className={sx(styles.statLabel)}>{label}</dt>
            <dd className={sx(styles.statValue)}>{value}</dd>
          </div>
        ))}
      </dl>
      {standalone && report.reason ? (
        <div className={sx(styles.callout, styles.calloutNeutral)}>
          <span>{report.reason}</span>
        </div>
      ) : null}
      {report.links.length > 0 ? (
        <div className={sx(styles.actions)}>
          {report.links.map((link) => (
            <a key={link.url} className={sx(styles.link)} href={link.url} target="_blank" rel="noreferrer">
              {link.label}
              <ArrowUpRight aria-hidden className={sx(styles.iconSm)} />
            </a>
          ))}
        </div>
      ) : null}
      {decisions.length > 0 ? (
        <div className={sx(styles.stageGroup)}>
          <p className={sx(styles.groupLabel)}>Decisions</p>
          <ul className={sx(styles.list)}>
            {decisions.map((item) => (
              <li key={item.decision} className={sx(styles.decision)}>
                <span className={sx(styles.decisionText)}>{item.decision}</span>
                <span className={sx(styles.decisionReason)}>{item.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {standalone && open.length > 0 ? (
        <div className={sx(styles.stageGroup)}>
          <p className={sx(styles.groupLabel)}>Still open</p>
          <ul className={sx(styles.list)}>
            {open.map((criterion) => (
              <li key={criterion.text} className={sx(styles.check)}>
                <span className={sx(styles.checkMark)}>
                  <CircleX aria-hidden className={sx(styles.icon, styles.toneIdle)} />
                </span>
                <span className={sx(styles.checkText)}>{criterion.text}</span>
                <span className={sx(styles.checkState)}>
                  {criterion.status === "unmet" ? "Not met" : "Not verified"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.leftBehind.length > 0 ? (
        <div className={sx(styles.stageGroup)}>
          <p className={sx(styles.groupLabel)}>Left behind</p>
          <ul className={sx(styles.list)}>
            {report.leftBehind.map((item) => (
              <li key={item} className={sx(styles.body)}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {verifiedFirst.length > 0 ? (
        <div className={sx(styles.stageGroup)}>
          <p className={sx(styles.groupLabel)}>Evidence</p>
          <EvidenceList evidence={verifiedFirst} />
        </div>
      ) : null}
      <div className={sx(styles.actions)}>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(formatMissionReportMarkdown(report)).then(
              () => setNotice({ text: "Copied the report as Markdown.", error: false }),
              () => setNotice({ text: "The clipboard is unavailable.", error: true }),
            );
          }}
        >
          <Copy aria-hidden />
          Copy Markdown
        </Button>
        {actions.addToPullRequest ? (
          <Button
            size="xs"
            variant="secondary"
            loading={running === "pr"}
            disabled={running !== null}
            onClick={() => void runAction("pr", actions.addToPullRequest!)}
          >
            <GitPullRequestArrow aria-hidden />
            Add to PR description
          </Button>
        ) : null}
        {actions.saveDecisions ? (
          <Button
            size="xs"
            variant="secondary"
            loading={running === "memory"}
            disabled={running !== null}
            onClick={() => void runAction("memory", actions.saveDecisions!)}
          >
            <BookmarkPlus aria-hidden />
            Save decisions to memory
          </Button>
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
