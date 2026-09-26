import { useId, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Hand } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { describeUsageShort } from "@/lib/missions/usage";
import { sx } from "@/components/ads/utils/stylex";
import { Textarea } from "@/components/ui/textarea";
import type { MissionDetail } from "@/lib/missions/api";
import { currentStageRecord, MISSION_LIMITS } from "@/lib/missions/domain";
import {
  describeSignOffAction,
  describeTurnBudget,
  projectMissionStages,
  summarizePreviousStage,
} from "@/lib/missions/mission-view";

export { describeSignOffAction, summarizePreviousStage };
import type { PlaybookStage } from "@/lib/playbooks/schema";
import { useAppStore } from "@/store/app.store";
import { useMissionsStore } from "@/store/missions-store";
import { useScopedTaskMission } from "./useMission";
import { missionStyles } from "./missions.styles";

/** The card's title: the decision, asked plainly. */
export function describeSignOffQuestion(stage: PlaybookStage): string {
  if (stage.kind === "ai") return `Ready to start ${stage.title}?`;
  switch (stage.action.type) {
    case "open-draft-pr":
      return "Ready to open the draft PR?";
    case "watch-checks":
      return "Ready to watch the PR checks?";
    case "mark-pr-ready":
      return "Ready to request review?";
  }
}

/**
 * A sign-off: the mission waits for the user before the next stage. It sits
 * where tool approvals sit, one card at a time, and says what the last stage
 * produced before asking.
 */
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
  const titleId = useId();
  const rows = useMemo(() => projectMissionStages(detail, new Date()), [detail]);
  const current = rows[detail.mission.currentStageIndex]!;
  const previous = rows[detail.mission.currentStageIndex - 1];
  const summary = summarizePreviousStage(previous);
  const canAskForChanges = rows
    .slice(0, detail.mission.currentStageIndex)
    .some((row) => row.stage.kind === "ai");
  const previousReport = previous?.record?.report;
  const budget = describeTurnBudget(detail.mission);
  const spent = describeUsageShort(detail.usage);
  return (
    <section
      className={sx(styles.card)}
      aria-labelledby={titleId}
      data-testid="mission-sign-off"
    >
      <div className={sx(styles.header)}>
        <IconTile size="xs" tone="warning" xstyle={styles.tile}>
          <Hand size={iconTileGlyphSizes.xs} />
        </IconTile>
        <div className={sx(styles.body)}>
          <div className={sx(styles.titleRow)}>
            <p id={titleId} className={sx(styles.title)}>
              {describeSignOffQuestion(current.stage)}
            </p>
            <span className={sx(styles.position, budget.nearLimit && styles.positionWarn)} title="Turns this mission has used of its limit">
              Stage {current.index + 1} of {rows.length} · {budget.text}
              {spent ? ` · ${spent}` : ""}
            </span>
          </div>
          {summary ? <p className={sx(styles.summary)}>{summary}</p> : null}
          {previousReport?.outcome === "complete" ? (
            <p className={sx(styles.report)}>{previousReport.summary}</p>
          ) : null}
        </div>
      </div>
      {asking ? (
        <form
          className={sx(styles.form)}
          onSubmit={(event) => {
            event.preventDefault();
            if (feedback.trim()) props.onAskForChanges(feedback.trim());
          }}
        >
          <label htmlFor={feedbackId} className={sx(styles.formLabel)}>
            What should change? The last AI stage runs again with your note.
          </label>
          <Textarea
            id={feedbackId}
            value={feedback}
            maxLength={MISSION_LIMITS.maxFeedbackChars}
            onChange={(event) => setFeedback(event.target.value)}
            rows={3}
            autoFocus
          />
          <div className={sx(styles.formActions)}>
            <Button type="submit" size="sm" disabled={props.busy || !feedback.trim()}>
              Send and run again
            </Button>
            <Button type="button" size="sm" variant="quiet" onClick={() => setAsking(false)}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <div className={sx(styles.actions)}>
          <Button size="sm" onClick={props.onSignOff} disabled={props.busy} loading={props.busy}>
            {describeSignOffAction(current.stage)}
          </Button>
          <Button size="sm" variant="outline" onClick={props.onReviewChanges}>
            Review changes
          </Button>
          {canAskForChanges ? (
            <Button size="sm" variant="quiet" onClick={() => setAsking(true)} disabled={props.busy}>
              Ask for changes
            </Button>
          ) : null}
        </div>
      )}
      {props.failure ? (
        <p className={sx(missionStyles.error, styles.indented)} role="alert">
          {props.failure}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The sign-off card for the scoped task's mission, in the composer's approval
 * slot. Renders nothing unless the current stage waits for the user.
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

/*
 * The same card the composer gives tool approvals — canvas fill, one hairline,
 * raised — so the two read as one kind of thing. The edge leans toward the
 * accent: a sign-off is a planned checkpoint, not a permission warning.
 */
const INDENT = `calc(24px + ${vars["--ads-space-8"]})`;

const styles = stylex.create({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    marginBottom: vars["--ads-space-12"],
    padding: "0.625rem",
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: `color-mix(in oklab, ${vars["--ads-color-accent"]} 40%, ${vars["--ads-color-border"]})`,
    borderRadius: vars["--ads-radius-panel"],
    backgroundColor: vars["--ads-color-canvas"],
    boxShadow: vars["--ads-elevation-raised"],
    color: vars["--ads-color-text"],
  },
  header: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-8"], minWidth: 0 },
  tile: { flex: "0 0 auto" },
  body: { display: "flex", flexDirection: "column", gap: vars["--ads-space-2"], flex: "1 1 auto", minWidth: 0 },
  // The position wraps under the question when the card is narrow.
  titleRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: vars["--ads-space-8"],
    rowGap: 0,
    minHeight: 24,
    minWidth: 0,
  },
  title: {
    flex: "1 1 auto",
    margin: 0,
    minWidth: 0,
    paddingTop: 2,
    fontSize: vars["--ads-font-size-body"],
    lineHeight: "1.25rem",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  position: {
    flex: "0 0 auto",
    marginInlineStart: "auto",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-subtle"],
    fontVariantNumeric: "tabular-nums",
  },
  positionWarn: { color: vars["--ads-color-warning-text"] },
  summary: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
  },
  report: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.375rem",
    paddingInlineStart: INDENT,
  },
  formActions: { display: "flex", alignItems: "center", gap: "0.375rem" },
  form: { display: "flex", flexDirection: "column", gap: vars["--ads-space-8"], paddingInlineStart: INDENT },
  formLabel: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  indented: { paddingInlineStart: INDENT },
});
