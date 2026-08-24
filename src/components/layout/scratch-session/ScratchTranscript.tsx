import { useState } from "react";
import { Button } from "@/components/ui";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { useScratchSessionStore } from "@/store/scratch-session.store";
import type { ApprovalPart } from "@/types/chat";

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

export function ScratchTranscript() {
  const messages = useScratchSessionStore((state) => state.messages);
  const taskId = useScratchSessionStore((state) => state.taskId);
  const respondApproval = useScratchSessionStore(
    (state) => state.respondApproval,
  );
  const [inFlightRequestId, setInFlightRequestId] = useState<string | null>(
    null,
  );

  return (
    <div className="max-h-[24rem] space-y-3 overflow-y-auto px-4 py-3">
      {messages.map((message) => {
        if (message.role === "user") {
          return (
            <p key={message.id} className="text-sm text-muted-foreground">
              {message.content}
            </p>
          );
        }

        const approvals = message.parts.filter(
          (part): part is ApprovalPart =>
            part.type === "approval" && part.state === "approval-requested",
        );

        return (
          <div key={message.id} className="space-y-2">
            <AssistantMessageBody
              message={message}
              taskId={taskId}
              messageId={message.id}
              streamingEnabled
            />
            {approvals.map((part) => (
              <ScratchApprovalRow
                key={part.requestId}
                part={part}
                disabled={inFlightRequestId === part.requestId}
                onRespond={({ approved }) => {
                  setInFlightRequestId(part.requestId);
                  void respondApproval({
                    requestId: part.requestId,
                    approved,
                  }).finally(() => setInFlightRequestId(null));
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
