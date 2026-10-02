import { useEffect, useMemo } from "react";
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Ellipsis,
  Gauge,
  ListChecks,
  ListOrdered,
  Pause,
  Play,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { DropdownMenu } from "@/components/ads/components/DropdownMenu";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { StepRail } from "@/components/ads/components/StepRail";
import { sx } from "@/components/ads/utils/stylex";
import type { MissionDetail } from "@/lib/missions/api";
import { currentStageRecord, isActiveMissionState, latestStageRecord } from "@/lib/missions/domain";
import { collectAcceptanceCriteria } from "@/lib/missions/briefing";
import {
  describeCheckIns,
  describeMissionBadge,
  describeMissionStatusLine,
  formatAge,
  projectMissionStages,
} from "@/lib/missions/mission-view";
import type { AcceptanceCriterion } from "@/lib/playbooks/stage-prompt";
import { useAppStore } from "@/store/app.store";
import { missionStageKey, useMissionFailure, useMissionsStore } from "@/store/missions-store";
import { isAgentRun } from "@/lib/missions/agent-run";
import { AgentRunDetailView } from "./AgentRunPanel";
import { useAgentRunActions, type AgentRunActions } from "./useAgentRunActions";
import { MissionReportView } from "./MissionReportView";
import { useMissionReportActions, type MissionReportActions } from "./useMissionReportActions";
import { MissionRunSummary } from "./MissionRunSummary";
import { StageCard } from "./StageCard";
import { StageTrack } from "./StageTrack";
import { useNow, usePrefersReducedMotion } from "./useMission";
import { missionStyles as styles } from "./missions.styles";

const CRITERION_PRESENTATION = {
  met: { label: "Met", icon: CircleCheck, tone: styles.toneDone },
  unmet: { label: "Not met", icon: CircleX, tone: styles.toneAttention },
  unverified: { label: "Not verified", icon: CircleDashed, tone: styles.toneIdle },
} as const satisfies Record<AcceptanceCriterion["status"], unknown>;

const TILE_TONES = {
  accent: "accent",
  warning: "warning",
  danger: "danger",
  success: "success",
  neutral: "neutral",
} as const;

/** The latest acceptance criteria any stage reported, in playbook order. */
function latestCriteria(detail: MissionDetail): AcceptanceCriterion[] {
  return collectAcceptanceCriteria(detail, true);
}

function latestSignOffTime(detail: MissionDetail) {
  for (let index = detail.events.length - 1; index >= 0; index -= 1) {
    if (detail.events[index]!.kind === "sign-off") return detail.events[index]!.createdAt;
  }
  return null;
}

const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

type MissionDetailViewProps = {
  detail: MissionDetail;
  now: number;
  onCommand: ReturnType<typeof useMissionsStore.getState>["runCommand"];
  onShowTool?: (toolCallId: string) => void;
  reportActions?: MissionReportActions;
  reducedMotion?: boolean;
  busy?: boolean;
  failure?: string | null;
  /** What an agent run's panel offers; a playbook mission uses `onCommand`. */
  agentActions?: AgentRunActions;
};

/** The mission in the Progress tab: the stage list for a playbook, the agent and its result for a run. */
export function MissionDetailView(props: MissionDetailViewProps) {
  return isAgentRun(props.detail.mission) ? (
    <AgentRunDetailView
      detail={props.detail}
      now={props.now}
      reportActions={props.reportActions}
      actions={props.agentActions}
      failure={props.failure}
    />
  ) : (
    <PlaybookDetailView {...props} />
  );
}

