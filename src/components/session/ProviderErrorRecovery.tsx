import { useRef, useState } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, Loader } from "@/components/ui";
import {
  buildProviderFailureContinuationPrompt,
  isProviderFailureRecoveryEligible,
  isProviderFailureRecoveryScopeCurrent,
  parseProviderErrorNotice,
} from "@/lib/providers/provider-error-recovery";
import { useAppStore } from "@/store/app.store";
import { sx } from "@/components/ads/utils/stylex";
import { providerErrorRecoveryStyles as styles } from "./provider-error-recovery.styles";

export function ProviderErrorRecovery(props: {
  content: string;
  taskId: string;
  messageId: string;
  terminalStopReason?: string;
  hideMessage?: boolean;
}) {
  const notice = parseProviderErrorNotice(props.content);
  const workspaceId = useAppStore((state) =>
    state.taskWorkspaceIdById[props.taskId] ?? state.activeWorkspaceId,
  );
  const isCurrentScope = useAppStore(
    (state) =>
      workspaceId != null &&
      state.activeWorkspaceId === workspaceId &&
      state.activeTaskId === props.taskId,
  );
  const turnActive = useAppStore(
    (state) => state.activeTurnIdsByTask[props.taskId] != null,
  );
  const isLatestMessage = useAppStore((state) => {
    const messages = state.messagesByTask[props.taskId] ?? [];
    return messages.at(-1)?.id === props.messageId;
  });
  const [resumePending, setResumePending] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const resumePendingRef = useRef(false);

  if (!notice) {
    return null;
  }

  const recoveryEligible = isProviderFailureRecoveryEligible({
    notice,
    terminalStopReason: props.terminalStopReason,
  });

  const canResume =
    recoveryEligible &&
    isCurrentScope &&
    isLatestMessage &&
    !turnActive &&
    !resumePending;
  const handleResume = () => {
    if (!canResume || resumePendingRef.current || !workspaceId) {
      return;
    }
    const state = useAppStore.getState();
    const currentWorkspaceId =
      state.taskWorkspaceIdById[props.taskId] ?? state.activeWorkspaceId;
    const latestMessage = state.messagesByTask[props.taskId]?.at(-1);
    if (
      !isProviderFailureRecoveryScopeCurrent({
        capturedWorkspaceId: workspaceId,
        currentWorkspaceId,
        activeWorkspaceId: state.activeWorkspaceId,
        scopedTaskId: props.taskId,
        activeTaskId: state.activeTaskId,
        messageId: props.messageId,
        latestMessageId: latestMessage?.id,
        activeTurnId: state.activeTurnIdsByTask[props.taskId],
      })
    ) {
      setResumeError(
        "Return to this task after its current activity settles, then resume work.",
      );
      return;
    }
    resumePendingRef.current = true;
    setResumePending(true);
    setResumeError(null);
    void state.sendUserMessage({
      taskId: props.taskId,
      content: buildProviderFailureContinuationPrompt(),
      preservePromptDraft: true,
      turnOrigin: "conversation",
    })
      .then((result) => {
        if (result.status === "blocked") {
          setResumeError(
            "Resolve the active approval or input request, then resume work.",
          );
        } else if (result.status === "send-failed") {
          setResumeError(result.message);
        }
      })
      .catch((error: unknown) => {
        setResumeError(
          error instanceof Error
            ? error.message
            : "Unable to start the continuation turn.",
        );
      })
      .finally(() => {
        resumePendingRef.current = false;
        setResumePending(false);
      });
  };

  return (
    <div
      className={sx(styles.root)}
      data-provider-error={notice.capacityFailure ? "capacity" : "terminal"}
    >
      {!props.hideMessage ? (
        <div className={sx(styles.messageRow)}>
          <TriangleAlert className={sx(styles.messageIcon)} aria-hidden="true" />
          <p className={sx(styles.message)}>{notice.message}</p>
        </div>
      ) : null}
      {notice.guidance ? (
        <p className={sx(styles.guidance)}>{notice.guidance}</p>
      ) : null}
      {recoveryEligible && isLatestMessage ? (
        <div className={sx(styles.resume)}>
          <p className={sx(styles.help)}>
            Resume starts a new turn with your current model selection. The
            continuation asks the agent to check the workspace first and
            continue only unfinished work.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canResume}
            aria-busy={resumePending || undefined}
            onClick={handleResume}
          >
            {resumePending ? (
              <Loader aria-hidden size="xs" variant="persist" />
            ) : (
              <RotateCcw aria-hidden="true" />
            )}
            Resume work
          </Button>
          {resumeError ? (
            <p role="alert" className={sx(styles.error)}>
              {resumeError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
