import { useState } from "react";
import type * as React from "react";
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  CircleX,
  ChevronDown,
  Clock,
  GitPullRequest,
  Hand,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { DropdownMenu } from "@/components/ads/components/DropdownMenu";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
import { describeUsageShort } from "@/lib/missions/usage";
import type { ProjectMissionView } from "@/lib/projects/api";
import { MISSION_PROVIDERS, type MissionProposal, type MissionProviderId } from "@/lib/projects/domain";
import { defaultProjectMissionModel, PROJECT_MISSION_MODELS } from "@/lib/projects/models";
import { getProviderLabel, toHumanModelName } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { projectStyles as styles } from "./projects.styles";

/** A running mission that stopped for the user. */
export function missionNeedsYou(mission: ProjectMissionView) {
  return (
    mission.state === "running" &&
    (mission.currentStageStatus === "awaiting-sign-off" ||
      mission.currentStageStatus === "blocked" ||
      mission.currentStageStatus === "stuck")
  );
}

export function missionTitle(mission: Pick<ProjectMissionView, "assignment">) {
  return mission.assignment.split("\n")[0]!.trim();
}

/** A mission's stages as small segments, colored by where it stands. */
function MiniTrack({ mission }: { mission: ProjectMissionView }) {
  const currentTone =
    mission.currentStageStatus === "awaiting-sign-off"
      ? styles.segWaiting
      : mission.currentStageStatus === "blocked" || mission.currentStageStatus === "stuck"
        ? styles.segAttention
        : styles.segActive;
  const completed = mission.state === "completed";
  const live = mission.state === "running" || mission.state === "paused";
  const shown = completed ? mission.stageCount : mission.currentStageIndex + (live ? 1 : 0);
  return (
    <span
      className={sx(styles.rowTrack)}
      role="img"
      aria-label={`Stage ${Math.min(shown, mission.stageCount)} of ${mission.stageCount}`}
    >
      {Array.from({ length: mission.stageCount }, (_, index) => (
        <span
          key={index}
          className={sx(
            styles.miniSegment,
            (completed || index < mission.currentStageIndex) && styles.segDone,
            live && index === mission.currentStageIndex && currentTone,
          )}
        />
      ))}
    </span>
  );
}

function describeMission(mission: ProjectMissionView) {
  const waiting = mission.currentStageStatus === "awaiting-sign-off";
  const troubled = mission.currentStageStatus === "blocked" || mission.currentStageStatus === "stuck";
  if (mission.state === "completed") return { Mark: CircleCheck, tone: styles.toneDone, text: `Completed · ${mission.playbookName}`, waiting: false, troubled: false };
  if (mission.state === "cancelled") return { Mark: CircleMinus, tone: styles.iconMuted, text: `Cancelled · ${mission.playbookName}`, waiting: false, troubled: false };
  if (mission.state === "stopped") {
    return { Mark: CircleX, tone: styles.toneAttention, text: `Stopped · ${mission.stageTitle ?? mission.playbookName}`, waiting: false, troubled: false };
  }
  const stage = mission.stageTitle ?? `Stage ${mission.currentStageIndex + 1}`;
  if (waiting) return { Mark: Hand, tone: styles.toneWaiting, text: `${stage} · waits for your sign-off`, waiting, troubled };
  if (troubled) return { Mark: TriangleAlert, tone: styles.toneAttention, text: `${stage} · ${mission.currentStageStatus}`, waiting, troubled };
  return { Mark: CircleDot, tone: styles.toneActive, text: `${stage} · ${mission.state === "paused" ? "paused" : "running"}`, waiting, troubled };
}

export function MissionRow(props: { mission: ProjectMissionView; onOpen: () => void }) {
  const { mission } = props;
  const { Mark, tone, text, waiting, troubled } = describeMission(mission);
  const pr = mission.report?.links.find((link) => /\/pull\/\d+/.test(link.url));
  const spent = describeUsageShort(mission.usage);
  return (
    <li className={sx(styles.row)}>
      <span className={sx(styles.rowMark)}>
        <Mark aria-hidden className={sx(styles.icon, tone)} />
      </span>
      <span className={sx(styles.rowText)}>
        <span className={sx(styles.rowTitle)} title={mission.assignment}>
          {missionTitle(mission)}
        </span>
        <span className={sx(styles.rowMeta)}>
          <span className={sx(waiting && styles.rowWaiting, troubled && styles.rowAttention)}>{text}</span>
          {" · "}
          {getProviderLabel({ providerId: mission.providerId as ProviderId })}
          {spent ? ` · ${spent}` : ""}
        </span>
      </span>
      <MiniTrack mission={mission} />
      <span className={sx(styles.rowActions)}>
        {pr ? (
          <Button variant="quiet" size="xs" render={<a href={pr.url} target="_blank" rel="noreferrer" />} aria-label={`Open ${pr.label}`}>
            <GitPullRequest aria-hidden />
            PR
          </Button>
        ) : null}
        <Button variant={waiting || troubled ? "secondary" : "quiet"} size="xs" onClick={props.onOpen}>
          {waiting ? "Review" : "Open"}
        </Button>
      </span>
    </li>
  );
}

