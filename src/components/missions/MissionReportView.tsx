import { useState } from "react";
import {
  ArrowUpRight,
  BookmarkPlus,
  CircleCheck,
  CircleMinus,
  CircleX,
  Copy,
  Ellipsis,
  FileText,
  GitPullRequestArrow,
  Send,
} from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { DropdownMenu } from "@/components/ads/components/DropdownMenu";
import { TextField } from "@/components/ads/components/TextField";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { describeUsageShort } from "@/lib/missions/usage";
import { isVerifiedEvidence } from "@/lib/missions/evidence";
import { sx } from "@/components/ads/utils/stylex";
import type { MissionReport } from "@/lib/missions/report";
import { describeMissionMetrics, formatMissionReportMarkdown } from "@/lib/missions/report-markdown";
import { formatAge } from "@/lib/missions/mission-view";
import { AgentRunPlan, describePlanProgress } from "./AgentRunPlan";
import { EvidenceList } from "./EvidenceList";
import type { MissionReportActions } from "./useMissionReportActions";
import { missionStyles as styles } from "./missions.styles";

type ReportActionKey = "pr" | "memory" | "slack";

const OUTCOME = {
  completed: { title: "Mission complete", icon: CircleCheck, tone: "success" },
  cancelled: { title: "Mission cancelled", icon: CircleMinus, tone: "neutral" },
  stopped: { title: "Mission stopped", icon: CircleX, tone: "danger" },
} as const;

const AGENT_RUN_OUTCOME_TITLES = { completed: "Ready", cancelled: "Stopped", stopped: "Failed" } as const;

/**
 * The Mission report: what the mission did, why, and what proves it. It leads
 * with the outcome and four figures, then the links a reviewer opens first,
 * then the reasoning. Static: a finished mission never animates.
 */
