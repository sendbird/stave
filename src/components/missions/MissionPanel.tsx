import { useEffect, useMemo } from "react";
import { CircleCheck, CircleDashed, CircleX, Ellipsis, Pause, Play, Target } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { DropdownMenu } from "@/components/ads/components/DropdownMenu";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { StepRail } from "@/components/ads/components/StepRail";
import { sx } from "@/components/ads/utils/stylex";
import { TeamSection } from "@/components/team/TeamSection";
import type { CollaborationTarget } from "@/components/team/DelegateTaskForm";
import type { MissionDetail } from "@/lib/missions/api";
import { currentStageRecord, isActiveMissionState, latestStageRecord } from "@/lib/missions/domain";
import {
  describeCheckIns,
  describeMissionBadge,
  describeMissionStatusLine,
  describeTurnBudget,
  formatAge,
  MISSION_PERMISSION_LABELS,
  projectMissionStages,
} from "@/lib/missions/mission-view";
import type { AcceptanceCriterion } from "@/lib/playbooks/stage-prompt";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { useAppStore } from "@/store/app.store";
import { useMissionsStore, useTaskMission } from "@/store/missions-store";
import { usePlaybooksUiStore } from "@/store/playbooks-ui-store";
import { MissionReportView } from "./MissionReportView";
import { useMissionReportActions, type MissionReportActions } from "./useMissionReportActions";
import { WakeUpSection } from "./WakeUpSection";
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

const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function MissionDetailView(props: {
  detail: MissionDetail;
  now: number;
  onCommand: ReturnType<typeof useMissionsStore.getState>["runCommand"];
  onShowTool?: (toolCallId: string) => void;
  reportActions?: MissionReportActions;
  reducedMotion?: boolean;
  busy?: boolean;
  failure?: string | null;
}) {
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
  const current = rows[mission.currentStageIndex]!;
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
          <span className={sx(styles.statusMeta)}>
            {active ? `Stage ${current.index + 1} of ${rows.length}` : `${rows.length} stages`}
          </span>
        </div>
        <StageTrack
          rows={rows}
          labels="never"
          size="md"
          live={active && !props.reducedMotion && mission.state === "running"}
          paused={mission.state === "paused"}
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
        <section className={sx(styles.section)} aria-label="Done when">
          <div className={sx(styles.sectionHeader)}>
            <h3 className={sx(styles.sectionTitle)}>Done when</h3>
            {signedOffAt ? (
              <span className={sx(styles.sectionAside)}>Signed off by you at {formatClock(signedOffAt)}</span>
            ) : null}
          </div>
          <ul className={sx(styles.list)}>
            {criteria.map((criterion) => {
              const presentation = CRITERION_PRESENTATION[criterion.status];
              const Icon = presentation.icon;
              return (
                <li key={criterion.text} className={sx(styles.check)}>
                  <span className={sx(styles.checkMark)}>
                    <Icon aria-hidden className={sx(styles.icon, presentation.tone)} />
                  </span>
                  <span className={sx(styles.checkText)}>{criterion.text}</span>
                  <span className={sx(styles.checkState)}>{presentation.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className={sx(styles.section)} aria-label="Stages">
        <div className={sx(styles.sectionHeader)}>
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

      <section className={sx(styles.section, styles.sectionRule)} aria-label="Mission details">
        <dl className={sx(styles.facts)}>
          <dt className={sx(styles.factLabel)}>Runs with</dt>
          <dd className={sx(styles.factValue)}>
            {getProviderLabel({ providerId: mission.fingerprint.providerId })} · {mission.fingerprint.model} ·{" "}
            {MISSION_PERMISSION_LABELS[mission.consent.permissionMode]} permissions
          </dd>
          <dt className={sx(styles.factLabel)}>Turns</dt>
          <dd className={sx(styles.factValue, describeTurnBudget(mission).nearLimit && styles.toneWaiting)}>
            {describeTurnBudget(mission).text}
            {describeTurnBudget(mission).nearLimit && active ? " — close to the limit; the mission stops there" : ""}
          </dd>
          <dt className={sx(styles.factLabel)}>Started</dt>
          <dd className={sx(styles.factValue)}>
            {formatClock(mission.createdAt)} · {formatAge(now - Date.parse(mission.createdAt))} ago
          </dd>
        </dl>
      </section>
    </section>
  );
}

/** No mission yet: what a mission is, and the way to start one. */
function HandOffEmptyState(props: { workspaceId: string; taskId: string }) {
  const provider = useAppStore((state) => state.tasks.find((task) => task.id === props.taskId)?.provider ?? null);
  const draft = useAppStore((state) => state.promptDraftByTask[props.taskId]?.text ?? "");
  const openStartSheet = usePlaybooksUiStore((state) => state.openStartSheet);
  const openPlaybooks = usePlaybooksUiStore((state) => state.openPlaybooks);
  const supported = provider === "claude-code" || provider === "codex";
  return (
    <section className={sx(styles.empty)} aria-label="Mission">
      <IconTile size="md" tone="accent">
        <Target size={iconTileGlyphSizes.md} />
      </IconTile>
      <div className={sx(styles.headText)}>
        <h2 className={sx(styles.title)}>Hand this task off</h2>
        <p className={sx(styles.notice)}>
          A mission carries the task through a playbook — understand, build, verify, open a PR — and stops only
          where you ask to sign off.
        </p>
      </div>
      <div className={sx(styles.actions)}>
        <Button
          size="sm"
          disabled={!supported}
          title={supported ? undefined : "Missions run on Claude and Codex tasks."}
          onClick={() =>
            openStartSheet({ workspaceId: props.workspaceId, taskId: props.taskId, assignment: draft })
          }
        >
          <Target aria-hidden />
          Start a mission
        </Button>
        <Button variant="quiet" size="sm" onClick={() => openPlaybooks()}>
          Manage playbooks
        </Button>
      </div>
    </section>
  );
}

/**
 * The right rail's Mission panel: the task's mission on top, its wake-up, and
 * the team (Advisor, workers, delegated tasks) below.
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
  const reportActions = useMissionReportActions(detail);
  const active = Boolean(detail && isActiveMissionState(detail.mission.state));
  const now = useNow(active);
  const reducedMotion = usePrefersReducedMotion();
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
          reducedMotion={reducedMotion}
          onCommand={runCommand}
          reportActions={reportActions}
          onShowTool={(toolUseId) => focusTranscriptTool({ taskId: props.taskId, toolUseId })}
        />
      ) : (
        <HandOffEmptyState workspaceId={props.workspaceId} taskId={props.taskId} />
      )}
      <WakeUpSection workspaceId={props.workspaceId} taskId={props.taskId} />
      <section className={sx(styles.section, styles.sectionRule)} aria-label="Team">
        {props.team ? (
          <TeamSection target={props.team} />
        ) : (
          <p className={sx(styles.notice)}>{props.teamUnavailableReason}</p>
        )}
      </section>
    </div>
  );
}
