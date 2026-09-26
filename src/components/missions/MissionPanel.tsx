import { useEffect, useMemo } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { TeamSection } from "@/components/team/TeamSection";
import type { CollaborationTarget } from "@/components/team/DelegateTaskForm";
import type { MissionDetail } from "@/lib/missions/api";
import { currentStageRecord, isActiveMissionState, latestStageRecord } from "@/lib/missions/domain";
import {
  describeCheckIns,
  describeMissionHeadline,
  formatAge,
  projectMissionStages,
} from "@/lib/missions/mission-view";
import type { AcceptanceCriterion } from "@/lib/playbooks/stage-prompt";
import { useAppStore } from "@/store/app.store";
import { useMissionsStore, useTaskMission } from "@/store/missions-store";
import { MissionReportView } from "./MissionReportView";
import { StageCard } from "./StageCard";
import { useNow } from "./useMission";
import { missionStyles as styles } from "./missions.styles";

const CRITERION_LABELS: Record<AcceptanceCriterion["status"], string> = {
  met: "met",
  unmet: "unmet",
  unverified: "not verified",
};

/** The latest acceptance criteria any stage reported, in playbook order. */
function latestCriteria(detail: MissionDetail): AcceptanceCriterion[] {
  let criteria: AcceptanceCriterion[] = [];
  for (const stage of detail.mission.playbook.stages) {
    const report = latestStageRecord(detail.stages, stage.id)?.report;
    if (report?.outcome === "complete" && report.acceptanceCriteria?.length) {
      criteria = report.acceptanceCriteria;
    }
  }
  return criteria;
}

function latestSignOffTime(detail: MissionDetail) {
  for (let index = detail.events.length - 1; index >= 0; index -= 1) {
    if (detail.events[index]!.kind === "sign-off") return detail.events[index]!.createdAt;
  }
  return null;
}

