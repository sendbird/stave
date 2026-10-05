import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { i18n, useTranslation } from "@/i18n";
import { useId, useState } from "react";
import { ArrowUpRight, ChevronRight, RotateCcw, SkipForward } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { StepRail } from "@/components/ads/components/StepRail";
import { sx } from "@/components/ads/utils/stylex";
import { formatAge, STAGE_STATUS_PRESENTATION, type AgentRunStageRow } from "@/lib/agent-runs/agent-run-view";
import { STAVE_ACTION_LABELS } from "@/lib/workflows/schema";
import { EvidenceList } from "./EvidenceList";
import { StageStatusIcon } from "./StageStatusIcon";
import { agentRunStyles as styles } from "./agent-runs.styles";

/** The right-hand meta of a stage row: duration, attempts, what it will do. */
export function describeStageMeta(row: AgentRunStageRow): string {
  const parts: string[] = [];
  if (row.status === "running") parts.push("now");
  else if (row.durationMs !== null && row.status === "completed") parts.push(formatAge(row.durationMs));
  if (row.attempts > 1) parts.push(i18n.t("agentRuns:remaining.presentationCopy4", { v1: row.attempts }));
  if (row.asksFirst && (row.status === "pending" || row.status === "awaiting-sign-off")) {
    parts.push(i18n.t("agentRuns:stageCard.extraCopy11"));
  }
  if (row.stage.kind === "action" && row.stage.action.type === "watch-checks" && row.status === "pending") {
    const repairs = row.stage.action.repairAttempts;
    parts.push(repairs ? i18n.t("agentRuns:stageCard.extraCopy12", { value1: repairs, count: repairs }) : i18n.t("agentRuns:stageCard.extraCopy13"));
  }
  return parts.join(" · ");
}

/** A stage card opens when its stage becomes current, or becomes current and blocked or stuck. */
export function shouldOpenStage(
  before: { current: boolean; recoverable: boolean },
  after: { current: boolean; recoverable: boolean },
): boolean {
  return (after.current && !before.current) || (after.recoverable && !before.recoverable);
}

