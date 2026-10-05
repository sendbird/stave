import { i18n, useTranslation } from "@/i18n";
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
import { describeUsageShort } from "@/lib/agent-runs/usage";
import { isVerifiedEvidence } from "@/lib/agent-runs/evidence";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentRunReport } from "@/lib/agent-runs/report";
import { describeAgentRunMetrics, formatAgentRunReportMarkdown } from "@/lib/agent-runs/report-markdown";
import { formatAge } from "@/lib/agent-runs/agent-run-view";
import { AgentRunPlan, describePlanProgress } from "./AgentRunPlan";
import { EvidenceList } from "./EvidenceList";
import type { AgentRunReportActions } from "./useAgentRunReportActions";
import { agentRunStyles as styles } from "./agent-runs.styles";

type ReportActionKey = "pr" | "memory" | "slack";

const OUTCOME = {
  completed: { get title() { return i18n.t("agentRuns:agentRunReportView.title"); }, icon: CircleCheck, tone: "success" },
  cancelled: { get title() { return i18n.t("agentRuns:agentRunReportView.title2"); }, icon: CircleMinus, tone: "neutral" },
  stopped: { get title() { return i18n.t("agentRuns:agentRunReportView.title3"); }, icon: CircleX, tone: "danger" },
} as const;

const AGENT_RUN_OUTCOME_TITLES = { get completed() { return i18n.t("agentRuns:agentRunReportView.completed"); }, get cancelled() { return i18n.t("agentRuns:agentRunReportView.cancelled"); }, get stopped() { return i18n.t("agentRuns:agentRunReportView.stopped"); } } as const;

/**
 * The Agent run report: what the agent run did, why, and what proves it. It leads
 * with the outcome and four figures, then the links a reviewer opens first,
 * then the reasoning. Static: a finished agent run never animates.
 */
