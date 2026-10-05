import { i18n, useTranslation } from "@/i18n";
import { useState } from "react";
import { AlarmClock, AlarmClockOff, Pause, Play } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import {
  describeWakeUpHistory,
  describeWakeUpStatus,
  describeWakeUpTrigger,
} from "@/lib/supervision/wake-up-view";
import { useTaskWakeUp, useWakeUpsStore, type TaskWakeUp } from "@/store/wake-ups-store";
import { useNow } from "./useAgentRun";
import { agentRunStyles as styles } from "./agent-runs.styles";

const STATUS_TONES = {
  active: styles.toneActive,
  waiting: styles.toneWaiting,
  attention: styles.toneAttention,
  ended: styles.toneIdle,
} as const;

/** The task's schedule: trigger, where it stands and why, with its controls. */
export function WakeUpSection(props: { workspaceId: string; taskId: string }) {
  useTranslation();
  const entry = useTaskWakeUp(props.workspaceId, props.taskId);
  const wakeUpId = entry?.wakeUp.id ?? "";
  const busy = useWakeUpsStore((state) => Boolean(state.pendingById[wakeUpId]));
  const failure = useWakeUpsStore((state) => state.failureById[wakeUpId] ?? null);
  const setPaused = useWakeUpsStore((state) => state.setPaused);
  const remove = useWakeUpsStore((state) => state.remove);
  const now = useNow(entry?.summary.state === "scheduled");
  if (!entry) return null;
  return (
    <WakeUpSectionView
      entry={entry}
      now={now}
      busy={busy}
      failure={failure}
      onSetPaused={(paused) => void setPaused(entry.wakeUp.id, paused)}
      onRemove={() => void remove(entry.wakeUp.id)}
    />
  );
}

export function WakeUpSectionView(props: {
  entry: TaskWakeUp;
  now: number;
  busy?: boolean;
  failure?: string | null;
  onSetPaused: (paused: boolean) => void;
  onRemove: () => void;
}) {
  useTranslation();
  const { wakeUp, summary } = props.entry;
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const status = describeWakeUpStatus(summary, props.now);
  const history = describeWakeUpHistory(summary);
  const Icon = summary.state === "scheduled" ? AlarmClock : AlarmClockOff;
  const busy = props.busy;
  return (
    <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:wakeUpSection.ariaLabel")} data-testid="wake-up-section">
      <div className={sx(styles.sectionHeader)}>
        <AlarmClock aria-hidden className={sx(styles.sectionIcon)} />
        <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:wakeUpSection.wakeUpSectionView")}</h3>
        <div className={sx(styles.actions)}>
          {confirmingRemove ? (
            <>
              <span className={sx(styles.notice)}>{i18n.t("agentRuns:wakeUpSection.wakeUpSectionView2")}</span>
              <Button size="xs" variant="danger" disabled={busy} onClick={props.onRemove}>
                {i18n.t("agentRuns:wakeUpSection.wakeUpSectionView3")}</Button>
              <Button size="xs" variant="quiet" onClick={() => setConfirmingRemove(false)}>
                {i18n.t("agentRuns:wakeUpSection.wakeUpSectionView4")}</Button>
            </>
          ) : (
            <>
              {summary.state === "scheduled" ? (
                <Button size="xs" variant="quiet" disabled={busy} onClick={() => props.onSetPaused(true)}>
                  <Pause aria-hidden />
                  {i18n.t("agentRuns:wakeUpSection.wakeUpSectionView5")}</Button>
              ) : null}
              {summary.state === "paused" ? (
                <Button size="xs" variant="secondary" disabled={busy} onClick={() => props.onSetPaused(false)}>
                  <Play aria-hidden />
                  {i18n.t("agentRuns:wakeUpSection.wakeUpSectionView6")}</Button>
              ) : null}
              <Button size="xs" variant="quiet" disabled={busy} onClick={() => setConfirmingRemove(true)}>
                {i18n.t("agentRuns:wakeUpSection.wakeUpSectionView7")}</Button>
            </>
          )}
        </div>
      </div>
      <div className={sx(styles.check)}>
        <span className={sx(styles.checkMark)}>
          <Icon aria-hidden className={sx(styles.icon, STATUS_TONES[status.tone])} />
        </span>
        <span className={sx(styles.checkText)}>
          <span className={sx(styles.decisionText)}>{describeWakeUpTrigger(wakeUp)}</span>
          <span className={sx(styles.decisionReason, styles.evidenceCommand)}>
            {status.text}
            {history ? ` · ${history}` : ""}
          </span>
        </span>
        <span />
      </div>
      {props.failure ? (
        <p className={sx(styles.error)} role="alert">
          {props.failure}
        </p>
      ) : null}
    </section>
  );
}
