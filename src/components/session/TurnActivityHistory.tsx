import { i18n, useTranslation } from "@/i18n";
import { useEffect, useId, useMemo, useRef } from "react";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { useAsync } from "@/components/aui/utils/async";
import { sx } from "@/components/aui/utils/stylex";
import { SearchablePicker } from "@/components/layout/settings-searchable-picker";
import { listTaskTurnHistory } from "@/lib/db/turn-history.db";
import { useAppStore } from "@/store/app.store";
import { TurnActivity } from "./TurnActivity";
import { TurnRecordView } from "./TurnRecordView";
import { SideChatActivityButton } from "./side-chat/SideChatActivityButton";
import {
  buildTurnPickerOptions,
  collectTurnPrompts,
  resolveTurnHistoryView,
} from "./turn-record.utils";
import { turnActivityHistoryStyles as styles } from "./turn-activity-history.styles";

/**
 * The task's saved turns, newest first, read once per task and again in place
 * whenever a turn starts or ends. The Task panel reads it for the state of the
 * turn it follows and hands it to the turn picker below.
 */
export function useTaskTurnHistory(workspaceId: string, taskId: string) {
  const liveTurnId = useAppStore((state) => state.activeTurnIdsByTask[taskId] ?? null);
  const retainedTurnId = useAppStore(
    (state) => state.retainedTurnActivityByTask[taskId]?.snapshot.turnId ?? null,
  );
  const history = useAsync(
    () => listTaskTurnHistory({ workspaceId, taskId }),
    [workspaceId, taskId],
  );
  const { refresh } = history;
  // Keep the current list on screen while the refresh runs.
  const settledRef = useRef(false);
  useEffect(() => {
    if (!settledRef.current) {
      settledRef.current = true;
      return;
    }
    refresh();
  }, [liveTurnId, retainedTurnId, refresh]);
  return history;
}

export type TaskTurnHistory = ReturnType<typeof useTaskTurnHistory>;

/**
 * The turn picker and the chosen turn: the live turn and the last finished
 * one keep the full activity view; any earlier turn, and the newest turn after
 * a restart, opens its saved record. The panel owns the choice, so its state
 * line follows the turn picked here; a new turn does not take the panel away
 * from a turn being read.
 */
export function TurnActivityHistory(props: {
  workspaceId: string;
  taskId: string;
  history: TaskTurnHistory;
  selected: string | null;
  onSelect: (turnId: string | null) => void;
}) {
  useTranslation();
  const { workspaceId, taskId, history } = props;
  const labelId = useId();
  const liveTurnId = useAppStore((state) => state.activeTurnIdsByTask[taskId] ?? null);
  const retainedTurnId = useAppStore(
    (state) => state.retainedTurnActivityByTask[taskId]?.snapshot.turnId ?? null,
  );
  const page = history.state.status === "ready" ? history.state.data : null;
  // Requests are read when the list arrives rather than on every streamed
  // message: the list refreshes whenever a turn starts or ends.
  const prompts = useMemo(
    () => (page ? collectTurnPrompts(useAppStore.getState().messagesByTask[taskId] ?? []) : {}),
    [page, taskId],
  );
  const options = useMemo(
    () => buildTurnPickerOptions({ turns: page?.turns ?? [], liveTurnId, prompts }),
    // Option labels are translated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, liveTurnId, prompts, i18n.language],
  );
  const { view, shownTurnId } = resolveTurnHistoryView({
    selected: props.selected,
    liveTurnId,
    retainedTurnId,
    latestTurnId: page?.turns[0]?.id ?? null,
  });
  const failed = history.state.status === "error";
  const showBar = failed || options.length > 0;
  return (
    <>
      {showBar ? (
        <div className={sx(styles.bar)} data-testid="turn-history-bar">
          <span id={labelId} className={sx(styles.label)}>
            {i18n.t("session:turnHistory.label")}
          </span>
          {failed ? (
            <>
              <p role="alert" className={sx(styles.notice)}>
                {i18n.t("session:turnHistory.readFailed")}
              </p>
              <AuiButton variant="quiet" size="xs" onClick={history.refresh}>
                {i18n.t("common:actions.retry")}
              </AuiButton>
            </>
          ) : (
            <SearchablePicker
              labelledBy={labelId}
              value={shownTurnId ?? undefined}
              placeholder={i18n.t("session:turnHistory.placeholder")}
              options={options}
              onSelect={props.onSelect}
              searchPlaceholder={i18n.t("session:turnHistory.searchPlaceholder")}
              emptyText={i18n.t("session:turnHistory.empty")}
              loading={history.state.status === "pending"}
              loadingText={i18n.t("session:turnHistory.loading")}
              triggerXstyle={styles.picker}
            />
          )}
          <SideChatActivityButton taskId={taskId} />
        </div>
      ) : null}
      {view.kind === "record" ? (
        <TurnRecordView key={view.turnId} workspaceId={workspaceId} taskId={taskId} turnId={view.turnId} />
      ) : (
        <TurnActivity host="panel" />
      )}
    </>
  );
}