type RunsOn = { providerId: MissionProviderId; model: string | null };

/** "Claude · Claude Opus 5.5": where a proposal runs, the provider default when it names no model. */
function describeRunsOn(runsOn: RunsOn) {
  const model = runsOn.model ?? defaultProjectMissionModel(runsOn.providerId);
  return `${getProviderLabel({ providerId: runsOn.providerId })} · ${toHumanModelName({ model })}`;
}

export function ProposalRow(props: {
  proposal: MissionProposal;
  busy: boolean;
  /** `runsOn` is present when the user changed the provider or model. */
  onApprove: (runsOn?: RunsOn) => void;
  onReject: () => void;
}) {
  const { proposal } = props;
  const stages = proposal.playbook.stages.length;
  const proposed: RunsOn = { providerId: proposal.providerId, model: proposal.model };
  const [runsOn, setRunsOn] = useState<RunsOn>(proposed);
  const changed = runsOn.providerId !== proposed.providerId || runsOn.model !== proposed.model;
  return (
    <li className={sx(styles.row, styles.rowCompact)}>
      <span className={sx(styles.rowMark)}>
        <CircleDashed aria-hidden className={sx(styles.icon, styles.toneWaiting)} />
      </span>
      <span className={sx(styles.rowText)}>
        <span className={sx(styles.rowTitle)} title={proposal.assignment}>
          {missionTitle(proposal)}
        </span>
        <span className={sx(styles.rowMeta)}>
          <span className={sx(styles.rowWaiting)}>Proposed</span>
          {` · ${proposal.playbook.name} · ${stages} ${stages === 1 ? "stage" : "stages"}`}
          {proposal.agentName ? ` · runs as ${proposal.agentName}` : ""}
        </span>
      </span>
      <span className={sx(styles.rowActions)}>
        <DropdownMenu
          placement="bottom-end"
          triggerAsChild
          trigger={
            <Button variant="quiet" size="xs" disabled={props.busy} aria-label={`Runs on ${describeRunsOn(runsOn)}. Change`}>
              {describeRunsOn(runsOn)}
              <ChevronDown aria-hidden />
            </Button>
          }
          groups={MISSION_PROVIDERS.map((providerId) => ({
            label: getProviderLabel({ providerId }),
            items: PROJECT_MISSION_MODELS[providerId].map((model) => ({
              label: toHumanModelName({ model }),
              selected:
                runsOn.providerId === providerId &&
                (runsOn.model ?? defaultProjectMissionModel(providerId)) === model,
              onSelect: () => setRunsOn({ providerId, model }),
            })),
          }))}
        />
        <Tooltip content="Dismiss this proposal">
          <Button variant="quiet" size="xs" iconOnly aria-label="Dismiss this proposal" disabled={props.busy} onClick={props.onReject}>
            <X aria-hidden />
          </Button>
        </Tooltip>
        <Button size="xs" disabled={props.busy} onClick={() => props.onApprove(changed ? runsOn : undefined)}>
          Start mission
        </Button>
      </span>
    </li>
  );
}

/**
 * A proposal that is not running yet: approved and waiting for a free slot,
 * or failed to start, with the reason Stave kept.
 */
export function PendingStartRow(props: { proposal: MissionProposal; parallelLimit: number }) {
  const { proposal } = props;
  const failed = proposal.state === "failed";
  const Mark = failed ? TriangleAlert : Clock;
  const status = failed
    ? `Could not start · ${proposal.detail?.trim() || "No reason was recorded."}`
    : `Queued · starts when a slot frees up (${props.parallelLimit} at once)`;
  return (
    <li className={sx(styles.row, styles.rowCompact)}>
      <span className={sx(styles.rowMark)}>
        <Mark aria-hidden className={sx(styles.icon, failed ? styles.toneAttention : styles.iconMuted)} />
      </span>
      <span className={sx(styles.rowText)}>
        <span className={sx(styles.rowTitle)} title={proposal.assignment}>
          {missionTitle(proposal)}
        </span>
        <span className={sx(styles.rowMeta, styles.rowMetaWrap)}>
          <span className={sx(failed && styles.rowAttention)}>{status}</span>
          {` · ${proposal.playbook.name}`}
          {proposal.agentName ? ` · runs as ${proposal.agentName}` : ""}
        </span>
      </span>
      <span className={sx(styles.rowActions)}>
        <span className={sx(styles.hint)}>{describeRunsOn({ providerId: proposal.providerId, model: proposal.model })}</span>
      </span>
    </li>
  );
}

/** A titled group of rows with its count, or a dashed note when it is empty. */
export function Lane(props: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className={sx(styles.lane)} aria-label={props.title}>
      <div className={sx(styles.laneHeader)}>
        <h3 className={sx(styles.laneTitle)}>{props.title}</h3>
        <span className={sx(styles.laneCount)}>{props.count}</span>
      </div>
      {props.count > 0 ? <ul className={sx(styles.rows)}>{props.children}</ul> : <p className={sx(styles.emptyLane)}>{props.empty}</p>}
    </section>
  );
}
