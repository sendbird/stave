import { useEffect, useId, useRef, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { Badge, type BadgeTone } from "@/components/aui/components/Badge";
import { raisedPanel } from "@/components/aui/recipes/raised-panel";
import { sx } from "@/components/aui/utils/stylex";
import { EvidenceList } from "@/components/agent-runs/EvidenceList";
import { agentRunStyles } from "@/components/agent-runs/agent-runs.styles";
import { describeTarsResponsibilityDetail, describeTarsWorkingChanges } from "@/lib/tars/detail";
import { describeUsageLong } from "@/lib/agent-runs/usage";
import type { TarsCriterionSource, TarsCriterionStatus, TarsReportEvidence, TarsReportModel, TarsRevisionFreshness } from "@/lib/tars/report-model";
import type { TarsResponsibility } from "@/lib/tars/types";
import { tarsSideViewStyles as styles } from "./tars-side-view.styles";

const STATUS_TONE: Record<TarsCriterionStatus, BadgeTone> = { met: "success", unmet: "danger", unverified: "warning", notReported: "neutral" };

const FRESHNESS_KEY = {
  current: "shell:tars.side.revision.current", superseded: "shell:tars.side.revision.superseded",
  finalUnknown: "shell:tars.side.revision.finalUnknown", unknown: "shell:tars.side.revision.unknown",
} as const satisfies Record<TarsRevisionFreshness, string>;

/** "Checked on 1a2b3c4d · the final revision": where something was checked, and whether that revision is the one the run ended on. */
export function describeTarsEvidenceRevision(revision: string | null, freshness: TarsRevisionFreshness) {
  if (!revision) return i18n.t("shell:tars.side.revision.unknown");
  return i18n.t(FRESHNESS_KEY[freshness], { revision });
}

/** What decided a criterion's status, in one line: the agent's report in a stage, or a Stave check with its result and revision. */
export function describeTarsCriterionSource(source: TarsCriterionSource) {
  if (source.kind === "none") return i18n.t("shell:tars.side.report.source.none");
  if (source.kind === "agent") return `${i18n.t("shell:tars.side.report.source.agent", { stage: source.stageTitle })} · ${describeTarsEvidenceRevision(source.revision, source.freshness)}`;
  if (source.exitCode === null) return i18n.t("shell:tars.side.report.source.checkNotRun", { name: source.name, stage: source.stageTitle });
  const result = source.exitCode === 0 ? i18n.t("shell:tars.side.report.source.checkPassed", { name: source.name, stage: source.stageTitle })
    : i18n.t("shell:tars.side.report.source.checkFailed", { name: source.name, stage: source.stageTitle, code: source.exitCode });
  return `${result} · ${describeTarsEvidenceRevision(source.revision, source.freshness)}`;
}

function Evidence({ items }: { items: readonly TarsReportEvidence[] }) {
  // The source label ("Verified by Stave", "Provider result", "Agent's claim") comes with each item from the existing list.
  return <EvidenceList evidence={items.map((item) => item.evidence)}
    revisions={items.map((item) => describeTarsEvidenceRevision(item.revision, item.freshness))} />;
}

/**
 * The result report: per acceptance criterion the reported status and the
 * evidence behind it, labelled by source and revision; then what is unmet and
 * what the run left behind. It is the run's frozen report, never live text.
 * `actions` are the next steps a blocked responsibility admits.
 */
export function TarsReportPanel({ model, row, focusUnmet, actions, publish }: {
  model: TarsReportModel; row: TarsResponsibility; focusUnmet?: boolean; actions?: ReactNode;
  /** Completed work's way to its draft pull request: the link once open, else the button that opens its confirmation card. */
  publish?: ReactNode;
}) {
  const { t } = useTranslation(["shell"]);
  const unmetRef = useRef<HTMLElement>(null);
  const ids = useId();
  const blocked = row.state === "blocked";
  useEffect(() => {
    if (focusUnmet) unmetRef.current?.scrollIntoView({ block: "start" });
  }, [focusUnmet, row.id]);
  const reason = blocked ? describeTarsResponsibilityDetail(row) ?? t("shell:tars.tray.blockedDetail") : null;
  const spent = describeUsageLong(model.usage);
  const workingChanges = describeTarsWorkingChanges(row);
  return <div className={sx(styles.section)} data-tars-report={model.state}>
    {model.state === "frozen"
      ? <p className={sx(styles.meta)} data-tars-report-frozen={model.frozenAt ?? ""}>
        {t("shell:tars.side.report.frozenAt", { time: model.frozenAt ? formatDateTime(model.frozenAt) : "" })}
        {model.finalRevision ? ` · ${t("shell:tars.side.report.finalRevision", { revision: model.finalRevision })}` : ""}
        {spent ? ` · ${t("shell:tars.side.report.spent", { value: spent })}` : ""}
      </p>
      : <p className={sx(styles.meta)} role="status">{t(`shell:tars.side.report.${model.state}`)}</p>}
    {workingChanges ? <p className={sx(styles.meta)} data-tars-report-working-changes={row.workingChanges!.kind}>{workingChanges}</p> : null}
    {model.outcome ? <div className={sx(styles.row)}>
      <Badge size="md" tone={model.outcome === "completed" ? "success" : model.outcome === "stopped" ? "danger" : "neutral"}>
        {t(`shell:tars.side.report.outcome.${model.outcome}`)}</Badge>
      {model.reason ? <span className={sx(styles.meta)}>{model.reason}</span> : null}
    </div> : null}
    {publish ? <div className={sx(styles.row)} data-tars-report-publish="">{publish}</div> : null}
    {/* Only blocked work has a reason and next steps; nothing else gets this landmark. */}
    {blocked ? <section className={sx(styles.section)} aria-label={t("shell:tars.side.report.blockedTitle")} data-tars-report-blocked="">
      {reason ? <p className={sx(agentRunStyles.callout)} role="note"><span><strong>{t("shell:tars.side.report.blockedTitle")}.</strong> {reason}</span></p> : null}
      {actions}
    </section> : null}
    {/* What is still owed leads; met work needs no heading of its own. */}
    {model.unmet.length ? <section ref={unmetRef} className={sx(styles.section, styles.anchor)} aria-labelledby={`${ids}-unmet`} data-tars-report-unmet={model.unmet.length}>
      <h3 id={`${ids}-unmet`} className={sx(styles.sectionTitle)}>{t("shell:tars.side.report.unmetTitle", { count: model.unmet.length })}</h3>
      <ul className={sx(raisedPanel.panel, styles.panelList)}>
        {model.unmet.map((criterion) => <li key={criterion.text} className={sx(raisedPanel.row, styles.criterionText)}>{criterion.text}</li>)}
      </ul>
    </section> : <p className={sx(styles.meta)} data-tars-report-unmet={0}>{t("shell:tars.side.report.allMet")}</p>}
    <section className={sx(styles.section)} aria-labelledby={`${ids}-criteria`}>
      <h3 id={`${ids}-criteria`} className={sx(styles.sectionTitle)}>{t("shell:tars.side.report.criteriaTitle")}</h3>
      <ul className={sx(raisedPanel.panel, styles.panelList)}>
        {model.criteria.map((criterion) => <li key={criterion.text} className={sx(raisedPanel.row, styles.panelRow)} data-tars-criterion={criterion.status}>
          <div className={sx(styles.criterionHead)}>
            <p className={sx(styles.criterionText)}>{criterion.text}</p>
            <Badge size="md" tone={STATUS_TONE[criterion.status]} xstyle={styles.badge}>{t(`shell:tars.side.report.status.${criterion.status}`)}</Badge>
          </div>
          <p className={sx(styles.meta)} data-tars-criterion-source={criterion.source.kind}>
            {criterion.status === "notReported" ? t("shell:tars.side.report.noReport") : describeTarsCriterionSource(criterion.source)}</p>
        </li>)}
      </ul>
    </section>
    {/* Evidence belongs to the stage that reported it, not to one criterion: shown once, under its stage. */}
    {model.evidenceGroups.map((group) => <section key={group.stageId} className={sx(styles.section)} aria-label={t("shell:tars.side.report.evidenceIn", { stage: group.stageTitle })}
      data-tars-evidence-group={group.stageId}>
      <h3 className={sx(styles.sectionTitle)}>{t("shell:tars.side.report.evidenceIn", { stage: group.stageTitle })}</h3>
      <Evidence items={group.evidence} />
    </section>)}
    {model.leftBehind.length ? <section className={sx(styles.section)} aria-labelledby={`${ids}-left`}>
      <h3 id={`${ids}-left`} className={sx(styles.sectionTitle)}>{t("shell:tars.side.report.leftBehind")}</h3>
      <ul className={sx(raisedPanel.panel, styles.panelList)}>{model.leftBehind.map((item) => <li key={item} className={sx(raisedPanel.row, styles.criterionText)}>{item}</li>)}</ul>
    </section> : null}
    {model.links.length ? <div className={sx(styles.row)}>
      {model.links.map((link) => <a key={link.url} className={sx(agentRunStyles.link)} href={link.url} target="_blank" rel="noreferrer">
        {link.label}<ArrowUpRight aria-hidden className={sx(agentRunStyles.iconSm)} /></a>)}
    </div> : null}
  </div>;
}