/** The instruction a stage ran with, folded away until asked for. */
export function InstructionDisclosure(props: { label: string; text: string; disabled?: boolean }) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={sx(styles.disclosure)}>
      <Button
        variant="quiet"
        size="xs"
        press="none"
        xstyle={styles.disclosureSummary}
        disabled={props.disabled}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight aria-hidden className={sx(styles.chevronSm, open && styles.chevronOpen)} />
        {props.label}
      </Button>
      {open ? (
        <p id={panelId} className={sx(styles.quote)}>
          {props.text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One stage on the agent run's timeline: its mark on the rail, and on demand
 * what it produced — the summary, Stave's own facts, decisions with reasons,
 * the evidence (Stave's first), links, and the instruction it ran with.
 */
export function StageCard(props: {
  row: AgentRunStageRow;
  last?: boolean;
  /** Retry and Skip, shown for the current stage when it is blocked or stuck. */
  onRetry?: () => void;
  onSkip?: () => void;
  onShowTool?: (toolCallId: string) => void;
  busy?: boolean;
}) {
  useTranslation();
  const { row } = props;
  const presentation = STAGE_STATUS_PRESENTATION[row.status];
  const report = row.record?.report ?? null;
  const facts = row.record?.facts ?? null;
  const bodyId = `agent-run-stage-${row.stage.id}`;
  const meta = describeStageMeta(row);
  const troubled = row.status === "blocked" || row.status === "stuck";
  const recoverable = row.current && troubled;
  const [expanded, setExpanded] = useState(row.current);
  // Opens when the stage becomes current or needs recovering, so Retry and
  // Skip are never folded away; the user can still close it again.
  const [opener, setOpener] = useState({ current: row.current, recoverable });
  if (opener.current !== row.current || opener.recoverable !== recoverable) {
    setOpener({ current: row.current, recoverable });
    if (shouldOpenStage(opener, { current: row.current, recoverable })) setExpanded(true);
  }
  const reached = row.record !== null;
  return (
    <StepRail.Step
      marker={<StageStatusIcon tone={presentation.tone} />}
      connector={!props.last}
      role="listitem"
      aria-current={row.current ? "step" : undefined}
    >
      <Button
        variant="quiet"
        size="sm"
        press="none"
        xstyle={styles.stageHeader}
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span
          className={sx(
            styles.stageTitle,
            row.current && styles.stageTitleCurrent,
            !reached && styles.stageTitlePending,
          )}
        >
          {getStageDisplayTitle(row.stage)}
          <span className={sx(styles.visuallyHidden)}>
            {" "}
            {i18n.t("agentRuns:stageCard.stageCard")}{row.index + 1}, {presentation.label}
          </span>
        </span>
        {row.stage.kind === "action" ? <span className={sx(styles.stageKind)} title={i18n.t("agentRuns:stageCard.title")}>
            Stave
          </span> : null}
        {meta ? <span className={sx(styles.stageMeta)}>{meta}</span> : null}
        <ChevronRight aria-hidden className={sx(styles.chevron, expanded && styles.chevronOpen)} />
      </Button>
      {expanded ? (
        <div id={bodyId} className={sx(styles.stageBody)}>
          {row.record?.detail && row.status !== "completed" ? (
            <div className={sx(styles.callout, !troubled && styles.calloutNeutral)} role={troubled ? "alert" : undefined}>
              <span>
                <strong>{presentation.label}.</strong> {row.record.detail}
              </span>
              {recoverable && (props.onRetry || props.onSkip) ? (
                <div className={sx(styles.actions)}>
                  {props.onRetry ? (
                    <Button size="xs" variant="secondary" onClick={props.onRetry} disabled={props.busy}>
                      <RotateCcw aria-hidden />
                      {i18n.t("agentRuns:stageCard.stageCard2")}</Button>
                  ) : null}
                  {props.onSkip ? (
                    <Button size="xs" variant="quiet" onClick={props.onSkip} disabled={props.busy}>
                      <SkipForward aria-hidden />
                      {i18n.t("agentRuns:stageCard.stageCard3")}</Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {report?.outcome === "complete" ? <p className={sx(styles.body)}>{report.summary}</p> : null}
          {report?.outcome === "blocked" ? (
            <div className={sx(styles.callout)}>
              <span>
                <strong>{i18n.t("agentRuns:stageCard.stageCard4")}</strong> {report.missing}
              </span>
              {report.suggestedAction ? <span className={sx(styles.muted)}>{report.suggestedAction}</span> : null}
            </div>
          ) : null}
          {facts?.diff || (facts && facts.commands.length > 0) ? (
            <p className={sx(styles.stat)}>
              {facts.diff ? (
                <span>
                  {facts.diff.filesChanged} {facts.diff.filesChanged === 1 ? i18n.t("agentRuns:stageCard.stageCard5") : i18n.t("agentRuns:stageCard.stageCard6")}{" "}
                  <span className={sx(styles.added)}>+{facts.diff.insertions}</span>{" "}
                  <span className={sx(styles.removed)}>−{facts.diff.deletions}</span>
                </span>
              ) : null}
              {facts.commands.length > 0 ? (
                <span>
                  {facts.commands.length} {facts.commands.length === 1 ? i18n.t("agentRuns:stageCard.stageCard7") : i18n.t("agentRuns:stageCard.stageCard8")} {i18n.t("agentRuns:stageCard.stageCard9")}</span>
              ) : null}
            </p>
          ) : null}
          {report?.outcome === "complete" && report.decisions.length > 0 ? (
            <div className={sx(styles.stageGroup)}>
              <p className={sx(styles.groupLabel)}>{i18n.t("agentRuns:stageCard.stageCard10")}</p>
              <ul className={sx(styles.list)}>
                {report.decisions.map((item) => (
                  <li key={item.decision} className={sx(styles.decision)}>
                    <span className={sx(styles.decisionText)}>{item.decision}</span>
                    <span className={sx(styles.decisionReason)}>{item.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {row.evidence.length > 0 ? (
            <div className={sx(styles.stageGroup)}>
              <p className={sx(styles.groupLabel)}>{i18n.t("agentRuns:stageCard.stageCard11")}</p>
              <EvidenceList evidence={row.evidence} onShowTool={props.onShowTool} />
            </div>
          ) : null}
          {report?.outcome === "complete" && report.artifacts.length > 0 ? (
            <div className={sx(styles.actions)}>
              {report.artifacts.map((artifact) => (
                <a key={artifact.url} className={sx(styles.link)} href={artifact.url} target="_blank" rel="noreferrer">
                  {artifact.label}
                  <ArrowUpRight aria-hidden className={sx(styles.iconSm)} />
                </a>
              ))}
            </div>
          ) : null}
          {row.status === "running" && !report && !row.record?.detail ? (
            <p className={sx(styles.notice)}>{i18n.t("agentRuns:stageCard.sentence8", { value1: row.durationMs !== null ? i18n.t("agentRuns:remaining.presentationCopy6", { v1: formatAge(row.durationMs) }) : "" })}</p>
          ) : null}
          <InstructionDisclosure
            label={row.stage.kind === "ai" ? i18n.t("agentRuns:stageCard.label") : i18n.t("agentRuns:stageCard.label2")}
            text={
              row.stage.kind === "ai"
                ? i18n.t("agentRuns:stageCard.text", { value1: row.stage.instruction, value2: row.stage.doneWhen })
                : i18n.t("agentRuns:remaining.presentationCopy7", { v1: STAVE_ACTION_LABELS[row.stage.action.type] })
            }
          />
        </div>
      ) : null}
    </StepRail.Step>
  );
}
