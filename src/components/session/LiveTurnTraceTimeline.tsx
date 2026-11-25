import { useCallback, useMemo } from "react";
import { i18n, useTranslation } from "@/i18n";
import { sx } from "@/components/aui/utils/stylex";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { useTurnClock } from "./TurnActivity";
import { buildTurnTrace, advanceTurnTrace } from "./turn-trace.utils";
import { turnTraceTimelineStyles as styles } from "./turn-trace-timeline.styles";
import { TurnTraceTimeline } from "./TurnTraceTimeline";

const NO_MESSAGES: ChatMessage[] = [];

/**
 * The live or last-finished turn's timeline, read from the store. Mounted only
 * while the Timeline view is open: it follows the conversation as it streams,
 * which the list view does not pay for.
 */
export function LiveTurnTraceTimeline(props: { taskId: string }) {
  useTranslation();
  const { taskId } = props;
  const liveTurnId = useAppStore((state) => state.activeTurnIdsByTask[taskId] ?? null);
  const activity = useAppStore((state) => state.providerTurnActivityByTask[taskId] ?? null);
  const retained = useAppStore((state) => state.retainedTurnActivityByTask[taskId] ?? null);
  const messages = useAppStore((state) => state.messagesByTask[taskId] ?? NO_MESSAGES);
  const focusTranscriptTool = useAppStore((state) => state.focusTranscriptTool);
  const now = useTurnClock(liveTurnId);
  const snapshot =
    liveTurnId && activity?.turnId === liveTurnId ? activity : (retained?.snapshot ?? null);
  const live = Boolean(snapshot && snapshot.turnId === liveTurnId && snapshot.completedAt == null);
  const turnId = snapshot?.turnId;
  const startedAt = snapshot?.startedAt;
  const completedAt = snapshot?.completedAt ?? null;
  const failed = !live && retained?.snapshot.turnId === turnId && retained?.outcome === "failed";
  const baseTrace = useMemo(
    () =>
      turnId && startedAt !== undefined
        ? buildTurnTrace({
            messages: messages.filter((message) => message.turnId === turnId),
            turnStartedAt: startedAt,
            turnCompletedAt: completedAt,
            live,
            now: startedAt,
            failed,
          })
        : null,
    // Span names are translated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, messages, turnId, startedAt, completedAt, failed, i18n.language],
  );
  const trace = useMemo(() => baseTrace ? advanceTurnTrace(baseTrace, now) : null, [baseTrace, now]);
  const onSelectTool = useCallback(
    (toolUseId: string) => focusTranscriptTool({ taskId, toolUseId }),
    [focusTranscriptTool, taskId],
  );
  if (!trace) {
    return <p className={sx(styles.empty)}>{i18n.t("session:turnTrace.noTurn")}</p>;
  }
  return <TurnTraceTimeline trace={trace} onSelectTool={onSelectTool} />;
}
