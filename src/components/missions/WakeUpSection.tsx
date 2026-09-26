import { useState } from "react";
import { AlarmClock, AlarmClockOff } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import {
  describeWakeUpHistory,
  describeWakeUpStatus,
  describeWakeUpTrigger,
} from "@/lib/supervision/wake-up-view";
import { useTaskWakeUp, useWakeUpsStore, type TaskWakeUp } from "@/store/wake-ups-store";
import { useNow } from "./useMission";
import { missionStyles as styles } from "./missions.styles";

const STATUS_TONES = {
  active: styles.toneActive,
  waiting: styles.toneWaiting,
  attention: styles.toneAttention,
  ended: styles.toneIdle,
} as const;

/** The task's wake-up: trigger, where it stands and why, with its controls. */
export function WakeUpSection(props: { workspaceId: string; taskId: string }) {
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
  const { wakeUp, summary } = props.entry;
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const status = describeWakeUpStatus(summary, props.now);
  const history = describeWakeUpHistory(summary);
  const Icon = summary.state === "scheduled" ? AlarmClock : AlarmClockOff;
  const busy = props.busy;
  return (
    <section className={sx(styles.section)} aria-label="Wake-up" data-testid="wake-up-section">
      <div className={sx(styles.panelHeader)}>
        <h3 className={sx(styles.panelTitle, styles.chipLabel)}>
          <Icon aria-hidden className={sx(styles.icon, STATUS_TONES[status.tone])} />
          Wake-up
        </h3>
        <div className={sx(styles.actions)}>
          {summary.state === "scheduled" ? (
            <ActionButton size="xs" weight="quiet" disabled={busy} onClick={() => props.onSetPaused(true)}>
              Pause
            </ActionButton>
          ) : null}
          {summary.state === "paused" ? (
            <ActionButton size="xs" disabled={busy} onClick={() => props.onSetPaused(false)}>
              Resume
            </ActionButton>
          ) : null}
          {confirmingRemove ? (
            <>
              <ActionButton size="xs" tone="danger" disabled={busy} onClick={props.onRemove}>
                Remove wake-up
              </ActionButton>
              <ActionButton size="xs" weight="quiet" onClick={() => setConfirmingRemove(false)}>
                Keep
              </ActionButton>
            </>
          ) : (
            <ActionButton size="xs" weight="quiet" disabled={busy} onClick={() => setConfirmingRemove(true)}>
              Remove
            </ActionButton>
          )}
        </div>
      </div>
      <dl className={sx(styles.facts)}>
        <dt className={sx(styles.factLabel)}>Trigger</dt>
        <dd className={sx(styles.factValue)}>{describeWakeUpTrigger(wakeUp)}</dd>
        <dt className={sx(styles.factLabel)}>Status</dt>
        <dd className={sx(styles.factValue)}>{status.text}</dd>
        {history ? (
          <>
            <dt className={sx(styles.factLabel)}>History</dt>
            <dd className={sx(styles.factValue)}>{history}</dd>
          </>
        ) : null}
      </dl>
      {props.failure ? (
        <p className={sx(styles.error)} role="alert">
          {props.failure}
        </p>
      ) : null}
    </section>
  );
}
