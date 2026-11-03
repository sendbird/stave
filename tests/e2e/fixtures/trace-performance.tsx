import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { Thinking } from "@/components/ads/components/Thinking";
import { LiveTurnTraceTimeline } from "@/components/session/TurnTraceTimeline";
import { useAppStore } from "@/store/app.store";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { ChatMessage, ToolUsePart } from "@/types/chat";

/** Real trace components; input reads reveal work in rows that did not change. */
export function mountTraceFixture(count = 100) {
  const app = document.getElementById("root");
  if (app) app.hidden = true;
  const host = document.createElement("main");
  document.body.append(host);
  const root = createRoot(host);
  const reads = Array<number>(count).fill(0);
  const tool = (index: number, updated = false): ToolUsePart => ({
    type: "tool_use", toolUseId: `tool-${index}`, toolName: "Read",
    get input() {
      reads[index]++;
      return JSON.stringify({ file_path: updated ? "updated.ts" : `file-${index}.ts` });
    },
    output: `output-${index}`, state: updated ? "output-error" : "output-available",
  });
  let message: ChatMessage = {
    id: "performance", role: "assistant", content: "", model: "test", providerId: "codex",
    parts: [...Array.from({ length: count }, (_,index) => tool(index)), { type: "text", text: "Streaming response" }],
    isStreaming: true,
  };
  const render = () => flushSync(() => root.render(
    <>
      <AssistantMessageBody message={message} taskId="probe" messageId={message.id} streamingEnabled />
      <Thinking status="done" label="Reasoning fixture"><textarea aria-label="Reasoning draft" defaultValue="draft" /></Thinking>
    </>,
  ));
  render();
  return {
    reads,
    resetReads() { reads.fill(0); },
    appendText() {
      message = { ...message, parts: [...message.parts.slice(0, -1), { type: "text", text: "Streaming response updated" }] };
      render();
    },
    updateTool(index: number) {
      message = { ...message, parts: message.parts.map((part, current) => current === index ? tool(index, true) : part) };
      render();
    },
  };
}

export type TraceFixture = ReturnType<typeof mountTraceFixture>;

export function mountTimelineFixture() {
  const host = document.createElement("main");
  document.body.append(host);
  let reads = 0;
  const startedAt = Date.now() - 10_000;
  const part: ToolUsePart = {
    type: "tool_use", toolUseId: "clock-tool", toolName: "Read", state: "input-available",
    startedAt: new Date(startedAt).toISOString(),
    get input() { reads++; return '{"file_path":"clock.ts"}'; },
  };
  useAppStore.setState((state) => ({
    activeTurnIdsByTask: { ...state.activeTurnIdsByTask, clock: "clock-turn" },
    providerTurnActivityByTask: { ...state.providerTurnActivityByTask, clock: { turnId: "clock-turn", startedAt } as ProviderTurnActivitySnapshot },
    messagesByTask: { ...state.messagesByTask, clock: [{ id: "clock-message", role: "assistant", model: "test", providerId: "codex", content: "", turnId: "clock-turn", parts: [part] }] },
  }));
  const root = createRoot(host);
  flushSync(() => root.render(<LiveTurnTraceTimeline taskId="clock" />));
  return { reads: () => reads };
}

export type TimelineFixture = ReturnType<typeof mountTimelineFixture>;
