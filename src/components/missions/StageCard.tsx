import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { formatAge, STAGE_STATUS_PRESENTATION, type MissionStageRow } from "@/lib/missions/mission-view";
import { STAVE_ACTION_LABELS } from "@/lib/playbooks/schema";
import { EvidenceList } from "./EvidenceList";
import { StageStatusIcon } from "./StageStatusIcon";
import { missionStyles as styles } from "./missions.styles";

function describeStageMeta(row: MissionStageRow): string {
  const parts: string[] = [];
  if (row.status === "running") parts.push("now");
  else if (row.durationMs !== null && row.status === "completed") parts.push(formatAge(row.durationMs));
  if (row.attempts > 1) parts.push(`attempt ${row.attempts}`);
  if (row.asksFirst && (row.status === "pending" || row.status === "awaiting-sign-off")) {
    parts.push("asks you first");
  }
  if (row.stage.kind === "action" && row.stage.action.type === "watch-checks" && row.status === "pending") {
    const repairs = row.stage.action.repairAttempts;
    parts.push(repairs ? `up to ${repairs} ${repairs === 1 ? "repair" : "repairs"}` : "no repairs");
  }
  return parts.join(" · ");
}

/**
 * One stage of a mission: status, and on demand the instruction it ran with,
 * what the agent reported and decided, and the evidence, Stave's first.
 */
export function StageCard(props: {
  row: MissionStageRow;
  /** Retry and Skip, shown for the current stage when it is blocked or stuck. */
  onRetry?: () => void;
  onSkip?: () => void;
  onShowTool?: (toolCallId: string) => void;
  busy?: boolean;
}) {
  const { row } = props;
  const [expanded, setExpanded] = useState(row.current);
  const presentation = STAGE_STATUS_PRESENTATION[row.status];
  const report = row.record?.report ?? null;
  const facts = row.record?.facts ?? null;
  const bodyId = `mission-stage-${row.stage.id}`;
  const meta = describeStageMeta(row);
  const recoverable = row.current && (row.status === "blocked" || row.status === "stuck");
  return (
    <li className={sx(styles.stage)} aria-current={row.current ? "step" : undefined}>
      <Button
        variant="quiet"
        size="sm"
        press="none"
        xstyle={styles.stageHeader}
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? (
          <ChevronDown aria-hidden className={sx(styles.icon, styles.toneIdle)} />
        ) : (
          <ChevronRight aria-hidden className={sx(styles.icon, styles.toneIdle)} />
        )}
        <StageStatusIcon tone={presentation.tone} />
        <span className={sx(styles.stageTitle)}>
          {row.index + 1}. {row.stage.title}
          <span className={sx(styles.visuallyHidden)}> — {presentation.label}</span>
        </span>
        {meta ? <span className={sx(styles.stageMeta)}>{meta}</span> : null}
      </Button>
      {expanded ? (
        <div id={bodyId} className={sx(styles.stageBody)}>
          {row.record?.detail && row.status !== "completed" ? (
            <p
              className={sx(
                row.status === "blocked" || row.status === "stuck" ? styles.error : styles.notice,
              )}
            >
              {presentation.label}: {row.record.detail}
            </p>
          ) : null}
          {report?.outcome === "complete" ? <p className={sx(styles.factValue)}>{report.summary}</p> : null}
          {report?.outcome === "blocked" ? (
            <p className={sx(styles.error)}>
              Missing: {report.missing}
              {report.suggestedAction ? ` — ${report.suggestedAction}` : ""}
            </p>
          ) : null}
          {report?.outcome === "complete" && report.decisions.length > 0 ? (
            <>
              <p className={sx(styles.subheading)}>Decisions</p>
              <ul className={sx(styles.list)}>
                {report.decisions.map((item) => (
                  <li key={item.decision}>
                    {item.decision} — <span className={sx(styles.factLabel)}>{item.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {row.evidence.length > 0 ? (
            <>
              <p className={sx(styles.subheading)}>Evidence</p>
              <EvidenceList evidence={row.evidence} onShowTool={props.onShowTool} />
            </>
          ) : null}
          {report?.outcome === "complete" && report.artifacts.length > 0 ? (
            <ul className={sx(styles.list)}>
              {report.artifacts.map((artifact) => (
                <li key={artifact.url}>
                  <a href={artifact.url} target="_blank" rel="noreferrer">
                    {artifact.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {facts?.diff ? (
            <p className={sx(styles.notice)}>
              {facts.diff.filesChanged} {facts.diff.filesChanged === 1 ? "file" : "files"} · +
              {facts.diff.insertions} −{facts.diff.deletions}
              {facts.commands.length > 0 ? ` · ${facts.commands.length} commands run` : ""}
            </p>
          ) : null}
          <p className={sx(styles.subheading)}>Instruction</p>
          <p className={sx(styles.quote)}>
            {row.stage.kind === "ai"
              ? `${row.stage.instruction}\nDone when: ${row.stage.doneWhen}`
              : `Stave action: ${STAVE_ACTION_LABELS[row.stage.action.type]}`}
          </p>
          {recoverable && (props.onRetry || props.onSkip) ? (
            <div className={sx(styles.actions)}>
              {props.onRetry ? (
                <ActionButton size="xs" onClick={props.onRetry} disabled={props.busy}>
                  Retry stage
                </ActionButton>
              ) : null}
              {props.onSkip ? (
                <ActionButton size="xs" weight="quiet" onClick={props.onSkip} disabled={props.busy}>
                  Skip stage
                </ActionButton>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
