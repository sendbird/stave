import { useLayoutEffect, useState } from "react";
import { applyAppLocale } from "@/i18n";
import { applyThemeClass } from "@/lib/themes/apply";
import { ComposerFrame } from "@/components/ai-elements/composer-frame";
import { CompactingIndicator } from "@/components/ai-elements/checkpoint";
import { PromptInputContextMeter } from "@/components/ai-elements/prompt-input-context-meter";

export function ContextProgressPreview() {
  const params = new URLSearchParams(location.search);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: params.get("theme") === "dark" });
    applyAppLocale(params.get("lang") ?? "en");
  }, []);
  const [startedAt] = useState(() => new Date(Date.now() - 12000).toISOString());
  return <div style={{ width: Number(params.get("width") ?? 720), maxWidth: "100%" }}>
    <ComposerFrame>
      <CompactingIndicator startedAt={params.has("unknown") ? undefined : startedAt} />
      <PromptInputContextMeter usage={{ messageId: "preview", usedPercent: 72, usedTokens: 720000, windowTokens: 1000000 }} compactAvailable={false} compactDisabled={false} />
    </ComposerFrame>
  </div>;
}
