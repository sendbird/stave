import { useLayoutEffect, useState } from "react";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { CodeBlock, CodeBlockHeader, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { MessageTextScaleContext } from "@/components/ai-elements/message-text-scale";
import { useAppStore } from "@/store/app.store";
import { applyThemeClass } from "@/lib/themes/apply";

// i18n-ignore: Dev-only fixture content.
export function ReaderSizingPreview() {
  const params = new URLSearchParams(location.search);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: params.get("theme") === "dark" });
    useAppStore.setState((state) => ({ settings: { ...state.settings, messageFontSize: Number(params.get("size") ?? 20) } }));
  }, []);
  const [value, setValue] = useState("Reader text 한국어");
  const model = { key: "preview", providerId: "codex" as const, model: "preview", label: "Preview", available: true };
  return <MessageTextScaleContext.Provider value={params.has("panel") ? "panel" : "conversation"}>
    <CodeBlock code={'echo "hello"\ntrue false 123'} language={params.get("language") ?? undefined}>
      <CodeBlockHeader><CodeBlockCopyButton /></CodeBlockHeader>
    </CodeBlock>
    <PromptInput value={value} onValueChange={setValue} minimal={params.has("minimal")}
      selectedModel={model} modelOptions={[model]} attachedFilePaths={[]}
      onModelSelect={() => {}} onAttachFilesChange={() => {}} onSubmit={() => {}} />
  </MessageTextScaleContext.Provider>;
}
