import { useState } from "react";
import {
  ArrowUpRight,
  Bot,
  CircleCheck,
  CircleX,
  Ellipsis,
  Hand,
  MessageSquare,
  Pause,
  Play,
  Radar,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { DropdownMenu } from "@/components/ads/components/DropdownMenu";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { formatAge } from "@/lib/missions/mission-view";
import { addMissionUsage, describeUsageLong, describeUsageShort } from "@/lib/missions/usage";
import type { ProjectDetail } from "@/lib/projects/api";
import type { MissionProposal } from "@/lib/projects/domain";
import { useAppStore } from "@/store/app.store";
import { countProjectNeeds, useProjectsStore } from "@/store/projects-store";
import { ProjectDetailTabs } from "./ProjectDetailTabs";
import { Lane, MissionRow, PendingStartRow, ProposalRow, missionNeedsYou } from "./ProjectRows";
import { describeTriggers } from "./ProjectStartsWhen";
import { projectStyles as styles } from "./projects.styles";

const STATE_BADGE = {
  active: { label: "Active", tone: "accent" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
} as const;

/**
 * One project: its goal and where it stands, the coordinator's latest word,
 * the missions in three lanes — what needs you, what runs, what is done — and
 * what the project learned, collected and is allowed to do.
 */
const TRIGGER_REASONS = {
  "issue-assigned": "an assigned issue",
  "pull-request": "pull request feedback",
  schedule: "its scheduled check-in",
} as const;

/** " for an assigned issue": what the coordinator's last automatic turn was about. */
function describeWakeReason(detail: ProjectDetail, wake: ProjectDetail["events"][number]): string {
  const triggerIds = Array.isArray(wake.detail.triggers) ? (wake.detail.triggers as string[]) : [];
  const kinds = new Set(
    detail.events
      .filter((event) => event.kind === "trigger-observed" && triggerIds.includes(event.detail.triggerId as string))
      .map((event) => event.detail.triggerKind as keyof typeof TRIGGER_REASONS),
  );
  const delivered = wake.detail.delivered && typeof wake.detail.delivered === "object" ? Object.keys(wake.detail.delivered) : [];
  const reasons: string[] = [...kinds].filter((kind) => kind in TRIGGER_REASONS).map((kind) => TRIGGER_REASONS[kind]);
  if (delivered.length) reasons.unshift(delivered.length === 1 ? "a mission update" : "mission updates");
  return reasons.length ? ` for ${reasons.join(" and ")}` : "";
}

/** Failed starts shown in full; older ones are summed up in one line. */
const FAILURES_SHOWN = 3;

/**
 * Proposals that are not running yet: approved ones waiting for a free slot,
 * and the newest failed starts (a failed start is never retried on its own).
 */
export function listPendingStarts(proposals: readonly MissionProposal[]) {
  const queued = proposals.filter((proposal) => proposal.state === "approved");
  const allFailed = proposals
    .filter((proposal) => proposal.state === "failed")
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return {
    queued,
    failed: allFailed.slice(0, FAILURES_SHOWN),
    earlierFailures: Math.max(0, allFailed.length - FAILURES_SHOWN),
  };
}

export function ProjectHome({
  detail,
  coordinatorDocked = false,
  onTalkToCoordinator,
}: {
  detail: ProjectDetail;
  /** The coordinator conversation is already beside the project. */
  coordinatorDocked?: boolean;
  onTalkToCoordinator?: () => void;
}) {
  const { project } = detail;
  const runCommand = useProjectsStore((state) => state.runCommand);
  const busy = useProjectsStore((state) => Boolean(state.pendingById[project.id]));
  const failure = useProjectsStore((state) => state.failureById[project.id] ?? null);
  const focusTaskAttention = useAppStore((state) => state.focusTaskAttention);
  const closeProjects = useAppStore((state) => state.closeProjects);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const open = (workspaceId: string, taskId: string) => {
    closeProjects();
    void focusTaskAttention({ workspaceId, taskId, repositoryPath: project.repositoryPath, refreshFromPersistence: true });
  };
  const pending = detail.proposals.filter((proposal) => proposal.state === "pending");
  const { queued, failed, earlierFailures } = listPendingStarts(detail.proposals);
  const waiting = detail.missions.filter(missionNeedsYou);
  const running = detail.missions.filter(
    (mission) => (mission.state === "running" || mission.state === "paused") && !missionNeedsYou(mission),
  );
  const done = detail.missions.filter((mission) => mission.state !== "running" && mission.state !== "paused");
  const lastWake = [...detail.events].reverse().find((event) => event.kind === "coordinator-woken");
  const badge = STATE_BADGE[project.state];
  const needs = countProjectNeeds(detail);
  const watching = describeTriggers(project.settings.triggers);
  const totalUsage = addMissionUsage(detail.missions.map((mission) => mission.usage));
  const spent = describeUsageShort(totalUsage);

  return (
    <div className={sx(styles.scroll)}>
      <div className={sx(styles.home)}>
        <header className={sx(styles.heading)}>
          <div className={sx(styles.headingText)}>
            <div className={sx(styles.titleRow)}>
              <h2 className={sx(styles.title)}>{project.name}</h2>
              <Badge size="sm" tone={badge.tone} dot>
                {badge.label}
              </Badge>
            </div>
            <p className={sx(styles.goal)}>{project.goal}</p>
            <div className={sx(styles.stats)}>
              {needs > 0 ? (
                <span className={sx(styles.stat, styles.statAttention)}>
                  <Hand aria-hidden className={sx(styles.icon)} />
                  <span className={sx(styles.statStrong, styles.colorInherit)}>{needs}</span> {needs === 1 ? "needs" : "need"} you
                </span>
              ) : null}
              <span className={sx(styles.stat)}>
                <span className={sx(styles.statStrong)}>{running.length + waiting.length}</span> running
              </span>
              <span className={sx(styles.stat)}>
                <span className={sx(styles.statStrong)}>{done.length}</span> done
              </span>
              {spent ? (
                <span className={sx(styles.stat)} title={describeUsageLong(totalUsage) ?? undefined}>
                  <span className={sx(styles.statStrong)}>{spent}</span> spent
                </span>
              ) : null}
              <span className={sx(styles.stat, styles.statQuiet)}>
                {project.settings.askBeforeStarting ? (
                  <ShieldCheck aria-hidden className={sx(styles.icon)} />
                ) : (
                  <Zap aria-hidden className={sx(styles.icon)} />
                )}
                {project.settings.askBeforeStarting ? "You start each mission" : "Starts missions on its own"} · up to{" "}
                {project.settings.parallelLimit} at once
              </span>
              {watching ? (
                <span className={sx(styles.stat, styles.statQuiet)} title="Starts when">
                  <Radar aria-hidden className={sx(styles.icon)} />
                  {watching}
                </span>
              ) : null}
            </div>
            {project.reasonDetail ? <p className={sx(styles.hint)}>{project.reasonDetail}</p> : null}
          </div>
          <div className={sx(styles.headingActions)}>
            {project.state === "active" ? (
              <Button variant="quiet" size="sm" disabled={busy} onClick={() => void runCommand("pause", { projectId: project.id })}>
                <Pause aria-hidden />
                Pause
              </Button>
            ) : null}
            {project.state === "paused" ? (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void runCommand("resume", { projectId: project.id })}>
                <Play aria-hidden />
                Resume
              </Button>
            ) : null}
            {project.state === "active" || project.state === "paused" ? (
              <DropdownMenu
                placement="bottom-end"
                triggerAsChild
                trigger={
                  <Button variant="quiet" size="iconSm" iconOnly aria-label="More project actions">
                    <Ellipsis aria-hidden />
                  </Button>
                }
                groups={[
                  {
                    items: [
                      {
                        label: "Mark the goal met",
                        icon: <CircleCheck />,
                        onSelect: () => void runCommand("end", { projectId: project.id, outcome: "completed" }),
                      },
                    ],
                  },
                  {
                    items: [
                      {
                        label: "Cancel project…",
                        tone: "danger",
                        icon: <CircleX />,
                        onSelect: () => setConfirmingCancel(true),
                      },
                    ],
                  },
                ]}
              />
            ) : null}
          </div>
        </header>

        {failure ? (
          <p className={sx(styles.error)} role="alert">
            {failure}
          </p>
        ) : null}

        <section className={sx(styles.coordinator)} aria-label="Coordinator">
          <IconTile size="sm" tone="accent">
            <Bot size={iconTileGlyphSizes.sm} />
          </IconTile>
          <div className={sx(styles.coordinatorText)}>
            <p className={sx(styles.coordinatorQuote, !project.summary && styles.coordinatorEmpty)}>
              {project.summary ?? "The coordinator has not summarized the project yet. It plans missions from the goal and follows them through."}
            </p>
            <span className={sx(styles.coordinatorMeta)}>
              Coordinator
              {lastWake ? ` · woke ${formatAge(Date.now() - Date.parse(lastWake.createdAt))} ago${describeWakeReason(detail, lastWake)}` : ""}
            </span>
          </div>
          <span className={sx(styles.coordinatorActions)}>
            {!coordinatorDocked && onTalkToCoordinator ? (
              <Button variant="secondary" size="sm" onClick={onTalkToCoordinator}>
                <MessageSquare aria-hidden />
                Talk
              </Button>
            ) : null}
            <Tooltip content="Open the coordinator's task">
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                aria-label="Open the coordinator's task"
                onClick={() => open(project.coordinator.workspaceId, project.coordinator.taskId)}
              >
                <ArrowUpRight aria-hidden />
              </Button>
            </Tooltip>
          </span>
        </section>

        <Lane title="Needs you" count={pending.length + waiting.length} empty="Nothing waits for you.">
          {pending.map((proposal) => (
            <ProposalRow
              key={proposal.id}
              proposal={proposal}
              busy={busy}
              onApprove={(runsOn) =>
                void runCommand("approveProposal", { projectId: project.id, proposalId: proposal.id, ...runsOn })
              }
              onReject={() => void runCommand("rejectProposal", { projectId: project.id, proposalId: proposal.id })}
            />
          ))}
          {waiting.map((mission) => (
            <MissionRow key={mission.missionId} mission={mission} onOpen={() => open(mission.workspaceId, mission.taskId)} />
          ))}
        </Lane>

        {queued.length + failed.length > 0 ? (
          <Lane title="Not started" count={queued.length + failed.length + earlierFailures} empty="">
            {queued.map((proposal) => (
              <PendingStartRow key={proposal.id} proposal={proposal} parallelLimit={project.settings.parallelLimit} />
            ))}
            {failed.map((proposal) => (
              <PendingStartRow key={proposal.id} proposal={proposal} parallelLimit={project.settings.parallelLimit} />
            ))}
            {earlierFailures > 0 ? (
              <li className={sx(styles.row, styles.rowCompact, styles.rowNote)}>
                <span />
                <span className={sx(styles.hint)}>
                  {earlierFailures} earlier {earlierFailures === 1 ? "start" : "starts"} also failed. Ask the
                  coordinator to propose {earlierFailures === 1 ? "it" : "them"} again.
                </span>
              </li>
            ) : null}
          </Lane>
        ) : null}

        <Lane title="Running" count={running.length} empty="No mission is running. The coordinator proposes the next ones.">
          {running.map((mission) => (
            <MissionRow key={mission.missionId} mission={mission} onOpen={() => open(mission.workspaceId, mission.taskId)} />
          ))}
        </Lane>

        <Lane title="Done" count={done.length} empty="Finished missions and their pull requests land here.">
          {done.map((mission) => (
            <MissionRow key={mission.missionId} mission={mission} onOpen={() => open(mission.workspaceId, mission.taskId)} />
          ))}
        </Lane>

        <ProjectDetailTabs
          detail={detail}
          busy={busy}
          onSetMemoryStatus={(memory, status) =>
            void runCommand("setMemoryStatus", { projectId: project.id, memoryId: memory.id, status })
          }
          onUpdateSettings={(settings) => runCommand("updateSettings", { projectId: project.id, settings })}
        />
      </div>
      <ConfirmDialog
        open={confirmingCancel}
        title={`Cancel “${project.name}”?`}
        description="The coordinator stops planning and waking, and no new mission starts. Missions already running finish on their own. A cancelled project cannot be reopened."
        confirmLabel="Cancel project"
        cancelLabel="Keep project"
        loading={busy}
        onConfirm={() => {
          void runCommand("end", { projectId: project.id, outcome: "cancelled" }).then(() => setConfirmingCancel(false));
        }}
        onCancel={() => setConfirmingCancel(false)}
      />
    </div>
  );
}
