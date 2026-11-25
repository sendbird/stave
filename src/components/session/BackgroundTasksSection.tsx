import * as stylex from "@stylexjs/stylex";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNow } from "@/components/agent-runs/useAgentRun";
import { Button } from "@/components/aui/components/Button";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { formatDateTime, formatElapsed } from "@/i18n/format";
import {
  canStopBackgroundTask,
  type BackgroundLogTail,
  type BackgroundTaskEvent,
  type BackgroundTaskRequest,
} from "@/lib/providers/background-tasks";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { useAppStore } from "@/store/app.store";

const EMPTY: readonly BackgroundTaskEvent[] = [];

export function BackgroundTasksSection({ workspaceId, taskId }: { workspaceId: string; taskId: string }) {
  const { liveTurnId, turnId, rows } = useTaskBackground(taskId);
  return <BackgroundTaskList workspaceId={workspaceId} taskId={taskId} liveTurnId={liveTurnId} turnId={turnId} rows={rows} />;
}

export function useTaskBackground(taskId: string) {
  const liveTurnId = useAppStore((state) => state.activeTurnIdsByTask[taskId]);
  const turnId = useAppStore((state) => state.activeTurnIdsByTask[taskId] ?? state.retainedTurnActivityByTask[taskId]?.snapshot.turnId);
  const rows = useAppStore((state) => {
    const activeTurnId = state.activeTurnIdsByTask[taskId];
    if (!activeTurnId) return state.retainedTurnActivityByTask[taskId]?.snapshot.backgroundTasks ?? EMPTY;
    const snapshot = state.providerTurnActivityByTask[taskId];
    return snapshot?.turnId === activeTurnId ? snapshot.backgroundTasks ?? EMPTY : EMPTY;
  });
  return { liveTurnId, turnId, rows };
}

export function BackgroundTaskList({ workspaceId, taskId, liveTurnId, turnId, rows, readOnly }: {
  workspaceId: string; taskId: string; liveTurnId?: string | null; turnId?: string | null;
  rows: readonly BackgroundTaskEvent[]; readOnly?: boolean;
}) {
  const { t } = useTranslation("session");
  const now = useNow(Boolean(liveTurnId && rows.some((row) => row.endedAt === undefined)), 1000);

  if (!turnId || rows.length === 0) {
    return <p className={sx(styles.note)}>{t("backgroundTasks.empty")}</p>;
  }

  return (
    <ul className={sx(styles.list)}>
      {rows.toReversed().map((row) => (
        <BackgroundTaskRow key={row.id} row={row} live={liveTurnId === turnId}
          workspaceId={workspaceId} taskId={taskId} turnId={turnId} now={now} readOnly={readOnly} />
      ))}
    </ul>
  );
}

function BackgroundTaskRow({ row, live, workspaceId, taskId, turnId, now, readOnly }: {
  row: BackgroundTaskEvent;
  live: boolean;
  workspaceId: string;
  taskId: string;
  turnId: string;
  now: number;
  readOnly?: boolean;
}) {
  const { t } = useTranslation("session");
  const request = window.api?.provider?.backgroundTask;
  const [tailOpen, setTailOpen] = useState(false);
  const [lastOutput, setLastOutput] = useState<BackgroundLogTail>();
  const [stopState, setStopState] = useState<"idle" | "pending" | "failed">("idle");
  const { id } = row;
  const follow = live && row.hasOutput && row.endedAt === undefined && tailOpen;

  useEffect(() => {
    if (!follow || !request) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      if (document.visibilityState === "visible") {
        const result = await request({ operation: "read", workspaceId, taskId, turnId, id }).catch(() => null);
        if (!disposed && result?.ok && result.output) {
          const output = result.output;
          setLastOutput((previous) => previous?.text === output.text && previous.truncated === output.truncated ? previous : output);
        }
      }
      if (!disposed) timer = setTimeout(() => { void read(); }, 1000);
    };
    void read();
    return () => { disposed = true; clearTimeout(timer); };
  }, [follow, request, id, workspaceId, taskId, turnId]);

  async function stop() {
    if (!request || !canStopBackgroundTask(row, live) || stopState === "pending") return;
    setStopState("pending");
    const input: BackgroundTaskRequest = { operation: "stop", workspaceId, taskId, turnId, id };
    const outcome = await request(input).catch(() => null);
    if (!outcome?.ok) setStopState("failed");
  }

  const output = row.finalOutput ?? lastOutput;
  const logRef = useRef<HTMLPreElement>(null);
  const followEnd = useRef(true);
  useLayoutEffect(() => {
    const log = logRef.current;
    if (tailOpen && followEnd.current && log) log.scrollTop = log.scrollHeight;
  }, [output, tailOpen]);

  return (
    <li className={sx(styles.row)} data-testid="background-task-row">
      <p className={sx(styles.description)}>{row.description || t("backgroundTasks.untitled")}</p>
      <p className={sx(styles.note)}>
        {t("backgroundTasks.statusLine", {
          provider: getProviderLabel({ providerId: row.providerId }),
          status: t(`backgroundTasks.status.${row.status}`),
          confidence: t(`backgroundTasks.confidence.${row.confidence}`),
        })}
      </p>
      <p className={sx(styles.note)}>
        {t("backgroundTasks.timing", {
          time: formatDateTime(row.startedAt),
          elapsed: formatElapsed(row.startedAt, row.endedAt ?? now),
        })}
      </p>
      {!readOnly && request && canStopBackgroundTask(row, live) ? (
        <div>
          <Button size="xs" variant="quiet" tone="danger" disabled={stopState === "pending"} onClick={() => { void stop(); }}>
            {t(stopState === "pending" ? "backgroundTasks.stopping" : "backgroundTasks.stop")}
          </Button>
          {stopState === "failed" ? <p role="alert" className={sx(styles.note)}>{t("backgroundTasks.stopFailed")}</p> : null}
        </div>
      ) : null}
      {output || (live && row.hasOutput && row.endedAt === undefined) ? (
        <details onToggle={(event) => setTailOpen(event.currentTarget.open)}>
          <summary className={sx(styles.summary, focusRing.ring)}>{t("backgroundTasks.log")}</summary>
          {output?.text ? (
            <>
              {output.truncated ? <p className={sx(styles.note)}>{t("backgroundTasks.truncated")}</p> : null}
              <pre
                ref={logRef}
                tabIndex={0}
                aria-label={t("backgroundTasks.log")}
                className={sx(styles.log, focusRing.ring)}
                onScroll={({ currentTarget: log }) => {
                  followEnd.current = log.scrollHeight - log.clientHeight - log.scrollTop <= 1;
                }}
              >{output.text}</pre>
            </>
          ) : <p className={sx(styles.note)}>{t("backgroundTasks.noOutput")}</p>}
        </details>
      ) : null}
    </li>
  );
}

const styles = stylex.create({
  list: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], margin: 0, padding: 0, listStyle: "none" },
  row: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0 },
  description: {
    margin: 0,
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflowWrap: "anywhere",
  },
  note: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], overflowWrap: "anywhere" },
  summary: { cursor: "pointer", color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-caption"] },
  log: {
    margin: 0,
    padding: vars["--aui-space-8"],
    maxBlockSize: "12em",
    overflow: "auto",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text"],
    backgroundColor: vars["--aui-color-surface-raised"],
  },
});