export function MissionReportView({
  report,
  actions = {},
  context = "standalone",
  agentOrigin = false,
}: {
  report: MissionReport;
  actions?: MissionReportActions;
  /**
   * `panel` under the Mission panel's header, which already names the outcome,
   * the reason and the open criteria; `standalone` in Task Results.
   */
  context?: "panel" | "standalone";
  /** An agent run: its copy says "run", and a one-stage run's stage is not a figure. */
  agentOrigin?: boolean;
}) {
  const standalone = context === "standalone";
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [running, setRunning] = useState<ReportActionKey | null>(null);
  const [sharing, setSharing] = useState(false);
  const [threadUrl, setThreadUrl] = useState(actions.suggestedSlackThread ?? "");
  /** Runs a report action and shows its sentence; true when it worked. */
  const runAction = async (which: ReportActionKey, action: () => Promise<string>): Promise<boolean> => {
    setRunning(which);
    try {
      setNotice({ text: await action(), error: false });
      return true;
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "That did not work.", error: true });
      return false;
    } finally {
      setRunning(null);
    }
  };
  const outcome = { ...OUTCOME[report.outcome], ...(agentOrigin ? { title: AGENT_RUN_OUTCOME_TITLES[report.outcome] } : {}) };
  const OutcomeIcon = outcome.icon;
  const evidence = report.stages.flatMap((stage) => stage.evidence);
  const verifiedFirst = [...evidence].sort(
    (left, right) => Number(isVerifiedEvidence(right)) - Number(isVerifiedEvidence(left)),
  );
  const verifiedCount = evidence.filter(isVerifiedEvidence).length;
  const decisions = report.stages.flatMap((stage) => stage.decisions);
  // A one-stage run's steps are its plan; a workflow's are its stages.
  const planItems = report.stages.length === 1 ? report.stages[0]!.plan : null;
  const plan = planItems && planItems.length > 0 ? planItems : null;
  const open = report.acceptanceCriteria.filter((criterion) => criterion.status !== "met");
  const completedStages = report.stages.filter((stage) => stage.status === "completed").length;
  const duration = formatAge(Date.parse(report.endedAt) - Date.parse(report.startedAt));
  const spent = describeUsageShort(report.usage);
  // In the Mission panel the Run card already shows turns and spend.
  const figures: Array<readonly [string, string]> = [
    ["Duration", duration],
    ...(agentOrigin && report.stages.length <= 1 ? [] : ([["Stages", `${completedStages}/${report.stages.length}`]] as const)),
    ...(standalone ? ([["Turns", String(report.turnCount)]] as const) : []),
    ["Verified", String(verifiedCount)],
    ...(standalone && spent ? ([["Spent", spent]] as const) : []),
  ];
  return (
    <section
      className={sx(styles.section, styles.sectionRoomy, standalone ? null : styles.sectionRule)}
      aria-label={agentOrigin ? "Run report" : "Mission report"}
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
          <FileText aria-hidden className={sx(styles.sectionIcon)} />
          <h3 className={sx(styles.sectionTitle)}>Report</h3>
        </div>
      )}
      <dl
        className={sx(
          styles.stats,
          // One row of figures, however many there are.
          figures.length === 2 && styles.statsTwo,
          figures.length === 3 && styles.statsThree,
          figures.length === 4 && styles.statsFour,
          figures.length === 5 && styles.statsFive,
        )}
        aria-label={agentOrigin ? "Run figures" : "Mission figures"}
      >
        {figures.map(([label, value]) => (
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
      {plan ? (
        <div className={sx(styles.stageGroup)}>
          <p className={sx(styles.groupLabel)}>Plan · {describePlanProgress(plan)}</p>
          <AgentRunPlan items={plan} />
        </div>
      ) : null}
      {decisions.length > 0 ? (
        <div className={sx(styles.stageGroup)}>
          <p className={sx(styles.groupLabel)}>Decisions</p>
          <ul className={sx(styles.itemList)}>
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
          <ul className={sx(styles.itemList)}>
            {report.leftBehind.map((item) => (
              <li key={item} className={sx(styles.bulletItem)}>
                <span aria-hidden className={sx(styles.bullet)} />
                <span className={sx(styles.bulletText)}>{item}</span>
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
      {report.metrics ? (
        <p className={sx(styles.notice)} data-testid="mission-metrics">
          {describeMissionMetrics(report.metrics)}
        </p>
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
        {actions.saveDecisions || actions.shareToSlack ? (
          <DropdownMenu
            placement="bottom-start"
            triggerAsChild
            trigger={
              <Button size="xs" variant="quiet" aria-label="More report actions" disabled={running !== null}>
                <Ellipsis aria-hidden />
                More
              </Button>
            }
            groups={[
              {
                items: [
                  ...(actions.saveDecisions
                    ? [{ label: "Save decisions to memory", icon: <BookmarkPlus />, pending: running === "memory", onSelect: () => void runAction("memory", actions.saveDecisions!) }]
                    : []),
                  ...(actions.shareToSlack ? [{ label: "Share to Slack…", icon: <Send />, onSelect: () => setSharing(true) }] : []),
                ],
              },
            ]}
          />
        ) : null}
      </div>
      {sharing && actions.shareToSlack ? (
        <form
          className={sx(styles.shareForm)}
          onSubmit={(event) => {
            event.preventDefault();
            void runAction("slack", () => actions.shareToSlack!(threadUrl.trim())).then((worked) => worked && setSharing(false));
          }}
        >
          <TextField
            size="sm"
            label="Slack thread"
            description="The agent posts the report once, as a reply, with your Slack tools. It changes no files."
            placeholder="https://acme.slack.com/archives/C123/p456"
            value={threadUrl}
            autoFocus
            onChange={(event) => setThreadUrl(event.target.value)}
          />
          <span className={sx(styles.shareActions)}>
            <Button type="button" size="xs" variant="quiet" onClick={() => setSharing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="xs" loading={running === "slack"} disabled={!threadUrl.trim() || running !== null}>
              Share
            </Button>
          </span>
        </form>
      ) : null}
      {notice ? (
        <p className={sx(notice.error ? styles.error : styles.notice)} role={notice.error ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
