import { useState } from "react";
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
  shouldAutoOpenToolPart,
  formatInlineSystemEventContent,
  shouldRenderInlineSystemEvent,
} from "@/components/session/chat-panel.utils";
import { copyTextToClipboard } from "@/lib/clipboard";
import { getProviderWaveTone } from "@/lib/providers/model-catalog";
import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import type { ProviderId } from "@/lib/providers/provider.types";
import { detectTruncationNotice } from "@/lib/truncation-visibility";
import { useAppStore } from "@/store/app.store";
import type { MessagePart } from "@/types/chat";
import { WorkspaceInformationReferenceChip } from "@/components/workspace-information-reference-chip";
import { chatPanelMessagePartsStyles } from "./chat-panel-message-parts.styles";
import {
  ChangedFilesBlock,
  FileChangeToolBlock,
  ReferencedFilesBlock,
  ImageAttachmentBlock,
} from "./chat-panel-file-blocks";

export { toToolDisplayName } from "@/lib/tool-display-name";

export function toProviderStartCase(args: { providerId: ProviderId }) {
  return args.providerId
    .split("-")
    .map((chunk) => `${chunk.slice(0, 1).toUpperCase()}${chunk.slice(1)}`)
    .join(" ");
}

// Provider wave tone → StyleX style. `getProviderWaveTone` returns a semantic
// tone (this file consumes that contract); themed provider CSS variables and
// the ADS accent token carry the color.
const providerToneStyles = stylex.create({
  claude: { color: "var(--provider-claude)" },
  codex: { color: "var(--provider-codex)" },
  accent: { color: vars.colorAccent },
});

export function toProviderWaveToneClass(args: {
  providerId: ProviderId | "user";
  model?: string;
}) {
  if (args.providerId === "user") {
    return sx(providerToneStyles.accent);
  }
  const tone = getProviderWaveTone({
    providerId: args.providerId,
    model: args.model,
  });
  return sx(providerToneStyles[tone]);
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <MessageAction
      label="Copy"
      tooltip="Copy message"
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
            workerExecution={part.workerExecution}
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
        <Tool
          defaultOpen={shouldAutoOpenToolPart(part.state)}
          openWhen={shouldAutoOpenToolPart(part.state)}
        >
          <ToolHeader
            type={part.toolName}
            state={part.state}
            elapsedSeconds={part.elapsedSeconds}
          />
          <ToolContent>
            <ToolInput input={part.input} />
            {(part.state !== "input-streaming" || part.output?.trim()) && (
              <ToolOutput
                label={
                  part.state === "input-streaming" ? "Live output" : undefined
                }
                outputText={part.output}
                errorText={
                  part.state === "output-error"
                    ? (part.output ?? "Tool failed.")
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
            resolveUserInput({ taskId, messageId, answers })
          }
          onDeny={() => resolveUserInput({ taskId, messageId, denied: true })}
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
            label={isTurnStartCheckpoint ? "Workspace checkpoint" : undefined}
            trigger={isTurnStartCheckpoint ? undefined : compactBoundaryTrigger}
            onRestore={handleRestoreCompactBoundary}
            restorePending={isRestoringCompactBoundary}
            restoreDisabled={!compactBoundaryGitRef}
          />
        );
      }
      // Fallback: generic "Context compacted" without trigger info
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
          text={displayContent}
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
