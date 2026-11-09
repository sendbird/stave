import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import type { ChatMessage } from "@/types/chat";
import type { ProviderId } from "@/lib/providers/provider.types";

export function mountTraceLifecycle(providerId: ProviderId) {
  document.getElementById("root")!.hidden = true;
  const host = document.createElement("main");
  host.dataset.traceLifecycle = "";
  document.body.append(host);
  const root = createRoot(host);
  const render = (stage: number) => {
    const done = stage === 2;
    const message = {
      id: "trace-lifecycle", role: "assistant", providerId, model: "test", content: "",
      isStreaming: !done,
      parts: [
        { type: "tool_use", toolUseId: "read", toolName: "Read", input: JSON.stringify({ file_path: "src/search.ts" }), state: stage === 0 ? "input-available" : "output-available", output: stage > 0 ? "read" : undefined },
        ...(stage > 0 ? [{ type: "tool_use", toolUseId: "edit", toolName: "Edit", input: JSON.stringify({ file_path: "src/styles.css" }), state: done ? "output-available" : "input-available", output: done ? "edited" : undefined }] : []),
        ...(done ? [{ type: "text", text: "Updated the search styles." }] : []),
      ],
    } as ChatMessage;
    flushSync(() => root.render(<AssistantMessageBody message={message} taskId="trace-lifecycle" messageId={message.id} streamingEnabled traceExpansionMode="auto" />));
  };
  render(0);
  return { advance: () => render(1), complete: () => render(2) };
}
