import { useId, useMemo, useState } from "react";
import { Hand } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { Textarea } from "@/components/ui/textarea";
import type { MissionDetail } from "@/lib/missions/api";
import { currentStageRecord, MISSION_LIMITS } from "@/lib/missions/domain";
import { projectMissionStages, type MissionStageRow } from "@/lib/missions/mission-view";
import type { PlaybookStage } from "@/lib/playbooks/schema";
import { useAppStore } from "@/store/app.store";
import { useMissionsStore } from "@/store/missions-store";
import { useScopedTaskMission } from "./useMission";
import { missionStyles as styles } from "./missions.styles";

/** The primary button names what happens when it is pressed. */
export function describeSignOffAction(stage: PlaybookStage): string {
  if (stage.kind === "ai") return `Start ${stage.title}`;
  switch (stage.action.type) {
    case "open-draft-pr":
      return "Open the draft PR";
    case "watch-checks":
      return "Start watching checks";
    case "mark-pr-ready":
      return "Mark ready for review";
  }
}

/** What the card cites: the stage before it, in one line. */
export function summarizePreviousStage(row: MissionStageRow | undefined): string | null {
  if (!row?.record) return null;
  const parts: string[] = [`${row.stage.title} ${row.status === "completed" ? "done" : row.status}`];
  const diff = row.record.facts?.diff;
  if (diff && diff.filesChanged > 0) {
    parts.push(`${diff.filesChanged} ${diff.filesChanged === 1 ? "file" : "files"} +${diff.insertions} −${diff.deletions}`);
  }
  const verified = row.evidence.filter((item) => item.source === "stave").length;
  if (verified > 0) parts.push(`${verified} verified by Stave`);
  return parts.join(" · ");
}

export function SignOffCard(props: {
  detail: MissionDetail;
  onSignOff: () => void;
  onAskForChanges: (feedback: string) => void;
  onReviewChanges: () => void;
  busy?: boolean;
  failure?: string | null;
}) {
  const { detail } = props;
  const [asking, setAsking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const feedbackId = useId();
  const rows = useMemo(() => projectMissionStages(detail, new Date()), [detail]);
  const current = rows[detail.mission.currentStageIndex]!;
  const previous = rows[detail.mission.currentStageIndex - 1];
  const summary = summarizePreviousStage(previous);
  const canAskForChanges = rows
    .slice(0, detail.mission.currentStageIndex)
    .some((row) => row.stage.kind === "ai");
  const previousReport = previous?.record?.report;
  return (
    <section className={sx(styles.signOff)} aria-label={`Sign-off: ${current.stage.title}`}>
      <p className={sx(styles.signOffTitle)}>
        <Hand aria-hidden className={sx(styles.icon, styles.toneWaiting)} />
        {current.stage.title} — waiting for your sign-off
      </p>
      {summary ? <p className={sx(styles.notice)}>{summary}</p> : null}
      {previousReport?.outcome === "complete" ? (
        <p className={sx(styles.factValue)}>{previousReport.summary}</p>
      ) : null}
      {asking ? (
        <form
          className={sx(styles.panel)}
          onSubmit={(event) => {
            event.preventDefault();
            if (feedback.trim()) props.onAskForChanges(feedback.trim());
          }}
        >
          <label htmlFor={feedbackId} className={sx(styles.subheading)}>
            What should change? The last AI stage runs again with this.
          </label>
          <Textarea
            id={feedbackId}
            value={feedback}
            maxLength={MISSION_LIMITS.maxFeedbackChars}
            onChange={(event) => setFeedback(event.target.value)}
            rows={3}
            autoFocus
          />
          <div className={sx(styles.actions)}>
            <ActionButton type="submit" weight="primary" disabled={props.busy || !feedback.trim()}>
              Ask for changes
            </ActionButton>
            <ActionButton type="button" weight="quiet" onClick={() => setAsking(false)}>
              Back
            </ActionButton>
          </div>
        </form>
      ) : (
        <div className={sx(styles.actions)}>
          <ActionButton weight="primary" onClick={props.onSignOff} disabled={props.busy}>
            {describeSignOffAction(current.stage)}
          </ActionButton>
          <ActionButton onClick={props.onReviewChanges}>Review changes</ActionButton>
          {canAskForChanges ? (
            <ActionButton weight="quiet" onClick={() => setAsking(true)} disabled={props.busy}>
              Ask for changes
            </ActionButton>
          ) : null}
        </div>
      )}
      {props.failure ? (
        <p className={sx(styles.error)} role="alert">
          {props.failure}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The composer slot's sign-off card, for the scoped task's mission. Renders
 * nothing unless the current stage waits for the user.
 */
export function MissionSignOffSlot() {
  const { detail } = useScopedTaskMission();
  const runCommand = useMissionsStore((state) => state.runCommand);
  const missionId = detail?.mission.id ?? "";
  const busy = useMissionsStore((state) => Boolean(state.pendingByMission[missionId]));
  const failure = useMissionsStore((state) => state.failureByMission[missionId]?.message ?? null);
  const setLayout = useAppStore((state) => state.setLayout);
  if (!detail || detail.mission.state !== "running") return null;
  const record = currentStageRecord(detail);
  if (record.status !== "awaiting-sign-off") return null;
  const identity = { missionId, stageId: record.stageId, attempt: record.attempt };
  return (
    <SignOffCard
      detail={detail}
      busy={busy}
      failure={failure}
      onSignOff={() => void runCommand("signOff", identity)}
      onAskForChanges={(feedback) => void runCommand("requestChanges", { ...identity, feedback })}
      onReviewChanges={() =>
        setLayout({ patch: { sidebarOverlayVisible: true, sidebarOverlayTab: "changes" } })
      }
    />
  );
}
