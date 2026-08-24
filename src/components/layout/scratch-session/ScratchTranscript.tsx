import { useState } from "react";
import { Button } from "@/components/ui";
import { UserInputCard } from "@/components/ai-elements/user-input-card";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { useScratchSessionStore } from "@/store/scratch-session.store";
import type {
  ApprovalPart,
  ChatMessage,
  MessagePart,
  UserInputPart,
} from "@/types/chat";

// AssistantMessageBody renders pending interaction parts (approval / user_input)
// through MessagePartRenderer, whose Approve/Deny and input controls are hardwired
// to the project-scoped useAppStore. A scratch session has no task in that store,
// so those controls would be dead *and* duplicate the scratch-owned interaction UI.
// Strip the requested (actionable) parts before handing the message to AssistantMessage-
// Body; the rows below become the sole live controls. Non-requested states
// (responded / interrupted) stay for history — ConfirmationCompact renders them
// buttonless, so they carry no misrouted actions.
export function isStoreWiredPendingInteraction(part: MessagePart): boolean {
  return (
    (part.type === "approval" && part.state === "approval-requested") ||
    (part.type === "user_input" && part.state === "input-requested")
  );
}

export function stripStoreWiredPendingInteractions(
  message: ChatMessage,
): ChatMessage {
  return {
    ...message,
    parts: message.parts.filter(
      (part) => !isStoreWiredPendingInteraction(part),
    ),
  };
}

export function ScratchApprovalRow(props: {
  part: ApprovalPart;
  disabled: boolean;
  onRespond: (args: { approved: boolean }) => void;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-card p-3">
      <p className="text-sm font-medium">{props.part.toolName}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {props.part.description}
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          disabled={props.disabled}
          onClick={() => props.onRespond({ approved: true })}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={props.disabled}
          onClick={() => props.onRespond({ approved: false })}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}

export function ScratchTranscriptView(props: {
  messages: ChatMessage[];
  taskId: string;
  inFlightRequestId: string | null;
  onRespond: (args: { part: ApprovalPart; approved: boolean }) => void;
  onRespondUserInput: (args: {
    part: UserInputPart;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => void;
}) {
  return (
    <div className="max-h-[24rem] space-y-3 overflow-y-auto px-4 py-3">
      {props.messages.map((message) => {
        if (message.role === "user") {
          return (
            <p key={message.id} className="text-sm text-muted-foreground">
              {message.content}
            </p>
          );
        }

        const pendingInteractions = message.parts.filter(
          (part): part is ApprovalPart | UserInputPart =>
            isStoreWiredPendingInteraction(part),
        );

        return (
          <div key={message.id} className="space-y-2">
            <AssistantMessageBody
              message={stripStoreWiredPendingInteractions(message)}
              taskId={props.taskId}
              messageId={message.id}
              streamingEnabled
            />
            {pendingInteractions.map((part) =>
              part.type === "approval" ? (
                <ScratchApprovalRow
                  key={`approval-${part.requestId}`}
                  part={part}
                  disabled={props.inFlightRequestId === part.requestId}
                  onRespond={({ approved }) =>
                    props.onRespond({ part, approved })
                  }
                />
              ) : (
                <UserInputCard
                  key={`user-input-${part.requestId}`}
                  toolName={part.toolName}
                  questions={part.questions}
                  state={part.state}
                  answers={part.answers}
                  presentation="inline"
                  disabled={props.inFlightRequestId === part.requestId}
                  disabledReason={
                    props.inFlightRequestId === part.requestId
                      ? "Sending response…"
                      : undefined
                  }
                  onSubmit={(answers) =>
                    props.onRespondUserInput({ part, answers })
                  }
                  onDeny={() =>
                    props.onRespondUserInput({ part, denied: true })
                  }
                />
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ScratchTranscript() {
  const messages = useScratchSessionStore((state) => state.messages);
  const taskId = useScratchSessionStore((state) => state.taskId);
  const respondApproval = useScratchSessionStore(
    (state) => state.respondApproval,
  );
  const respondUserInput = useScratchSessionStore(
    (state) => state.respondUserInput,
  );
  const [inFlightRequestId, setInFlightRequestId] = useState<string | null>(
    null,
  );

  return (
    <ScratchTranscriptView
      messages={messages}
      taskId={taskId}
      inFlightRequestId={inFlightRequestId}
      onRespond={({ part, approved }) => {
        setInFlightRequestId(part.requestId);
        void respondApproval({ requestId: part.requestId, approved }).finally(
          () => setInFlightRequestId(null),
        );
      }}
      onRespondUserInput={({ part, answers, denied }) => {
        setInFlightRequestId(part.requestId);
        void respondUserInput({
          requestId: part.requestId,
          answers,
          denied,
        }).finally(() => setInFlightRequestId(null));
      }}
    />
  );
}