export function AgentRunReportView({
  report,
  actions = {},
  context = "standalone",
  agentOrigin = false,
}: {
  report: AgentRunReport;
  actions?: AgentRunReportActions;
  /**
   * `panel` under the Agent run panel's header, which already names the outcome,
   * the reason and the open criteria; `standalone` in Task Results.
   */
  context?: "panel" | "standalone";
  /** An agent run: its copy says "run", and a one-stage run's stage is not a figure. */
  agentOrigin?: boolean;
}) {
  useTranslation();
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
      setNotice({ text: error instanceof Error ? error.message : i18n.t("agentRuns:agentRunReportView.text"), error: true });
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
  // In the Agent run panel the Run card already shows turns and spend.
  const figures: Array<readonly [string, string]> = [
    [i18n.t("agentRuns:agentRunReportView.extraCopy4"), duration],
    ...(agentOrigin && report.stages.length <= 1 ? [] : ([[i18n.t("agentRuns:agentRunReportView.extraCopy5"), `${completedStages}/${report.stages.length}`]] as const)),
    ...(standalone ? ([[i18n.t("agentRuns:agentRunReportView.extraCopy6"), String(report.turnCount)]] as const) : []),
    [i18n.t("agentRuns:agentRunReportView.extraCopy7"), String(verifiedCount)],
    ...(standalone && spent ? ([[i18n.t("agentRuns:agentRunReportView.extraCopy8"), spent]] as const) : []),
  ];
  return (
    <section
      className={sx(styles.section, styles.sectionRoomy, standalone ? null : styles.sectionRule)}
      aria-label={i18n.t("agentRuns:agentRunReportView.ariaLabel")}
      data-testid="agent-run-report"
    >
      {standalone ? (
        <div className={sx(styles.sectionHeader)}>
          <IconTile size="xs" tone={outcome.tone}>
            <OutcomeIcon size={iconTileGlyphSizes.xs} />
          </IconTile>
          <div className={sx(styles.headText)}>
            <h3 className={sx(styles.title)}>{outcome.title}</h3>
            <p className={sx(styles.eyebrow)}>
              {report.workflowName} · {report.assignment.split("\n")[0]}
            </p>
          </div>
        </div>
      ) : (
        <div className={sx(styles.sectionHeader)}>
          <FileText aria-hidden className={sx(styles.sectionIcon)} />
          <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:agentRunReportView.agentRunReportView")}</h3>
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
        aria-label={i18n.t("agentRuns:agentRunReportView.ariaLabel2")}
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
          <p className={sx(styles.groupLabel)}>{i18n.t("agentRuns:agentRunReportView.sentence6", { value1: describePlanProgress(plan) })}</p>
          <AgentRunPlan items={plan} />
        </div>
      ) : null}
      {decisions.length > 0 ? (
        <div className={sx(styles.stageGroup)}>
          <p className={sx(styles.groupLabel)}>{i18n.t("agentRuns:agentRunReportView.agentRunReportView3")}</p>
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
          <p className={sx(styles.groupLabel)}>{i18n.t("agentRuns:agentRunReportView.agentRunReportView4")}</p>
          <ul className={sx(styles.list)}>
            {open.map((criterion) => (
              <li key={criterion.text} className={sx(styles.check)}>
                <span className={sx(styles.checkMark)}>
                  <CircleX aria-hidden className={sx(styles.icon, styles.toneIdle)} />
                </span>
                <span className={sx(styles.checkText)}>{criterion.text}</span>
                <span className={sx(styles.checkState)}>
                  {criterion.status === "unmet" ? i18n.t("agentRuns:agentRunReportView.copy") : i18n.t("agentRuns:agentRunReportView.copy2")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.leftBehind.length > 0 ? (
        <div className={sx(styles.stageGroup)}>
          <p className={sx(styles.groupLabel)}>{i18n.t("agentRuns:agentRunReportView.agentRunReportView5")}</p>
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
          <p className={sx(styles.groupLabel)}>{i18n.t("agentRuns:agentRunReportView.agentRunReportView6")}</p>
          <EvidenceList evidence={verifiedFirst} />
        </div>
      ) : null}
      {report.metrics ? (
        <p className={sx(styles.notice)} data-testid="agent-run-metrics">
          {describeAgentRunMetrics(report.metrics)}
        </p>
      ) : null}
      <div className={sx(styles.actions)}>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(formatAgentRunReportMarkdown(report)).then(
              () => setNotice({ text: i18n.t("agentRuns:agentRunReportView.text2"), error: false }),
              () => setNotice({ text: i18n.t("agentRuns:agentRunReportView.text3"), error: true }),
            );
          }}
        >
          <Copy aria-hidden />
          {i18n.t("agentRuns:agentRunReportView.agentRunReportView7")}</Button>
        {actions.addToPullRequest ? (
          <Button
            size="xs"
            variant="secondary"
            loading={running === "pr"}
            disabled={running !== null}
            onClick={() => void runAction("pr", actions.addToPullRequest!)}
          >
            <GitPullRequestArrow aria-hidden />
            {i18n.t("agentRuns:agentRunReportView.agentRunReportView8")}</Button>
        ) : null}
        {actions.saveDecisions || actions.shareToSlack ? (
          <DropdownMenu
            placement="bottom-start"
            triggerAsChild
            trigger={
              <Button size="xs" variant="quiet" aria-label={i18n.t("agentRuns:agentRunReportView.ariaLabel3")} disabled={running !== null}>
                <Ellipsis aria-hidden />
                {i18n.t("agentRuns:agentRunReportView.trigger")}</Button>
            }
            groups={[
              {
                items: [
                  ...(actions.saveDecisions
                    ? [{ label: i18n.t("agentRuns:agentRunReportView.label"), icon: <BookmarkPlus />, pending: running === "memory", onSelect: () => void runAction("memory", actions.saveDecisions!) }]
                    : []),
                  ...(actions.shareToSlack ? [{ label: i18n.t("agentRuns:agentRunReportView.label2"), icon: <Send />, onSelect: () => setSharing(true) }] : []),
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
            label={i18n.t("agentRuns:agentRunReportView.label3")}
            description={i18n.t("agentRuns:agentRunReportView.description")}
            placeholder="https://acme.slack.com/archives/C123/p456"
            value={threadUrl}
            autoFocus
            onChange={(event) => setThreadUrl(event.target.value)}
          />
          <span className={sx(styles.shareActions)}>
            <Button type="button" size="xs" variant="quiet" onClick={() => setSharing(false)}>
              {i18n.t("agentRuns:agentRunReportView.agentRunReportView9")}</Button>
            <Button type="submit" size="xs" loading={running === "slack"} disabled={!threadUrl.trim() || running !== null}>
              {i18n.t("agentRuns:agentRunReportView.agentRunReportView10")}</Button>
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
