import { formatSystemEventDisplay } from "./system-event-display";
import { i18n, useTranslation } from "@/i18n";
import { useState } from "react";
import { LensToolPreview } from "@/components/panes/surfaces/lens/LensAutomationStatus";
import { Check, Copy } from "lucide-react";
import {
  CompactingIndicator,
  ContextCompactedCheckpoint,
  MessageAction,
  MessageResponse,
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
import { detectTruncationNotice } from "@/lib/truncation-visibility";
import { useAppStore } from "@/store/app.store";
import type { MessagePart } from "@/types/chat";
import { TaskContextChip } from "@/components/task-context-chip";
import { DocumentContextChip, openAttachedDocument } from "@/components/document-context-chip";
import { openAttachedTask } from "@/components/open-attached-task";
import { WorkspaceInformationReferenceChip } from "@/components/workspace-information-reference-chip";
import { chatPanelMessagePartsStyles } from "./chat-panel-message-parts.styles";
import {
  ChangedFilesBlock,
  FileChangeToolBlock,
  ReferencedFilesBlock,
  ImageAttachmentBlock,
} from "./chat-panel-file-blocks";
import {
  TraceSubagentRun,
  TraceTodoRun,
  TraceToolRun,
} from "./message/turn-event-tool-runs";

export { toToolDisplayName } from "@/lib/tool-display-name";
export { toProviderWaveHueClass } from "@/components/ai-elements/provider-wave-tone.styles";

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
    systemEventPresentation = "full",
  } = args;
  const rollbackToCompactBoundary = useAppStore(
    (state) => state.rollbackToCompactBoundary,
  );
  const [isRestoringCompactBoundary, setIsRestoringCompactBoundary] =
    useState(false);

  switch (part.type) {
    /*
     * A display list reaches a tool call only through here. It is drawn by the
     * same `ToolRun` builders as the assistant trace, plus the live Lens
     * preview a browser call drives and a "Live output" label while the call
     * is still streaming.
     */
    case "tool_use":
      if (isSubagentToolPart({ toolName: part.toolName })) {
        return <TraceSubagentRun part={part} />;
      }
      if (isTodoToolPart({ toolName: part.toolName })) {
        return (
          <TraceTodoRun
            part={part}
            title={i18n.t("session:assistantTraceBuilder.title2")}
          />
        );
      }
      if (part.toolName.trim().toLowerCase() === "file_change") {
        return <FileChangeToolBlock input={part.input} />;
      }
      return (
        <TraceToolRun
          outputLabel={
            part.state === "input-streaming"
              ? i18n.t("session:chatPanelMessageParts.label2")
              : undefined
          }
          part={part}
          taskId={taskId}
        >
          {part.toolName.includes("stave_lens_") ? (
            <LensToolPreview toolName={part.toolName} input={part.input} />
          ) : null}
        </TraceToolRun>
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
    case "document_context":
      return (
        <DocumentContextChip
          title={part.title}
          workspaceName={part.workspaceName}
          revision={part.revision}
          onOpen={() => openAttachedDocument(part)}
        />
      );
    // Approvals and user-input requests render in the assistant trace
    // (TraceApproval / TraceClarification); no caller passes them here.
    case "approval":
    case "user_input":
      return null;
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
