import { i18n, useTranslation } from "@/i18n";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ads/components/Button";
import { Dialog } from "@/components/ads/components/Dialog";
import { sx } from "@/components/ads/utils/stylex";
import {
  Message,
  MessageContent,
  TurnModelChip,
} from "@/components/ai-elements";
import {
  AgentRunInstructions,
  useAgentRunPrompt,
} from "@/components/agent-runs/AgentRunPrompt";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import { getTurnModelInfoParts } from "@/lib/providers/turn-model-info";
import {
  loadRunTurnMessages,
  selectRunTurnMessages,
} from "@/lib/reviews/run-turn";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { AssistantMessageBody } from "./message/assistant-trace";
import { runTurnDialogStyles as styles } from "./run-turn-dialog.styles";

const EMPTY_MESSAGES: ChatMessage[] = [];

type RunTurnState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "failed"; message: string }
  | { status: "ready"; messages: ChatMessage[] };

type LoadedRunTurn = { key: string } & (
  | { status: "loading" }
  | { status: "ready"; messages: ChatMessage[] | null }
  | { status: "failed"; message: string }
);

/**
 * One run's messages: from the open conversation when it still holds the
 * whole run, otherwise read from saved history with the conversation's own
 * paged loader. Nothing here writes to the conversation's message window.
 */