function PlaybookDetailView(props: MissionDetailViewProps) {
  const { detail, now, onCommand } = props;
  const { mission } = detail;
  const rows = useMemo(() => projectMissionStages(detail, new Date(now)), [detail, now]);
  const line = describeMissionStatusLine(detail);
  const badge = describeMissionBadge(detail);
  const active = isActiveMissionState(mission.state);
  const record = active ? currentStageRecord(detail) : null;
  const identity = record ? { missionId: mission.id, stageId: record.stageId, attempt: record.attempt } : null;
  const criteria = latestCriteria(detail);
  const signedOffAt = latestSignOffTime(detail);
  const userPause = mission.pauseReason === "paused-by-user" || mission.pauseReason === "taken-over";
  // The badge already names the state; the line beside it says where and why.
  const statusText = active
    ? [
        line.title === badge.label ? null : line.title,
        line.state === badge.label ? null : line.state,
        line.detail,
        formatAge(now - Date.parse(line.since)),
      ]
        .filter(Boolean)
        .join(" · ")
    : (mission.reasonDetail ?? `Ended at ${formatClock(mission.updatedAt)}`);
  return (
    <section className={sx(styles.panel)} aria-label={`Mission: ${mission.playbook.name}`} data-testid="mission-panel">
      <header className={sx(styles.head)}>
        <div className={sx(styles.headRow)}>
          <IconTile size="sm" tone={TILE_TONES[badge.tone]}>
            <Target size={iconTileGlyphSizes.sm} />
          </IconTile>
          <div className={sx(styles.headText)}>
            <p className={sx(styles.eyebrow)}>Mission · {mission.playbook.name}</p>
            <h2 className={sx(styles.title)} title={mission.assignment}>
              {mission.assignment}
            </h2>
          </div>
          {active ? (
            <div className={sx(styles.headActions)}>
              {mission.state === "running" ? (
                <Button
                  variant="quiet"
                  size="xs"
                  disabled={props.busy}
                  onClick={() => void onCommand("pause", { missionId: mission.id })}
                >
                  <Pause aria-hidden />
                  Pause
                </Button>
              ) : null}
              {mission.state === "paused" && userPause ? (
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={props.busy}
                  onClick={() => void onCommand("resume", { missionId: mission.id })}
                >
                  <Play aria-hidden />
                  Resume
                </Button>
              ) : null}
              <DropdownMenu
                placement="bottom-end"
                triggerAsChild
                trigger={
                  <Button variant="quiet" size="iconSm" iconOnly aria-label="More mission actions">
                    <Ellipsis aria-hidden />
                  </Button>
                }
                groups={[
                  {
                    items: [
                      {
                        label: "Cancel mission",
                        tone: "danger",
                        disabled: props.busy,
                        onSelect: () => void onCommand("cancel", { missionId: mission.id }),
                      },
                    ],
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
        <div className={sx(styles.statusRow)}>
          <Badge size="sm" tone={badge.tone} dot xstyle={styles.badge}>
            {badge.label}
          </Badge>
          <span className={sx(styles.statusText)} title={statusText}>
            {statusText}
          </span>
        </div>
        {/* The track names the stage and the count; the Stages list below names them all. */}
        <StageTrack
          rows={rows}
          size="md"
          live={active && !props.reducedMotion && mission.state === "running"}
          paused={mission.state === "paused"}
          tone={mission.state === "stopped" ? "attention" : undefined}
        />
        {mission.pauseReason === "runtime-changed" ? (
          <div className={sx(styles.callout, styles.calloutNeutral)}>
            <span>{mission.reasonDetail ?? "The task's model changed since the mission started."}</span>
            <div className={sx(styles.actions)}>
              <Button
                size="xs"
                variant="secondary"
                disabled={props.busy}
                onClick={() => void onCommand("acceptRuntime", { missionId: mission.id })}
              >
                Use it for the remaining stages
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      {props.failure ? (
        <p className={sx(styles.error)} role="alert">
          {props.failure}
        </p>
      ) : null}

      {criteria.length > 0 ? (
        <section className={sx(styles.section, styles.sectionRule)} aria-label="Done when">
          <div className={sx(styles.sectionHeader)}>
            <ListChecks aria-hidden className={sx(styles.sectionIcon)} />
            <h3 className={sx(styles.sectionTitle)}>Done when</h3>
            <span className={sx(styles.sectionAside)}>
              {criteria.filter((criterion) => criterion.status === "met").length} of {criteria.length} met
            </span>
          </div>
          <ul className={sx(styles.checkList)}>
            {criteria.map((criterion) => {
              const presentation = CRITERION_PRESENTATION[criterion.status];
              const Icon = presentation.icon;
              return (
                <li key={criterion.text} className={sx(styles.check)}>
                  <span className={sx(styles.checkMark)}>
                    <Icon aria-hidden className={sx(styles.icon, presentation.tone)} />
                  </span>
                  <span className={sx(styles.checkText)}>{criterion.text}</span>
                  <span className={sx(styles.checkState, presentation.tone)}>{presentation.label}</span>
                </li>
              );
            })}
          </ul>
          {signedOffAt ? <p className={sx(styles.checkNote)}>Signed off by you at {formatClock(signedOffAt)}</p> : null}
        </section>
      ) : null}

      <section className={sx(styles.section, styles.sectionRule)} aria-label="Stages">
        <div className={sx(styles.sectionHeader)}>
          <ListOrdered aria-hidden className={sx(styles.sectionIcon)} />
          <h3 className={sx(styles.sectionTitle)}>Stages</h3>
          <span className={sx(styles.sectionAside)}>{describeCheckIns(mission)}</span>
        </div>
        <StepRail density="compact" role="list">
          {rows.map((row) => (
            <StageCard
              key={row.stage.id}
              row={row}
              last={row.index === rows.length - 1}
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
        </StepRail>
      </section>

      {detail.report ? (
        <MissionReportView report={detail.report} actions={props.reportActions} context="panel" />
      ) : null}

      <section className={sx(styles.section, styles.sectionRule)} aria-label="Run">
        <div className={sx(styles.sectionHeader)}>
          <Gauge aria-hidden className={sx(styles.sectionIcon)} />
          <h3 className={sx(styles.sectionTitle)}>Run</h3>
        </div>
        <MissionRunSummary mission={mission} usage={detail.usage ?? null} active={active} now={now} formatClock={formatClock} />
      </section>
    </section>
  );
}

/**
 * The mission in the Task panel's Progress tab, with the commands that steer
 * it. Shown only for a task that has a mission; a task without one shows its
 * flow there instead; a run starts when work is assigned to an agent.
 */
export function MissionPanel(props: { taskId: string; detail: MissionDetail }) {
  const { detail } = props;
  const runCommand = useMissionsStore((state) => state.runCommand);
  const refreshMission = useMissionsStore((state) => state.refreshMission);
  const missionId = detail.mission.id;
  const busy = useMissionsStore((state) => Boolean(state.pendingByMission[missionId]));
  const stage = detail.mission.playbook.stages[detail.mission.currentStageIndex];
  const record = stage ? latestStageRecord(detail.stages, stage.id) : null;
  const failure = useMissionFailure(missionId, record ? missionStageKey(record) : null);
  const focusTranscriptTool = useAppStore((state) => state.focusTranscriptTool);
  const reportActions = useMissionReportActions(detail);
  const agentActions = useAgentRunActions(detail);
  const active = isActiveMissionState(detail.mission.state);
  const now = useNow(active);
  const reducedMotion = usePrefersReducedMotion();
  // A finished mission's report is built on request; fetch it once.
  const needsReport = !active && !detail.report;
  useEffect(() => {
    if (needsReport) void refreshMission(missionId);
  }, [needsReport, missionId, refreshMission]);
  return (
    <MissionDetailView
      detail={detail}
      now={now}
      busy={busy}
      failure={failure}
      reducedMotion={reducedMotion}
      onCommand={runCommand}
      reportActions={reportActions}
      agentActions={agentActions}
      onShowTool={(toolUseId) => focusTranscriptTool({ taskId: props.taskId, toolUseId })}
    />
  );
}
