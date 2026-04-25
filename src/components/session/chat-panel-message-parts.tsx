import { useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  type ChainOfThoughtStepData as ChainOfThoughtStep,
  CompactingIndicator,
  ConfirmationCompact,
  ContextCompactedCheckpoint,
  MessageAction,
  MessageResponse,
  OrchestrationCard,
  StaveProcessingCard,
  SubagentCard,
  TodoCard,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  UserInputCard,
  parseSubagentToolInput,
} from "@/components/ai-elements";
import { LinkifiedText } from "@/components/ui/linkified-text";
import {
  isSubagentProgressSystemEvent,
  isSubagentToolPart,
  isTodoToolPart,
  shouldAutoOpenToolPart,
  shouldRenderInlineSystemEvent,
} from "@/components/session/chat-panel.utils";
import { copyTextToClipboard } from "@/lib/clipboard";
import { getTaskControlOwner, isTaskManaged } from "@/lib/tasks";
import { getProviderWaveToneClass } from "@/lib/providers/model-catalog";
import { useAppStore } from "@/store/app.store";
import type { MessagePart } from "@/types/chat";
import { ChangedFilesBlock, FileChangeToolBlock, ReferencedFilesBlock, ImageAttachmentBlock } from "./chat-panel-file-blocks";

export function toProviderStartCase(args: { providerId: "claude-code" | "codex" | "stave" }) {
  return args.providerId
    .split("-")
    .map((chunk) => `${chunk.slice(0, 1).toUpperCase()}${chunk.slice(1)}`)
    .join(" ");
}

export function toProviderWaveToneClass(args: { providerId: "claude-code" | "codex" | "stave" | "user"; model?: string }) {
  if (args.providerId === "user") {
    return "text-primary";
  }
  return getProviderWaveToneClass({ providerId: args.providerId, model: args.model });
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
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
    </MessageAction>
  );
}

export function toToolDisplayName(toolName: string) {
  return toolName
    .trim()
    .replace(/^tool[-_:]?/i, "")
    .replaceAll(/[_-]+/g, " ")
    || "Tool";
}