export function MissionDetailView(props: {
  detail: MissionDetail;
  now: number;
  onCommand: ReturnType<typeof useMissionsStore.getState>["runCommand"];
  onShowTool?: (toolCallId: string) => void;
  busy?: boolean;
  failure?: string | null;
}) {
  const { detail, now, onCommand } = props;
  const { mission } = detail;
  const rows = useMemo(() => projectMissionStages(detail, new Date(now)), [detail, now]);
  const headline = describeMissionHeadline(detail);
  const active = isActiveMissionState(mission.state);
  const record = active ? currentStageRecord(detail) : null;
  const identity = record ? { missionId: mission.id, stageId: record.stageId, attempt: record.attempt } : null;
  const criteria = latestCriteria(detail);
  const signedOffAt = latestSignOffTime(detail);
  const userPause = mission.pauseReason === "paused-by-user" || mission.pauseReason === "taken-over";
  return (
    <section className={sx(styles.panel)} aria-label={`Mission: ${mission.playbook.name}`} data-testid="mission-panel">
      <div className={sx(styles.panelHeader)}>
        <h2 className={sx(styles.panelTitle)}>Mission · {mission.playbook.name}</h2>
        {active ? (
          <div className={sx(styles.actions)}>
            {mission.state === "running" ? (
              <ActionButton size="xs" weight="quiet" disabled={props.busy} onClick={() => void onCommand("pause", { missionId: mission.id })}>
                Pause
              </ActionButton>
            ) : null}
            {mission.state === "paused" && userPause ? (
              <ActionButton size="xs" disabled={props.busy} onClick={() => void onCommand("resume", { missionId: mission.id })}>
                Resume
              </ActionButton>
            ) : null}
            {mission.pauseReason === "runtime-changed" ? (
              <ActionButton size="xs" disabled={props.busy} onClick={() => void onCommand("acceptRuntime", { missionId: mission.id })}>
                Apply to remaining stages
              </ActionButton>
            ) : null}
            <ActionButton size="xs" weight="quiet" disabled={props.busy} onClick={() => void onCommand("cancel", { missionId: mission.id })}>
              Cancel mission
            </ActionButton>
          </div>
        ) : null}
      </div>
      <dl className={sx(styles.facts)}>
        <dt className={sx(styles.factLabel)}>Goal</dt>
        <dd className={sx(styles.factValue)}>{mission.assignment}</dd>
        <dt className={sx(styles.factLabel)}>Status</dt>
        <dd className={sx(styles.factValue)}>
          {headline.text}
          {active ? ` · ${formatAge(now - Date.parse(headline.since))}` : ""}
        </dd>
        <dt className={sx(styles.factLabel)}>Check-ins</dt>
        <dd className={sx(styles.factValue)}>{describeCheckIns(mission)}</dd>
        {criteria.length > 0 ? (
          <>
            <dt className={sx(styles.factLabel)}>Done when</dt>
            <dd className={sx(styles.factValue)}>
              {signedOffAt ? (
                <p className={sx(styles.notice)}>
                  Signed off by you at {new Date(signedOffAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </p>
              ) : null}
              <ul className={sx(styles.list)}>
                {criteria.map((criterion) => (
                  <li key={criterion.text}>
                    {criterion.text} — <span className={sx(styles.factLabel)}>{CRITERION_LABELS[criterion.status]}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
      </dl>
      {props.failure ? (
        <p className={sx(styles.error)} role="alert">
          {props.failure}
        </p>
      ) : null}
      <ol className={sx(styles.list)} aria-label="Stages">
        {rows.map((row) => (
          <StageCard
            key={row.stage.id}
            row={row}
            busy={props.busy}
            onShowTool={props.onShowTool}
            {...(row.current && identity
              ? {
                  onRetry: () => void onCommand("retryStage", identity),
                  onSkip: () => void onCommand("skipStage", identity),
                }
              : {})}
          />
        ))}
      </ol>
      {detail.report ? <MissionReportView report={detail.report} /> : null}
    </section>
  );
}

/**
 * The right rail's Mission panel: the task's mission on top, and the team
 * (Advisor, workers, delegated tasks) below it.
 */
export function MissionPanel(props: {
  workspaceId: string;
  taskId: string;
  team: CollaborationTarget | null;
  teamUnavailableReason?: string;
}) {
  const detail = useTaskMission(props.workspaceId, props.taskId);
  const runCommand = useMissionsStore((state) => state.runCommand);
  const refreshMission = useMissionsStore((state) => state.refreshMission);
  const missionId = detail?.mission.id ?? "";
  const busy = useMissionsStore((state) => Boolean(state.pendingByMission[missionId]));
  const failure = useMissionsStore((state) => state.failureByMission[missionId]?.message ?? null);
  const focusTranscriptTool = useAppStore((state) => state.focusTranscriptTool);
  const active = Boolean(detail && isActiveMissionState(detail.mission.state));
  const now = useNow(active);
  // A finished mission's report is built on request; fetch it once.
  const needsReport = Boolean(detail && !active && !detail.report);
  useEffect(() => {
    if (needsReport && missionId) void refreshMission(missionId);
  }, [needsReport, missionId, refreshMission]);
  return (
    <div className={sx(styles.panel)}>
      {detail ? (
        <MissionDetailView
          detail={detail}
          now={now}
          busy={busy}
          failure={failure}
          onCommand={runCommand}
          onShowTool={(toolUseId) => focusTranscriptTool({ taskId: props.taskId, toolUseId })}
        />
      ) : (
        <p className={sx(styles.notice)}>This task has no mission. A mission runs a playbook on this task stage by stage.</p>
      )}
      <div className={sx(styles.section)}>
        {props.team ? (
          <TeamSection target={props.team} />
        ) : (
          <p className={sx(styles.notice)}>{props.teamUnavailableReason}</p>
        )}
      </div>
    </div>
  );
}
