import { formatSystemEventDisplay } from "./system-event-display";
import { i18n, useTranslation } from "@/i18n";
import { useState } from "react";
import { LensToolPreview } from "@/components/panes/surfaces/lens/LensAutomationStatus";
import { Check, Copy } from "lucide-react";
import {
  CompactingIndicator,
  ConfirmationCompact,
  ContextCompactedCheckpoint,
  MessageAction,
  MessageResponse,
  SubagentCard,
  TodoCard,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  UserInputCard,
  type UserInputCardPresentation,
  parseSubagentToolInput,
  TruncationWarningBanner,
} from "@/components/ai-elements";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { ProviderErrorRecovery } from "@/components/session/ProviderErrorRecovery";
import {
  isSubagentToolPart,
  isTodoToolPart,
  formatInlineSystemEventContent,
  shouldRenderInlineSystemEvent,
} from "@/components/session/chat-panel.utils";
import { copyTextToClipboard } from "@/lib/clipboard";
import { sx } from "@/components/ads/utils/stylex";
import type { ProviderId } from "@/lib/providers/provider.types";
import { detectTruncationNotice } from "@/lib/truncation-visibility";
import { useAppStore } from "@/store/app.store";
import type { MessagePart } from "@/types/chat";
import { TaskContextChip } from "@/components/task-context-chip";
import { openAttachedTask } from "@/components/open-attached-task";
import { WorkspaceInformationReferenceChip } from "@/components/workspace-information-reference-chip";
import { chatPanelMessagePartsStyles } from "./chat-panel-message-parts.styles";
import {
  ChangedFilesBlock,
  FileChangeToolBlock,
  ReferencedFilesBlock,
  ImageAttachmentBlock,
} from "./chat-panel-file-blocks";

export { toToolDisplayName } from "@/lib/tool-display-name";
export { toProviderWaveToneClass } from "@/components/ai-elements/provider-wave-tone.styles";

export function toProviderStartCase(args: { providerId: ProviderId }) {
  return args.providerId
    .split("-")
    .map((chunk) => `${chunk.slice(0, 1).toUpperCase()}${chunk.slice(1)}`)
    .join(" ");
}

