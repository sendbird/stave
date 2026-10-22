import { i18n, useTranslation } from "@/i18n";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { useAsync } from "@/components/ads/utils/async";
import { sx } from "@/components/ads/utils/stylex";
import { SearchablePicker } from "@/components/layout/settings-searchable-picker";
import { listTaskTurnHistory } from "@/lib/db/turn-history.db";
import { useAppStore } from "@/store/app.store";
import { TurnActivity } from "./TurnActivity";
import { TurnApprovalRecord } from "./TurnApprovalRecord";
import { TurnRecordView } from "./TurnRecordView";
import { SideChatActivityButton } from "./side-chat/SideChatActivityButton";
import {
  buildTurnPickerOptions,
  collectTurnPrompts,
  resolveTurnHistoryView,
} from "./turn-record.utils";
import { turnActivityHistoryStyles as styles } from "./turn-activity-history.styles";

/**
 * Activity with its turn picker. The live turn and the last finished one keep
 * the full activity view; any earlier turn, and the newest turn after a
 * restart, opens its saved record. The choice lasts while the task stays
 * open; a new turn does not take the panel away from a turn being read.
 */
export function TurnActivityHistory(props: { workspaceId: string; taskId: string }) {
  useTranslation();
  const { workspaceId, taskId } = props;
  const labelId = useId();
  const liveTurnId = useAppStore((state) => state.activeTurnIdsByTask[taskId] ?? null);
  const retainedTurnId = useAppStore(
    (state) => state.retainedTurnActivityByTask[taskId]?.snapshot.turnId ?? null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const history = useAsync(
    () => listTaskTurnHistory({ workspaceId, taskId }),
    [workspaceId, taskId],
  );
  const { refresh } = history;
  // A turn starting or ending changes the list. Refresh in place, keeping the
  // current list on screen meanwhile.
  const settledRef = useRef(false);
  useEffect(() => {
    if (!settledRef.current) {
      settledRef.current = true;
      return;
    }
    refresh();
  }, [liveTurnId, retainedTurnId, refresh]);
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
    selected,
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
              <AdsButton variant="quiet" size="xs" onClick={refresh}>
                {i18n.t("common:actions.retry")}
              </AdsButton>
            </>
          ) : (
            <SearchablePicker
              labelledBy={labelId}
              value={shownTurnId ?? undefined}
              placeholder={i18n.t("session:turnHistory.placeholder")}
              options={options}
              onSelect={setSelected}
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
      <div className={sx(styles.body)}>
        {view.kind === "record" ? (
          <TurnRecordView
            key={view.turnId}
            workspaceId={workspaceId}
            taskId={taskId}
            turnId={view.turnId}
          />
        ) : (
          <TurnActivity host="panel" />
        )}
      </div>
      {/* Under the list: the approval record of the turn shown. */}
      <TurnApprovalRecord turnId={view.kind === "record" ? view.turnId : undefined} />
    </>
  );
}