export function useRunTurnMessages(args: {
  workspaceId: string;
  taskId: string;
  turnId: string;
}): RunTurnState & { retry: () => void } {
  const { workspaceId, taskId, turnId } = args;
  const resident = useAppStore((state) =>
    state.activeWorkspaceId === workspaceId
      ? (state.messagesByTask[taskId] ?? EMPTY_MESSAGES)
      : EMPTY_MESSAGES,
  );
  const residentTotal = useAppStore((state) =>
    state.activeWorkspaceId === workspaceId
      ? state.messageCountByTask[taskId]
      : undefined,
  );
  const residentSelection = useMemo(
    () =>
      selectRunTurnMessages({
        messages: resident,
        turnId,
        // An unknown count is not proof that no older rows exist.
        startsAtBeginning:
          residentTotal !== undefined && resident.length >= residentTotal,
      }),
    [resident, residentTotal, turnId],
  );
  const needsLoad = residentSelection.status !== "complete";
  const key = JSON.stringify([workspaceId, taskId, turnId]);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadedRunTurn | null>(null);
  useEffect(() => {
    if (!needsLoad) return;
    let cancelled = false;
    setLoaded({ key, status: "loading" });
    loadRunTurnMessages({
      turnId,
      loadPage: ({ limit, offset }) =>
        loadTaskMessagesPage({ workspaceId, taskId, limit, offset }),
    }).then(
      (messages) => {
        if (!cancelled) setLoaded({ key, status: "ready", messages });
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoaded({
          key,
          status: "failed",
          message:
            error instanceof Error && error.message
              ? error.message
              : i18n.t("session:runTurnDialog.message"),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, key, needsLoad, taskId, turnId, workspaceId]);
  const retry = () => setAttempt((count) => count + 1);
  if (residentSelection.status === "complete") {
    return { status: "ready", messages: residentSelection.messages, retry };
  }
  if (!loaded || loaded.key !== key || loaded.status === "loading") {
    return { status: "loading", retry };
  }
  if (loaded.status === "failed") return { ...loaded, retry };
  return loaded.messages
    ? { status: "ready", messages: loaded.messages, retry }
    : { status: "missing", retry };
}

/**
 * One row of the read-only transcript, built from the conversation's own
 * pieces: the agent-run prompt fold and the message body with
 * its tool calls, turn events and changed files. No row actions — the run is
 * history here, not a place to rewind or branch from.
 */
const RunTurnMessageRow = memo(function RunTurnMessageRow(props: {
  message: ChatMessage;
  taskId: string;
  /** On the prompt: the run it started, for the agent-run fold. */
  startedTurnId?: string;
  showInterimMessages: boolean;
}) {
  useTranslation();
  const { message, taskId } = props;
  const text = message.displayContent ?? message.content;
  const agentRunPrompt = useAgentRunPrompt({
    taskId,
    turnId: message.role === "user" ? props.startedTurnId : undefined,
    text,
  });
  const bodyMessage = useMemo(
    () =>
      agentRunPrompt?.assignment
        ? {
            ...message,
            content: agentRunPrompt.assignment,
            displayContent: agentRunPrompt.assignment,
            parts: [{ type: "text" as const, text: agentRunPrompt.assignment }],
            displayParts: undefined,
          }
        : message,
    [agentRunPrompt?.assignment, message],
  );
  const assistant = message.role === "assistant";
  return (
    <li className={sx(styles.row)} data-message-id={message.id}>
      <Message from={message.role}>
        <div className={sx(assistant ? styles.assistant : styles.user)}>
          <MessageContent>
            {!(agentRunPrompt && !agentRunPrompt.assignment) ? (
              <AssistantMessageBody
                message={bodyMessage}
                taskId={taskId}
                messageId={message.id}
                streamingEnabled={false}
                traceExpansionMode="manual"
                showInterimMessages={props.showInterimMessages}
                readOnly
              />
            ) : null}
            {agentRunPrompt ? (
              <AgentRunInstructions text={agentRunPrompt.instructions} />
            ) : null}
          </MessageContent>
          {assistant && message.providerId !== "user" && message.model ? (
            <TurnModelChip
              providerId={message.providerId}
              model={message.model}
              parts={getTurnModelInfoParts(message)}
            />
          ) : null}
        </div>
      </Message>
    </li>
  );
});

/** The run's turn, rendered with the conversation's components, read-only. */
export function RunTurnTranscript(props: {
  messages: readonly ChatMessage[];
  taskId: string;
  turnId: string;
}) {
  useTranslation();
  const showInterimMessages = useAppStore(
    (state) => state.settings.showInterimMessages,
  );
  return (
    <ol aria-label={i18n.t("session:runTurnDialog.ariaLabel")} className={sx(styles.transcript)}>
      {props.messages.map((message, index) => (
        <RunTurnMessageRow
          key={message.id}
          message={message}
          taskId={props.taskId}
          startedTurnId={
            index === 0 && message.role === "user" ? props.turnId : undefined
          }
          showInterimMessages={showInterimMessages}
        />
      ))}
    </ol>
  );
}

function RunTurnBody(props: {
  workspaceId: string;
  taskId: string;
  turnId: string;
}) {
  useTranslation();
  const state = useRunTurnMessages(props);
  if (state.status === "loading") {
    return (
      <p role="status" className={sx(styles.note)}>
        {i18n.t("session:runTurnDialog.runTurnBody")}</p>
    );
  }
  if (state.status === "failed") {
    return (
      <div className={sx(styles.alert)}>
        <p role="alert" className={sx(styles.error)}>
          {state.message}
        </p>
        <Button size="xs" variant="secondary" onClick={state.retry}>
          {i18n.t("session:runTurnDialog.runTurnBody2")}</Button>
      </div>
    );
  }
  if (state.status === "missing") {
    return (
      <p className={sx(styles.note)}>
        {i18n.t("session:runTurnDialog.runTurnBody3")}</p>
    );
  }
  return (
    <RunTurnTranscript
      messages={state.messages}
      taskId={props.taskId}
      turnId={props.turnId}
    />
  );
}

/**
 * "Show the turn": the run as the conversation showed it — the prompt, the
 * agent's messages, tool calls and turn events — in a dialog sized for
 * reading. The body mounts only while the dialog is open, so a closed dialog
 * never reads history.
 */
export function RunTurnDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  taskId: string;
  turnId: string;
  description?: ReactNode;
}) {
  useTranslation();
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={i18n.t("session:runTurnDialog.title")}
      description={props.description}
      width="xl"
      xstyle={styles.popup}
    >
      <RunTurnBody
        workspaceId={props.workspaceId}
        taskId={props.taskId}
        turnId={props.turnId}
      />
    </Dialog>
  );
}
