import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { CirclePause } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { MissionDetail } from "@/lib/missions/api";
import { isActiveMissionState } from "@/lib/missions/domain";
import { isAgentRun } from "@/lib/missions/agent-run";
import { AGENT_RUN_STATE_TONES, describeAgentRunStatus, agentRunDuration } from "@/lib/missions/agent-run-view";
import { describeMissionStatusLine, projectMissionStages, type MissionStageRow } from "@/lib/missions/mission-view";
import { describeUsageShort } from "@/lib/missions/usage";
import { useFleetMissionsStore } from "@/store/fleet-missions-store";
import { StageStatusIcon } from "./StageStatusIcon";
import { StageTrack } from "./StageTrack";
import { useNow } from "./useMission";

/** The workspace's running mission: the newest active one, as stored. */
function pickActiveMission(details: Record<string, MissionDetail>, workspaceId: string) {
  let picked: MissionDetail | undefined;
  for (const detail of Object.values(details)) {
    if (detail.mission.workspaceId !== workspaceId || !isActiveMissionState(detail.mission.state)) continue;
    if (!picked || detail.mission.createdAt > picked.mission.createdAt) picked = detail;
  }
  return picked;
}

/**
 * A Fleet card's mission line: the stage rail and where it stands, so a board
 * of workspaces shows which missions wait for you without opening any.
 */
export function FleetMissionStrip(props: { workspaceId: string; onOpen: (taskId: string) => void }) {
  const detail = useFleetMissionsStore((state) => pickActiveMission(state.details, props.workspaceId));
  const rows = useMemo(() => (detail ? projectMissionStages(detail, new Date(detail.mission.updatedAt)) : []), [detail]);
  if (!detail) return null;
  if (isAgentRun(detail.mission)) return <FleetAgentRunStrip detail={detail} rows={rows} onOpen={props.onOpen} />;
  const line = describeMissionStatusLine(detail);
  const paused = detail.mission.state === "paused";
  const current = rows[detail.mission.currentStageIndex]!;
  const spent = describeUsageShort(detail.usage);
  return (
    <Button
      layout="host"
      variant="quiet"
      press="none"
      xstyle={styles.strip}
      aria-label={`Mission ${detail.mission.playbook.name}: ${line.title}${line.state ? `, ${line.state}` : ""}. Open the task.`}
      onClick={() => props.onOpen(detail.mission.leadTaskId)}
    >
      <span className={sx(styles.head)}>
        <StageStatusIcon tone={line.tone} icon={paused ? CirclePause : undefined} />
        <span className={sx(styles.text)}>
          <span className={sx(styles.title)}>{line.title}</span>
          {line.state ?? line.detail ? (
            <span className={sx(line.tone === "attention" ? styles.attention : line.tone === "waiting" ? styles.waiting : styles.muted)}>
              {" · "}
              {line.state ?? line.detail}
            </span>
          ) : null}
        </span>
        <span className={sx(styles.position)}>
          {current.index + 1}/{rows.length}
          {spent ? ` · ${spent}` : ""}
        </span>
      </span>
      <StageTrack rows={rows} labels="never" live={false} paused={paused} />
    </Button>
  );
}

/** A Fleet card's line for an agent run: the agent and its state, and its stage rail when it has stages. */
function FleetAgentRunStrip(props: { detail: MissionDetail; rows: readonly MissionStageRow[]; onOpen: (taskId: string) => void }) {
  const { detail, rows } = props;
  const status = describeAgentRunStatus(detail);
  const spent = describeUsageShort(detail.usage);
  const now = useNow(isActiveMissionState(detail.mission.state));
  const elapsed = agentRunDuration(detail, now);
  const staged = rows.length > 1;
  return (
    <Button
      layout="host"
      variant="quiet"
      press="none"
      xstyle={styles.strip}
      aria-label={`${status.agentName}: ${status.label}. Open the task.`}
      onClick={() => props.onOpen(detail.mission.leadTaskId)}
    >
      <span className={sx(styles.head)}>
        <StageStatusIcon tone={AGENT_RUN_STATE_TONES[status.state]} state={status.state} />
        <span className={sx(styles.text)}>
          <span className={sx(styles.title)}>{status.agentName}</span>
          <span className={sx(status.state === "needs-you" ? styles.waiting : styles.muted)}>
            {" · "}
            {status.label}
          </span>
        </span>
        <span className={sx(styles.position)}>
          {staged ? `${detail.mission.currentStageIndex + 1}/${rows.length} · ` : ""}
          {elapsed}
          {spent ? ` · ${spent}` : ""}
        </span>
      </span>
      {staged ? (
        <StageTrack rows={rows} labels="never" live={false} paused={detail.mission.state === "paused"} />
      ) : null}
    </Button>
  );
}

const styles = stylex.create({
  strip: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: vars["--ads-space-4"],
    width: "100%",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    borderRadius: 0,
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
    textAlign: "start",
    color: vars["--ads-color-text"],
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    cursor: "pointer",
  },
  head: { display: "flex", alignItems: "center", gap: vars["--ads-space-8"], minWidth: 0 },
  text: {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
  },
  title: { fontWeight: vars["--ads-font-weight-medium"] },
  muted: { color: vars["--ads-color-text-muted"] },
  waiting: { color: vars["--ads-color-warning-text"] },
  attention: { color: vars["--ads-color-danger-text"] },
  position: {
    flex: "0 0 auto",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-subtle"],
    fontVariantNumeric: "tabular-nums",
  },
});