export function CopyButton({ text }: { text: string }) {
  useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <MessageAction
      label={i18n.t("session:chatPanelMessageParts.label")}
      tooltip={i18n.t("session:chatPanelMessageParts.tooltip")}
      onClick={() => {
        void copyTextToClipboard(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
    >
      {copied ? (
        <Check className={sx(chatPanelMessagePartsStyles.copyIconActive)} />
      ) : (
        <Copy className={sx(chatPanelMessagePartsStyles.copyIcon)} />
      )}
    </MessageAction>
  );
}

export function MessagePartRenderer(args: {
  part: MessagePart;
  taskId: string;
  messageId: string;
  terminalStopReason?: string;
  isStreaming?: boolean;
  isLastTextPart?: boolean;
  userInputPresentation?: UserInputCardPresentation;
  systemEventPresentation?: "full" | "detail";
}) {
  useTranslation();
  const {
    part,
    taskId,
    messageId,
    terminalStopReason,
    isStreaming,
    isLastTextPart,
    userInputPresentation,
    systemEventPresentation = "full",
  } = args;
  const resolveApproval = useAppStore((state) => state.resolveApproval);
  const resolveUserInput = useAppStore((state) => state.resolveUserInput);
  const rollbackToCompactBoundary = useAppStore(
    (state) => state.rollbackToCompactBoundary,
  );
  const [isRestoringCompactBoundary, setIsRestoringCompactBoundary] =
    useState(false);

  switch (part.type) {
    case "tool_use":
      if (isSubagentToolPart({ toolName: part.toolName })) {
        return (
          <SubagentCard
            defaultOpen={false}
            input={part.input}
            output={part.output}
            state={part.state}
            progressMessages={part.progressMessages}
          />
        );
      }
      if (isTodoToolPart({ toolName: part.toolName })) {
        return (
          <TodoCard
            defaultOpen={true}
            input={part.input}
            output={part.output}
            state={part.state}
          />
        );
      }
      if (part.toolName.trim().toLowerCase() === "file_change") {
        return <FileChangeToolBlock input={part.input} />;
      }
      return (
        <Tool defaultOpen={false}>
          <ToolHeader
            type={part.toolName}
            state={part.state}
            elapsedSeconds={part.elapsedSeconds}
          />
          <ToolContent>
            <LensToolPreview toolName={part.toolName} input={part.input} />
            <ToolInput input={part.input} />
            {(part.state !== "input-streaming" || part.output?.trim()) && (
              <ToolOutput
                label={
                  part.state === "input-streaming" ? i18n.t("session:chatPanelMessageParts.label2") : undefined
                }
                outputText={part.output}
                errorText={
                  part.state === "output-error"
                    ? (part.output ?? i18n.t("session:chatPanelMessageParts.errorText"))
                    : undefined
                }
                linkifyOutputText={part.state !== "input-streaming"}
              />
            )}
          </ToolContent>
        </Tool>
      );
    case "code_diff":
      return (
        <ChangedFilesBlock
          parts={[part]}
          taskId={taskId}
          messageId={messageId}
          startIndex={0}
        />
      );
    case "file_context":
      return <ReferencedFilesBlock parts={[part]} />;
    case "image_context":
      return <ImageAttachmentBlock parts={[part]} />;
    case "workspace_information_context":
      return <WorkspaceInformationReferenceChip reference={part.reference} />;
    case "task_context":
      return (
        <TaskContextChip
          title={part.title}
          scope={part.scope}
          findingCount={part.findingIds?.length}
          onOpen={() => void openAttachedTask({ taskId: part.taskId, workspaceId: part.workspaceId })}
        />
      );
    case "approval":
      return (
        <ConfirmationCompact
          toolName={part.toolName}
          description={part.description}
          state={part.state}
          onApprove={() =>
            resolveApproval({ taskId, messageId, approved: true })
          }
          onApproveAlways={
            part.supportsAllowAlways
              ? () =>
                  resolveApproval({
                    taskId,
                    messageId,
                    approved: true,
                    scope: "always",
                  })
              : undefined
          }
          onReject={() =>
            resolveApproval({ taskId, messageId, approved: false })
          }
        />
      );
    case "user_input":
      return (
        <UserInputCard
          toolName={part.toolName}
          questions={part.questions}
          answers={part.answers}
          state={part.state}
          presentation={userInputPresentation}
          onSubmit={(answers) =>
            resolveUserInput({ taskId, messageId, requestId: part.requestId, answers })
          }
          onDeny={() => resolveUserInput({ taskId, messageId, requestId: part.requestId, denied: true })}
        />
      );
    case "system_event": {
      if (!shouldRenderInlineSystemEvent({ content: part.content })) {
        return null;
      }
      if (part.content.trimStart().toLowerCase().startsWith("[error]")) {
        return (
          <ProviderErrorRecovery
            content={part.content}
            taskId={taskId}
            messageId={messageId}
            terminalStopReason={terminalStopReason}
            hideMessage={systemEventPresentation === "detail"}
          />
        );
      }
      const normalized = part.content.trim().toLowerCase();
      // "Compacting conversation context…" — in-progress spinner
      // i18n-ignore: canonical provider or lifecycle text used for parsing
      if (normalized.startsWith("compacting conversation context")) {
        return <CompactingIndicator />;
      }
      // "Context compacted (auto)." / "Context compacted (manual)." — checkpoint divider
      const compactedMatch = part.content
        .trim()
        .match(/^Context compacted\s*\(([^)]+)\)\./i);
      const compactBoundaryTrigger =
        part.compactBoundary?.trigger ?? compactedMatch?.[1];
      const compactBoundaryGitRef = part.compactBoundary?.gitRef;
      const isTurnStartCheckpoint = compactBoundaryTrigger === "turn_start";
      const handleRestoreCompactBoundary = () => {
        if (!compactBoundaryGitRef || isRestoringCompactBoundary) {
          return;
        }
        setIsRestoringCompactBoundary(true);
        void rollbackToCompactBoundary({
          taskId,
          gitRef: compactBoundaryGitRef,
          ...(compactBoundaryTrigger
            ? { trigger: compactBoundaryTrigger }
            : {}),
        }).finally(() => {
          setIsRestoringCompactBoundary(false);
        });
      };
      if (part.compactBoundary != null || compactedMatch) {
        return (
          <ContextCompactedCheckpoint
            label={isTurnStartCheckpoint ? i18n.t("session:chatPanelMessageParts.label3") : undefined}
            trigger={isTurnStartCheckpoint ? undefined : compactBoundaryTrigger}
            onRestore={handleRestoreCompactBoundary}
            restorePending={isRestoringCompactBoundary}
            restoreDisabled={!compactBoundaryGitRef}
          />
        );
      }
      // Fallback: generic "Context compacted" without trigger info
      // i18n-ignore: canonical provider or lifecycle text used for parsing
      if (normalized.startsWith("context compacted")) {
        return (
          <ContextCompactedCheckpoint
            trigger={compactBoundaryTrigger}
            onRestore={handleRestoreCompactBoundary}
            restorePending={isRestoringCompactBoundary}
            restoreDisabled={!compactBoundaryGitRef}
          />
        );
      }
      const truncationNotice = detectTruncationNotice({
        text: part.content,
        source: "system",
      });
      if (truncationNotice) {
        return <TruncationWarningBanner notice={truncationNotice} />;
      }
      const displayContent = formatInlineSystemEventContent({
        content: part.content,
      });
      return (
        <LinkifiedText
          as="p"
          text={formatSystemEventDisplay(displayContent)}
          className={sx(chatPanelMessagePartsStyles.systemEventText)}
        />
      );
    }
    case "text":
      if (!part.text?.trim()) return null;
      return (
        <MessageResponse isStreaming={isStreaming && isLastTextPart}>
          {part.text}
        </MessageResponse>
      );
    case "thinking":
      return null;
  }
}