export function MessagePartRenderer(args: {
  part: MessagePart;
  taskId: string;
  messageId: string;
  isStreaming?: boolean;
  isLastTextPart?: boolean;
}) {
  const { part, taskId, messageId, isStreaming, isLastTextPart } = args;
  const resolveApproval = useAppStore((state) => state.resolveApproval);
  const resolveUserInput = useAppStore((state) => state.resolveUserInput);
  const rollbackToCompactBoundary = useAppStore((state) => state.rollbackToCompactBoundary);
  const task = useAppStore((state) => state.tasks.find((item) => item.id === taskId) ?? null);
  const [isRestoringCompactBoundary, setIsRestoringCompactBoundary] = useState(false);
  const isManaged = isTaskManaged(task);
  const managedReason = isManaged
    ? `This request is managed by ${getTaskControlOwner(task) === "external" ? "an external controller" : "Stave"}. Respond from the originating client or take over after the run ends.`
    : undefined;

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
        <Tool
          defaultOpen={shouldAutoOpenToolPart(part.state)}
          openWhen={shouldAutoOpenToolPart(part.state)}
        >
          <ToolHeader type={part.toolName} state={part.state} elapsedSeconds={part.elapsedSeconds} />
          <ToolContent>
            <ToolInput input={part.input} />
            {(part.state !== "input-streaming" || part.output?.trim()) && (
            <ToolOutput
              label={part.state === "input-streaming" ? "Live output" : undefined}
              outputText={part.output}
              errorText={part.state === "output-error" ? (part.output ?? "Tool failed.") : undefined}
              linkifyOutputText={part.state !== "input-streaming"}
            />
          )}
        </ToolContent>
        </Tool>
      );
    case "code_diff":
      return <ChangedFilesBlock parts={[part]} taskId={taskId} messageId={messageId} startIndex={0} />;
    case "file_context":
      return <ReferencedFilesBlock parts={[part]} />;
    case "image_context":
      return <ImageAttachmentBlock parts={[part]} />;
    case "approval":
      return (
        <ConfirmationCompact
          toolName={part.toolName}
          description={part.description}
          state={part.state}
          disabled={isManaged}
          disabledReason={managedReason}
          onApprove={() => resolveApproval({ taskId, messageId, approved: true })}
          onReject={() => resolveApproval({ taskId, messageId, approved: false })}
        />
      );
    case "user_input":
      return (
        <UserInputCard
          toolName={part.toolName}
          questions={part.questions}
          answers={part.answers}
          state={part.state}
          disabled={isManaged}
          disabledReason={managedReason}
          onSubmit={(answers) => resolveUserInput({ taskId, messageId, answers })}
          onDeny={() => resolveUserInput({ taskId, messageId, denied: true })}
        />
      );
    case "system_event": {
      if (!shouldRenderInlineSystemEvent({ content: part.content })) {
        return null;
      }
      const normalized = part.content.trim().toLowerCase();
      // "Compacting conversation context…" — in-progress spinner
      if (normalized.startsWith("compacting conversation context")) {
        return <CompactingIndicator />;
      }
      // "Context compacted (auto)." / "Context compacted (manual)." — checkpoint divider
      const compactedMatch = part.content.trim().match(/^Context compacted\s*\(([^)]+)\)\./i);
      const compactBoundaryTrigger = part.compactBoundary?.trigger ?? compactedMatch?.[1];
      const compactBoundaryGitRef = part.compactBoundary?.gitRef;
      const handleRestoreCompactBoundary = () => {
        if (!compactBoundaryGitRef || isRestoringCompactBoundary) {
          return;
        }
        setIsRestoringCompactBoundary(true);
        void rollbackToCompactBoundary({
          taskId,
          gitRef: compactBoundaryGitRef,
          ...(compactBoundaryTrigger ? { trigger: compactBoundaryTrigger } : {}),
        }).finally(() => {
          setIsRestoringCompactBoundary(false);
        });
      };
      if (compactedMatch) {
        return (
          <ContextCompactedCheckpoint
            trigger={compactBoundaryTrigger}
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
      return (
        <LinkifiedText
          as="p"
          text={part.content}
          className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[0.875em] italic text-muted-foreground"
        />
      );
    }
    case "orchestration_progress":
      return <OrchestrationCard part={part} />;
    case "stave_processing":
      return <StaveProcessingCard part={part} />;
    case "text":
      if (!part.text?.trim()) return null;
      return <MessageResponse isStreaming={isStreaming && isLastTextPart}>{part.text}</MessageResponse>;
    case "thinking":
      return null;
  }
}

export function buildChainOfThoughtSteps(parts: MessagePart[]): ChainOfThoughtStep[] {
  const steps: ChainOfThoughtStep[] = [];
  parts.forEach((part, index) => {
    if (part.type === "tool_use") {
      const isSubagent = isSubagentToolPart({ toolName: part.toolName });
      if (!isSubagent) {
        return;
      }
      const subagentInput = isSubagent ? parseSubagentToolInput({ input: part.input }) : null;
      // Use the latest progress message as the CoT detail when the agent is active.
      const latestProgress = part.progressMessages?.at(-1);
      steps.push({
        id: `tool-${index}`,
        label: isSubagent
          ? subagentInput?.description ?? subagentInput?.subagentType ?? "Subagent"
          : part.toolName,
        detail: latestProgress
          ?? (isSubagent
            ? (subagentInput?.prompt ?? part.input ?? part.output)
            : part.input || part.output),
        status: part.state === "input-streaming"
          ? "active"
          : part.state === "output-available"
          ? "done"
          : "pending",
        kind: isSubagent ? "agent" : "tool",
      });
      return;
    }
    if (part.type === "system_event") {
      // Skip subagent progress events — they are already shown inside the SubagentCard.
      if (isSubagentProgressSystemEvent(part.content)) {
        return;
      }
      steps.push({
        id: `system-${index}`,
        label: part.content,
        status: "done",
        kind: "system",
      });
    }
  });
  return steps;
}
