import { ZenChatInput } from "@/components/session/ChatInput";
import { ZenChatPanel } from "@/components/session/ZenChatPanel";
import { RenderProfiler } from "@/lib/render-profiler";
import { ChatAreaScaffold, useChatAreaShellState } from "./chat-area.shared";

export function ZenChatArea() {
  const state = useChatAreaShellState();

  return (
    <ChatAreaScaffold
      state={state}
      input={(
        <RenderProfiler id="ChatInput" thresholdMs={8}>
          <ZenChatInput />
        </RenderProfiler>
      )}
      panel={(
        <RenderProfiler id="ChatPanel" thresholdMs={8}>
          <ZenChatPanel inputDockHeight={state.chatInputDockHeight} />
        </RenderProfiler>
      )}
      inputDockMode="overlay"
    />
  );
}
